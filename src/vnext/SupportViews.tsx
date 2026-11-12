import { pushNotif, banManagers, khoiManagers, FOCUS_KEY } from './notify';
import { ST_COLOR_NAME } from '../../lib/vnext/status';
import { stageOf, stageMetaKey, STAGE_LABEL, stageLabel, BUCKET_ORDER, BUCKET_LABEL, bucketOf, splitByBucket, type Bucket, type BucketSplit } from '../../lib/vnext/stageLabel';
import { ST_META } from '../../lib/vnext/status';
/** B2 — Duyệt hỗ trợ MKT theo từng bản đăng ký (user × dự án × tháng); B3 — Admin xem mọi bản ghi theo dự án. */
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where, setDoc, writeBatch, runTransaction } from 'firebase/firestore';
import { deputyBlocked, type BanApproverRole } from '../lib/banApprover';
import { writeLineHist } from './nsActions';
import { usePayMap, syncMyPay } from './payStatus';
import { StatusBadge, SummaryBox, useViewMode, ViewToggle } from './statusUi';
import type { St5 } from '../../lib/vnext/status';
import { usePendingRequests, actionablePending, ApprovalsPanel } from './onboardingViews';
import { type VCtx, isAdm, canViewAll, isKhoiMgr, gdkdTeams, projectName, teamName, blockName, userName, vnCan, notifyUser, useNsLines } from './ctx';
import { Card, Btn, Badge, Th, Td, Field, Input, Modal, Empty, fmt, vnTime, useToast, SearchSelect, Kpi , FilterSheet} from './ui';
import { PeriodPicker, defaultPeriod } from './PeriodPicker';
import { periodLabel } from '../../lib/vnext/period';
import { baseSupportPctAtPeriod, fmtPct, excelSupportPctFields } from '../../lib/vnext/supportPct';
import { exportFileName, blockCodeOf, teamCodeOf } from '../../lib/vnext/exportName';
import type { NsLine } from '../../lib/vnext/budget';
import { SUPPORT_COLLECTION, SUPPORT_LABEL, SUPPORT_TONE, type Support, type SupportStatus, type StoredStatus, buildDecision, effectiveStatus, payOf, supportable, filterRows, isAutoApproved, isAutoNow, AUTO_APPROVED_NOTE, splitByStatus, ALL_STATUSES, HISTORY_COLLECTION, HIST_LABEL, timeline, type LineHist, type StatusSplit } from '../../lib/vnext/support';
import { BAN_STATUS_LABEL, buildBanDecision, effectiveBanStatus, banReasonText, banPendingKind } from '../../lib/vnext/banSupport';
import { useKycMap, useAllKyc, KycCells, useMyKyc } from './KycViews';
import { canSeeOthersKyc, type Kyc, accountForLine, hasPayInfo } from '../../lib/vnext/kyc';
import { kycRequired } from '../../lib/vnext/onboarding';
import { isBanKdLeader, isBanKdDeputy } from '../lib/orgPermissions';
import { loadXlsx } from '../lib/loadXlsx';

export const SUPPORT_APPROVE = 'vn.ns.support_approve';
export const SUPPORT_EXPORT = 'vn.ns.support_export';

/** Nghe nsSupport trong phạm vi được đọc (khớp rules).
 * Trưởng/Phó Ban: thêm query projectId ∈ dự án Ban (giống BanKdManagementView) —
 * trước đây chỉ tải ownerUid==self → trang chủ «NS Ban của tôi» thiếu nsSupport → mọi dòng thành «Chờ duyệt».
 */
export function useSupport(c: VCtx, periods: string[], opts: { blockIds?: string[]; mine?: boolean } = {}) {
  const [m, setM] = useState<Record<string, Support>>({});
  const banPids = (c.myBanKdIds || []).length
    ? (c.projects || []).filter((p: any) => p?.id && c.myBanKdIds.includes(String(p.banKdId || ''))).map((p: any) => String(p.id)).sort()
    : [] as string[];
  const key = periods.join(',') + '|' + (opts.blockIds || []).join(',') + '|' + (opts.mine ? 'm' : '') + '|' + banPids.join(',') + '|' + c.uid + c.role;
  useEffect(() => {
    if (!c.uid || !periods.length) return;
    const base = collection(c.db, SUPPORT_COLLECTION);
    const qs: [string, any][] = [];
    if (opts.mine) qs.push(['me', query(base, where('ownerUid', '==', c.uid))]);
    else if (canViewAll(c)) qs.push(['all', query(base, where('period', 'in', periods.slice(0, 10)))]);
    else {
      if (isKhoiMgr(c)) for (const b of (opts.blockIds || c.myBlockIds)) if (c.myBlockIds.includes(b)) qs.push(['b' + b, query(base, where('blockId', '==', b))]);
      if (c.role === 'gdkd') for (const t of gdkdTeams(c)) qs.push(['t' + t, query(base, where('teamId', '==', t))]);
      // Trưởng / Phó Ban (và user có myBanKdIds): nsSupport theo dự án Ban — rules: isBanMgrOf(project.banKdId).
      for (let i = 0; i < banPids.length; i += 30) {
        const ch = banPids.slice(i, i + 30);
        qs.push(['ban' + i, query(base, where('projectId', 'in', ch))]);
      }
      qs.push(['me', query(base, where('ownerUid', '==', c.uid))]);
    }
    const parts: Record<string, Support[]> = {};
    const push = () => { const o: Record<string, Support> = {}; Object.values(parts).flat().forEach((s) => { if (periods.includes(s.period)) o[s.id] = s; }); setM(o); };
    const un = qs.map(([k, q]) => onSnapshot(q, (s: any) => { parts[k] = s.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) })); push(); }, () => { parts[k] = []; push(); }));
    return () => un.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.db, key]);
  return m;
}

export function SupportBadge({ status, title, line, s }: { status: SupportStatus; title?: string; line?: NsLine; s?: Partial<Support> | null }) {
  if (!line) return <StatusBadge status={status as St5} title={title} />;
  const k = stageOf(status as St5, line, s);
  return <span data-stage={k}><StatusBadge status={stageMetaKey(k)} title={title} label={STAGE_LABEL[k]} /></span>;
}

export async function decideSupport(c: VCtx, line: NsLine, prev: Support | undefined, status: StoredStatus, reason = '', pay?: { has: boolean }) {
  if (status === 'approved' && pay && !pay.has) throw new Error('Người đăng ký chưa cập nhật thông tin thanh toán (STK) — chưa duyệt được');
  const before = effectiveStatus(line, prev);
  await setDoc(doc(c.db, SUPPORT_COLLECTION, line.id), buildDecision(line, prev, { uid: c.uid, name: c.name }, status, reason));
  await writeLineHist(c, line, status, before === 'reapproval' && prev ? [{ field: 'amount', from: String(prev.amount), to: String(line.amount) }] : [], reason, before);
  const email = (line as any).ownerEmail || c.users.find((u) => (u.uid || u.id) === line.ownerUid)?.email;
  const msg = `Bản đăng ký NS MKT ${periodLabel(line.period)} · ${projectName(c, line.projectId)} · ${fmt(line.amount)} đ: ${SUPPORT_LABEL[status]}${reason ? ` — ${reason}` : ''} (bởi ${c.name}).`;
  await notifyUser(c, { email, uid: line.ownerUid }, `Hỗ trợ MKT: ${SUPPORT_LABEL[status]}`, msg, { type: 'ns_support', lineId: line.id }).catch(() => {});
  if (status === 'approved' || status === 'rejected') await pushNotif(c, line.ownerUid, { type: status, title: `NS MKT ${SUPPORT_LABEL[status]}: ${projectName(c, line.projectId)}`, body: msg, link: '/quan-ly-phong-kd', refId: line.id });
  if (status === 'approved') {
    const banId = String(c.projects.find((p) => p.id === line.projectId)?.banKdId || '');
    const body = `${periodLabel(line.period)} · ${projectName(c, line.projectId)} · ${fmt(line.amount)} đ · ${line.ownerName || line.ownerUid} — chờ Ban duyệt`;
    for (const u of new Set(banManagers(c, banId))) {
      await pushNotif(c, u, { type: 'pending', title: `Chờ Ban duyệt: ${projectName(c, line.projectId)}`, body, link: '/quan-ly-ban-kd', refId: line.id });
    }
  }
}

/** Trưởng Ban (hoặc Admin/KT) duyệt / từ chối / đặt lại chờ duyệt tầng Ban (kể cả đổi quyết định đã có / grandfather). */
export async function decideBanSupport(c: VCtx, line: NsLine, prev: Support | undefined, banStatus: 'approved' | 'rejected' | 'pending', reason = '') {
  await decideBanSupportBatch(c, [{ line, prev }], banStatus, reason);
}

/** Duyệt Ban hàng loạt (theo Khối): writeBatch nsSupport (≤450/lần), thông báo fire-and-forget. */
export async function decideBanSupportBatch(
  c: VCtx,
  items: Array<{ line: NsLine; prev?: Support }>,
  banStatus: 'approved' | 'rejected' | 'pending',
  reason = '',
  role?: BanApproverRole,
): Promise<{ written: number; skipped: number }> {
  if (!items.length) return { written: 0, skipped: 0 };
  const why = String(reason || '').trim();
  if ((banStatus === 'rejected' || banStatus === 'pending') && why.length < 3) {
    throw new Error(banStatus === 'rejected' ? 'Từ chối Ban cần lý do (≥ 3 ký tự)' : 'Đặt lại Ban cần lý do (≥ 3 ký tự)');
  }
  const ready: Array<{ line: NsLine; prev?: Support; payload: ReturnType<typeof buildBanDecision> }> = [];
  for (const it of items) {
    const gdk = effectiveStatus(it.line, it.prev);
    if (gdk !== 'approved' && gdk !== 'need_pay') {
      throw new Error(`Dòng ${it.line.id}: chỉ duyệt Ban khi GĐK đã duyệt (hoặc Chờ STK)`);
    }
    ready.push({ ...it, payload: buildBanDecision(it.line, it.prev, { uid: c.uid, name: c.name, ...(role ? { role } : {}) }, banStatus, why) });
  }
  // Phó Ban: transaction đọc bản hiện hành → bỏ qua dòng Trưởng Ban đã quyết định (rules cũng chặn khi ghi đồng thời).
  // Trưởng Ban / Admin: batch như cũ (Trưởng Ban luôn thắng).
  const skippedIds = new Set<string>();
  if (role === 'deputy') {
    const CH = 100;
    for (let i = 0; i < ready.length; i += CH) {
      const slice = ready.slice(i, i + CH);
      await runTransaction(c.db, async (tx) => {
        const snaps = await Promise.all(slice.map((r) => tx.get(doc(c.db, SUPPORT_COLLECTION, r.line.id))));
        slice.forEach((r, k) => {
          const cur = snaps[k].exists() ? (snaps[k].data() as any) : null;
          if (deputyBlocked('deputy', cur)) { skippedIds.add(r.line.id); return; }
          // Dùng bản mới nhất làm prev (giữ history người khác vừa ghi).
          const fresh = cur ? buildBanDecision(r.line, cur, { uid: c.uid, name: c.name, role: 'deputy' }, banStatus, why) : r.payload;
          tx.set(doc(c.db, SUPPORT_COLLECTION, r.line.id), fresh);
        });
      });
    }
  } else {
    const CHUNK = 450;
    for (let i = 0; i < ready.length; i += CHUNK) {
      const slice = ready.slice(i, i + CHUNK);
      const batch = writeBatch(c.db);
      for (const r of slice) batch.set(doc(c.db, SUPPORT_COLLECTION, r.line.id), r.payload);
      await batch.commit();
    }
  }
  if (skippedIds.size) {
    const keep = ready.filter((r) => !skippedIds.has(r.line.id));
    ready.length = 0; ready.push(...keep);
  }
  const label = BAN_STATUS_LABEL[banStatus];
  const notifType = banStatus === 'approved' ? 'approved' : banStatus === 'rejected' ? 'rejected' : 'reapproval';
  // Thông báo từng NV — không chặn batch.
  void Promise.all(ready.map(async (r) => {
    try {
      const email = (r.line as any).ownerEmail || c.users.find((u) => (u.uid || u.id) === r.line.ownerUid)?.email;
      const msg = `NS MKT ${periodLabel(r.line.period)} · ${projectName(c, r.line.projectId)} · ${fmt(r.line.amount)} đ: ${label}${why ? ` — ${why}` : ''} (bởi ${c.name}).`;
      await notifyUser(c, { email, uid: r.line.ownerUid }, `Ban KD: ${label}`, msg, { type: 'ns_support', lineId: r.line.id }).catch(() => {});
      await pushNotif(c, r.line.ownerUid, { type: notifType, title: `${label}: ${projectName(c, r.line.projectId)}`, body: msg, link: '/quan-ly-phong-kd', refId: r.line.id });
    } catch { /* ignore */ }
  }));
  // Phong t343u: Từ chối / Đặt lại → thông báo GĐK + Trợ lý Khối (chuông), kèm lý do / Ban / dự án / kỳ / số dòng.
  if (banStatus === 'rejected' || banStatus === 'pending') {
    void (async () => {
      try {
        const byBlock = new Map<string, typeof ready>();
        for (const r of ready) {
          const bid = r.line.blockId || '_none';
          if (!byBlock.has(bid)) byBlock.set(bid, []);
          byBlock.get(bid)!.push(r);
        }
        for (const [blockId, list] of byBlock) {
          const periods = [...new Set(list.map((r) => periodLabel(r.line.period)))].join(', ');
          const projects = [...new Set(list.map((r) => projectName(c, r.line.projectId)))].slice(0, 5);
          const banNames = [...new Set(list.map((r) => {
            const p = c.projects.find((x) => x.id === r.line.projectId) as any;
            const ban = c.banKds.find((b) => b.id === p?.banKdId);
            return ban?.name || p?.banKdName || 'Ban';
          }))];
          const title = banStatus === 'rejected'
            ? `Ban từ chối ${list.length} dòng NS · ${blockName(c, blockId) || 'Khối'}`
            : `Ban đặt lại ${list.length} dòng NS · ${blockName(c, blockId) || 'Khối'}`;
          const body = [
            `Lý do: ${why}`,
            `Ban: ${banNames.join(', ')}`,
            `Kỳ: ${periods}`,
            `Dự án: ${projects.join(', ')}${projects.length < new Set(list.map((r) => r.line.projectId)).size ? '…' : ''}`,
            `Số dòng: ${list.length}`,
            `(${c.name})`,
          ].join(' · ');
          const link = '/quan-ly-khoi';
          const refId = list[0]?.line.id || '';
          for (const u of new Set(khoiManagers(c, blockId === '_none' ? undefined : blockId))) {
            await pushNotif(c, u, { type: notifType, title: title.slice(0, 200), body, link, refId });
          }
        }
      } catch { /* ignore */ }
    })();
  }
  return { written: ready.length, skipped: skippedIds.size };
}

/** Thông tin thanh toán theo TÀI KHOẢN NHẬN TIỀN đã chọn trên dòng NS (không chọn → mặc định). */
function lineKyc(k: Kyc | null | undefined, line: NsLine): Kyc | null {
  if (!k) return null;
  const a = accountForLine(k, line.payAccount);
  return a ? { ...k, bankAccount: a.bankAccount, bankName: a.bankName, accountHolder: a.accountHolder } : { ...k, bankAccount: line.payAccount ? '(TK đã xoá ••' + line.payAccount.tail + ')' : k.bankAccount };
}
type Row = { line: NsLine; s?: Support; status: SupportStatus; kyc?: Kyc | null };

async function exportXlsx(c: VCtx, rows: Row[], fileName: string) {
  const XLSX = await loadXlsx();
  const data = rows.map((r) => ({
    'Tháng': periodLabel(r.line.period), 'Khối': blockName(c, r.line.blockId), 'Phòng': teamName(c, r.line.teamId), 'Họ tên': r.line.ownerName || userName(c, r.line.ownerUid),
    'Email': r.line.ownerEmail || '', 'Dự án': projectName(c, r.line.projectId),
    ...excelSupportPctFields(c.projects.find((p) => p.id === r.line.projectId), c.banKds || [], r.line.period),
    'Ngân sách đăng ký (đ)': Number(r.line.amount) || 0,
    'Số CCCD': r.kyc?.cccd || '', 'Số tài khoản': r.kyc?.bankAccount || '', 'Tên chủ tài khoản': r.kyc?.accountHolder || '', 'Ngân hàng': r.kyc?.bankName || '',
    'Trạng thái': stageLabel(r.status as St5, r.line, r.s), 'Nhóm (ô tổng)': BUCKET_LABEL[bucketOf(stageOf(r.status as St5, r.line, r.s))], 'Màu trạng thái': ST_COLOR_NAME[r.status as St5], 'Lý do': r.s?.status === 'rejected' ? r.s?.reason || '' : '', 'Người duyệt': isAutoNow(r.line, r.s) ? AUTO_APPROVED_NOTE : r.s?.decidedByName || '', 'Thời điểm duyệt': r.s?.decidedAt ? vnTime(r.s.decidedAt) : '',
    'Trạng thái Ban': BAN_STATUS_LABEL[effectiveBanStatus(r.line, r.s)], 'Lý do Ban': banReasonText(r.s), 'Người duyệt Ban': r.s?.banDecidedByName || '', 'Thời điểm Ban duyệt': r.s?.banDecidedAt ? vnTime(r.s.banDecidedAt) : '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  // CCCD / STK là chuỗi (giữ số 0 đầu, không thành số mũ). Cột tỉ lệ ngay sau Dự án.
  ws['!cols'] = [10, 14, 18, 24, 26, 26, 14, 36, 18, 16, 18, 24, 16, 16, 24, 20, 18, 14, 24, 18, 18].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Duyet ho tro MKT');
  XLSX.writeFile(wb, fileName);
}

function Filters({ c, rows, f, setF, showStatus = true, buckets = false }: { c: VCtx; rows: Row[]; f: any; setF: (f: any) => void; showStatus?: boolean; buckets?: boolean }) {
  const teams = [...new Set(rows.map((r) => r.line.teamId).filter(Boolean))] as string[];
  const users = [...new Map(rows.filter((r) => !f.teamId || r.line.teamId === f.teamId).map((r) => [r.line.ownerUid, r.line.ownerName || userName(c, r.line.ownerUid)])).entries()];
  const projects = [...new Set(rows.map((r) => r.line.projectId))];
  const active = [f.teamId, f.ownerUid, f.projectId, showStatus ? f.status : ''].filter(Boolean).length;
  const fields = <>
    <Field label="Phòng"><SearchSelect value={f.teamId || ''} onChange={(v: string) => setF({ ...f, teamId: v, ownerUid: '' })} options={[{ value: '', label: 'Tất cả' }, ...teams.map((t) => ({ value: t, label: teamName(c, t) }))]} data-testid="vn-sup-f-team" /></Field>
    <Field label="User"><SearchSelect value={f.ownerUid || ''} onChange={(v: string) => setF({ ...f, ownerUid: v })} options={[{ value: '', label: 'Tất cả' }, ...users.map(([u, n]) => ({ value: u as string, label: n as string }))]} data-testid="vn-sup-f-user" /></Field>
    <Field label="Dự án"><SearchSelect value={f.projectId || ''} onChange={(v: string) => setF({ ...f, projectId: v })} options={[{ value: '', label: 'Tất cả' }, ...projects.map((p) => ({ value: p, label: projectName(c, p) }))]} data-testid="vn-sup-f-project" /></Field>
    {showStatus && <Field label="Trạng thái"><SearchSelect sort={false} value={f.status || ''} onChange={(v: string) => setF({ ...f, status: v })} options={[{ value: '', label: 'Tất cả' }, { value: 'todo', label: 'Cần xử lý (chờ + duyệt lại)' }, ...(buckets ? (['pending', 'reapproval', 'need_pay', 'khoi_ok', 'approved', 'rejected'] as Bucket[]).map((s) => ({ value: s, label: BUCKET_LABEL[s] })) : (['pending', 'reapproval', 'need_pay', 'approved', 'rejected'] as SupportStatus[]).map((s) => ({ value: s, label: SUPPORT_LABEL[s] }))), { value: 'ban_pending', label: 'Chờ Ban KD duyệt' }, { value: 'ban_reapproval', label: 'Chờ Ban KD duyệt lại' }]} data-testid="vn-sup-f-status" /></Field>}
  </>;
  return <FilterSheet activeCount={active}>{fields}</FilterSheet>;
}

/** Quản lý Khối › Duyệt hỗ trợ MKT (GĐ Khối / Trợ lý Khối của Khối; Admin). */
export function SupportReviewPanel({ c, blockId, period, lines }: { c: VCtx; blockId?: string; period: string; lines: NsLine[] }) {
  const sup = useSupport(c, [period], { blockIds: blockId ? [blockId] : [] });
  const own = lines.filter((l) => supportable(l) && l.period === period && l.blockId === blockId);
  const canSee = canSeeOthersKyc(c.role);
  const kycs = useKycMap(c, own.map((l) => l.ownerUid || ''), canSee && !!own.length);
  const canDecide = vnCan(c, SUPPORT_APPROVE) && (isAdm(c) || (isKhoiMgr(c) && !!blockId && c.myBlockIds.includes(blockId)));
  const canExport = vnCan(c, SUPPORT_EXPORT) && canSee;
  const [f, setF] = useState<any>(() => { try { const v = sessionStorage.getItem(SUPPORT_FILTER_KEY); if (v) { setTimeout(() => { try { sessionStorage.removeItem(SUPPORT_FILTER_KEY); } catch { /* */ } }, 3000); return { status: v }; } } catch { /* */ } return { status: '' }; });
  const [histRow, setHistRow] = useState<Row | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [rej, setRej] = useState<Row[] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  const pay = usePayMap(c.db);
  const [mode, setMode] = useViewMode('support-review', c.uid);
  const [focus] = useState(() => { try { const v = sessionStorage.getItem(FOCUS_KEY) || ''; sessionStorage.removeItem(FOCUS_KEY); return v; } catch { return ''; } });
  useEffect(() => { if (!focus) return; const h = setTimeout(() => document.querySelector(`[data-line="${focus}"]`)?.scrollIntoView({ block: 'center' }), 600); return () => clearTimeout(h); }, [focus]);
  const all: Row[] = useMemo(() => own.map((line) => { const s = sup[line.id]; return { line, s, status: effectiveStatus(line, s, payOf(pay, line.ownerUid)), kyc: lineKyc(kycs[line.ownerUid || ''], line) }; })
    .sort((a, b) => String(a.line.ownerName || '').localeCompare(String(b.line.ownerName || ''), 'vi') || projectName(c, a.line.projectId).localeCompare(projectName(c, b.line.projectId), 'vi')), [own, sup, kycs, pay, c.blocks]);
  const banKind = f.status === 'ban_pending' ? 'first' : f.status === 'ban_reapproval' ? 'reapproval' : null;
  const rows = banKind
    ? filterRows(all, { ...f, status: '' }).filter((r) => banPendingKind(r.line, r.s) === banKind)
    : filterRows(all, f);
  const split = useMemo(() => splitByStatus(own, sup, pay), [own, sup, pay, c.blocks]);
  if (!blockId) return <Card className="p-5 text-[13px]">Bạn chưa được gán Khối.</Card>;

  const run = async (list: Row[], status: StoredStatus, why = '') => {
    if (!list.length) return;
    setBusy(true); let ok = 0; const errs: string[] = [];
    for (const r of list) { try { await decideSupport(c, r.line, r.s, status, why, payOf(pay, r.line.ownerUid)); ok++; } catch (e: any) { errs.push(e?.code || e?.message); } }
    setBusy(false); setSel(new Set());
    toast(errs.length ? `Xong ${ok}/${list.length} — lỗi: ${errs[0]}` : `Đã cập nhật ${ok} bản đăng ký: ${SUPPORT_LABEL[status]}`, errs.length ? 'err' : 'ok');
  };
  const actions = (r: Row) => <><Btn small onClick={() => setHistRow(r)} data-testid="vn-support-history">Lịch sử</Btn>{' '}{<>
    {r.status !== 'approved' && <Btn small primary disabled={busy || r.status === 'need_pay'} title={r.status === 'need_pay' ? 'Người đăng ký chưa cập nhật thông tin thanh toán' : undefined} onClick={() => run([r], 'approved')} data-testid="vn-support-approve">{r.status === 'reapproval' ? 'Duyệt lại' : 'Duyệt'}</Btn>}{' '}
    {r.status !== 'rejected' && <Btn small danger disabled={busy} onClick={() => { setReason(''); setRej([r]); }} data-testid="vn-support-reject">Từ chối</Btn>}{' '}
    {(r.s || isAutoApproved(r.line)) && r.status !== 'pending' && r.status !== 'reapproval' && <Btn small disabled={busy} onClick={() => run([r], 'pending')} data-testid="vn-support-reset">Đặt lại</Btn>}
  </>}</>;
  const notes = (r: Row) => { const ban = effectiveBanStatus(r.line, r.s); return <>
    {r.status === 'need_pay' && <div className="text-[11px] text-[#6B2FB3] max-w-[260px]" data-testid="vn-support-needpay">Người đăng ký chưa có STK nhận tiền — chưa duyệt được{isAutoApproved(r.line) ? '; NS Khối sẽ tự duyệt lại khi cập nhật' : '; cập nhật xong sẽ về «Chờ duyệt»'}.</div>}
    {isAutoNow(r.line, r.s) && r.status !== 'need_pay' && <div className="text-[11px] text-[#0F7B4A]" data-testid="vn-support-auto">{AUTO_APPROVED_NOTE}</div>}
    {r.status === 'reapproval' && r.s && <div className="text-[11px] text-[var(--mh-warn)]" data-testid="vn-support-reappr">Đã duyệt {fmt(r.s.amount)} → nay {fmt(r.line.amount)}{Number(r.s.amount) === Number(r.line.amount) ? ' (sửa lại, số tiền không đổi)' : ''}</div>}
    {r.s?.status === 'rejected' && r.s.reason && <div className="text-[11px] text-[var(--mh-err)] max-w-[260px]">{r.s.reason}</div>}
    {(ban === 'pending' || ban === 'rejected') && <div className={`text-[11px] max-w-[260px] ${ban === 'rejected' ? 'text-[var(--mh-err)]' : 'text-[var(--mh-warn)]'}`} data-testid="vn-support-ban">{BAN_STATUS_LABEL[ban]}{banReasonText(r.s) ? ` — ${banReasonText(r.s)}` : ''}</div>}
  </>; };
  const selRows = rows.filter((r) => sel.has(r.line.id) && r.status !== 'need_pay');
  const pickable = rows.filter((r) => r.status !== 'need_pay');
  return (
    <div className="space-y-3 font-['Be_Vietnam_Pro',sans-serif]" data-testid="vn-support-review">
      <div className="flex flex-wrap gap-2 items-end">
        <Filters c={c} rows={all} f={f} setF={setF} />
        {canExport && <Btn onClick={() => exportXlsx(c, rows, exportFileName({ blockCode: blockId ? blockCodeOf(c.blocks.find((b) => b.id === blockId)) || blockId : '', month: period, teamCode: f.teamId ? teamCodeOf(c.teams.find((t) => t.id === f.teamId)) : '', projectName: f.projectId ? projectName(c, f.projectId) : '' }, 'xlsx'))} data-testid="vn-support-export">⬇ Xuất Excel</Btn>}
      </div>
      <StatusSplitKpis split={split} testId="vn-support-split" onPick={(st) => setF({ ...f, status: st })} active={f.status} />
      <Card>
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-[var(--mh-border)]">
          <div className="font-semibold text-[14px] flex-1">Duyệt hỗ trợ MKT · {blockName(c, blockId)} · {periodLabel(period)} ({rows.length})</div>
          <ViewToggle mode={mode} onChange={setMode} />
          {canDecide && <>
            <Btn small primary disabled={busy || !selRows.length} onClick={() => run(selRows, 'approved')} data-testid="vn-support-bulk-approve">✓ Duyệt {selRows.length || ''} đã chọn</Btn>
            <Btn small danger disabled={busy || !selRows.length} onClick={() => { setReason(''); setRej(selRows); }}>Từ chối đã chọn</Btn>
          </>}
        </div>
        {!rows.length ? <Empty>Không có bản đăng ký nào</Empty> : mode === 'card' ? (
          <div className="p-2.5 grid gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="vn-support-cards">
            {rows.map((r) => <div key={r.line.id} data-testid="vn-support-row" data-line={r.line.id} className={`rounded-xl border p-3 space-y-1.5 ${focus === r.line.id ? 'border-[var(--mh-navy)] ring-2 ring-[#BFD0F5]' : 'border-[var(--mh-border)]'}`}>
              <div className="flex items-start gap-2">
                {canDecide && r.status !== 'need_pay' && <input type="checkbox" className="mt-1" aria-label="Chọn" checked={sel.has(r.line.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(r.line.id) : n.delete(r.line.id); setSel(n); }} />}
                <div className="flex-1 min-w-0"><div className="font-semibold text-[14px] truncate">{r.line.ownerName || userName(c, r.line.ownerUid)}</div><div className="text-[11px] text-[var(--mh-text-3)]">{r.line.kind === 'khoi' ? 'NS Khối' : teamName(c, r.line.teamId)}</div></div>
                <SupportBadge status={r.status} />
              </div>
              <div className="flex text-[13px]"><span className="flex-1 truncate">{projectName(c, r.line.projectId)}</span><b className="tabular-nums">{fmt(r.line.amount)} đ</b></div>
              {canSee && <div className="text-[11px] text-[var(--mh-text-2)]">{r.kyc?.bankAccount ? `${r.kyc.bankName} · ${r.kyc.bankAccount} · ${r.kyc.accountHolder}` : 'Chưa khai TT thanh toán'}</div>}
              {notes(r)}
              {canDecide && <div className="flex flex-wrap gap-1.5 pt-1">{actions(r)}</div>}
            </div>)}
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full" data-testid="vn-support-table"><thead><tr>
            {canDecide && <Th><input type="checkbox" aria-label="Chọn tất cả" checked={pickable.length > 0 && pickable.every((r) => sel.has(r.line.id))} onChange={(e) => setSel(e.target.checked ? new Set(pickable.map((r) => r.line.id)) : new Set())} /></Th>}
            <Th>Họ tên</Th><Th className="hidden md:table-cell">Dự án</Th><Th r className="hidden md:table-cell">Ngân sách đăng ký</Th><Th className="hidden md:table-cell">CCCD</Th><Th className="hidden md:table-cell">STK</Th><Th className="hidden md:table-cell">Chủ TK</Th><Th className="hidden md:table-cell">Ngân hàng</Th><Th>Trạng thái</Th>{canDecide && <Th></Th>}
          </tr></thead><tbody>
            {rows.map((r) => <tr key={r.line.id} data-testid="vn-support-row" data-line={r.line.id} className={focus === r.line.id ? "bg-[#EEF3FF]" : ""}>
              {canDecide && <Td>{r.status !== 'need_pay' && <input type="checkbox" aria-label="Chọn" checked={sel.has(r.line.id)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(r.line.id) : n.delete(r.line.id); setSel(n); }} />}</Td>}
              <Td><div className="font-medium">{r.line.ownerName || userName(c, r.line.ownerUid)}</div><div className="text-[11px] text-[var(--mh-text-3)]">{r.line.kind === 'khoi' ? 'NS Khối' : teamName(c, r.line.teamId)}</div>
                <div className="md:hidden text-[12px] mt-0.5" data-testid="vn-support-mobile-info">{projectName(c, r.line.projectId)} · <b>{fmt(r.line.amount)}</b>{canSee && <div className="text-[11px] text-[var(--mh-text-2)]">{r.kyc?.bankAccount ? `${r.kyc.bankName} · ${r.kyc.bankAccount} · ${r.kyc.accountHolder}` : 'Chưa khai TT thanh toán'}</div>}</div></Td>
              <Td className="hidden md:table-cell">{projectName(c, r.line.projectId)}</Td>
              <Td r className="font-semibold hidden md:table-cell">{fmt(r.line.amount)}</Td>
              <Td className="tabular-nums text-[12px] hidden md:table-cell" data-testid="vn-support-cccd">{canSee ? (r.kyc ? r.kyc.cccd : <Badge c="warn">Chưa khai</Badge>) : 'Ẩn'}</Td>
              <Td className="tabular-nums text-[12px] hidden md:table-cell">{canSee ? r.kyc?.bankAccount || '—' : 'Ẩn'}</Td>
              <Td className="text-[12px] font-medium hidden md:table-cell" data-testid="vn-support-holder">{canSee ? r.kyc?.accountHolder || '—' : 'Ẩn'}</Td>
              <Td className="text-[12px] hidden md:table-cell">{canSee ? r.kyc?.bankName || '—' : 'Ẩn'}</Td>
              <Td><SupportBadge status={r.status} title={isAutoNow(r.line, r.s) ? AUTO_APPROVED_NOTE : r.s ? `${r.s.decidedByName} · ${vnTime(r.s.decidedAt)}${r.s.reason ? ' · ' + r.s.reason : ''}` : undefined} />
                {notes(r)}</Td>
              {canDecide && <Td r className="whitespace-nowrap">{actions(r)}</Td>}
            </tr>)}
          </tbody></table></div>
        )}
        <div className="px-4 py-2.5 text-[11px] text-[var(--mh-text-3)] border-t border-[var(--mh-border)]">Mỗi dòng = 1 bản đăng ký NS MKT (user × dự án × tháng). Người dùng nhận thông báo khi trạng thái thay đổi. Khoản đã duyệt mà người đăng ký sửa bất kỳ thông tin nào → «Cần duyệt lại» (hiện số đã duyệt và số mới). NS Khối do GĐ Khối / Trợ lý Khối đăng ký được tự động duyệt.</div>
      </Card>
      <Modal open={!!rej} onClose={() => setRej(null)} title={`Từ chối ${rej?.length || 0} bản đăng ký`} footer={<><Btn onClick={() => setRej(null)}>Huỷ</Btn><Btn danger disabled={busy || reason.trim().length < 3} onClick={async () => { const l = rej!; setRej(null); await run(l, 'rejected', reason.trim()); }} data-testid="vn-support-reject-confirm">Từ chối</Btn></>}>
        <Field label="Lý do (bắt buộc, tối thiểu 3 ký tự)"><Input value={reason} onChange={(e: any) => setReason(e.target.value)} maxLength={300} data-testid="vn-support-reason" /></Field>
      </Modal>
      {histRow && <LineHistoryModal c={c} line={histRow.line} s={histRow.s} onClose={() => setHistRow(null)} />}
      {node}
    </div>
  );
}

/** Admin › Vận hành › Ngân sách MKT › Bản ghi đăng ký: lọc Phòng / User / Dự án / Tháng / Trạng thái, nhóm theo dự án. */
/** Cột dùng chung mọi nhóm dự án (table-layout: fixed) → các nhóm thẳng cột với nhau. */
const NS_REC_COLS = ['14%', '19%', '8%', '10%', '19%', '15%', '15%'];
function NsRecordsCols() {
  return <colgroup data-testid="vn-admin-ns-cols">{NS_REC_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>;
}

/** Ô tổng Ngân sách MKT: Tổng + Ban KD đã duyệt + Khối đã duyệt + chờ GĐK / duyệt lại / Chờ STK / Từ chối (cộng lại = Tổng). */
const KHOI_OK_META = { fg: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' };
function BucketSummary({ split, onPick, active }: { split: BucketSplit; onPick: (s: string) => void; active?: string }) {
  const cell = (key: string, label: string, n: number, amount: number, m?: { fg: string; bg: string; border: string }) => (
    <button type="button" key={key || 'all'} onClick={() => onPick(active === key ? '' : key)}
      className={`text-left rounded-xl border px-3 py-2 min-w-0 cursor-pointer hover:shadow-sm ${active === key && key ? 'ring-2 ring-offset-1' : ''}`}
      style={{ background: m?.bg || 'var(--mh-surface)', borderColor: m?.border || 'var(--mh-border)', color: m?.fg || 'var(--mh-text)' }} data-testid={`vn-sum-${key || 'total'}`} data-n={n} data-amount={amount}>
      <div className="text-[11px] font-semibold truncate opacity-90">{label} ({n})</div>
      <div className="text-[16px] font-bold tabular-nums truncate">{fmt(amount)} <span className="text-[11px] font-normal">đ</span></div>
    </button>);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" data-testid="vn-status-split" data-total={split.total}>
      {cell('', 'Tổng đăng ký', split.n, split.total)}
      {BUCKET_ORDER.map((k) => cell(k, BUCKET_LABEL[k], split[k].n, split[k].amount, k === 'khoi_ok' ? KHOI_OK_META : ST_META[k as keyof typeof ST_META]))}
    </div>);
}

export function AdminNsRecords({ c }: { c: VCtx }) {
  const [period, setPeriod] = useState(defaultPeriod(c.settings));
  const { lines } = useNsLines(c, [period], 'all');
  const sup = useSupport(c, [period]);
  const pay = usePayMap(c.db);
  const canSee = canSeeOthersKyc(c.role);
  const kycAll = useAllKyc(c, canSee && canViewAll(c));
  const [f, setF] = useState<any>({ status: '' });
  const [blockId, setBlockId] = useState('');
  const [mode, setMode] = useViewMode('admin-ns', c.uid);
  const all: Row[] = useMemo(() => lines.filter((l) => supportable(l) && l.period === period && (!blockId || l.blockId === blockId))
    .map((line) => ({ line, s: sup[line.id], status: effectiveStatus(line, sup[line.id], payOf(pay, line.ownerUid)), kyc: lineKyc(kycAll[line.ownerUid || ''], line) })), [lines, sup, period, blockId, kycAll, pay, c.blocks]);
  const banKind = f.status === 'ban_pending' ? 'first' : f.status === 'ban_reapproval' ? 'reapproval' : null;
  const isBucket = !banKind && BUCKET_ORDER.includes(f.status) && f.status !== 'pending' && f.status !== 'reapproval' && f.status !== 'need_pay';
  const rows = banKind
    ? filterRows(all, { ...f, status: '' }).filter((r) => banPendingKind(r.line, r.s) === banKind)
    : filterRows(all, isBucket ? { ...f, status: '' } : f).filter((r) => !isBucket || bucketOf(stageOf(r.status as St5, r.line, r.s)) === f.status);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { if (!m.has(r.line.projectId)) m.set(r.line.projectId, []); m.get(r.line.projectId)!.push(r); }
    return [...m.entries()].map(([pid, rs]) => ({ pid, rs: rs.sort((a, b) => String(a.line.ownerName || '').localeCompare(String(b.line.ownerName || ''), 'vi')), total: rs.reduce((s, r) => s + Number(r.line.amount || 0), 0) }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);
  const blocks = [...new Set(lines.filter(supportable).map((l) => l.blockId).filter(Boolean))] as string[];
  return (
    <div className="space-y-3" data-testid="vn-admin-ns-records">
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Tháng"><PeriodPicker value={period} onChange={setPeriod} settings={c.settings} db={c.db} /></Field>
        <Field label="Khối"><SearchSelect value={blockId} onChange={(v: string) => { setBlockId(v); setF({ ...f, teamId: '', ownerUid: '' }); }} options={[{ value: '', label: 'Tất cả' }, ...blocks.map((b) => ({ value: b, label: blockName(c, b) }))]} /></Field>
        <Filters c={c} rows={all} f={f} setF={setF} buckets />
        {vnCan(c, SUPPORT_EXPORT) && canSee && <Btn onClick={() => exportXlsx(c, rows, exportFileName({ blockCode: blockId ? blockCodeOf(c.blocks.find((b) => b.id === blockId)) || blockId : '', month: period, teamCode: f.teamId ? teamCodeOf(c.teams.find((t) => t.id === f.teamId)) : '', projectName: f.projectId ? projectName(c, f.projectId) : '' }, 'xlsx'))} data-testid="vn-admin-ns-export">⬇ Xuất Excel</Btn>}
        <ViewToggle mode={mode} onChange={setMode} />
      </div>
      <BucketSummary split={splitByBucket(all)} onPick={(st) => setF({ ...f, status: st })} active={f.status} />
      {!groups.length ? <Card><Empty>Không có bản ghi đăng ký cho bộ lọc này</Empty></Card> : groups.map((g) => (
        <Card key={g.pid} data-testid="vn-admin-ns-group">
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-[var(--mh-border)] bg-[var(--mh-surface-2)]"><div className="font-semibold text-[14px] flex-1">{projectName(c, g.pid)}{(() => { const e = baseSupportPctAtPeriod(c.projects.find((p) => p.id === g.pid), c.banKds || [], period); return e ? <span className="ml-2 text-[12px] font-medium text-[var(--mh-text-2)]" data-testid="vn-pct-cell" title={e.fallback === 'current' ? 'Không có lịch sử bao phủ kỳ — tỉ lệ hiện tại' : (e.source === 'ban' ? 'Theo Ban KD' : 'Base riêng dự án')}>· Tỉ lệ hỗ trợ MKT {fmtPct(e.pct)}{e.fallback === 'current' ? '*' : ''}</span> : <span className="ml-2 text-[12px] font-medium text-[var(--mh-text-3)]" data-testid="vn-pct-cell">· Tỉ lệ hỗ trợ MKT —</span>; })()}</div><Badge c="info">{g.rs.length} bản ghi · {fmt(g.total)} đ</Badge></div>
          {mode === 'card' ? <div className="p-2.5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{g.rs.map((r) => <div key={r.line.id} data-testid="vn-admin-ns-row" className="rounded-xl border border-[var(--mh-border)] p-3 space-y-1">
            <div className="flex items-start gap-2"><div className="flex-1 min-w-0"><div className="font-semibold text-[13px] truncate">{r.line.ownerName || userName(c, r.line.ownerUid)}</div><div className="text-[11px] text-[var(--mh-text-3)]">{teamName(c, r.line.teamId)} · {blockName(c, r.line.blockId)}</div></div><SupportBadge status={r.status} line={r.line} s={r.s} /></div>
            <div className="text-[13px] font-bold tabular-nums">{fmt(r.line.amount)} đ</div><KycCells k={r.kyc} canSee={canSee} compact />
            {r.s?.status === 'rejected' && r.s.reason && <div className="text-[11px] text-[var(--mh-err)]">{r.s.reason}</div>}
            <div className="text-[11px] text-[var(--mh-text-2)]">{isAutoNow(r.line, r.s) ? AUTO_APPROVED_NOTE : r.s ? `${r.s.decidedByName} · ${vnTime(r.s.decidedAt)}` : '—'}</div></div>)}</div> :
          <div className="overflow-x-auto"><table className="w-full table-fixed min-w-[980px]" data-testid="vn-admin-ns-table"><NsRecordsCols /><thead><tr><Th>Họ tên</Th><Th>Phòng</Th><Th>Khối</Th><Th r>Ngân sách</Th><Th>Thông tin TT</Th><Th>Trạng thái</Th><Th>Người duyệt</Th></tr></thead><tbody>
            {g.rs.map((r) => <tr key={r.line.id} data-testid="vn-admin-ns-row"><Td className="font-medium truncate">{r.line.ownerName || userName(c, r.line.ownerUid)}</Td><Td className="text-[12px] truncate" title={teamName(c, r.line.teamId)}>{teamName(c, r.line.teamId)}</Td><Td className="text-[12px] truncate">{blockName(c, r.line.blockId)}</Td>
              <Td r className="font-semibold tabular-nums whitespace-nowrap">{fmt(r.line.amount)}</Td><Td><KycCells k={r.kyc} canSee={canSee} compact /></Td><Td><SupportBadge status={r.status} line={r.line} s={r.s} />{r.s?.status === 'rejected' && r.s.reason && <div className="text-[11px] text-[var(--mh-err)]">{r.s.reason}</div>}</Td>
              <Td className="text-[11px] text-[var(--mh-text-2)]">{isAutoNow(r.line, r.s) ? AUTO_APPROVED_NOTE : r.s ? `${r.s.decidedByName} · ${vnTime(r.s.decidedAt)}` : '—'}</Td></tr>)}
          </tbody></table></div>}
        </Card>
      ))}
    </div>
  );
}

export const SUPPORT_FILTER_KEY = 'vnSupportFilter';
export const SUPPORT_PERIOD_KEY = 'vnSupportPeriod';

/** 4 ô trạng thái (số khoản + tổng tiền) — dùng chung mọi màn để số khớp nhau. */
/** Ô tổng = SummaryBox (statusUi) — dùng chung mọi màn. */
export function StatusSplitKpis({ split, testId, onPick, active }: { split: StatusSplit; testId?: string; onPick?: (s: any) => void; active?: string }) {
  return <SummaryBox split={split as any} testId={testId} onPick={onPick} active={active} />;
}

/** Lịch sử 1 bản đăng ký: đăng ký, từng lần sửa (trường cũ → mới), duyệt / từ chối kèm lý do. Chỉ đọc. */
export function LineHistoryModal({ c, line, s, onClose }: { c: VCtx; line: NsLine; s?: Support; onClose: () => void }) {
  const [hist, setHist] = useState<LineHist[] | null>(null);
  useEffect(() => {
    const base = collection(c.db, HISTORY_COLLECTION);
    const q = canViewAll(c) ? query(base, where('lineId', '==', line.id))
      : isKhoiMgr(c) && c.myBlockIds.includes(line.blockId || '') ? query(base, where('lineId', '==', line.id), where('blockId', '==', line.blockId))
      : line.ownerUid === c.uid ? query(base, where('lineId', '==', line.id), where('ownerUid', '==', c.uid))
      : query(base, where('lineId', '==', line.id), where('teamId', '==', line.teamId || ''));
    return onSnapshot(q, (x: any) => setHist(x.docs.map((d: any) => d.data() as LineHist)), () => setHist([]));
  }, [c.db, line.id]);
  const items = hist ? timeline(line, s, hist) : [];
  const FIELD: Record<string, string> = { payAccount: 'Tài khoản nhận tiền', amount: 'Số tiền', projectId: 'Dự án', teamId: 'Phòng', blockId: 'Khối', deleted: 'Đã xoá' };
  const val = (f: string, v: string) => f === 'amount' ? fmt(Number(v)) + ' đ' : f === 'projectId' ? projectName(c, v) : f === 'teamId' ? teamName(c, v) : f === 'blockId' ? blockName(c, v) : f === 'deleted' ? (v === 'true' ? 'Có' : 'Không') : v;
  return (
    <Modal open onClose={onClose} wide title={`Lịch sử · ${line.ownerName || userName(c, line.ownerUid)} · ${projectName(c, line.projectId)}`} footer={<Btn onClick={onClose}>Đóng</Btn>}>
      <div data-testid="vn-line-history" className="space-y-2 text-[13px]">
        {hist === null ? <div className="text-[var(--mh-text-3)]">Đang tải…</div> : !items.length ? <Empty>Chưa có lịch sử</Empty> : items.map((h, i) => (
          <div key={i} className="border border-[var(--mh-border)] rounded-lg px-3 py-2" data-testid="vn-line-history-item" data-action={h.action}>
            <div className="flex flex-wrap gap-2 items-center"><Badge c={h.action === 'approved' ? 'ok' : h.action === 'rejected' ? 'err' : h.action === 'update' ? 'warn' : 'info'}>{HIST_LABEL[h.action] || h.action}</Badge>
              <span className="font-medium">{h.byName}</span><span className="text-[var(--mh-text-3)] text-[12px]">{vnTime(h.at)} (giờ VN)</span>{h.legacy && <span className="text-[11px] text-[var(--mh-text-3)]">· ghi nhận cũ</span>}</div>
            {!!h.changes.length && <ul className="mt-1 text-[12px] text-[#3B4A61]">{h.changes.map((x, j) => <li key={j}>{FIELD[x.field] || x.field}: <s className="text-[var(--mh-text-3)]">{val(x.field, x.from)}</s> → <b>{val(x.field, x.to)}</b></li>)}</ul>}
            {h.reason && <div className="mt-1 text-[12px] text-[var(--mh-text-2)]">Lý do: {h.reason}</div>}
          </div>))}
        <div className="text-[11px] text-[var(--mh-text-3)]">Lịch sử chỉ ghi thêm, không ai sửa hay xoá được.</div>
      </div>
    </Modal>
  );
}

/** Khoản cần GĐK / Trợ lý Khối xử lý (Chờ duyệt + Cần duyệt lại) trong các Khối mình, mọi kỳ từ 11/2026. */
export function useKhoiTodo(c: VCtx, enabled: boolean) {
  const [lines, setLines] = useState<Record<string, NsLine[]>>({});
  const [sup, setSup] = useState<Record<string, Record<string, Support>>>({});
  const bkey = enabled ? c.myBlockIds.join(',') : '';
  const pay = usePayMap(c.db, enabled);
  useEffect(() => {
    if (!bkey || !c.uid) { setLines({}); setSup({}); return; }
    const un: (() => void)[] = [];
    for (const b of bkey.split(',')) {
      un.push(onSnapshot(query(collection(c.db, 'ns_lines'), where('blockId', '==', b)), (x: any) => setLines((o) => ({ ...o, [b]: x.docs.map((d: any) => ({ id: d.id, ...d.data() })) })), () => setLines((o) => ({ ...o, [b]: [] }))));
      un.push(onSnapshot(query(collection(c.db, SUPPORT_COLLECTION), where('blockId', '==', b)), (x: any) => setSup((o) => ({ ...o, [b]: Object.fromEntries(x.docs.map((d: any) => [d.id, { id: d.id, ...d.data() }])) })), () => setSup((o) => ({ ...o, [b]: {} }))));
    }
    return () => un.forEach((u) => u());
  }, [c.db, bkey, c.uid]);
  return useMemo(() => {
    const sm: Record<string, Support> = Object.assign({}, ...Object.values(sup));
    const rows = (Object.values(lines) as NsLine[][]).flat().filter((l) => supportable(l) && String(l.period) >= '2026-11' && l.ownerUid !== c.uid)
      .map((line) => ({ line, s: sm[line.id], status: effectiveStatus(line, sm[line.id], payOf(pay, line.ownerUid)) }))
      .filter((r) => r.status === 'pending' || r.status === 'reapproval')
      .sort((a, b) => String(b.line.updatedAt || '').localeCompare(String(a.line.updatedAt || '')));
    const pend = rows.filter((r) => r.status === 'pending'), re = rows.filter((r) => r.status === 'reapproval');
    const amt = (rs: typeof rows) => rs.reduce((a, r) => a + (Number(r.line.amount) || 0), 0);
    return { rows, count: rows.length, pending: { n: pend.length, amount: amt(pend) }, reapproval: { n: re.length, amount: amt(re) }, total: amt(rows), loaded: !!Object.keys(lines).length };
  }, [lines, sup, c.uid, pay, c.blocks]);
}

/** Popup đăng nhập: hiện MỖI lần đăng nhập / tải app cho tới khi xử lý hết (không giới hạn 1 lần/ngày).
 *  «Để sau» chỉ ẩn trong lần tải app hiện tại (bộ nhớ tạm, mất khi tải lại / đăng nhập lại). */
const dismissedThisLoad = new Set<string>();
export const popupDismissed = (k: string) => dismissedThisLoad.has(k);
export const dismissPopup = (k: string) => { dismissedThisLoad.add(k); };
/** Popup GỘP khi GĐK / Trợ lý Khối đăng nhập: «Ngân sách cần duyệt» + «Thành viên chờ duyệt» (mỗi phần ẩn nếu trống;
 *  cả hai trống → không hiện). Tối đa 1 lần / ngày (giờ VN). Thay popup «Thành viên chờ duyệt» riêng. */
export function KhoiTodoPopup({ c, todo, onGo, onGoMembers }: { c: VCtx; todo: ReturnType<typeof useKhoiTodo>; onGo: (period?: string) => void; onGoMembers: () => void }) {
  const key = 'vnKhoiTodoSeen:' + c.uid;
  const memEligible = vnCan(c, 'vn.approvals.review') && vnCan(c, 'vn.approvals.login_popup');
  const reqs = usePendingRequests(c, memEligible);
  const members = memEligible ? actionablePending(c, reqs) : [];
  const [closed, setClosed] = useState(false);
  // Đợi dữ liệu 2 phần tải xong rồi mới quyết định hiện (tránh hiện 1 phần rồi nháy).
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 2500); return () => clearTimeout(t); }, []);
  // NS chờ duyệt / Ban trả về → GdkBanReturnGate (một popup). KhoiTodoPopup chỉ còn Thành viên chờ duyệt.
  const nsHandledByGdkGate = c.role === 'gd_khoi' || c.role === 'tro_ly_khoi';
  const hasBudget = !nsHandledByGdkGate && todo.count > 0, hasMem = members.length > 0;
  if (closed || !ready || popupDismissed(key) || (!hasBudget && !hasMem)) return null;
  const close = () => { dismissPopup(key); setClosed(true); };
  const ids = new Set(members.map((r) => r.uid));
  return (
    <Modal open onClose={close} wide title="Việc cần xử lý" footer={<div className="flex flex-wrap justify-end gap-2 w-full">
      <Btn onClick={close} data-testid="vn-todo-later">Để sau</Btn>
      {hasMem && <Btn onClick={() => { close(); onGoMembers(); }} data-testid="vn-todo-go-members"><span className="sm:hidden">Thành viên ›</span><span className="hidden sm:inline">Đi tới Thành viên chờ duyệt</span></Btn>}
      {hasBudget && <Btn primary onClick={() => { close(); onGo(todo.rows[0]?.line.period); }} data-testid="vn-todo-go"><span className="sm:hidden">Duyệt hỗ trợ ›</span><span className="hidden sm:inline">Đi tới Duyệt hỗ trợ MKT</span></Btn>}</div>}>
      <div data-testid="vn-todo-popup" className="space-y-4 text-[13px]">
        {hasBudget && <section className="space-y-2" data-testid="vn-todo-budget">
          <div className="font-semibold text-[14px]">Ngân sách cần duyệt</div>
          <div className="grid grid-cols-2 gap-2">
            <Kpi label={`Chờ duyệt (${todo.pending.n})`} value={fmt(todo.pending.amount)} hint="đ" />
            <Kpi label={`Cần duyệt lại (${todo.reapproval.n})`} value={fmt(todo.reapproval.amount)} hint="đ · đã duyệt nhưng bị sửa" />
          </div>
          <ul className="space-y-1.5">{todo.rows.slice(0, 5).map((r) => <li key={r.line.id} className="flex flex-wrap gap-x-2 items-center border-b border-[var(--mh-surface-2)] pb-1" data-testid="vn-todo-item">
            <span className="font-medium">{r.line.ownerName || userName(c, r.line.ownerUid)}</span><span className="text-[var(--mh-text-3)] text-[12px]">{projectName(c, r.line.projectId)} · {periodLabel(r.line.period)}</span>
            <span className="ml-auto tabular-nums">{r.status === 'reapproval' && r.s ? <><s className="text-[var(--mh-text-3)]">{fmt(r.s.amount)}</s> → <b>{fmt(r.line.amount)}</b></> : <b>{fmt(r.line.amount)}</b>} đ</span>
            <SupportBadge status={r.status} /></li>)}</ul>
        </section>}
        {hasMem && <section className="space-y-2" data-testid="vn-todo-members">
          <div className="font-semibold text-[14px]">Thành viên chờ duyệt ({members.length})</div>
          <div className="text-[12px] text-[var(--mh-text-2)]">{c.role === 'gdkd' ? 'Yêu cầu vào Phòng KD của bạn (vai trò / thành viên).' : 'Yêu cầu vào các Phòng KD / chức vụ thuộc Khối của bạn.'} Duyệt hoặc từ chối ngay tại đây.</div>
          <ApprovalsPanel c={c} filter={(r) => ids.has(r.uid)} />
        </section>}
        <div className="text-[11px] text-[var(--mh-text-3)]">Thông báo hiện lại mỗi lần đăng nhập cho tới khi xử lý hết.</div>
      </div>
    </Modal>
  );
}

/** Khoản NS của tôi đang «Chờ cập nhật TT thanh toán» (mọi kỳ từ 11/2026, chưa bị từ chối). Đồng bộ cờ payStatus của chính mình. */
export function useMyPayGate(c: VCtx, enabled = true) {
  const k = useMyKyc(c);
  const pay = usePayMap(c.db, enabled);
  const [lines, setLines] = useState<NsLine[]>([]);
  const has = k === undefined ? undefined : hasPayInfo(k);
  useEffect(() => { if (enabled && has !== undefined) syncMyPay(c.db, c.uid, has, pay); }, [enabled, has, pay && pay[c.uid], c.uid]);
  useEffect(() => {
    if (!enabled || !c.uid) return;
    return onSnapshot(query(collection(c.db, 'ns_lines'), where('ownerUid', '==', c.uid)), (x: any) => setLines(x.docs.map((d: any) => ({ id: d.id, ...d.data() }))), () => setLines([]));
  }, [c.db, c.uid, enabled]);
  const rows = has === false ? lines.filter((l) => supportable(l) && String(l.period) >= '2026-11') : [];
  return { has, rows, amount: rows.reduce((a, l) => a + (Number(l.amount) || 0), 0) };
}
/** Banner + popup (1 lần / ngày giờ VN) nhắc người đăng ký cập nhật thông tin thanh toán. */
export function PayGateBanner({ c, onOpenKyc, popup = false }: { c: VCtx; onOpenKyc?: () => void; popup?: boolean }) {
  const g = useMyPayGate(c);
  const key = 'vnPayGateSeen:' + c.uid;
  const [closed, setClosed] = useState(false);
  // Popup: không chồng lên popup «Việc cần xử lý» của GĐK / Trợ lý — đợi popup đó đóng.
  const [other, setOther] = useState(popup);
  useEffect(() => { if (!popup) return; const t = () => setOther(!!document.querySelector('[data-testid="vn-todo-popup"],[data-testid="vn-kyc-form"],[data-testid="vn-namereq-gate"]')); const i = setInterval(t, 1200); const s0 = setTimeout(t, 3000); return () => { clearInterval(i); clearTimeout(s0); }; }, [popup]);
  // Trưởng Ban / Phó Ban / Admin / Mod miễn cập nhật STK — không hiện banner/popup.
  const me = { uid: c.uid, email: c.email, role: c.role } as any;
  const isLeader = (c.banKds || []).some((b: any) => isBanKdLeader(b, me, me));
  const isDeputy = (c.banKds || []).some((b: any) => isBanKdDeputy(b, me, me));
  if (!kycRequired(c.role, { profile: c.profile || c.users.find((u: any) => (u.uid || u.id) === c.uid), isBanLeader: isLeader || c.role === 'truong_ban_kd', isBanDeputy: isDeputy })) return null;
  if (!g.rows.length || (popup && other)) return null;
  const list = <ul className="space-y-1 text-[12px]">{g.rows.slice(0, 8).map((l) => <li key={l.id} className="flex gap-2" data-testid="vn-paygate-item"><span className="flex-1">{projectName(c, l.projectId)} · {periodLabel(l.period)}{l.kind === 'khoi' ? ' · NS Khối' : ''}</span><b className="tabular-nums">{fmt(l.amount)} đ</b></li>)}</ul>;
  const msg = `Bạn có ${g.rows.length} khoản NS MKT (${fmt(g.amount)} đ) đang «Chờ cập nhật TT thanh toán». Khoản chỉ được tính là đã duyệt khi bạn có số tài khoản nhận tiền.`;
  if (!popup) return (
    <Card className="p-3 border-[#F5C26B] bg-[#FFF8EB] space-y-2" data-testid="vn-paygate-banner">
      <div className="text-[13px] font-semibold text-[#8A5300]">⚠ Chưa có thông tin thanh toán</div>
      <div className="text-[12px] text-[var(--mh-text-2)]">{msg}</div>{list}
      {onOpenKyc && <Btn small primary onClick={onOpenKyc} data-testid="vn-paygate-open">Cập nhật thông tin thanh toán</Btn>}
    </Card>);
  if (closed || popupDismissed(key)) return null;
  const close = () => { dismissPopup(key); setClosed(true); };
  return (
    <Modal open onClose={close} title="Cập nhật thông tin thanh toán" footer={<div className="flex flex-wrap justify-end gap-2 w-full"><Btn onClick={close} data-testid="vn-paygate-later">Để sau</Btn>{onOpenKyc && <Btn primary onClick={() => { close(); onOpenKyc(); }} data-testid="vn-paygate-popup-open">Cập nhật ngay</Btn>}</div>}>
      <div className="space-y-2 text-[13px]" data-testid="vn-paygate-popup"><div>{msg}</div>{list}</div>
    </Modal>);
}
