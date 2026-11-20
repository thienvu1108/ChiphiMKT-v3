/**
 * Quick-nav «Đăng ký MKT» / «Báo cáo tuần» (NVKD / GĐKD menu) đều mở màn Quản lý Phòng KD
 * (TabsContent value="team-mgmt") ở đúng sub-tab. activeTab luôn là 'team-mgmt' — nếu để
 * 'team-weekly' / 'team-register' thì không TabsContent nào khớp → trang trắng.
 */
export type TeamQuickTab = 'team-register' | 'team-weekly';
export type TeamSubTab = 'register' | 'weekly';

export interface TeamQuickNav {
  activeTab: 'team-mgmt';
  subTab: TeamSubTab;
  /** Menu item that stays highlighted in the sidebar / bottom nav. */
  highlight: TeamQuickTab;
}

export function isTeamQuickTab(tab: string | null | undefined): tab is TeamQuickTab {
  return tab === 'team-register' || tab === 'team-weekly';
}

/** Map a quick-nav menu value to the real screen + sub-tab; null for any other tab. */
export function teamQuickNav(tab: string | null | undefined): TeamQuickNav | null {
  if (!isTeamQuickTab(tab)) return null;
  return { activeTab: 'team-mgmt', subTab: tab === 'team-register' ? 'register' : 'weekly', highlight: tab };
}

/** Tab value the shell should highlight: the chosen quick item while on Quản lý Phòng KD. */
export function shellHighlightTab(activeTab: string, quick: TeamQuickTab | null | undefined): string {
  return activeTab === 'team-mgmt' && quick ? quick : activeTab;
}
