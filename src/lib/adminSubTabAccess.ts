/**
 * Per-sub-page access for the "admin" tab (URL guard + landing guard).
 *
 * Mirrors the in-app entry points so a URL never opens a screen the role cannot reach from
 * the UI (firestore.rules still deny the writes either way):
 *  - /users, /cai-dat (users, settings): admin / super_admin / accountant, or admin.users.view /
 *    admin.permissions.edit (the "Hệ thống" sidebar group).
 *  - /phan-quyen (permissions): admin / super_admin or admin.permissions.edit.
 *  - /nhat-ky-hoat-dong (audit): opened from the Users screen → same gate as users.
 *  - /nhat-ky (history): history.view.
 *  - /du-an, /ban-kd, /team, /nghiem-thu-admin (projects, teams, acceptance): the
 *    "Dự án · Ban KD · Team" catalog page, whose tab bar shows these to every catalog role.
 *  - /ngan-sach-khoi, /ngan-sach-doi-ung: the rule-exact read gates.
 */
export type AdminAccessCtx = {
  isAdmin: boolean; // includes super_admin / app owner
  isSuperAdmin?: boolean;
  isAccountant: boolean;
  isInternalStaff: boolean;
  canViewBlockBudget: boolean;
  canViewReciprocalBudget: boolean;
  hasPermission: (key: string) => boolean;
};

export function canUseSystemPages(ctx: AdminAccessCtx): boolean {
  return (
    ctx.isAdmin || !!ctx.isSuperAdmin || ctx.isAccountant ||
    ctx.hasPermission('admin.users.view') || ctx.hasPermission('admin.permissions.edit')
  );
}

export function canUseCatalogPages(ctx: AdminAccessCtx): boolean {
  return (
    ctx.isAdmin || !!ctx.isSuperAdmin || ctx.isAccountant || ctx.isInternalStaff ||
    ctx.hasPermission('admin.projects.view') || ctx.hasPermission('admin.teams.view')
  );
}

export function isAdminSubTabAllowed(subTab: string, ctx: AdminAccessCtx): boolean {
  if (ctx.isAdmin || ctx.isSuperAdmin) return true;
  switch (subTab) {
    case 'block-budgets':
      return ctx.canViewBlockBudget;
    case 'reciprocal-budgets':
      return ctx.canViewReciprocalBudget;
    case 'users':
    case 'settings':
    case 'audit':
      return canUseSystemPages(ctx);
    case 'permissions':
      return ctx.hasPermission('admin.permissions.edit');
    case 'history':
      return ctx.hasPermission('history.view');
    case 'projects':
    case 'teams':
    case 'acceptance':
      return canUseCatalogPages(ctx);
    default:
      // Unknown / removed sub tabs: never open by URL for non-admins.
      return false;
  }
}
