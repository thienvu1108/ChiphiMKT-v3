/**
 * Role → permission helpers that MIRROR firestore.rules (normalizedUserRole / hasPerm /
 * defaultPermsFor). Keep in sync with firestore.rules so the UI never shows an action the
 * rules will deny (and vice versa).
 */

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

/** firestore.rules defaultPermsFor(role): used only when rolePermissions/{role} is missing. */
export const RULE_DEFAULT_PERMS: Record<RoleKey, string[]> = {
  super_admin: ['home.view', 'history.view', 'actual.view', 'actual.create', 'actual.edit', 'register.view', 'register.create', 'register.edit', 'admin.costs.view', 'admin.costs.create', 'admin.costs.edit', 'admin.budgets.view', 'admin.budgets.create', 'admin.budgets.edit', 'mkt_efficiency.view', 'report_nt.view', 'block.view', 'block_budget.view', 'block_budget.create', 'block_budget.edit', 'block_budget.delete', 'reciprocal_budget.view', 'reciprocal_budget.create', 'reciprocal_budget.edit', 'reciprocal_budget.delete', 'admin.users.view', 'admin.permissions.edit'],
  admin: ['home.view', 'history.view', 'actual.view', 'actual.create', 'actual.edit', 'register.view', 'register.create', 'register.edit', 'admin.costs.view', 'admin.costs.create', 'admin.costs.edit', 'admin.budgets.view', 'admin.budgets.create', 'admin.budgets.edit', 'mkt_efficiency.view', 'report_nt.view', 'block.view', 'block_budget.view', 'block_budget.create', 'block_budget.edit', 'block_budget.delete', 'reciprocal_budget.view', 'reciprocal_budget.create', 'reciprocal_budget.edit', 'reciprocal_budget.delete', 'admin.users.view', 'admin.permissions.edit'],
  mod: ['home.view', 'history.view', 'actual.view', 'actual.create', 'actual.edit', 'register.view', 'register.create', 'register.edit', 'admin.costs.view', 'admin.budgets.view', 'mkt_efficiency.view', 'report_nt.view', 'block.view', 'block_budget.view', 'reciprocal_budget.view'],
  accountant: ['home.view', 'history.view', 'actual.view', 'register.view', 'admin.costs.view', 'admin.costs.edit', 'admin.budgets.view', 'admin.budgets.edit', 'mkt_efficiency.view', 'report_nt.view', 'block.view', 'block_budget.view', 'reciprocal_budget.view', 'reciprocal_budget.create', 'reciprocal_budget.edit', 'reciprocal_budget.delete'],
  gdda: ['home.view', 'history.view', 'actual.view', 'actual.create', 'actual.edit', 'register.view', 'register.create', 'register.edit', 'mkt_efficiency.view', 'report_nt.view', 'block.view', 'block_budget.view', 'reciprocal_budget.view'],
  gd_khoi: ['home.view', 'history.view', 'actual.view', 'register.view', 'mkt_efficiency.view', 'report_nt.view', 'block.view', 'block_budget.view', 'block_budget.create', 'block_budget.edit', 'block_budget.delete', 'reciprocal_budget.view', 'reciprocal_budget.create', 'reciprocal_budget.edit', 'reciprocal_budget.delete'],
  tro_ly_khoi: ['home.view', 'history.view', 'actual.view', 'register.view', 'mkt_efficiency.view', 'report_nt.view', 'block.view', 'block_budget.view', 'block_budget.create', 'block_budget.edit', 'block_budget.delete', 'reciprocal_budget.view', 'reciprocal_budget.create', 'reciprocal_budget.edit', 'reciprocal_budget.delete'],
  // Trưởng ban KD: only Quản lý Ban KD (Ngân sách Ban = block budgets of the Ban's projects,
  // Nghiệm thu MKT theo Ban = acceptances). Scope to own Ban is enforced in UI + ban_kd rules.
  truong_ban_kd: ['report_nt.view', 'block_budget.view'],
  // Phó Ban KD: xem Quản lý Ban KD (không duyệt NS Ban — UI canApprove = leader only).
  pho_ban_kd: ['report_nt.view', 'block_budget.view'],
  gdkd: ['home.view', 'history.view', 'actual.view', 'register.view', 'mkt_efficiency.view', 'report_nt.view'],
  assistant: ['home.view', 'history.view', 'actual.view', 'actual.create', 'actual.edit', 'register.view', 'register.create', 'register.edit', 'mkt_efficiency.view', 'report_nt.view', 'block.view', 'block_budget.view', 'block_budget.create', 'block_budget.edit', 'block_budget.delete', 'reciprocal_budget.view', 'reciprocal_budget.create', 'reciprocal_budget.edit', 'reciprocal_budget.delete'],
  user: [],
};

/**
 * Permission families the rules enforce by EXACT key. For these the UI must not use the
 * legacy fallbacks (".edit implies .create/.delete", "any family key implies .view").
 */
const RULE_ENFORCED_PREFIXES = [
  'block_budget.', 'reciprocal_budget.', 'register.', 'actual.', 'admin.budgets.', 'admin.costs.',
  'home.view', 'history.view', 'report_nt.view', 'mkt_efficiency.view', 'block.view',
];

export function isRuleEnforcedKey(key: string): boolean {
  return RULE_ENFORCED_PREFIXES.some((p) => (p.endsWith('.') ? key.startsWith(p) : key === p));
}

export type RolePermDoc = { id?: string; role?: string; permissions?: unknown };

/** Find the stored rolePermissions doc the RULES read (doc id == normalized role). */
export function findRolePermDoc(list: RolePermDoc[] | undefined, roleKey: RoleKey): RolePermDoc | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.find((rp) => rp?.id === roleKey) || list.find((rp) => !rp?.id && rp?.role === roleKey);
}

/** Exactly firestore.rules hasPerm(key). */
export function ruleHasPerm(opts: {
  roleKey: RoleKey;
  rolePermissionsList?: RolePermDoc[];
  isAppOwner?: boolean;
  /** rules: hasUserData() — profile doc exists */
  hasProfile?: boolean;
}, key: string): boolean {
  const { roleKey, rolePermissionsList, isAppOwner, hasProfile = true } = opts;
  if (isAppOwner) return true;
  if (!hasProfile) return false;
  if (roleKey === 'super_admin') return true;
  const saved = findRolePermDoc(rolePermissionsList, roleKey);
  if (saved) return Array.isArray(saved.permissions) && (saved.permissions as unknown[]).includes(key);
  return RULE_DEFAULT_PERMS[roleKey].includes(key);
}

export function ruleHasAnyPerm(opts: Parameters<typeof ruleHasPerm>[0], keys: string[]): boolean {
  return keys.some((k) => ruleHasPerm(opts, k));
}

/**
 * UI permission check. Rule-enforced keys follow the rules exactly (block_budget.create also
 * accepts block_budget.edit, like the rules). Other keys keep the legacy UI fallbacks.
 */
export function uiHasPermission(opts: {
  roleKey: RoleKey;
  rolePermissionsList?: RolePermDoc[];
  defaultPermissions?: Record<string, string[]>;
  isAppOwner?: boolean;
}, permKey: string): boolean {
  const { roleKey, rolePermissionsList, defaultPermissions = {}, isAppOwner } = opts;
  if (isAppOwner || roleKey === 'super_admin') return true;
  if (isRuleEnforcedKey(permKey)) {
    if (roleKey === 'user') {
      // Role "user" UI only exposes process_doiung.* (rules may allow less-visible extras).
      return false;
    }
    if (permKey === 'block_budget.create') {
      return ruleHasAnyPerm({ roleKey, rolePermissionsList, isAppOwner }, ['block_budget.create', 'block_budget.edit']);
    }
    return ruleHasPerm({ roleKey, rolePermissionsList, isAppOwner }, permKey);
  }
  if (roleKey === 'user') return permKey.startsWith('process_doiung.');
  const saved = findRolePermDoc(rolePermissionsList, roleKey);
  const current: string[] = saved
    ? (Array.isArray(saved.permissions) ? (saved.permissions as string[]) : [])
    : defaultPermissions[roleKey] || [];
  if (current.includes(permKey)) return true;
  if (permKey.endsWith('.create') || permKey.endsWith('.delete')) {
    const baseKey = permKey.replace(/\.(create|delete)$/, '');
    if (current.includes(`${baseKey}.edit`)) return true;
  }
  if (permKey.endsWith('.view')) {
    const baseKey = permKey.replace(/\.view$/, '');
    if (current.some((p) => p.startsWith(`${baseKey}.`))) return true;
  }
  return false;
}
