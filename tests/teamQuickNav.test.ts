import { describe, expect, it } from 'vitest';
import { isTeamQuickTab, shellHighlightTab, teamQuickNav } from '../src/lib/teamQuickNav';
import { pathFromTabs } from '../lib/routes';

describe('teamQuickNav', () => {
  it('maps Báo cáo tuần to team-mgmt + weekly sub-tab', () => {
    expect(teamQuickNav('team-weekly')).toEqual({ activeTab: 'team-mgmt', subTab: 'weekly', highlight: 'team-weekly' });
  });

  it('maps Đăng ký MKT to team-mgmt + register sub-tab', () => {
    expect(teamQuickNav('team-register')).toEqual({ activeTab: 'team-mgmt', subTab: 'register', highlight: 'team-register' });
  });

  it('never yields an activeTab without a TabsContent (team-weekly / team-register)', () => {
    for (const t of ['team-weekly', 'team-register']) {
      const nav = teamQuickNav(t)!;
      expect(isTeamQuickTab(nav.activeTab)).toBe(false);
      expect(nav.activeTab).toBe('team-mgmt');
      // Same URL as before → no route change, still /quan-ly-phong-kd
      expect(pathFromTabs(nav.activeTab)).toBe(pathFromTabs(t));
    }
  });

  it('returns null for other tabs', () => {
    for (const t of ['team-mgmt', 'home', 'admin', 'block-mgmt', '', null, undefined]) {
      expect(teamQuickNav(t)).toBeNull();
    }
  });
});

describe('shellHighlightTab', () => {
  it('highlights the clicked quick item while on Quản lý Phòng KD', () => {
    expect(shellHighlightTab('team-mgmt', 'team-weekly')).toBe('team-weekly');
    expect(shellHighlightTab('team-mgmt', 'team-register')).toBe('team-register');
  });

  it('highlights team-mgmt when no quick item is chosen', () => {
    expect(shellHighlightTab('team-mgmt', null)).toBe('team-mgmt');
  });

  it('ignores a stale quick item on other screens', () => {
    expect(shellHighlightTab('home', 'team-weekly')).toBe('home');
  });
});
