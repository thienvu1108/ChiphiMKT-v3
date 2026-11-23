/**
 * Role-locked navigation (menu + landing + URL guard).
 *
 * Some roles get exactly ONE screen, enforced by ROLE in code (independent of the
 * rolePermissions toggles in Cài đặt › Phân quyền):
 *  - Giám đốc Khối (gd_khoi) / Trợ lý Khối (tro_ly_khoi) → Quản lý Khối
 *    (Ngân sách Khối of their own Khối lives inside it, tab "Ngân sách Khối").
 *  - Trưởng ban KD (truong_ban_kd) / Phó Ban KD (pho_ban_kd) → Quản lý Ban KD (own Ban only).
 * Exception: gd_khoi who is also a Phó Ban (ban_kd.deputyUids) may open Quản lý Ban KD too.
 * Every other URL redirects to that screen; landing after login is that screen.
 */
import { normalizeRoleKey, type RoleKey } from './rolePermissions';

export type LockedScreen = { tab: string; path: string; label: string };

export const ROLE_LOCKED_SCREEN: Partial<Record<RoleKey, LockedScreen>> = {
  gd_khoi: { tab: 'block-mgmt', path: '/quan-ly-khoi', label: 'Quản lý Khối' },
  tro_ly_khoi: { tab: 'block-mgmt', path: '/quan-ly-khoi', label: 'Quản lý Khối' },
  truong_ban_kd: { tab: 'bankd-mgmt', path: '/quan-ly-ban-kd', label: 'Quản lý Ban KD' },
  pho_ban_kd: { tab: 'bankd-mgmt', path: '/quan-ly-ban-kd', label: 'Quản lý Ban KD' },
};

/** Accepts a RoleKey or any raw role string (normalized like firestore.rules). */
export function lockedScreenForRole(role: unknown): LockedScreen | null {
  const key = normalizeRoleKey(role);
  return ROLE_LOCKED_SCREEN[key] || null;
}

export function isLockedRole(role: unknown): boolean {
  return lockedScreenForRole(role) !== null;
}

/**
 * GĐ Khối kiêm Phó Ban KD (listed in some ban_kd.deputyUids): keeps Quản lý Khối as the locked main
 * screen but ALSO gets Quản lý Ban KD (own deputy Ban(s) only). Mirrors isDualGdkUser (team-mgmt).
 */
export const GDK_DEPUTY_BAN_SCREEN: LockedScreen = { tab: 'bankd-mgmt', path: '/quan-ly-ban-kd', label: 'Quản lý Ban KD' };

/** Extra screen a locked role may use besides its locked one (null → none). */
export function extraLockedScreenForRole(role: unknown, isBanDeputy?: boolean): LockedScreen | null {
  return normalizeRoleKey(role) === 'gd_khoi' && isBanDeputy ? GDK_DEPUTY_BAN_SCREEN : null;
}

type NavLike = { value: string; isAdminLink?: boolean; adminSubTab?: string };

/**
 * Sidebar / bottom nav / "Thêm" drawer items for a role. Locked roles keep only their single
 * screen; other roles are returned unchanged.
 */
export function filterNavForRole<T extends NavLike>(role: unknown, items: T[], isBanDeputy?: boolean): T[] {
  const locked = lockedScreenForRole(role);
  if (!locked) return items;
  const extra = extraLockedScreenForRole(role, isBanDeputy);
  return items.filter((i) => !i.isAdminLink && !i.adminSubTab && (i.value === locked.tab || (!!extra && i.value === extra.tab)));
}

/** May this role be on (tab, adminSubTab)? Unlocked roles: always true (other guards apply). */
export function isScreenAllowedForRole(role: unknown, tab: string, _adminSubTab?: string, isBanDeputy?: boolean): boolean {
  const locked = lockedScreenForRole(role);
  if (!locked) return true;
  const extra = extraLockedScreenForRole(role, isBanDeputy);
  return tab === locked.tab || (!!extra && tab === extra.tab);
}

/** URL guard: path to replace the current one with, or null when the path is allowed. */
export function redirectPathForRole(role: unknown, pathname: string, isBanDeputy?: boolean): string | null {
  const locked = lockedScreenForRole(role);
  if (!locked) return null;
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  if (clean === locked.path || clean.startsWith(locked.path + '/')) return null;
  const extra = extraLockedScreenForRole(role, isBanDeputy);
  if (extra && (clean === extra.path || clean.startsWith(extra.path + '/'))) return null;
  return locked.path;
}

/** Landing tab after login for a locked role (null → use the normal landing logic). */
export function landingTabForRole(role: unknown): string | null {
  return lockedScreenForRole(role)?.tab || null;
}
