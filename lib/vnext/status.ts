/**
 * MỘT bộ máy trạng thái cho mọi màn + Excel.
 * 5 trạng thái, ưu tiên: Từ chối > Chờ STK > Cần duyệt lại > Đã duyệt (gồm NS Khối tự duyệt) > Chờ duyệt.
 * Nguồn dữ liệu: ns_lines (từ 11/2026) + NS kỳ cũ (budgets / block_budgets ≤ 10/2026, chuẩn hoá về cùng dạng; kỳ cũ không có luồng duyệt → «Đã duyệt»).
 */
import type { NsLine } from './budget';
import { effectiveStatus, supportable, payOf, type Support, type PayMap } from './support';

export type St5 = 'approved' | 'pending' | 'reapproval' | 'need_pay' | 'rejected';
/** Thứ tự hiển thị trong ô tổng. */
export const ST5_ORDER: St5[] = ['approved', 'pending', 'reapproval', 'need_pay', 'rejected'];
/** Thứ tự ưu tiên khi suy ra (cao → thấp). */
export const ST5_PRIORITY: St5[] = ['rejected', 'need_pay', 'reapproval', 'approved', 'pending'];
export type StMeta = { label: string; fg: string; bg: string; border: string; xlsx: string };
/** Màu DS: ok / pending tím / warn / draft Chờ STK / err / xám khoá. */
export const ST_META: Record<St5 | 'locked' | 'deleted', StMeta> = {
  approved: { label: 'Đã duyệt', fg: '#12805C', bg: '#E7F5EF', border: '#A7DFC1', xlsx: 'C6EFCE' },
  pending: { label: 'Chờ duyệt', fg: '#7C3AED', bg: '#F3E8FF', border: '#D8B4FE', xlsx: 'E9D5FF' },
  reapproval: { label: 'Cần duyệt lại', fg: '#B45309', bg: '#FEF3E2', border: '#F6B98A', xlsx: 'F8CBAD' },
  need_pay: { label: 'Chờ STK', fg: '#64748B', bg: '#F1F5F9', border: '#CBD5E1', xlsx: 'E2E8F0' },
  rejected: { label: 'Từ chối', fg: '#C2362B', bg: '#FCEBEA', border: '#F2ADA7', xlsx: 'FFC7CE' },
  locked: { label: 'Đã khoá', fg: '#5B6B82', bg: '#F1F5F9', border: '#D5DCE5', xlsx: 'E7E6E6' },
  deleted: { label: 'Đã xoá', fg: '#5B6B82', bg: '#F1F5F9', border: '#D5DCE5', xlsx: 'E7E6E6' },
};
export const stLabel = (s: St5 | 'locked' | 'deleted') => ST_META[s]?.label || s;

/** Hàm trạng thái DUY NHẤT cho 1 dòng NS. */
export function lineStatus(line: NsLine, s?: Partial<Support> | null, pay?: boolean | { has: boolean; since?: string }): St5 {
  return effectiveStatus(line, s, pay) as St5;
}

export type URow = {
  id: string; source: 'ns' | 'legacy'; kind: string; period: string;
  ownerUid: string; ownerName: string; teamId: string; blockId: string; banKdId: string; projectId: string;
  amount: number; status: St5; line?: NsLine; support?: Partial<Support>;
};
const banOf = (projects: any[], pid: string) => String(projects.find((p) => p.id === pid)?.banKdId || '');

/** Adapter ns_lines (≥ 11/2026). */
export function adaptNs(lines: NsLine[], sup: Record<string, Partial<Support> | undefined>, pay: PayMap, projects: any[] = []): URow[] {
  return lines.filter((l) => supportable(l) && String(l.period) >= '2026-11').map((l) => ({
    id: l.id, source: 'ns', kind: l.kind, period: l.period, ownerUid: l.ownerUid || '', ownerName: (l as any).ownerName || '',
    teamId: l.teamId || '', blockId: l.blockId || '', banKdId: banOf(projects, l.projectId), projectId: l.projectId,
    amount: Number(l.amount) || 0, status: lineStatus(l, sup[l.id], payOf(pay, l.ownerUid)), line: l, support: sup[l.id],
  }));
}
/** «2026-05» / «05/2026» / số → «YYYY-MM». */
export function legacyKey(m: any): string {
  const s = String(m ?? '').trim();
  let x = s.match(/^(\d{4})-(\d{1,2})/); if (x) return `${x[1]}-${x[2].padStart(2, '0')}`;
  x = s.match(/^(\d{1,2})\/(\d{4})/); if (x) return `${x[2]}-${x[1].padStart(2, '0')}`;
  return '';
}
/** Adapter NS kỳ cũ (budgets = user/Phòng, block_budgets = Khối), ≤ 10/2026. */
export function adaptLegacy(budgets: any[], blockBudgets: any[], projects: any[] = [], blockOfTeam: (t: string) => string = () => ''): URow[] {
  const one = (r: any, kind: string): URow | null => {
    const period = legacyKey(r.month); if (!period || period > '2026-10' || r.deleted) return null;
    const amount = Number(r.approvedAmount ?? r.amount); if (!Number.isFinite(amount) || amount <= 0) return null;
    const teamId = String(r.teamId || ''); const projectId = String(r.projectId || '');
    return { id: kind + ':' + r.id, source: 'legacy', kind, period, ownerUid: String(r.createdBy || r.submittedBy || r.userId || ''), ownerName: String(r.implementerName || r.submittedByName || ''),
      teamId, blockId: String(r.blockId || (teamId ? blockOfTeam(teamId) : '')), banKdId: banOf(projects, projectId), projectId, amount, status: r.status === 'rejected' ? 'rejected' : 'approved' };
  };
  return [...budgets.map((r) => one(r, 'legacy_user')), ...blockBudgets.map((r) => one(r, 'legacy_khoi'))].filter(Boolean) as URow[];
}

export type Summary = { total: number; n: number; by: Record<St5, { n: number; amount: number }> };
export const emptySummary = (): Summary => ({ total: 0, n: 0, by: Object.fromEntries(ST5_ORDER.map((k) => [k, { n: 0, amount: 0 }])) as any });
export function summarize(rows: URow[]): Summary {
  const o = emptySummary();
  for (const r of rows) { o.total += r.amount; o.n++; o.by[r.status].n++; o.by[r.status].amount += r.amount; }
  return o;
}
export type GroupBy = 'blockId' | 'banKdId' | 'teamId' | 'projectId' | 'ownerUid' | 'period';
/** Gộp DUY NHẤT theo Khối / Ban / Phòng / dự án / người đăng ký / tháng. */
export function aggregate(rows: URow[], by: GroupBy): Map<string, Summary> {
  const m = new Map<string, URow[]>();
  for (const r of rows) { const k = (r as any)[by] || ''; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return new Map([...m.entries()].map(([k, v]) => [k, summarize(v)]));
}

/** Tên màu (cột Excel «Màu trạng thái» — SheetJS bản miễn phí không tô nền ô). */
export const ST_COLOR_NAME: Record<St5, string> = { approved: 'Xanh lá', pending: 'Tím', reapproval: 'Cam', need_pay: 'Xám', rejected: 'Đỏ' };

/** Báo cáo tuần: mọi trạng thái trừ Từ chối (Chờ duyệt / Cần duyệt lại / Đã duyệt / Chờ STK đều báo cáo được). */
export const isNsReportableStatus = (st: St5 | string) => st !== 'rejected';
