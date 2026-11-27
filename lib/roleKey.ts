/** Role id + normalizer, shared by client and Vercel serverless APIs (keep off src/). */
export type RoleKey =
  | 'super_admin'
  | 'admin'
  | 'mod'
  | 'accountant'
  | 'gdda'
  | 'gd_khoi'
  | 'tro_ly_khoi'
  | 'truong_ban_kd'
  | 'pho_ban_kd'
  | 'gdkd'
  | 'assistant'
  | 'user';

/** Same mapping as firestore.rules normalizedUserRole(). An assignedBlock alone is NOT a role. */
export function normalizeRoleKey(raw: unknown): RoleKey {
  const r = String(raw ?? 'user').toLowerCase().trim();
  if (r === 'super_admin' || r === 'super admin') return 'super_admin';
  if (r === 'admin' || r === 'quản trị' || r === 'quan tri') return 'admin';
  if (r === 'mod' || r === 'moderator' || r === 'điều phối' || r === 'dieu phoi') return 'mod';
  if (r === 'accountant' || r === 'kế toán' || r === 'ke toan') return 'accountant';
  if (r === 'gdda' || r === 'gđda' || r === 'giám đốc dự án') return 'gdda';
  if (
    r === 'gd_khoi' || r === 'gdkhoi' || r === 'gđ khối' || r === 'giám đốc khối' ||
    r === 'giám đốc liên khối' || r === 'gdk' || r === 'gd khối' || r === 'trưởng khối'
  ) return 'gd_khoi';
  if (
    r === 'tro_ly_khoi' || r === 'trợ lý khối' || r === 'tro ly khoi' || r === 'tro_ly_gdkhoi' ||
    r === 'assistant_block'
  ) return 'tro_ly_khoi';
  if (
    r === 'truong_ban_kd' || r === 'trưởng ban kd' || r === 'truong ban kd' || r === 'trưởng ban' ||
    r === 'truong_ban' || r === 'trưởng ban kinh doanh'
  ) return 'truong_ban_kd';
  if (
    r === 'pho_ban_kd' || r === 'phó ban kd' || r === 'pho ban kd' || r === 'phó ban' ||
    r === 'pho_ban' || r === 'phó ban kinh doanh'
  ) return 'pho_ban_kd';
  if (r === 'gdkd' || r === 'gđkd' || r === 'giám đốc kinh doanh' || r === 'gđ kinh doanh') return 'gdkd';
  if (r === 'assistant' || r === 'trợ lý' || r === 'tro ly') return 'assistant';
  return 'user';
}
