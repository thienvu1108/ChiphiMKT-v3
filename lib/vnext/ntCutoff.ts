/**
 * Go-live cutoff cho "Người phụ trách bắt buộc" ở Nghiệm thu MKT.
 * Cấu hình: settings/global.ntImplementerRequiredFrom (Firestore Timestamp, 00:00 giờ VN của ngày go-live).
 * Không đặt → chưa bắt buộc. Bản ghi tạo từ mốc này mang cờ ntRequired=true và phải luôn có implementerUid
 * (rules kiểm tra ở create + update). Bản ghi cũ (không có cờ) không bắt buộc.
 */
export function cutoffDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(+v) ? null : v;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'string') { const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+07:00` : v); return isNaN(+d) ? null : d; }
  return null;
}
export function ntImplementerRequired(cutoff: any, now: Date = new Date()): boolean {
  const d = cutoffDate(cutoff);
  return !!d && now.getTime() >= d.getTime();
}
/** Ngày VN dạng YYYY-MM-DD (cho ô input date). */
export function cutoffInputValue(v: any): string {
  const d = cutoffDate(v); if (!d) return '';
  return new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
}
export function cutoffFromInput(s: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+07:00`) : null;
}
/** Bản ghi đã chịu ràng buộc (tạo sau go-live). */
export function recordNeedsImplementer(rec: any): boolean { return rec?.ntRequired === true; }
export const NT_REQUIRED_MSG = 'Bản ghi Nghiệm thu mới (từ ngày go-live) bắt buộc chọn Người phụ trách.';
