import { lockBlock } from './locks';
import { doc, setDoc, deleteDoc, collection, getDoc, getDocs, addDoc, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { HISTORY_COLLECTION, buildHist, diffLine, isAutoApproved, type HistAction, type HistChange } from '../../lib/vnext/support';
import { pushNotif, banManagers } from './notify';
import { NS_COLLECTION, nsLineId, appendHistory, type NsLine, type NsKind } from '../../lib/vnext/budget';
import { WEEKLY_COLLECTION, weeklyId, stripItemsForProject } from '../../lib/vnext/weekly';
import { type VCtx, notifyUser, projectName, isAdm } from './ctx';
import { periodLabel } from '../../lib/vnext/period';
import { personAccountIds, ntPeriodKey } from '../../lib/vnext/ntBudgetProjects';
import { buildDeleteAudit, buildSaWriteAudit, buildRestoreAudit, stripUndefined, weeklyRemoval, mergeWeeklyItems, amountBeforeDelete, latestSoftDeleteAudit, planProjectChange, type WeeklySnapItem, type NsImpact } from '../../lib/vnext/nsAdmin';

export async function saveNsLine(c: VCtx, opts: {
  kind: NsKind; period: string; teamId?: string; blockId?: string; projectId: string;
  owner?: { uid: string; name?: string; email?: string };
  existing?: NsLine | null; amount: number; reason?: string; notifyOwner?: boolean;
  payAccount?: { id: string; bankName: string; tail: string } | null;
  coImplementer?: string; createdByRole?: string;
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
  const next = { ...base, ...(opts.payAccount ? { payAccount: opts.payAccount } : {}), ...(opts.coImplementer !== undefined ? { coImplementer: String(opts.coImplementer || '').trim() } : {}), ...(opts.createdByRole && (!opts.existing || opts.existing.deleted) ? { createdByRole: opts.createdByRole } : {}), amount: opts.amount, deleted: false, history: appendHistory(base, h), updatedAt: now, updatedBy: c.uid };
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
export async function deleteNsLine(c: VCtx, line: NsLine, hard: boolean, reason?: string) {
  { const lk = lockBlock(c.role, 'nsEdit', line.period); if (lk) throw new Error(lk); }
  const ch = [{ field: 'deleted', from: 'false', to: 'true' }, { field: 'amount', from: String(Number(line.amount || 0)), to: '0' }];
  // Ghi lịch sử TRƯỚC khi xoá hẳn (rules kiểm tra dòng NS còn tồn tại).
  if (hard) {
    await writeLineHist(c, line, 'delete', ch, reason);
    await deleteDoc(doc(c.db, NS_COLLECTION, line.id));
    try { await cleanupWeeklyForNsLine(c, line); } catch (e: any) { console.warn('[cleanupWeeklyForNsLine]', e?.code || e?.message); }
    return;
  }
  const now = new Date().toISOString();
  const { id, ...rest } = line as any;
  await setDoc(doc(c.db, NS_COLLECTION, line.id), { ...rest, amount: 0, deleted: true, history: appendHistory(line, { at: now, byUid: c.uid, byName: c.name, byRole: c.role, action: 'delete', from: Number(line.amount || 0), to: 0, ...(reason ? { reason } : {}) }), updatedAt: now, updatedBy: c.uid });
  await writeLineHist(c, line, 'delete', ch, reason);
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

// ---------------------------------------------------------------
// MC-6 — Super Admin quản lý đăng ký NS của user
// ---------------------------------------------------------------
const actorOf = (c: VCtx) => ({ uid: c.uid, email: c.email, name: c.name, role: c.role as string });
const assertSa = (c: VCtx) => { if (c.role !== 'super_admin') throw new Error('Chỉ Super Admin'); };
async function writeAudit(c: VCtx, payload: Record<string, any>) {
  await addDoc(collection(c.db, 'auditLogs'), stripUndefined({ ...payload, timestamp: serverTimestamp() }));
}

/** Xem trước (không ghi) các mục Báo cáo tuần sẽ bị gỡ khi xoá dòng. docData chỉ kèm khi doc sẽ bị xoá hẳn (để khôi phục). */
export async function previewWeeklyForNsLine(c: VCtx, line: NsLine): Promise<{ docs: WeeklySnapItem[]; count: number }> {
  const docs: WeeklySnapItem[] = [];
  const uid = line.ownerUid;
  if (!uid || !line.period || !line.projectId || (line.kind !== 'user' && line.kind !== 'khoi')) return { docs, count: 0 };
  for (const dot of [1, 2, 3, 4]) {
    const id = weeklyId(line.period, dot, uid);
    const snap = await getDoc(doc(c.db, WEEKLY_COLLECTION, id));
    if (!snap.exists()) continue;
    const data = snap.data() as any;
    const { removed, remaining } = weeklyRemoval(data.items, line.projectId);
    if (!removed.length) continue;
    docs.push({ docId: id, removedItems: removed, ...(!remaining.length && isAdm(c) ? { docData: data } : {}) });
  }
  return { docs, count: docs.reduce((s, d) => s + d.removedItems.length, 0) };
}

/** Số bản Nghiệm thu (không phải nháp) đang gắn với dòng. null = không đọc được. */
export async function previewNtForNsLine(c: VCtx, line: NsLine): Promise<number | null> {
  try {
    const user = c.users.find((u) => (u.uid || u.id) === line.ownerUid);
    const ids = personAccountIds(user, line.ownerUid).slice(0, 10);
    if (!ids.length) return 0;
    const s = await getDocs(query(collection(c.db, 'acceptances'), where('implementerUid', 'in', ids)));
    return s.docs.map((d) => d.data() as any).filter((r) => !r.isDraft && r.projectId === line.projectId && ntPeriodKey(r.ntMonth || r.month) === line.period).length;
  } catch (e: any) { console.warn('[previewNtForNsLine]', e?.code || e?.message); return null; }
}

/** Xoá (mềm / cứng) bởi SA: ghi auditLogs TRƯỚC (kèm snapshot); lỗi audit → huỷ xoá. */
export async function saDeleteNsLine(c: VCtx, line: NsLine, hard: boolean, reason: string, impact: NsImpact, weekly: WeeklySnapItem[]) {
  assertSa(c);
  try { await writeAudit(c, buildDeleteAudit({ hard, line, reason, actor: actorOf(c), weekly, impact })); }
  catch (e: any) { throw new Error('Không ghi được nhật ký — đã huỷ xoá: ' + (e?.code || e?.message)); }
  await deleteNsLine(c, line, hard, reason);
}

/** Thêm đăng ký cho user (SA). existing = dòng đã xoá cùng id (nếu có) → ghi đè. */
export async function saCreateNsLine(c: VCtx, o: { period: string; teamId: string; owner: { uid: string; name?: string; email?: string }; projectId: string; amount: number; reason: string; notify: boolean; existing?: NsLine | null }) {
  assertSa(c);
  const id = await saveNsLine(c, { kind: 'user', period: o.period, teamId: o.teamId, projectId: o.projectId, owner: o.owner, existing: o.existing || null, amount: o.amount, reason: o.reason, createdByRole: 'super_admin' });
  try { await writeAudit(c, buildSaWriteAudit({ create: true, lineId: id, reason: o.reason, actor: actorOf(c), before: null, after: { amount: o.amount, projectId: o.projectId } })); }
  catch (e: any) { console.warn('[saCreate audit]', e?.code || e?.message); }
  if (o.notify && o.owner.email) await notifyUser(c, { email: o.owner.email, uid: o.owner.uid }, 'Super Admin đã tạo đăng ký Ngân sách MKT cho bạn', `${c.name} thêm NS dự án ${projectName(c, o.projectId)} · ${periodLabel(o.period)}: ${o.amount.toLocaleString('vi-VN')} đ. Lý do: ${o.reason}`, { projectId: o.projectId, teamId: o.teamId, period: o.period, lineId: id });
  return id;
}

/** Sửa bởi SA. Đổi dự án = tạo dòng mới (id mới) + xoá mềm dòng cũ. existingNew = dòng cùng id mới (đã xoá) nếu có. */
export async function saUpdateNsLine(c: VCtx, o: { line: NsLine; amount: number; projectId: string; reason: string; notify: boolean; existingNew?: NsLine | null; supportStatus?: string }) {
  assertSa(c);
  const { line } = o;
  const plan = planProjectChange(line, o.projectId);
  const before = { amount: Number(line.amount || 0), projectId: line.projectId };
  let newId = line.id;
  if (!plan.changed) {
    newId = await saveNsLine(c, { kind: 'user', period: line.period, teamId: line.teamId, projectId: line.projectId, existing: line, amount: o.amount, reason: o.reason });
  } else {
    newId = await saveNsLine(c, { kind: 'user', period: line.period, teamId: line.teamId, blockId: line.blockId, projectId: o.projectId, owner: { uid: line.ownerUid || '', name: line.ownerName, email: line.ownerEmail }, existing: o.existingNew || null, amount: o.amount, reason: `${o.reason} (chuyển từ dự án ${projectName(c, line.projectId)})` });
    const { docs } = await previewWeeklyForNsLine(c, line);
    const why = `Chuyển sang dự án ${projectName(c, o.projectId)}: ${o.reason}`;
    await saDeleteNsLine(c, line, false, why, { ntCount: null, supportStatus: o.supportStatus || '' }, docs);
  }
  try { await writeAudit(c, buildSaWriteAudit({ create: false, lineId: newId, reason: o.reason, actor: actorOf(c), before, after: { amount: o.amount, projectId: o.projectId }, extra: plan.changed ? { movedFrom: line.id } : undefined })); }
  catch (e: any) { console.warn('[saUpdate audit]', e?.code || e?.message); }
  if (o.notify && line.ownerEmail && line.ownerUid !== c.uid) await notifyUser(c, { email: line.ownerEmail, uid: line.ownerUid }, 'Super Admin đã điều chỉnh Ngân sách MKT của bạn', `${c.name} sửa NS ${periodLabel(line.period)}: ${projectName(c, line.projectId)} ${before.amount.toLocaleString('vi-VN')} đ → ${projectName(c, o.projectId)} ${o.amount.toLocaleString('vi-VN')} đ. Lý do: ${o.reason}`, { projectId: o.projectId, teamId: line.teamId, period: line.period, lineId: newId });
  return newId;
}

/** Khôi phục dòng xoá mềm + best-effort khôi phục Báo cáo tuần. weekly: true = đã khôi phục, false = lỗi, null = không có gì để khôi phục. */
export async function saRestoreNsLine(c: VCtx, line: NsLine): Promise<{ amount: number; weekly: boolean | null }> {
  assertSa(c);
  const amount = amountBeforeDelete(line);
  const now = new Date().toISOString();
  const { id, ...rest } = line as any;
  await setDoc(doc(c.db, NS_COLLECTION, line.id), stripUndefined({ ...rest, amount, deleted: false, history: appendHistory(line, { at: now, byUid: c.uid, byName: c.name, byRole: c.role, action: 'restore', from: 0, to: amount }), updatedAt: now, updatedBy: c.uid }));
  await writeLineHist(c, line, 'restore', [{ field: 'deleted', from: 'true', to: 'false' }, { field: 'amount', from: '0', to: String(amount) }]);
  let weekly: boolean | null = null;
  try {
    const s = await getDocs(query(collection(c.db, 'auditLogs'), where('targetId', '==', line.id)));
    const a: any = latestSoftDeleteAudit(s.docs.map((d) => d.data() as any));
    const snap: any[] = Array.isArray(a?.weeklySnapshot) ? a.weeklySnapshot : [];
    if (snap.length) {
      weekly = true;
      for (const w of snap) {
        const ref = doc(c.db, WEEKLY_COLLECTION, w.docId);
        const cur = await getDoc(ref);
        if (cur.exists()) {
          const d = cur.data() as any;
          const m = mergeWeeklyItems(d.items, w.removedItems);
          if (m.added) await setDoc(ref, { ...d, items: m.items, updatedAt: now });
        } else if (w.docData && Array.isArray(w.docData.items)) {
          await setDoc(ref, { ...w.docData, items: mergeWeeklyItems(w.docData.items, w.removedItems).items, updatedAt: now });
        }
      }
    }
  } catch (e: any) { console.warn('[restore weekly]', e?.code || e?.message); weekly = false; }
  try { await writeAudit(c, buildRestoreAudit({ lineId: line.id, amount, weeklyRestored: weekly, actor: actorOf(c) })); } catch (e: any) { console.warn('[restore audit]', e?.code || e?.message); }
  return { amount, weekly };
}
