/** URL ↔ tab mapping for ChiphiMKT v2 Corporate Clean redesign */

export type AppRoute = {
  path: string;
  tab: string;
  adminSubTab?: string;
  label: string;
  group?: 'overview' | 'ops' | 'mgmt' | 'process' | 'catalog' | 'system' | 'other';
};

export const APP_ROUTES: AppRoute[] = [
  { path: '/', tab: 'home', label: 'Trang chủ', group: 'overview' },
  { path: '/nghiem-thu', tab: 'report-nt', label: 'Nghiệm thu MKT', group: 'ops' },
  { path: '/ngan-sach-khoi', tab: 'admin', adminSubTab: 'block-budgets', label: 'Ngân sách MKT', group: 'ops' },
  { path: '/bao-cao-nghiem-thu', tab: 'nt-report', label: 'Báo cáo Nghiệm thu', group: 'ops' },
  { path: '/ns-ky-cu', tab: 'ns-legacy', label: 'NS kỳ cũ (≤ T10)', group: 'ops' },
  { path: '/quan-ly-phong-kd', tab: 'team-mgmt', label: 'Quản lý Phòng KD', group: 'mgmt' },
  { path: '/quan-ly-bao-cao', tab: 'report-mgmt', label: 'Quản lý Báo cáo', group: 'mgmt' },
  { path: '/ngan-sach-doi-ung', tab: 'admin', adminSubTab: 'reciprocal-budgets', label: 'Ngân sách đối ứng', group: 'ops' },
  { path: '/quan-ly-khoi', tab: 'block-mgmt', label: 'Quản lý Khối', group: 'mgmt' },
  { path: '/quan-ly-ban-kd', tab: 'bankd-mgmt', label: 'Quản lý Ban KD', group: 'mgmt' },
  { path: '/cho-duyet', tab: 'vn-pending', label: 'Chờ duyệt', group: 'other' },
  { path: '/huong-dan', tab: 'huong-dan', label: 'Hướng dẫn', group: 'other' },
  { path: '/thong-tin-ho-tro', tab: 'thong-tin-ho-tro', label: 'Thông tin Hỗ trợ', group: 'other' },
  { path: '/trang-chu', tab: 'vn-home', label: 'Trang chủ', group: 'overview' },
  { path: '/nhat-ky-loi', tab: 'vn-errors', label: 'Nhật ký lỗi', group: 'system' },
  { path: '/thong-ke-su-dung', tab: 'vn-usage', label: 'Thống kê sử dụng', group: 'system' },
  { path: '/khoa-theo-ngay', tab: 'vn-locks', label: 'Khoá theo ngày', group: 'system' },
  { path: '/du-an', tab: 'admin', adminSubTab: 'projects', label: 'Dự án', group: 'catalog' },
  { path: '/ban-kd', tab: 'admin', adminSubTab: 'projects', label: 'Ban KD', group: 'catalog' },
  { path: '/team', tab: 'admin', adminSubTab: 'teams', label: 'Team', group: 'catalog' },
  { path: '/nghiem-thu-admin', tab: 'admin', adminSubTab: 'acceptance', label: 'Nghiệm thu (QT)', group: 'catalog' },
  { path: '/duyet-tai-khoan', tab: 'vn-approvals', label: 'Duyệt tài khoản', group: 'system' },
  { path: '/users', tab: 'admin', adminSubTab: 'users', label: 'Users', group: 'system' },
  { path: '/phan-quyen', tab: 'admin', adminSubTab: 'permissions', label: 'Phân quyền', group: 'system' },
  { path: '/cai-dat', tab: 'admin', adminSubTab: 'settings', label: 'Cài đặt', group: 'system' },
  { path: '/nhat-ky', tab: 'admin', adminSubTab: 'history', label: 'Nhật ký', group: 'system' },
  { path: '/nhat-ky-hoat-dong', tab: 'admin', adminSubTab: 'audit', label: 'Nhật ký hoạt động', group: 'system' },
  { path: '/ho-tro', tab: 'support', label: 'Hỗ trợ kỹ thuật', group: 'other' },
  { path: '/quan-tri', tab: 'admin', adminSubTab: 'block-budgets', label: 'Quản trị hệ thống', group: 'system' },
];

export function pathFromTabs(tab: string, adminSubTab?: string): string {
  if (tab === 'admin' && adminSubTab) {
    const hit = APP_ROUTES.find((r) => r.tab === 'admin' && r.adminSubTab === adminSubTab);
    if (hit) return hit.path;
    return '/quan-tri';
  }
  // NVKD / GĐKD quick-nav deep-links share the Phòng KD URL
  if (tab === 'team-register' || tab === 'team-weekly') return '/quan-ly-phong-kd';
  const hit = APP_ROUTES.find((r) => r.tab === tab && !r.adminSubTab);
  return hit?.path || '/';
}

/**
 * Removed modules whose old URLs must be rewritten (replace, not push) to a live path.
 * (v-next: /quan-ly-phong-kd đã được khôi phục thành màn Quản lý Phòng KD mới.)
 * - /lich-su: Lịch sử dòng tiền không còn màn hình riêng → về Trang chủ.
 */
export const REMOVED_PATH_REDIRECTS: Record<string, string> = {
  '/lich-su': '/',
  // v-next: bỏ Quy trình đăng ký MKT / đối ứng
  '/quy-trinh-mkt': '/',
  '/quy-trinh-doi-ung': '/',
};

export function redirectForRemovedPath(pathname: string): string | null {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  for (const [from, to] of Object.entries(REMOVED_PATH_REDIRECTS)) {
    if (clean === from || clean.startsWith(from + '/')) return to;
  }
  return null;
}

export function tabsFromPath(pathname: string): { tab: string; adminSubTab?: string } {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  // Removed modules: soft-redirect old deep links
  if (clean === '/ngan-sach' || clean === '/dang-ky-mkt') {
    return { tab: 'admin', adminSubTab: 'block-budgets' };
  }
  if (redirectForRemovedPath(clean)) return { tab: 'home' };
  const hit = APP_ROUTES.find((r) => r.path === clean);
  if (hit) return { tab: hit.tab, adminSubTab: hit.adminSubTab };
  // Soft match prefix for query-less nested
  const soft = APP_ROUTES.find((r) => r.path !== '/' && clean.startsWith(r.path));
  if (soft) return { tab: soft.tab, adminSubTab: soft.adminSubTab };
  return { tab: 'home' };
}

export const NAV_GROUP_LABELS: Record<string, string> = {
  overview: 'TỔNG QUAN',
  ops: 'VẬN HÀNH',
  mgmt: 'QUẢN LÝ',
  process: 'QUY TRÌNH',
  catalog: 'DANH MỤC',
  system: 'HỆ THỐNG',
  other: '',
};
