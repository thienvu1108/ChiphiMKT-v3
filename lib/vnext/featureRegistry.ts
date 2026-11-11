/**
 * Sổ đăng ký tính năng / quyền v-next — NGUỒN DUY NHẤT.
 * - Cài đặt → Phân quyền tự hiện mọi mục ở đây (nhóm, nhãn, mô tả) với quyền mặc định theo vai trò.
 * - UI kiểm tra quyền qua vnCan()/effectiveVnPerms().
 * - firestore.rules: hàm vnDefaultPerms() được SINH từ file này (npm run gen:vn-rules); test kiểm tra đồng bộ.
 * Thêm tính năng mới = thêm 1 dòng vào VN_FEATURES. Vai trò đã lưu cấu hình trước đó sẽ nhận quyền
 * mặc định cho khoá mới (vì khoá chưa nằm trong knownKeys của doc rolePermissions).
 */
import type { RoleKey } from '../../src/lib/rolePermissions';

export type VnFeature = { key: string; group: string; label: string; desc: string; defaults: RoleKey[] };

const STAFF_REG: RoleKey[] = ['user', 'gdkd', 'gdda', 'assistant'];
const MGMT: RoleKey[] = ['admin', 'mod', 'accountant'];
const KHOI: RoleKey[] = ['gd_khoi', 'tro_ly_khoi'];

export const VN_FEATURES: VnFeature[] = [
  // Ngân sách MKT
  { key: 'vn.ns.view', group: 'Ngân sách MKT (kỳ 21→20)', label: 'Xem Ngân sách MKT', desc: 'Xem NS đã đăng ký theo phạm vi (user / Phòng / Khối).', defaults: [...STAFF_REG, ...MGMT, ...KHOI, 'truong_ban_kd', 'pho_ban_kd'] },
  { key: 'vn.ns.register', group: 'Ngân sách MKT (kỳ 21→20)', label: 'Đăng ký NS cá nhân', desc: 'User đăng ký NS theo dự án trong cửa sổ đăng ký.', defaults: STAFF_REG },
  { key: 'vn.ns.khoi_register', group: 'Ngân sách MKT (kỳ 21→20)', label: 'Đăng ký MKT (GĐ Khối / Trợ lý Khối)', desc: 'GĐ Khối và Trợ lý Khối tự đăng ký NS MKT theo dự án cho Khối mình (Quản lý Khối › Đăng ký MKT); tính vào NS Khối và phải nộp Báo cáo tuần.', defaults: [...KHOI] },
  { key: 'vn.ns.team_edit', group: 'Ngân sách MKT (kỳ 21→20)', label: 'Sửa NS user của Phòng', desc: 'GĐKD sửa NS user đã đăng ký (bắt buộc lý do). Đã bỏ hẳn «Bổ sung ngân sách» (kể cả Admin): NS chỉ ghi nhận từ Đăng ký Ngân sách MKT.', defaults: ['gdkd', 'admin'] },
  { key: 'vn.ns.support_approve', group: 'Ngân sách MKT (kỳ 21→20)', label: 'Duyệt hỗ trợ MKT', desc: 'GĐ Khối / Trợ lý Khối duyệt hỗ trợ MKT theo từng bản đăng ký (user × dự án × tháng) của Khối mình: Đã được duyệt / Chưa được duyệt / Từ chối (bắt buộc lý do). User nhận thông báo. Admin: mọi Khối.', defaults: ['admin', ...KHOI] },
  { key: 'vn.ns.support_export', group: 'Ngân sách MKT (kỳ 21→20)', label: 'Xuất Excel duyệt hỗ trợ (đủ CCCD / STK)', desc: 'Tải Excel danh sách bản đăng ký kèm Số CCCD, Số tài khoản, Ngân hàng đầy đủ. Admin: toàn hệ thống; GĐ Khối / Trợ lý Khối: Khối mình.', defaults: ['admin', ...KHOI] },
  { key: 'vn.kyc.view', group: 'Tài khoản & Phòng KD', label: 'Xem thông tin thanh toán (CCCD / STK)', desc: 'Xem Số CCCD, Số tài khoản, Ngân hàng của người khác: Admin / Kế toán (mọi người), GĐ Khối / Trợ lý Khối (người trong Khối mình). GĐKD và vai trò khác KHÔNG xem được dù có bật (chặn ở firestore.rules). Ai cũng xem / sửa được của chính mình.', defaults: ['admin', 'accountant', ...KHOI] },
  { key: 'vn.kyc.manage', group: 'Tài khoản & Phòng KD', label: 'Sửa hộ thông tin thanh toán', desc: 'Admin sửa Số CCCD / STK / Ngân hàng cho người dùng (Quản lý Người dùng). Mọi tài khoản bắt buộc tự khai khi đăng nhập.', defaults: ['admin'] },
  { key: 'vn.approvals.login_popup', group: 'Tài khoản & Phòng KD', label: 'Popup chờ duyệt khi đăng nhập', desc: 'Khi đăng nhập, GĐ Khối / Trợ lý Khối (Khối mình) và GĐKD (Phòng mình) thấy popup danh sách thành viên chờ duyệt, duyệt / từ chối ngay hoặc chuyển tới mục Chờ duyệt.', defaults: ['admin', ...KHOI, 'gdkd'] },
    // Quản lý Ban KD (Trưởng Ban / Phó Ban = người được gán trên Ban KD; quyền hiệu lực = quyền này VÀ đang là Trưởng/Phó của Ban)
  { key: 'vn.bankd.projects', group: 'Quản lý Ban KD', label: 'Thêm / sửa / gỡ dự án của Ban', desc: 'Trưởng Ban và Phó Ban thêm, sửa dự án thuộc Ban mình và «Gỡ khỏi Ban» (chỉ bỏ liên kết Ban, dự án vẫn còn). Chỉ Admin xoá dự án. Admin: mọi Ban.', defaults: ['admin', 'mod', 'accountant', 'gdda', ...KHOI, 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.bankd.support_pct', group: 'Quản lý Ban KD', label: 'Xem Tỉ lệ hỗ trợ MKT', desc: 'Xem tab «Tỉ lệ hỗ trợ MKT» trong Quản lý Ban KD (chính sách từng dự án, lịch sử). Quyền sửa là mục riêng bên dưới.', defaults: ['admin', 'mod', 'accountant', 'gdda', ...KHOI, 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.bankd.support_pct_edit', group: 'Quản lý Ban KD', label: 'Sửa Tỉ lệ hỗ trợ MKT (Ban mình)', desc: 'Sửa Base %, Bonus %, Điều kiện Bonus, Max / 1 sale chấm đủ 30 công, CĐT hỗ trợ của từng dự án và tỉ lệ chung + Max chung của Ban. Trưởng Ban / Phó Ban: chỉ Ban mình phụ trách. Admin: mọi Ban. Thiếu quyền này chỉ xem. Phó Ban có thể mang vai trò bất kỳ nên mặc định bật cho mọi vai trò — phạm vi vẫn chỉ Ban mình là Trưởng/Phó.', defaults: ['admin', 'mod', 'accountant', 'gdda', ...KHOI, 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.cdt.manage', group: 'Quản lý Ban KD', label: 'Quản lý CĐT (Chủ đầu tư)', desc: 'Trang «Dự án · Ban KD · Team» › Quản lý CĐT: thêm, sửa, xoá (ẩn) CĐT trong danh sách Chủ đầu tư. Mọi người xem được và chọn CĐT cho dự án.', defaults: ['admin'] },
  // Báo cáo tuần
  { key: 'vn.reports.admin_edit', group: 'Báo cáo tuần', label: 'Admin sửa / xoá Báo cáo tuần', desc: 'Sửa số liệu hoặc xoá (ẩn) Báo cáo tuần của bất kỳ ai trong Quản lý Báo cáo / Báo cáo Khối / Phòng / Ban. Có lịch sử (ai sửa, lúc nào, giá trị cũ); báo cáo đã xoá không tính vào số đã nộp.', defaults: ['admin'] },
  { key: 'vn.weekly.submit', group: 'Báo cáo tuần', label: 'Nộp Báo cáo tuần', desc: 'Nộp/cập nhật báo cáo 4 đợt mỗi kỳ, liên kết NS. Ai đăng ký MKT (kể cả GĐ Khối / Trợ lý Khối) đều phải nộp.', defaults: [...STAFF_REG, ...KHOI] },
  { key: 'vn.team_nt.view', group: 'Báo cáo Phòng / Khối / Ban', label: 'Tab Nghiệm thu MKT (Quản lý Phòng KD)', desc: 'Xem (chỉ đọc) Nghiệm thu MKT của Phòng theo kỳ; NVKD chỉ thấy bản ghi của mình.', defaults: ['admin', 'mod', 'accountant', ...KHOI, 'gdkd', 'user'] },
  // Báo cáo tổng hợp
  { key: 'vn.report.phong.view', group: 'Báo cáo Phòng / Khối / Ban', label: 'Xem Báo cáo Phòng', desc: 'Tình hình nộp và chi phí theo user của Phòng.', defaults: ['gdkd', ...KHOI, ...MGMT] },
  { key: 'vn.report.khoi.view', group: 'Báo cáo Phòng / Khối / Ban', label: 'Xem Báo cáo Khối', desc: 'Rollup Khối → Phòng → User.', defaults: [...KHOI, ...MGMT] },
  { key: 'vn.report.ban.view', group: 'Báo cáo Phòng / Khối / Ban', label: 'Xem Báo cáo Ban KD', desc: 'Báo cáo theo dự án của Ban.', defaults: ['truong_ban_kd', 'pho_ban_kd', ...MGMT] },
  { key: 'vn.report_mgmt.view', group: 'Báo cáo Phòng / Khối / Ban', label: 'Quản lý Báo cáo', desc: 'Báo cáo tuần toàn hệ thống, lọc, rollup.', defaults: MGMT },
  { key: 'vn.report.export', group: 'Báo cáo Phòng / Khối / Ban', label: 'Xuất Excel báo cáo', desc: 'Tải Excel báo cáo tuần/rollup trong phạm vi được xem.', defaults: ['gdkd', ...KHOI, ...MGMT, 'truong_ban_kd', 'pho_ban_kd'] },
  // Báo cáo Nghiệm thu
  { key: 'vn.nt_report.view', group: 'Báo cáo Nghiệm thu', label: 'Xem Báo cáo Nghiệm thu', desc: 'Slide báo cáo từ bản ghi “Đã nghiệm thu”.', defaults: ['gdkd', ...KHOI, ...MGMT, 'truong_ban_kd', 'pho_ban_kd'] },
  { key: 'vn.nt_report.export', group: 'Báo cáo Nghiệm thu', label: 'Tải PDF / PPTX', desc: 'Xuất báo cáo Nghiệm thu.', defaults: ['gdkd', ...KHOI, ...MGMT, 'truong_ban_kd', 'pho_ban_kd'] },
  { key: 'vn.nt_images.upload', group: 'Báo cáo Nghiệm thu', label: 'Tải ảnh Nghiệm thu', desc: 'Nút Tải ảnh trên từng bản ghi (Drive: Tháng/Khối/Phòng/User/Dự án).', defaults: ['admin', 'mod'] },
  { key: 'vn.nt_invoices.upload', group: 'Báo cáo Nghiệm thu', label: 'Tải Hóa đơn Nghiệm thu', desc: 'Nút «Tải Hóa Đơn» cạnh «Tải ảnh»: nhiều ảnh / PDF, không giới hạn dung lượng (tải thẳng lên Drive), thư mục Hóa đơn riêng cùng cấu trúc Tháng/Khối/Phòng/User/Dự án. Hiện trong Báo cáo Nghiệm thu, mục Hóa đơn.', defaults: ['admin', 'mod'] },
  { key: 'vn.share_links.manage', group: 'Báo cáo Nghiệm thu', label: 'Tạo / thu hồi link công khai', desc: 'Link xem báo cáo có hạn, thu hồi được.', defaults: ['admin', 'mod'] },
  { key: 'vn.nt_records.assign', group: 'Báo cáo Nghiệm thu', label: 'Gán Phòng / Người phụ trách', desc: 'Chọn Phòng KD rồi Người phụ trách (lọc theo Phòng); 1 bản ghi / user / dự án / tháng.', defaults: ['admin', 'mod'] },
  { key: 'vn.nt_records.manual_assignee', group: 'Báo cáo Nghiệm thu', label: 'Tự nhập Người phụ trách (Tháng 10/2026)', desc: 'Chỉ kỳ Tháng 10/2026 (21/9–20/10, chưa có đăng ký NS theo user): chọn «Khác – tự nhập» để gõ tên. Từ Tháng 11 chỉ chọn từ danh sách.', defaults: ['admin', 'mod'] },
  // Tài khoản & tổ chức
  { key: 'vn.approvals.review', group: 'Tài khoản & Phòng KD', label: 'Duyệt đăng ký / chức vụ', desc: 'Duyệt yêu cầu trong Khối/Phòng mình quản lý (GĐK/Trợ lý Khối: GĐKD, Trợ lý Khối và thành viên NVKD vào mọi Phòng KD thuộc Khối mình; GĐKD: NVKD Phòng mình). Admin duyệt tất cả.', defaults: ['admin', ...KHOI, 'gdkd'] },
  { key: 'vn.transfer.direct', group: 'Tài khoản & Phòng KD', label: 'Chuyển Phòng trực tiếp', desc: 'Chuyển user sang Phòng/Khối khác không cần duyệt.', defaults: ['admin'] },
  { key: 'vn.dual_gdkd.assign', group: 'Tài khoản & Phòng KD', label: 'Gán GĐ Khối kiêm GĐKD', desc: 'Thêm GĐ Khối vào danh sách GĐKD của Phòng (tính vào tối đa 4); duyệt đăng ký «kiêm GĐKD Phòng…».', defaults: ['admin'] },
  { key: 'vn.users.rename', group: 'Tài khoản & Phòng KD', label: 'Đổi tên người dùng', desc: 'Admin: mọi người · GĐK/Trợ lý Khối: người trong Khối mình · GĐKD: người trong Phòng mình. Chỉ đổi họ tên; ghi Nhật ký (ai đổi, tên cũ → mới).', defaults: ['admin', ...KHOI, 'gdkd'] },
  { key: 'vn.users.rename_self', group: 'Tài khoản & Phòng KD', label: 'Tự đổi tên mình', desc: 'Mọi người (kể cả đang chờ duyệt) tự đổi họ tên hiển thị của mình ở menu tài khoản. Chỉ đổi họ tên; ghi Nhật ký (tên cũ → mới).', defaults: ['admin', 'mod', 'accountant', 'gdda', ...KHOI, 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.guide.view', group: 'Hướng dẫn', label: 'Xem Hướng dẫn', desc: 'Trang «Hướng dẫn» (quy trình thanh toán & thuế tài khoản quảng cáo Meta). Người đang chờ duyệt luôn xem được.', defaults: ['admin', 'mod', 'accountant', 'gdda', ...KHOI, 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.support_info.view', group: 'Hướng dẫn', label: 'Xem Thông tin Hỗ trợ', desc: 'Menu «Thông tin Hỗ trợ» (chỉ xem): chính sách hỗ trợ MKT của mọi dự án — Base %, Bonus %, Điều kiện Bonus, Max / 1 sale chấm đủ 30 công, CĐT hỗ trợ.', defaults: ['admin', 'mod', 'accountant', 'gdda', ...KHOI, 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.team_status.edit', group: 'Tài khoản & Phòng KD', label: 'Ngừng hoạt động / danh sách GĐKD', desc: 'Đổi trạng thái Phòng và danh sách GĐKD (tối đa 4).', defaults: ['admin', 'accountant'] },
  // Tiện ích chung (batch 24/10)
  { key: 'vn.notif.bell', group: 'Tiện ích chung', label: 'Chuông thông báo', desc: 'Chuông trên thanh trên cùng: số chưa đọc, danh sách, đánh dấu đã đọc, bấm để mở bản ghi.', defaults: ['admin', 'mod', 'accountant', 'gdda', 'gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.home.role', group: 'Tiện ích chung', label: 'Trang chủ theo vai trò', desc: 'Trang chủ hiện việc cần làm và số liệu theo vai trò (nhân viên, GĐK/Trợ lý, Trưởng/Phó Ban, Kế toán, Admin).', defaults: ['admin', 'mod', 'accountant', 'gdda', 'gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.search.global', group: 'Tiện ích chung', label: 'Tìm kiếm nhanh (Ctrl+K)', desc: 'Tìm người, mã Phòng, Khối, Ban, dự án — chỉ trong phạm vi được xem.', defaults: ['admin', 'mod', 'accountant', 'gdda', 'gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.view.cards', group: 'Tiện ích chung', label: 'Chuyển Bảng / Thẻ trên điện thoại', desc: 'Bảng dài có nút Bảng / Thẻ (nhớ theo người dùng; mặc định Thẻ trên điện thoại).', defaults: ['admin', 'mod', 'accountant', 'gdda', 'gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'] },
  { key: 'vn.locks.manage', group: 'Hệ thống', label: 'Cài đặt khoá theo ngày', desc: 'Khoá đăng ký NS mới / sửa NS / Nghiệm thu theo khoảng ngày (giờ VN). Chỉ Super Admin (luật Firestore cũng chỉ cho Super Admin).', defaults: [] },
  { key: 'vn.errorlog.view', group: 'Hệ thống', label: 'Nhật ký lỗi', desc: 'Xem lỗi phía người dùng (không có thông tin cá nhân), gộp theo lỗi, lọc theo màn / vai trò / thiết bị.', defaults: ['admin'] },
  { key: 'vn.usage.view', group: 'Hệ thống', label: 'Thống kê sử dụng', desc: 'DAU/WAU theo vai trò / Khối / Ban, màn dùng nhiều, máy tính vs điện thoại, đăng ký/ngày, thời gian duyệt, chờ duyệt theo Khối, người thiếu STK.', defaults: ['admin'] },
];

export const VN_FEATURE_KEYS = VN_FEATURES.map((f) => f.key);

export const VN_ROLES: RoleKey[] = ['super_admin', 'admin', 'mod', 'accountant', 'gdda', 'gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'pho_ban_kd', 'gdkd', 'assistant', 'user'];

export function vnDefaultPerms(role: RoleKey): string[] {
  if (role === 'super_admin') return [...VN_FEATURE_KEYS];
  return VN_FEATURES.filter((f) => f.defaults.includes(role)).map((f) => f.key);
}

/** Nhóm cho Cài đặt → Phân quyền (cùng hình dạng PERMISSION_GROUPS). */
export function vnPermissionGroups() {
  const groups: { category: string; items: { key: string; label: string; desc: string }[] }[] = [];
  for (const f of VN_FEATURES) {
    let g = groups.find((x) => x.category === f.group);
    if (!g) groups.push((g = { category: f.group, items: [] }));
    g.items.push({ key: f.key, label: f.label, desc: f.desc });
  }
  return groups;
}

/**
 * Quyền hiệu lực của vai trò cho các khoá v-next.
 * doc.knownKeys = các khoá admin đã từng thấy khi lưu → theo doc.permissions; khoá mới → mặc định registry.
 */
export function effectiveVnPerms(role: RoleKey, saved?: { permissions?: unknown; knownKeys?: unknown } | null): string[] {
  if (role === 'super_admin') return [...VN_FEATURE_KEYS];
  const defs = new Set(vnDefaultPerms(role));
  if (!saved) return [...defs];
  const perms = new Set(Array.isArray(saved.permissions) ? (saved.permissions as string[]) : []);
  const known = new Set(Array.isArray(saved.knownKeys) ? (saved.knownKeys as string[]) : []);
  return VN_FEATURE_KEYS.filter((k) => (known.has(k) ? perms.has(k) : defs.has(k)));
}

/** Danh sách đầy đủ để chỉnh trong Phân quyền: quyền cũ đã lưu + quyền v-next hiệu lực. */
export function editablePerms(role: RoleKey, saved: { permissions?: unknown; knownKeys?: unknown } | null | undefined, legacyDefaults: string[]): string[] {
  const legacy = saved ? (Array.isArray(saved.permissions) ? (saved.permissions as string[]) : []).filter((k) => !k.startsWith('vn.')) : legacyDefaults;
  return [...new Set([...legacy, ...effectiveVnPerms(role, saved)])];
}

/** Sinh khối hàm cho firestore.rules (giữ đồng bộ với registry). */
export function rulesBlock(): string {
  const roles = VN_ROLES.filter((r) => r !== 'super_admin');
  // Chuỗi ternary: chỉ danh sách của role khớp được đánh giá (giới hạn 1000 biểu thức của rules).
  const body = roles.map((r) => `      role == '${r}' ? [${vnDefaultPerms(r).map((k) => `'${k}'`).join(', ')}] :`).join('\n');
  return [
    '    // BEGIN GENERATED vn-registry (lib/vnext/featureRegistry.ts → npm run gen:vn-rules). Không sửa tay.',
    '    function vnDefaultPerms(role) {',
    '      return',
    body,
    '      [];',
    '    }',
    '    // END GENERATED vn-registry',
  ].join('\n');
}
