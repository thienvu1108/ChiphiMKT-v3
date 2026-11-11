/**
 * Duyệt hỗ trợ MKT — B2. 1 quyết định / bản đăng ký NS (ns_lines kind 'user') / user / tháng.
 * nsSupport/{lineId} (cùng id với ns_lines). Không có doc = «Chưa được duyệt».
 * Người duyệt: GĐ Khối / Trợ lý Khối của Khối ghi trên dòng NS (blockId), Admin.
 */
import type { NsLine } from './budget';

export const SUPPORT_COLLECTION = 'nsSupport';
/** 'reapproval' = «Cần duyệt lại»: suy ra trong code (đã duyệt rồi người đăng ký sửa), KHÔNG ghi vào nsSupport. */
/** 'need_pay' = «Chờ cập nhật TT thanh toán»: suy ra trong code (người đăng ký chưa có STK), không ghi. Tính vào ô «Chờ duyệt». */
export type SupportStatus = 'pending' | 'approved' | 'rejected' | 'reapproval' | 'need_pay';
export type StoredStatus = 'pending' | 'approved' | 'rejected';
/** Nhãn = ST_META (lib/vnext/status.ts) — thống nhất mọi màn + Excel. */
export const SUPPORT_LABEL: Record<SupportStatus, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', reapproval: 'Cần duyệt lại', need_pay: 'Chờ STK' };
export const SUPPORT_TONE: Record<SupportStatus, string> = { pending: 'warn', approved: 'ok', rejected: 'err', reapproval: 'warn', need_pay: 'warn' };
export const ALL_STATUSES: SupportStatus[] = ['approved', 'pending', 'reapproval', 'need_pay', 'rejected'];
/** Cần GĐK / Trợ lý xử lý. */
export const isTodo = (st: SupportStatus) => st === 'pending' || st === 'reapproval';

export type SupportHist = { at: string; byUid: string; byName: string; status: StoredStatus; reason?: string; amount: number };
export type Support = {
  id: string; lineId: string; period: string; ownerUid: string; teamId: string; blockId: string; projectId: string;
  amount: number; status: StoredStatus; reason?: string; decidedBy: string; decidedByName: string; decidedAt: string; history?: SupportHist[];
  /** Tầng Ban KD — sau GĐK duyệt. Thiếu + trước cutover = grandfather (xem banSupport.ts). */
  banStatus?: 'pending' | 'approved' | 'rejected';
  banReason?: string; banDecidedBy?: string; banDecidedByName?: string; banDecidedAt?: string; banDecidedRole?: string;
};

export const statusOf = (s?: Partial<Support> | null): StoredStatus => (s?.status === 'approved' || s?.status === 'rejected' ? s.status : 'pending');

/** Bản đăng ký NS cần duyệt hỗ trợ: dòng user còn hiệu lực. */
export const supportable = (l: NsLine) => (l.kind === 'user' || l.kind === 'khoi') && !l.deleted && Number(l.amount) > 0;

/** Dòng NS Khối (GĐ Khối / Trợ lý Khối đăng ký) → tự động «Đã được duyệt», không cần / không thể duyệt tay. Suy ra trong code, không ghi nsSupport. */
/** Khối → uid GĐ Khối (directorUid) / Trợ lý Khối (assistantUids). Cập nhật từ buildCtx mỗi khi blocks đổi. */
let khoiMgrIdx = new Map<string, Set<string>>();
export function setKhoiManagers(blocks: { id: string; directorUid?: string; assistantUids?: string[] }[] | undefined) {
  const m = new Map<string, Set<string>>();
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || !b.id) continue;
    const ids = [b.directorUid, ...(Array.isArray(b.assistantUids) ? b.assistantUids : [])].filter((x): x is string => typeof x === 'string' && !!x);
    if (ids.length) m.set(b.id, new Set(ids));
  }
  khoiMgrIdx = m;
}
/** Người đăng ký là GĐ Khối / Trợ lý của chính Khối ghi trên dòng (kể cả khi kiêm GĐKD và đăng ký như user của Phòng). */
export const ownerIsKhoiManager = (l: Pick<NsLine, 'blockId' | 'ownerUid'>) => !!l.blockId && !!l.ownerUid && !!khoiMgrIdx.get(l.blockId)?.has(l.ownerUid);
export const isAutoApproved = (l: NsLine) => l.kind === 'khoi' || (l.kind === 'user' && ownerIsKhoiManager(l));
/** NS Khối chưa có quyết định tay (nsSupport) → đang ở trạng thái tự duyệt. Có quyết định (Từ chối / Đặt lại / Duyệt) → theo quyết định. */
export const isAutoNow = (l: NsLine, s?: Partial<Support> | null) => isAutoApproved(l) && !s;
export const AUTO_APPROVED_NOTE = 'Tự động duyệt (GĐK/Trợ lý đăng ký)';

/** Lần sửa gần nhất của dòng NS (create/update/delete trong line.history, hoặc updatedAt nếu không có history). */
export function lastEditAt(line: NsLine): string {
  const h = Array.isArray(line.history) ? line.history : [];
  let t = '';
  for (const x of h) if (x && (x.action === 'update' || x.action === 'delete' || x.action === 'create') && String(x.at || '') > t) t = String(x.at);
  return t;
}
/** Dòng bị sửa (bất kỳ trường nào / lưu lại) sau thời điểm quyết định. */
export function editedSince(line: NsLine, s?: Partial<Support> | null): boolean {
  if (!s) return false;
  if (Number(s.amount) !== Number(line.amount)) return true;
  if (s.projectId && s.projectId !== line.projectId) return true;
  const at = lastEditAt(line);
  return !!at && !!s.decidedAt && at > String(s.decidedAt);
}
/** Đã duyệt rồi bị sửa → «Cần duyệt lại»; bị từ chối rồi sửa → «Chưa được duyệt» (nộp lại). NS Khối luôn tự duyệt. */
export function effectiveStatus(line: NsLine, s?: Partial<Support> | null, pay?: boolean | PayState): SupportStatus {
  const hasPay = typeof pay === 'object' ? pay.has : pay;
  const since = typeof pay === 'object' ? pay.since || '' : '';
  let st = baseStatus(line, s);
  // Duyệt khi người đăng ký CHƯA có STK (STK có sau thời điểm duyệt) → NS thường về «Chưa được duyệt» để GĐK duyệt lại. NS Khối vẫn tự duyệt.
  if (st === 'approved' && hasPay && since && !isAutoApproved(line) && s?.decidedAt && since > String(s.decidedAt)) st = 'pending';
  // Chưa có thông tin thanh toán (STK) → chưa thể tính là đã duyệt, GĐK cũng chưa duyệt được (kể cả NS Khối tự duyệt).
  return hasPay === false && st !== 'rejected' ? 'need_pay' : st;
}

/** Hook Báo cáo tuần (loại Ban từ chối). Mặc định no-op; banSupport.ts gán khi load. */
let _weeklyBanGate: ((line: NsLine, s?: Partial<Support> | null) => boolean) | null = null;
export function setWeeklyBanGate(fn: ((line: NsLine, s?: Partial<Support> | null) => boolean) | null) { _weeklyBanGate = fn; }
/**
 * Báo cáo tuần: mọi dòng chưa bị từ chối (Chờ duyệt / Cần duyệt lại / Đã duyệt / Chờ STK / Chờ Ban).
 * Loại GĐK từ chối; Ban từ chối qua setWeeklyBanGate. Không đổi status trên Firestore.
 * `pay` giữ chữ ký cũ (không chặn báo cáo).
 */
export function isNsReportableLine(line: NsLine, s?: Partial<Support> | null, _pay?: boolean | PayState): boolean {
  const base = baseStatus(line, s);
  if (base === 'rejected') return false;
  if (_weeklyBanGate) return _weeklyBanGate(line, s);
  return true;
}
/**
 * Số tiền NS dùng cho Báo cáo tuần.
 * Cần duyệt lại (đã sửa sau GĐK duyệt): lấy amount đã duyệt gần nhất trên nsSupport nếu có; không thì amount hiện tại.
 */
export function reportableNsAmount(line: NsLine, s?: Partial<Support> | null): number {
  const base = baseStatus(line, s);
  const prev = Number(s?.amount);
  if (base === 'reapproval' && Number.isFinite(prev) && prev > 0) return prev;
  return Number(line.amount) || 0;
}
/** Map uid → có STK; undefined = chưa tải (không chặn). */
/** has = có STK; since = lần đầu có STK (ISO, '' = có từ trước khi có tính năng). */
export type PayState = { has: boolean; since?: string };
export type PayMap = Record<string, PayState> | undefined;
export const payOf = (pay: PayMap, uid?: string): PayState | undefined => (pay ? (pay[uid || ''] || { has: false }) : undefined);
/** Nền GĐK (không overlay Chờ STK) — dùng tầng Ban + báo cáo. */
export function baseStatusForBan(line: NsLine, s?: Partial<Support> | null): SupportStatus {
  return baseStatus(line, s);
}
function baseStatus(line: NsLine, s?: Partial<Support> | null): SupportStatus {
  if (isAutoNow(line, s)) return 'approved';
  const st = statusOf(s);
  // NS Khối đã duyệt (tay) rồi GĐK/Trợ lý tự sửa → vẫn «Đã duyệt» (tự duyệt), không cần duyệt lại.
  if (isAutoApproved(line) && st === 'approved') return 'approved';
  if (st === 'approved' && editedSince(line, s)) return 'reapproval';
  if (st === 'rejected' && editedSince(line, s)) return 'pending';
  return st;
}

export type StatusSplit = Record<SupportStatus, { n: number; amount: number }> & { total: number };
/** Tách tổng NS theo 4 trạng thái — dùng chung cho Ngân sách MKT Khối, Duyệt hỗ trợ MKT, Ngân sách Ban. */
/** 5 ô riêng (ST5_ORDER), tổng = tổng 5 ô. */
export function splitByStatus(lines: NsLine[], sup: Record<string, Partial<Support> | undefined>, pay?: PayMap): StatusSplit {
  const o: any = { total: 0 };
  for (const k of ALL_STATUSES) o[k] = { n: 0, amount: 0 };
  for (const l of lines) {
    if (!supportable(l)) continue;
    const st = effectiveStatus(l, sup[l.id], payOf(pay, l.ownerUid));
    const a = Number(l.amount) || 0;
    o[st].n++; o[st].amount += a; o.total += a;
  }
  return o;
}

export function buildDecision(line: NsLine, prev: Partial<Support> | null | undefined, by: { uid: string; name: string }, status: StoredStatus, reason = '', at = new Date().toISOString()): Omit<Support, 'id'> {
  const h: SupportHist = { at, byUid: by.uid, byName: by.name, status, amount: Number(line.amount), ...(reason ? { reason } : {}) };
  const base: Omit<Support, 'id'> = {
    lineId: line.id, period: line.period, ownerUid: line.ownerUid || '', teamId: line.teamId || '', blockId: line.blockId || '', projectId: line.projectId,
    amount: Number(line.amount), status, ...(reason ? { reason } : {}), decidedBy: by.uid, decidedByName: by.name, decidedAt: at,
    history: [...((prev?.history as SupportHist[]) || []), h].slice(-100),
  };
  // GĐK duyệt / duyệt lại → xếp hàng Ban. Từ chối / đặt lại → xoá trạng thái Ban.
  if (status === 'approved') return { ...base, banStatus: 'pending' };
  return base;
}

export type SupportFilter = { teamId?: string; ownerUid?: string; projectId?: string; period?: string; status?: SupportStatus | 'todo' | '' };
export function filterRows<T extends { line: NsLine; status: SupportStatus }>(rows: T[], f: SupportFilter): T[] {
  return rows.filter((r) => (!f.teamId || r.line.teamId === f.teamId) && (!f.ownerUid || r.line.ownerUid === f.ownerUid)
    && (!f.projectId || r.line.projectId === f.projectId) && (!f.period || r.line.period === f.period) && (!f.status || (f.status === 'todo' ? isTodo(r.status) : r.status === f.status)));
}

// ---------------------------------------------------------------
// Lịch sử từng bản đăng ký — nsLineHistory/{autoId}: chỉ ghi thêm (rules: create-only, không sửa/xoá).
// ---------------------------------------------------------------
export const HISTORY_COLLECTION = 'nsLineHistory';
export type HistAction = 'create' | 'update' | 'delete' | 'approved' | 'rejected' | 'pending';
export const HIST_LABEL: Record<HistAction, string> = { create: 'Đăng ký', update: 'Sửa', delete: 'Xoá', approved: 'Duyệt', rejected: 'Từ chối', pending: 'Đặt lại chưa duyệt' };
export type HistChange = { field: string; from: string; to: string };
export type LineHist = {
  lineId: string; period: string; kind: string; ownerUid: string; teamId: string; blockId: string; projectId: string;
  action: HistAction; changes: HistChange[]; reason?: string; byUid: string; byName: string; byRole: string; at: string;
  /** Trạng thái hiệu lực ngay trước thao tác (vd. sửa khoản đã duyệt → 'approved'). */
  prevStatus?: string;
};
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
/** So sánh dòng cũ / mới → danh sách trường thay đổi (amount, projectId, deleted, teamId, blockId). */
export function diffLine(prev: Partial<NsLine> | null | undefined, next: Partial<NsLine>): HistChange[] {
  const out: HistChange[] = [];
  for (const f of ['amount', 'projectId', 'teamId', 'blockId', 'deleted'] as const) {
    const a = prev ? (f === 'amount' ? Number(prev[f] || 0) : f === 'deleted' ? !!prev[f] : prev[f]) : f === 'amount' ? 0 : f === 'deleted' ? false : undefined;
    const b = f === 'amount' ? Number(next[f] || 0) : f === 'deleted' ? !!next[f] : next[f];
    if (str(a) !== str(b)) out.push({ field: f, from: str(a), to: str(b) });
  }
  const pa = (x: any) => (x?.payAccount ? `${x.payAccount.bankName} ••${x.payAccount.tail}` : '');
  if ((prev ? pa(prev) : '') !== pa(next) && (prev || next.payAccount)) out.push({ field: 'payAccount', from: prev ? pa(prev) : '', to: pa(next) });
  return out;
}
export function buildHist(line: Pick<NsLine, 'id' | 'period' | 'kind' | 'ownerUid' | 'teamId' | 'blockId' | 'projectId'>, by: { uid: string; name: string; role: string }, action: HistAction, changes: HistChange[] = [], extra: { reason?: string; prevStatus?: string; at?: string } = {}): LineHist {
  return {
    lineId: line.id, period: line.period, kind: line.kind, ownerUid: line.ownerUid || '', teamId: line.teamId || '', blockId: line.blockId || '', projectId: line.projectId,
    action, changes: changes.slice(0, 10), ...(extra.reason ? { reason: extra.reason.slice(0, 300) } : {}), ...(extra.prevStatus ? { prevStatus: extra.prevStatus } : {}),
    byUid: by.uid, byName: String(by.name || '').slice(0, 120), byRole: String(by.role || ''), at: extra.at || new Date().toISOString(),
  };
}
/** Gộp lịch sử mới (nsLineHistory) + lịch sử cũ (ns_lines.history, nsSupport.history) trước khi có nsLineHistory → 1 dòng thời gian. */
export type TimelineItem = { at: string; byName: string; action: HistAction; changes: HistChange[]; reason?: string; legacy?: boolean };
export function timeline(line: NsLine, s: Partial<Support> | null | undefined, hist: LineHist[]): TimelineItem[] {
  const first = hist.reduce((m, h) => (!m || h.at < m ? h.at : m), '');
  // Bản ghi cũ trong ns_lines.history / nsSupport.history được ghi cùng lúc với nsLineHistory (lệch vài ms) → bỏ trong 60 giây trước mốc đầu.
  const cut = first ? new Date(Date.parse(first) - 60000).toISOString() : '';
  const old: TimelineItem[] = [];
  for (const h of (Array.isArray(line.history) ? line.history : [])) {
    if (cut && String(h.at) >= cut) continue;
    old.push({ at: String(h.at), byName: h.byName, action: h.action as HistAction, changes: Number(h.from) !== Number(h.to) || h.action === 'create' ? [{ field: 'amount', from: String(h.action === 'create' ? 0 : h.from), to: String(h.to) }] : [], reason: h.reason, legacy: true });
  }
  for (const h of ((s?.history as SupportHist[]) || [])) {
    if (cut && String(h.at) >= cut) continue;
    old.push({ at: String(h.at), byName: h.byName, action: h.status, changes: [], reason: h.reason, legacy: true });
  }
  const now: TimelineItem[] = hist.map((h) => ({ at: h.at, byName: h.byName, action: h.action, changes: h.changes || [], reason: h.reason }));
  return [...old, ...now].sort((a, b) => b.at.localeCompare(a.at));
}
