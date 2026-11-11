/** Kỳ cũ (≤ Tháng 10/2026, trước VNEXT_PERIOD_CUTOVER): dữ liệu NS đăng ký theo luồng cũ (budgets / block_budgets) chỉ xem. */
import { VNEXT_PERIOD_CUTOVER } from './period';

/** Chuẩn hoá trường month cũ ("2026-10", "10/2026", "T10/2026", "Tháng 10/2026") → "YYYY-MM"; không đọc được → ''. */
export function legacyMonthKey(v: unknown): string {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})\s*[/.-]\s*(\d{4})/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  return '';
}
export const isLegacyPeriod = (key: string) => !!key && key < VNEXT_PERIOD_CUTOVER;
