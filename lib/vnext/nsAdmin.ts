/**
 * MC-6 — Super Admin thêm / sửa / xoá (mềm + cứng) / khôi phục đăng ký NS của từng user.
 * Hàm thuần (không đụng Firestore); phần ghi nằm ở src/vnext/nsActions.ts.
 */
import { nsLineId, type NsLine } from './budget.js';

export type NsAuditAction = 'NS_LINE_SOFT_DELETE' | 'NS_LINE_HARD_DELETE' | 'NS_LINE_SA_CREATE' | 'NS_LINE_SA_UPDATE' | 'NS_LINE_RESTORE';

export type WeeklySnapItem = { docId: string; removedItems: any[]; docData?: any };
export type NsImpact = { ntCount: number | null; supportStatus: string };

/** Chỉ Super Admin thấy / dùng chức năng MC-6 (kể cả kỳ đã khoá). Admin giữ hành vi cũ. */
export const canSaManageNs = (role: unknown): boolean => role === 'super_admin';

export const REASON_MIN = 3;
export const reasonOk = (r: unknown): boolean => String(r ?? '').trim().length >= REASON_MIN;
export const DELETE_CONFIRM_WORD = 'XOA';
export const deleteConfirmOk = (v: unknown): boolean => String(v ?? '').trim() === DELETE_CONFIRM_WORD;

/** Bỏ undefined (đệ quy) để ghi Firestore; giữ nguyên null / Date / object có prototype lạ (Timestamp). */
export function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.filter((x) => x !== undefined).map((x) => stripUndefined(x)) as any;
  if (v && typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    const o: any = {};
    for (const [k, x] of Object.entries(v as any)) if (x !== undefined) o[k] = stripUndefined(x);
    return o;
  }
  return v;
}

/** Số tiền ngay trước lần xoá mềm gần nhất (history action 'delete' cuối → `from`). */
export function amountBeforeDelete(line: Pick<NsLine, 'history'> | null | undefined): number {
  const h = Array.isArray(line?.history) ? line!.history! : [];
  for (let i = h.length - 1; i >= 0; i--) if (h[i]?.action === 'delete') return Number(h[i].from) || 0;
  return 0;
}

/** Id dòng user khi đổi dự án (cùng owner / period / team). */
export function userLineIdFor(line: Pick<NsLine, 'period' | 'teamId' | 'ownerUid'>, projectId: string): string {
  return nsLineId('user', line.period, String(line.teamId || ''), projectId, line.ownerUid);
}
export function planProjectChange(line: Pick<NsLine, 'id' | 'period' | 'teamId' | 'ownerUid' | 'projectId'>, newProjectId: string): { changed: boolean; newId: string } {
  const changed = !!newProjectId && newProjectId !== line.projectId;
  return { changed, newId: changed ? userLineIdFor(line, newProjectId) : line.id };
}

/** Dòng do SA tạo: createdByRole hoặc history[0].byRole. */
export function isSaCreated(line: Partial<NsLine> | null | undefined): boolean {
  if (!line) return false;
  if (line.createdByRole === 'super_admin') return true;
  const h0: any = Array.isArray(line.history) ? line.history[0] : null;
  return h0?.byRole === 'super_admin' && h0?.action === 'create';
}

/** Sửa khoản đã duyệt hỗ trợ mà đổi tiền / dự án → sẽ thành «Cần duyệt lại». */
export function willNeedReapproval(supportStatus: string | undefined, before: { amount: number; projectId: string }, after: { amount: number; projectId: string }): boolean {
  return supportStatus === 'approved' && (Number(before.amount) !== Number(after.amount) || before.projectId !== after.projectId);
}

const sameItem = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
/** Thêm lại removedItems vào items hiện tại, không trùng (so khớp JSON). */
export function mergeWeeklyItems(current: any[] | undefined, removed: any[] | undefined): { items: any[]; added: number } {
  const items = [...(current || [])];
  let added = 0;
  for (const r of removed || []) {
    if (items.some((x) => sameItem(x, r))) continue;
    items.push(r); added++;
  }
  return { items, added };
}

/** Phần tính của previewWeeklyForNsLine: từ doc weekly → mục sẽ bị gỡ. */
export function weeklyRemoval(items: any[] | undefined, projectId: string): { removed: any[]; remaining: any[] } {
  const all = items || [];
  return { removed: all.filter((i) => i?.projectId === projectId), remaining: all.filter((i) => i?.projectId !== projectId) };
}

export function buildDeleteAudit(args: {
  hard: boolean; line: NsLine; reason: string; actor: { uid: string; email?: string; name?: string; role: string };
  weekly: WeeklySnapItem[]; impact: NsImpact; at?: string;
}): Record<string, any> {
  const at = args.at || new Date().toISOString();
  const email = String(args.actor.email || '').toLowerCase();
  return stripUndefined({
    action: args.hard ? 'NS_LINE_HARD_DELETE' : 'NS_LINE_SOFT_DELETE',
    collection: 'ns_lines', targetId: args.line.id,
    userId: args.actor.uid, ...(email ? { userEmail: email } : {}), userName: args.actor.name || '', role: args.actor.role,
    reason: String(args.reason || '').trim(), at,
    snapshot: { line: { ...args.line } },
    weeklySnapshot: args.weekly.map((w) => ({ docId: w.docId, removedItems: w.removedItems, ...(w.docData ? { docData: w.docData } : {}) })),
    impact: { ntCount: args.impact.ntCount, supportStatus: args.impact.supportStatus },
  });
}

export function buildSaWriteAudit(args: {
  create: boolean; lineId: string; reason: string; actor: { uid: string; email?: string; name?: string; role: string };
  before: { amount: number; projectId: string } | null; after: { amount: number; projectId: string }; at?: string; extra?: Record<string, any>;
}): Record<string, any> {
  const email = String(args.actor.email || '').toLowerCase();
  return stripUndefined({
    action: args.create ? 'NS_LINE_SA_CREATE' : 'NS_LINE_SA_UPDATE',
    collection: 'ns_lines', targetId: args.lineId,
    userId: args.actor.uid, ...(email ? { userEmail: email } : {}), userName: args.actor.name || '', role: args.actor.role,
    reason: String(args.reason || '').trim(), at: args.at || new Date().toISOString(),
    before: args.before, after: args.after, ...(args.extra || {}),
  });
}

export function buildRestoreAudit(args: {
  lineId: string; amount: number; weeklyRestored: boolean | null; reason?: string;
  actor: { uid: string; email?: string; name?: string; role: string }; at?: string;
}): Record<string, any> {
  const email = String(args.actor.email || '').toLowerCase();
  return stripUndefined({
    action: 'NS_LINE_RESTORE', collection: 'ns_lines', targetId: args.lineId,
    userId: args.actor.uid, ...(email ? { userEmail: email } : {}), userName: args.actor.name || '', role: args.actor.role,
    reason: args.reason || 'Khôi phục đăng ký NS', at: args.at || new Date().toISOString(),
    after: { amount: args.amount }, weeklyRestored: args.weeklyRestored,
  });
}

/** Bản audit xoá mềm mới nhất của một dòng (lọc client). */
export function latestSoftDeleteAudit<T extends { action?: string; at?: string }>(logs: T[]): T | null {
  return logs.filter((l) => l?.action === 'NS_LINE_SOFT_DELETE').sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0] || null;
}
