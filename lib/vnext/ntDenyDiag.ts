/** Chẩn đoán vì sao máy chủ từ chối TẠO Nghiệm thu (permission-denied) — kiểm theo đúng thứ tự firestore.rules, trả lý do ĐẦU TIÊN sai. Thuần, không PII (chỉ id rút gọn). */
export type NtDenyInput = {
  authUid: string;
  profileDocId: string;
  serverRole: string | null;
  payload: { month?: unknown; ntMonth?: unknown; implementerUid?: unknown; implementerManual?: unknown; ntRequired?: unknown; supplementFor?: unknown; adLinks?: unknown };
  cutoffMs: number | null;
  serverNowMs: number;
  pastLocked: boolean;
  windowLocked: boolean;
  keyExists: boolean;
  keyAcceptanceExists: boolean;
  keyAcceptanceId?: string;
};
export type NtDenyResult = { code: string; message: string };

const short = (s: unknown) => { const v = String(s || ''); return v ? `${v.slice(0, 6)}…` : '—'; };
const ymRe = /^\d{4}-\d{2}$/;

export function explainNtCreateDenied(i: NtDenyInput): NtDenyResult {
  const p = i.payload || {};
  const month = String(p.month || '');
  const ky = ymRe.test(month) ? `${+month.slice(5)}/${month.slice(0, 4)}` : month || '?';
  if (i.serverRole == null) {
    return { code: 'no-profile', message: `Tài khoản đang đăng nhập chưa có quyền Mod/Admin trên máy chủ (UID ${short(i.authUid)}). Đăng xuất, đăng nhập lại đúng tài khoản; nếu vẫn lỗi báo Super Admin.` };
  }
  if (!['admin', 'super_admin', 'mod'].includes(i.serverRole)) {
    return { code: 'role', message: `Tài khoản đang đăng nhập chưa có quyền Mod/Admin trên máy chủ (UID ${short(i.authUid)}). Đăng xuất, đăng nhập lại đúng tài khoản; nếu vẫn lỗi báo Super Admin.` };
  }
  const lockedMsg = `Kỳ tháng ${ky} đã khoá Nghiệm thu (hoặc bạn không có quyền). Chỉ Super Admin sửa được — hãy tạo bản «Nghiệm thu bổ sung» mới trong kỳ đang mở để Super Admin duyệt.`;
  if (i.pastLocked) return { code: 'past-locked', message: lockedMsg };
  if (i.windowLocked) return { code: 'window-locked', message: lockedMsg };
  if (i.keyExists) {
    if (i.keyAcceptanceExists) {
      return { code: 'dup-key', message: `Đã có bản ghi Nghiệm thu cùng Người phụ trách + Dự án + kỳ (mã ${short(i.keyAcceptanceId)}) — có thể bị ẩn bởi bộ lọc Team/Khối. Tìm và sửa bản đó thay vì tạo mới.` };
    }
    return { code: 'orphan-key', message: 'Khoá trùng cũ chưa giải phóng — tải lại trang rồi thử lại; nếu vẫn lỗi báo Admin.' };
  }
  const hasImpl = !!p.implementerUid || !!p.implementerManual;
  if (i.cutoffMs != null && i.serverNowMs >= i.cutoffMs && (!hasImpl || p.ntRequired !== true)) {
    return { code: 'missing-required', message: 'Thiếu cờ bắt buộc Người phụ trách (ứng dụng chưa tải xong cấu hình) — tải lại trang (Ctrl+Shift+R) rồi thử lại.' };
  }
  if (p.implementerManual && month !== '2026-10') {
    return { code: 'manual-not-allowed', message: 'Chỉ kỳ Tháng 10/2026 được tự nhập Người phụ trách.' };
  }
  const sf = p.supplementFor ? String(p.supplementFor) : '';
  if (sf && (!ymRe.test(sf) || !ymRe.test(month) || sf >= month)) {
    return { code: 'supplement-shape', message: 'Nghiệm thu bổ sung không hợp lệ (kỳ bổ sung phải là kỳ trước kỳ đang lưu).' };
  }
  if (Array.isArray(p.adLinks) && p.adLinks.length > 20) {
    return { code: 'adlinks', message: 'Danh sách link quảng cáo vượt quá 20 mục — bớt lại rồi lưu.' };
  }
  return { code: 'unknown', message: 'Máy chủ từ chối lưu (mã NT-?) — đã ghi nhật ký để quản trị viên kiểm tra. Tải lại trang rồi thử lại.' };
}
