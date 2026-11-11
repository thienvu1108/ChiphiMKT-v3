import { describe, expect, it } from 'vitest';
import {
  filterNavForRole, isLockedRole, isScreenAllowedForRole, landingTabForRole, lockedScreenForRole, redirectPathForRole,
} from '../src/lib/roleMenu';
import { normalizeRoleKey, ruleHasPerm, uiHasPermission, RULE_DEFAULT_PERMS } from '../src/lib/rolePermissions';
import { APP_ROUTES, tabsFromPath } from '../lib/routes';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Everything the sidebar can offer (same shapes AuthenticatedApp builds for shellNavItems).
const FULL_NAV = [
  { value: 'home', label: 'Trang chủ' },
  { value: 'report-nt', label: 'Nghiệm thu MKT' },
  { value: 'block-budgets', label: 'Ngân sách Khối', isAdminLink: true, adminSubTab: 'block-budgets' },
  { value: 'reciprocal-budgets', label: 'Ngân sách đối ứng', isAdminLink: true, adminSubTab: 'reciprocal-budgets' },
  { value: 'block-mgmt', label: 'Quản lý Khối' },
  { value: 'bankd-mgmt', label: 'Quản lý Ban KD' },
  { value: 'process-mkt', label: 'Quy trình MKT' },
  { value: 'process-doiung', label: 'Quy trình đối ứng' },
  { value: 'projects', label: 'Dự án · Ban KD · Team', isAdminLink: true, adminSubTab: 'projects' },
  { value: 'users', label: 'Users', isAdminLink: true, adminSubTab: 'users' },
  { value: 'permissions', label: 'Phân quyền', isAdminLink: true, adminSubTab: 'permissions' },
  { value: 'settings', label: 'Cài đặt & Nhật ký', isAdminLink: true, adminSubTab: 'settings' },
  { value: 'support', label: 'Hỗ trợ kỹ thuật' },
];

describe('menu by role — single item for locked roles', () => {
  it('gd_khoi sees ONLY "Quản lý Khối"', () => {
    expect(filterNavForRole('gd_khoi', FULL_NAV).map((i) => i.label)).toEqual(['Quản lý Khối']);
  });
  it('tro_ly_khoi sees ONLY "Quản lý Khối"', () => {
    expect(filterNavForRole('tro_ly_khoi', FULL_NAV).map((i) => i.label)).toEqual(['Quản lý Khối']);
  });
  it('truong_ban_kd sees ONLY "Quản lý Ban KD"', () => {
    expect(filterNavForRole('truong_ban_kd', FULL_NAV).map((i) => i.label)).toEqual(['Quản lý Ban KD']);
  });
  it('pho_ban_kd sees ONLY "Quản lý Ban KD"', () => {
    expect(filterNavForRole('pho_ban_kd', FULL_NAV).map((i) => i.label)).toEqual(['Quản lý Ban KD']);
  });
  it('Vietnamese / legacy role spellings lock the same way', () => {
    expect(filterNavForRole('Giám đốc Khối', FULL_NAV).map((i) => i.value)).toEqual(['block-mgmt']);
    expect(filterNavForRole('Trợ lý Khối', FULL_NAV).map((i) => i.value)).toEqual(['block-mgmt']);
    expect(filterNavForRole('Trưởng ban KD', FULL_NAV).map((i) => i.value)).toEqual(['bankd-mgmt']);
  });
  it('hides Ngân sách Khối, Danh mục, Trang chủ, Hỗ trợ kỹ thuật for gd_khoi / tro_ly_khoi', () => {
    for (const role of ['gd_khoi', 'tro_ly_khoi']) {
      const labels = filterNavForRole(role, FULL_NAV).map((i) => i.label);
      for (const hidden of ['Ngân sách Khối', 'Dự án · Ban KD · Team', 'Trang chủ', 'Hỗ trợ kỹ thuật', 'Quản lý Ban KD']) {
        expect(labels).not.toContain(hidden);
      }
    }
  });
  it('does not change the menu of other roles (admin, mod, gdkd, user, legacy leader)', () => {
    for (const role of ['admin', 'super_admin', 'mod', 'accountant', 'gdda', 'gdkd', 'assistant', 'user', undefined]) {
      expect(isLockedRole(role)).toBe(false);
      expect(filterNavForRole(role, FULL_NAV)).toHaveLength(FULL_NAV.length);
    }
  });
});

describe('landing + URL redirects for locked roles', () => {
  it('landing after login', () => {
    expect(landingTabForRole('gd_khoi')).toBe('block-mgmt');
    expect(landingTabForRole('tro_ly_khoi')).toBe('block-mgmt');
    expect(landingTabForRole('truong_ban_kd')).toBe('bankd-mgmt');
    expect(landingTabForRole('pho_ban_kd')).toBe('bankd-mgmt');
    expect(landingTabForRole('admin')).toBeNull();
  });
  it('locked paths are real routes', () => {
    for (const r of ['gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'pho_ban_kd']) {
      const locked = lockedScreenForRole(r)!;
      expect(APP_ROUTES.find((a) => a.path === locked.path)?.tab).toBe(locked.tab);
      expect(tabsFromPath(locked.path).tab).toBe(locked.tab);
    }
  });
  it('every other URL redirects gd_khoi / tro_ly_khoi to /quan-ly-khoi', () => {
    for (const role of ['gd_khoi', 'tro_ly_khoi']) {
      for (const p of ['/', '/ngan-sach-khoi', '/ngan-sach-doi-ung', '/du-an', '/ban-kd', '/team', '/ho-tro', '/quan-ly-ban-kd', '/users', '/phan-quyen', '/cai-dat', '/nghiem-thu', '/quy-trinh-mkt', '/quan-tri', '/khong-ton-tai']) {
        expect(redirectPathForRole(role, p)).toBe('/quan-ly-khoi');
      }
      expect(redirectPathForRole(role, '/quan-ly-khoi')).toBeNull();
      expect(redirectPathForRole(role, '/quan-ly-khoi/')).toBeNull();
    }
  });
  it('every other URL redirects truong_ban_kd to /quan-ly-ban-kd', () => {
    for (const p of ['/', '/quan-ly-khoi', '/ngan-sach-khoi', '/ban-kd', '/du-an', '/ho-tro', '/users']) {
      expect(redirectPathForRole('truong_ban_kd', p)).toBe('/quan-ly-ban-kd');
    }
    expect(redirectPathForRole('truong_ban_kd', '/quan-ly-ban-kd')).toBeNull();
  });
  it('no redirects for unlocked roles', () => {
    expect(redirectPathForRole('admin', '/users')).toBeNull();
    expect(redirectPathForRole('user', '/quy-trinh-doi-ung')).toBeNull();
    expect(redirectPathForRole('gdkd', '/')).toBeNull();
  });
  it('screen guard', () => {
    expect(isScreenAllowedForRole('gd_khoi', 'block-mgmt')).toBe(true);
    expect(isScreenAllowedForRole('gd_khoi', 'admin', 'block-budgets')).toBe(false);
    expect(isScreenAllowedForRole('truong_ban_kd', 'bankd-mgmt')).toBe(true);
    expect(isScreenAllowedForRole('truong_ban_kd', 'home')).toBe(false);
    expect(isScreenAllowedForRole('mod', 'home')).toBe(true);
  });
});

describe('role truong_ban_kd (mirrors firestore.rules)', () => {
  it('normalizes', () => {
    expect(normalizeRoleKey('truong_ban_kd')).toBe('truong_ban_kd');
    expect(normalizeRoleKey('Trưởng ban KD')).toBe('truong_ban_kd');
    expect(normalizeRoleKey('trưởng ban')).toBe('truong_ban_kd');
  });
  it('default perms: Ngân sách Ban + Nghiệm thu only', () => {
    expect([...RULE_DEFAULT_PERMS.truong_ban_kd].sort()).toEqual(['block_budget.view', 'report_nt.view']);
    expect(ruleHasPerm({ roleKey: 'truong_ban_kd', rolePermissionsList: [] }, 'block_budget.create')).toBe(false);
    expect(ruleHasPerm({ roleKey: 'truong_ban_kd', rolePermissionsList: [] }, 'reciprocal_budget.view')).toBe(false);
    expect(uiHasPermission({ roleKey: 'truong_ban_kd', rolePermissionsList: [] }, 'home.view')).toBe(false);
  });
});

describe('firestore.rules ↔ UI stay in sync for the locked roles', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
  it('defaultPermsFor() lists the same defaults as RULE_DEFAULT_PERMS', () => {
    for (const role of ['gd_khoi', 'tro_ly_khoi', 'truong_ban_kd'] as const) {
      const m = rules.match(new RegExp(`'${role}': \\[([^\\]]*)\\]`));
      expect(m, role).toBeTruthy();
      const keys = m![1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean).sort();
      expect(keys).toEqual([...RULE_DEFAULT_PERMS[role]].sort());
    }
  });
  it('normalizedUserRole() maps truong_ban_kd', () => {
    expect(rules).toMatch(/r == 'truong_ban_kd'[^?]*\? 'truong_ban_kd'/);
  });
});
