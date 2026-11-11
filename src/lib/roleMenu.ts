/**
 * Role-locked navigation (menu + landing + URL guard).
 *
 * Some roles get exactly ONE screen, enforced by ROLE in code (independent of the
 * rolePermissions toggles in Cài đặt › Phân quyền):
 *  - Giám đốc Khối (gd_khoi) / Trợ lý Khối (tro_ly_khoi) → Quản lý Khối
 *    (Ngân sách Khối of their own Khối lives inside it, tab "Ngân sách Khối").
 *  - Trưởng ban KD (truong_ban_kd) / Phó Ban KD (pho_ban_kd) → Quản lý Ban KD (own Ban only).
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

type NavLike = { value: string; isAdminLink?: boolean; adminSubTab?: string };

/**
 * Sidebar / bottom nav / "Thêm" drawer items for a role. Locked roles keep only their single
 * screen; other roles are returned unchanged.
 */
export function filterNavForRole<T extends NavLike>(role: unknown, items: T[]): T[] {
  const locked = lockedScreenForRole(role);
  if (!locked) return items;
  return items.filter((i) => !i.isAdminLink && !i.adminSubTab && i.value === locked.tab);
}

/** May this role be on (tab, adminSubTab)? Unlocked roles: always true (other guards apply). */
export function isScreenAllowedForRole(role: unknown, tab: string, _adminSubTab?: string): boolean {
  const locked = lockedScreenForRole(role);
  if (!locked) return true;
  return tab === locked.tab;
}

/** URL guard: path to replace the current one with, or null when the path is allowed. */
export function redirectPathForRole(role: unknown, pathname: string): string | null {
  const locked = lockedScreenForRole(role);
  if (!locked) return null;
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  if (clean === locked.path || clean.startsWith(locked.path + '/')) return null;
  return locked.path;
}

/** Landing tab after login for a locked role (null → use the normal landing logic). */
export function landingTabForRole(role: unknown): string | null {
  return lockedScreenForRole(role)?.tab || null;
}
