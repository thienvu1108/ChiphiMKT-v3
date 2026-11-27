/**
 * MC-11: Lọc «Loại hồ sơ» (Tất cả / Chỉ hồ sơ chính / Chỉ bổ sung) cho Báo cáo NT và Nghiệm thu MKT.
 * Hàm thuần — chỉ dùng cho hiển thị/xuất; không ghi dữ liệu.
 */
import { normalizeMonth, recordCostBeforeVat } from './ntReport.js';
import { isSupplement, suppStatus, ntCountsInTotals } from './ntSupplement.js';
import { rowSupplementFor } from './ntNoBudget.js';

export type NtKind = 'all' | 'main' | 'supp';
const YM = /^\d{4}-\d{2}$/;

/** Kỳ báo cáo của bản ghi: bổ sung → kỳ được bổ sung (supplementFor); còn lại → month. */
export function ntReportMonth(a: any): string {
  if (isSupplement(a)) {
    const f = normalizeMonth(rowSupplementFor(a));
    if (YM.test(f)) return f;
  }
  return normalizeMonth(a?.month);
}

/** Kỳ nộp bổ sung: supplementIn; bản cũ (không supplementIn) → month nếu khác kỳ được bổ sung; không có → ''. */
export function ntSuppInMonth(a: any): string {
  if (!isSupplement(a)) return '';
  if (a.supplementIn) return normalizeMonth(a.supplementIn);
  const m = normalizeMonth(a.month);
  return YM.test(m) && m !== normalizeMonth(a.supplementFor) ? m : '';
}

export function ntKindMatch(a: any, kind: NtKind): boolean {
  if (kind === 'main') return !isSupplement(a);
  if (kind === 'supp') return isSupplement(a) && suppStatus(a) === 'approved';
  return ntCountsInTotals(a);
}

export function ntKindLabel(kind: NtKind): string {
  return kind === 'main' ? 'Chỉ hồ sơ chính' : kind === 'supp' ? 'Chỉ bổ sung' : 'Tất cả';
}
export function ntExportPrefix(kind: NtKind): string {
  return kind === 'main' ? 'Báo cáo HỒ SƠ CHÍNH' : kind === 'supp' ? 'Báo cáo BỔ SUNG' : 'Báo cáo';
}

const mLabel = (m: string) => (YM.test(m) ? `T${+m.slice(5)}/${m.slice(0, 4)}` : '');
function dmyVN(iso: unknown): string {
  const d = new Date(String(iso || ''));
  if (!iso || isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('day')}/${g('month')}/${g('year')}`;
}

export function ntSuppExcelCols(a: any) {
  const s = isSupplement(a);
  return {
    'LOẠI': s ? 'Bổ sung' : 'Chính',
    'BỔ SUNG CHO KỲ': s ? mLabel(ntReportMonth(a)) : '',
    'KỲ NỘP': s ? mLabel(ntSuppInMonth(a)) : '',
    'NGÀY DUYỆT BS': s ? dmyVN(a.supplementDecidedAt) : '',
  };
}

export function ntSuppSummary(list: any[], cost: (a: any) => number = recordCostBeforeVat) {
  const by = new Map<string, { month: string; count: number; total: number }>();
  let count = 0, total = 0;
  for (const a of list || []) {
    const v = Number(cost(a)) || 0, m = ntReportMonth(a);
    count++; total += v;
    const e = by.get(m) || { month: m, count: 0, total: 0 };
    e.count++; e.total += v; by.set(m, e);
  }
  return { count, total, byTarget: [...by.values()].sort((x, y) => x.month.localeCompare(y.month)) };
}
