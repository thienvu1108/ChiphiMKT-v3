import { describe, expect, it } from 'vitest';
import { APP_ROUTES, pathFromTabs, redirectForRemovedPath, tabsFromPath } from '../lib/routes';

describe('routes — v-next: Quản lý Phòng KD khôi phục + màn mới', () => {
  it('exposes /quan-ly-phong-kd as the team-mgmt tab (no longer redirected)', () => {
    expect(APP_ROUTES.some((r) => r.path === '/quan-ly-phong-kd' && r.tab === 'team-mgmt')).toBe(true);
    expect(pathFromTabs('team-mgmt')).toBe('/quan-ly-phong-kd');
    expect(redirectForRemovedPath('/quan-ly-phong-kd')).toBeNull();
    expect(tabsFromPath('/quan-ly-phong-kd')).toEqual({ tab: 'team-mgmt', adminSubTab: undefined });
  });

  it('maps Quản lý Báo cáo and Báo cáo Nghiệm thu', () => {
    expect(pathFromTabs('report-mgmt')).toBe('/quan-ly-bao-cao');
    expect(tabsFromPath('/quan-ly-bao-cao').tab).toBe('report-mgmt');
    expect(pathFromTabs('nt-report')).toBe('/bao-cao-nghiem-thu');
    expect(tabsFromPath('/bao-cao-nghiem-thu').tab).toBe('nt-report');
    // prefix soft-match must not confuse /nghiem-thu with /nghiem-thu-admin or /bao-cao-nghiem-thu
    expect(tabsFromPath('/nghiem-thu').tab).toBe('report-nt');
  });

  it('keeps Quản lý Khối / Ban KD routes', () => {
    expect(redirectForRemovedPath('/quan-ly-khoi')).toBeNull();
    expect(tabsFromPath('/quan-ly-khoi').tab).toBe('block-mgmt');
    expect(tabsFromPath('/quan-ly-ban-kd').tab).toBe('bankd-mgmt');
    expect(tabsFromPath('/ngan-sach-khoi')).toEqual({ tab: 'admin', adminSubTab: 'block-budgets' });
  });
});

describe('routes — audit log, /lich-su, /ban-kd', () => {
  it('maps admin/audit to its own path so "Xem nhật ký hoạt động" does not fall back to Ngân sách Khối', () => {
    expect(pathFromTabs('admin', 'audit')).toBe('/nhat-ky-hoat-dong');
    expect(tabsFromPath('/nhat-ky-hoat-dong')).toEqual({ tab: 'admin', adminSubTab: 'audit' });
    // /nhat-ky (history) still exact-matches its own sub tab
    expect(tabsFromPath('/nhat-ky')).toEqual({ tab: 'admin', adminSubTab: 'history' });
  });

  it('redirects the dead /lich-su route to Trang chủ', () => {
    expect(APP_ROUTES.some((r) => r.path === '/lich-su')).toBe(false);
    expect(redirectForRemovedPath('/lich-su')).toBe('/');
    expect(tabsFromPath('/lich-su')).toEqual({ tab: 'home' });
  });

  it('/ban-kd still opens Dự án · Ban KD (admin/projects)', () => {
    expect(tabsFromPath('/ban-kd')).toEqual({ tab: 'admin', adminSubTab: 'projects' });
  });
});
