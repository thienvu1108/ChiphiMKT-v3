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

export const NT_CFG_LOADING_MSG = 'Đang tải cấu hình, vui lòng thử lại sau vài giây.';
export type NtRequiredDecision = { ok: boolean; required: boolean; msg?: string };
/**
 * Quyết định bản ghi mới có phải mang ntRequired=true không, KHÔNG phụ thuộc prop có thể chưa tải
 * (settings/global tải sau → prop null/undefined; rules vẫn bắt ntRequired nên thiếu cờ = permission-denied).
 * - Prop đã cho thấy bắt buộc → true (không cần fetch).
 * - Ngược lại đọc settings/global lúc lưu (fetchCutoff trả ntImplementerRequiredFrom, hoặc null nếu chưa đặt).
 * - Fetch lỗi: nếu prop có giá trị (đã tải, chưa tới mốc) dùng prop; còn không → chặn, không gửi thiếu cờ.
 */
export async function resolveNtRequired(
  propCutoff: any,
  fetchCutoff: () => Promise<any>,
  now: Date = new Date(),
): Promise<NtRequiredDecision> {
  if (ntImplementerRequired(propCutoff, now)) return { ok: true, required: true };
  try {
    return { ok: true, required: ntImplementerRequired(await fetchCutoff(), now) };
  } catch {
    if (cutoffDate(propCutoff)) return { ok: true, required: false };
    return { ok: false, required: false, msg: NT_CFG_LOADING_MSG };
  }
}
