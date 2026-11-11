import { lockBlock } from './locks';
import { doc, setDoc, deleteDoc, collection, getDoc, writeBatch } from 'firebase/firestore';
import { HISTORY_COLLECTION, buildHist, diffLine, isAutoApproved, type HistAction, type HistChange } from '../../lib/vnext/support';
import { pushNotif, banManagers } from './notify';
import { NS_COLLECTION, nsLineId, appendHistory, type NsLine, type NsKind } from '../../lib/vnext/budget';
import { WEEKLY_COLLECTION, weeklyId, stripItemsForProject } from '../../lib/vnext/weekly';
import { type VCtx, notifyUser, projectName, isAdm } from './ctx';
import { periodLabel } from '../../lib/vnext/period';

export async function saveNsLine(c: VCtx, opts: {
  kind: NsKind; period: string; teamId?: string; blockId?: string; projectId: string;
  owner?: { uid: string; name?: string; email?: string };
  existing?: NsLine | null; amount: number; reason?: string; notifyOwner?: boolean;
  payAccount?: { id: string; bankName: string; tail: string } | null;
}) {
  { const lk = lockBlock(c.role, opts.existing && !opts.existing.deleted ? 'nsEdit' : 'nsCreate', opts.period); if (lk) throw new Error(lk); }
  const scope = opts.kind === 'gdk' || opts.kind === 'khoi' ? opts.blockId! : opts.teamId!;
  const id = opts.existing?.id || nsLineId(opts.kind, opts.period, scope, opts.projectId, opts.owner?.uid);
  const now = new Date().toISOString();
  const from = Number(opts.existing?.amount || 0);
  const h = { at: now, byUid: c.uid, byName: c.name, byRole: c.role, actingAs: opts.kind === 'user' ? 'user' : opts.kind, action: (opts.existing ? 'update' : 'create') as any, from, to: opts.amount, ...(opts.reason ? { reason: opts.reason } : {}) };
  const base: any = opts.existing ? { ...opts.existing } : {
    period: opts.period, kind: opts.kind, projectId: opts.projectId,
    ...(opts.teamId ? { teamId: opts.teamId } : {}),
    ...(opts.blockId ? { blockId: opts.blockId } : {}),
    ...((opts.kind === 'user' || opts.kind === 'khoi') && opts.owner ? { ownerUid: opts.owner.uid, ownerName: opts.owner.name || '', ownerEmail: (opts.owner.email || '').toLowerCase() } : {}),
    createdAt: now, createdBy: c.uid,
    ...(opts.kind !== 'user' && opts.kind !== 'khoi' ? { actingAs: opts.kind, actingRole: c.role } : {}),
  };
  delete base.id;
  const next = { ...base, ...(opts.payAccount ? { payAccount: opts.payAccount } : {}), amount: opts.amount, deleted: false, history: appendHistory(base, h), updatedAt: now, updatedBy: c.uid };
  await setDoc(doc(c.db, NS_COLLECTION, id), next);
  if (opts.kind === 'user' || opts.kind === 'khoi') await writeLineHist(c, { id, ...next } as NsLine, opts.existing ? 'update' : 'create', diffLine(opts.existing || null, next), opts.reason);
  // NS tự duyệt (Khối / GĐK-kiêm) → xếp hàng Ban ngay khi tạo
  if (!opts.existing && (opts.kind === 'user' || opts.kind === 'khoi')) {
    const line = { id, ...next } as NsLine;
    if (isAutoApproved(line)) {
      const banId = String(c.projects.find((p) => p.id === line.projectId)?.banKdId || '');
      const body = `${periodLabel(line.period)} · ${projectName(c, line.projectId)} · ${(Number(line.amount) || 0).toLocaleString('vi-VN')} đ — NS tự duyệt, chờ Ban duyệt`;
      for (const u of new Set(banManagers(c, banId))) {
        await pushNotif(c, u, { type: 'pending', title: `Chờ Ban duyệt: ${projectName(c, line.projectId)}`, body, link: '/quan-ly-ban-kd', refId: line.id });
      }
    }
  }
  if (opts.notifyOwner && opts.existing?.ownerEmail && opts.existing.ownerUid !== c.uid) {
    await notifyUser(c, { email: opts.existing.ownerEmail, uid: opts.existing.ownerUid },
      'GĐKD đã điều chỉnh Ngân sách MKT của bạn',
      `${c.name} sửa NS dự án ${projectName(c, opts.projectId)} · ${periodLabel(opts.period)}: ${from.toLocaleString('vi-VN')} → ${opts.amount.toLocaleString('vi-VN')} đ. Lý do: ${opts.reason || ''}`,
      { projectId: opts.projectId, teamId: opts.teamId, period: opts.period, lineId: id });
  }
  return id;
}

/** User xoá dòng của mình (không thông báo). Admin xoá: đánh dấu deleted để giữ lịch sử.
 * Đồng thời gỡ các item Báo cáo tuần cùng period + ownerUid + projectId (mọi đợt). Hết item → xoá doc (Admin) hoặc để items=[]. */
export async function deleteNsLine(c: VCtx, line: NsLine, hard: boolean) {
  { const lk = lockBlock(c.role, 'nsEdit', line.period); if (lk) throw new Error(lk); }
  const ch = [{ field: 'deleted', from: 'false', to: 'true' }, { field: 'amount', from: String(Number(line.amount || 0)), to: '0' }];
  // Ghi lịch sử TRƯỚC khi xoá hẳn (rules kiểm tra dòng NS còn tồn tại).
  if (hard) {
    await writeLineHist(c, line, 'delete', ch);
    await deleteDoc(doc(c.db, NS_COLLECTION, line.id));
    try { await cleanupWeeklyForNsLine(c, line); } catch (e: any) { console.warn('[cleanupWeeklyForNsLine]', e?.code || e?.message); }
    return;
  }
  const now = new Date().toISOString();
  const { id, ...rest } = line as any;
  await setDoc(doc(c.db, NS_COLLECTION, line.id), { ...rest, amount: 0, deleted: true, history: appendHistory(line, { at: now, byUid: c.uid, byName: c.name, byRole: c.role, action: 'delete', from: Number(line.amount || 0), to: 0 }), updatedAt: now, updatedBy: c.uid });
  await writeLineHist(c, line, 'delete', ch);
  try { await cleanupWeeklyForNsLine(c, line); } catch (e: any) { console.warn('[cleanupWeeklyForNsLine]', e?.code || e?.message); }
}

/** Gỡ item weekly_reports khớp period + uid + projectId trên 4 đợt. Không có PII mới. */
export async function cleanupWeeklyForNsLine(c: VCtx, line: NsLine) {
  const uid = line.ownerUid;
  if (!uid || !line.period || !line.projectId) return;
  if (line.kind !== 'user' && line.kind !== 'khoi') return;
  const batch = writeBatch(c.db);
  let n = 0;
  const now = new Date().toISOString();
  for (const dot of [1, 2, 3, 4]) {
    const id = weeklyId(line.period, dot, uid);
    const ref = doc(c.db, WEEKLY_COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) continue;
    const data = snap.data() as any;
    const before = data.items || [];
    const items = stripItemsForProject(before, line.projectId);
    if (items.length === before.length) continue;
    if (!items.length && isAdm(c)) {
      batch.delete(ref);
    } else {
      batch.update(ref, { items, updatedAt: now, history: [...(data.history || []), { at: now, byUid: c.uid, byName: c.name, action: 'ns_delete_strip', projectId: line.projectId }].slice(-100) });
    }
    n++;
  }
  if (n) await batch.commit();
}

/** Ghi 1 mục lịch sử (append-only). Lỗi ghi lịch sử không chặn thao tác chính. */
export async function writeLineHist(c: VCtx, line: NsLine, action: HistAction, changes: HistChange[] = [], reason?: string, prevStatus?: string) {
  if (line.kind !== 'user' && line.kind !== 'khoi') return;
  try { await setDoc(doc(collection(c.db, HISTORY_COLLECTION)), buildHist(line, { uid: c.uid, name: c.name, role: c.role }, action, changes, { reason, prevStatus })); }
  catch (e: any) { console.warn('[nsLineHistory]', e?.code || e?.message); }
}
