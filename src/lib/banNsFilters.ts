/** Ngân sách Ban — bộ lọc (Kỳ tháng / Dự án / Khối) và gom nhóm theo dự án (khớp projectId). Pure. */
import { periodRange } from '../../lib/vnext/period';

export type BanNsFilter = { month?: string; projectId?: string; block?: string };

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11" → "Tháng 11/2026 (21/10 – 20/11)". Kỳ M = 21/(M-1) → 20/M. */
export function kyMonthLabel(key: string): string {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return String(key || '');
  const r = periodRange(key);
  return `Tháng ${m}/${y} (${pad(r.start.d)}/${pad(r.start.m)} – ${pad(r.end.d)}/${pad(r.end.m)})`;
}

const isAll = (v?: string) => !v || v === 'all';

/** Khớp Khối theo id hoặc mã Khối. */
export function matchesBlock(rec: { blockId?: string; blockCode?: string }, block?: string, codeOf?: (id: string) => string | undefined): boolean {
  if (isAll(block)) return true;
  if (rec.blockId === block || rec.blockCode === block) return true;
  return !!(rec.blockId && codeOf && codeOf(rec.blockId) === block);
}

export function matchesBanNsFilter(
  rec: { month?: string; period?: string; projectId?: string; blockId?: string; blockCode?: string },
  f: BanNsFilter,
  codeOf?: (id: string) => string | undefined,
): boolean {
  const month = rec.month ?? rec.period;
  if (!isAll(f.month) && month !== f.month) return false;
  if (!isAll(f.projectId) && rec.projectId !== f.projectId) return false;
  return matchesBlock(rec, f.block, codeOf);
}

export function activeFilterCount(f: BanNsFilter & { status?: string; search?: string }): number {
  return [f.month, f.projectId, f.block, f.status].filter((v) => !isAll(v)).length + (f.search?.trim() ? 1 : 0);
}

export type ProjectBucket<T> = { projectId: string; label: string; rows: T[]; subtotal: number; blocks: string[] };

/** Gom theo projectId (không theo tên), sắp xếp theo tên dự án (vi); trong nhóm sắp theo Khối. */
export function groupByProject<T>(
  rows: T[],
  get: { projectId: (r: T) => string | undefined; amount: (r: T) => unknown; projectName: (id: string, r: T) => string; blockName: (r: T) => string },
): ProjectBucket<T>[] {
  const m = new Map<string, ProjectBucket<T>>();
  for (const r of rows) {
    const id = get.projectId(r) || '_none';
    let g = m.get(id);
    if (!g) {
      g = { projectId: id, label: id === '_none' ? '(Chưa gắn dự án)' : (get.projectName(id, r) || id), rows: [], subtotal: 0, blocks: [] };
      m.set(id, g);
    }
    g.rows.push(r);
    g.subtotal += Number(get.amount(r)) || 0;
    const b = get.blockName(r);
    if (b && !g.blocks.includes(b)) g.blocks.push(b);
  }
  const out = Array.from(m.values());
  for (const g of out) g.rows.sort((a, b) => get.blockName(a).localeCompare(get.blockName(b), 'vi'));
  return out.sort((a, b) => (a.projectId === '_none' ? 1 : 0) - (b.projectId === '_none' ? 1 : 0) || a.label.localeCompare(b.label, 'vi'));
}

export type BulkSummary = { khoi: number; records: number; total: number };

/** Tóm tắt cho popup xác nhận: số Khối (distinct blockId), số bản, tổng tiền. */
export function bulkSummary<T>(rows: T[], get: { blockId: (r: T) => string | undefined; amount: (r: T) => unknown }): BulkSummary {
  const ks = new Set(rows.map((r) => get.blockId(r) || '_none'));
  return { khoi: rows.length ? ks.size : 0, records: rows.length, total: rows.reduce((s, r) => s + (Number(get.amount(r)) || 0), 0) };
}

/** Bản được thao tác hàng loạt «cả dự án»: chỉ bản Chờ Ban duyệt, chỉ khi user có quyền duyệt (Phó Ban → []). */
export function projectBulkTargets<T extends { ban: string }>(rows: T[], canApprove: boolean, allowed?: (r: T) => boolean): T[] {
  if (!canApprove) return [];
  return rows.filter((r) => r.ban === 'pending' && (!allowed || allowed(r)));
}

/** Popup xác nhận bắt buộc khi thao tác > 1 bản hoặc > 1 Khối. */
export function needsBulkConfirm(s: BulkSummary): boolean {
  return s.records > 1 || s.khoi > 1;
}

export const BAN_REASON_MIN = 3;
export function validBanReason(reason: string): boolean {
  return reason.trim().length >= BAN_REASON_MIN;
}
