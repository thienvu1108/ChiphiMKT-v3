/** Phạm vi Khối cho Quản lý Khối (Ngân sách Khối / Báo cáo Khối).
 *  GĐK / Trợ lý Khối: chỉ Khối mình phụ trách. Admin/Mod/Kế toán/Trưởng ban: mọi Khối.
 *  `active` = Khối đang chọn ở đầu trang Quản lý Khối (để tab v-next không lệch Khối). */
export const KHOI_GLOBAL_ROLES = ['super_admin', 'admin', 'mod', 'accountant', 'truong_ban_kd'];
export const KHOI_MANAGER_ROLES = ['gd_khoi', 'tro_ly_khoi'];
export function khoiScope(role: string, myBlockIds: string[], allBlockIds: string[], active?: string) {
  const global = KHOI_GLOBAL_ROLES.includes(role);
  const allowed = global ? [...allBlockIds] : KHOI_MANAGER_ROLES.includes(role) ? allBlockIds.filter((b) => myBlockIds.includes(b)) : [];
  const selected = active && allowed.includes(active) ? active : allowed[0] || '';
  return { global, allowed, selected, canSwitch: allowed.length > 1 };
}
