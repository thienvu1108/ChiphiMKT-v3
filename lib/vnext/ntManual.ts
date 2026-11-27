/**
 * Nghiệm thu MKT — «Người phụ trách» tự nhập (chỉ kỳ Tháng 10/2026: 21/9–20/10).
 * Tháng 10 chưa có đăng ký NS MKT theo user → cho gõ tên tay. Từ Tháng 11 (21/10/2026) chỉ chọn từ danh sách.
 * Lưu: implementerName = tên gõ, implementerManual = true, implementerUid = '' (không có uid / không khoá ntKeys),
 * ntMonth = '2026-10'. Mọi màn hình / báo cáo / xuất file đọc implementerName nên hiển thị đúng.
 * firestore.rules kiểm tra lại (ntManualOk): chỉ tháng 10.2026, tên 1–120 ký tự, quyền vn.nt_records.manual_assignee.
 */
import { normalizeMonth } from './ntReport';

export const NT_MANUAL_MONTH = '2026-10';
export const NT_MANUAL_FEATURE = 'vn.nt_records.manual_assignee';
export const NT_MANUAL_VALUE = '__manual__';
export const NT_MANUAL_LABEL = '✎ Khác – tự nhập tên…';
export const NT_MANUAL_MAX = 120;

export type NtManualOpts = { supplementFor?: string; noBudget?: boolean };
/** Nghiệm thu bổ sung «Không có đăng ký NS» cho kỳ gốc ≥ 2026-11 cũng được tự nhập (xem ntManualAllowed). */
export const NT_MANUAL_NOBUDGET_FROM = '2026-11';
function noBudgetManualOk(opts?: NtManualOpts): boolean {
  return !!opts?.noBudget && normalizeMonth(opts?.supplementFor) >= NT_MANUAL_NOBUDGET_FROM && /^\d{4}-\d{2}$/.test(normalizeMonth(opts?.supplementFor));
}

/**
 * Bản ghi / kỳ có được tự nhập Người phụ trách không: Tháng 10/2026,
 * hoặc Nghiệm thu bổ sung «Không có đăng ký NS» cho kỳ gốc ≥ 2026-11.
 */
export function ntManualAllowed(month: unknown, opts?: NtManualOpts): boolean {
  return normalizeMonth(month) === NT_MANUAL_MONTH || noBudgetManualOk(opts);
}

export function cleanManualName(s: unknown): string {
  return String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function validateManualName(s: unknown): string | null {
  const n = cleanManualName(s);
  if (!n) return 'Nhập tên người phụ trách';
  if (n.length > NT_MANUAL_MAX) return `Tối đa ${NT_MANUAL_MAX} ký tự`;
  return null;
}

export function isManualImplementer(r: any): boolean {
  return r?.implementerManual === true && !r?.implementerUid && !!r?.implementerName;
}

/** Tên hiển thị (kèm nhãn «tự nhập» khi cần). */
export function implementerLabel(r: any, withTag = true): string {
  const n = String(r?.implementerName || '');
  if (!n) return '';
  return isManualImplementer(r) && withTag ? `${n} (tự nhập)` : n;
}

/** Patch ghi vào acceptances/{id} cho tên tự nhập. Ném lỗi nếu tháng không cho phép hoặc tên không hợp lệ. */
export function manualAttributionPatch(month: unknown, name: unknown, by?: { uid?: string; email?: string }, opts?: NtManualOpts) {
  if (!ntManualAllowed(month, opts)) throw Object.assign(new Error('Chỉ kỳ Tháng 10/2026 hoặc Nghiệm thu bổ sung «Không có đăng ký NS» được tự nhập Người phụ trách'), { code: 'month' });
  const err = validateManualName(name);
  if (err) throw Object.assign(new Error(err), { code: 'name' });
  return {
    implementerUid: '', implementerName: cleanManualName(name), implementerManual: true, ntMonth: normalizeMonth(month) === NT_MANUAL_MONTH ? NT_MANUAL_MONTH : normalizeMonth(month),
    ntAssignedAt: new Date().toISOString(), ntAssignedBy: by?.email || by?.uid || '',
  };
}

/** Khoá chuỗi cho báo cáo (bản ghi tự nhập không có uid). */
export function manualKey(name: unknown): string {
  return 'manual:' + cleanManualName(name).toLowerCase();
}
