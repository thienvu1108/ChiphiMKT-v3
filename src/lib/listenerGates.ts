import { ruleHasAnyPerm, type RoleKey, type RolePermDoc } from './rolePermissions';

/** Permission keys that firestore.rules accept for reading each collection (canReadX()). */
export const LISTENER_READ_KEYS = {
  budgets: ['register.view', 'admin.budgets.view', 'home.view', 'history.view'],
  block_budgets: ['block_budget.view', 'block.view'],
  reciprocal_budgets: ['reciprocal_budget.view'],
  costs: ['actual.view', 'admin.costs.view', 'home.view', 'history.view'],
  efficiencyReports: ['mkt_efficiency.view', 'home.view'],
} as const;

export type GatedCollection = keyof typeof LISTENER_READ_KEYS;

/**
 * May the app subscribe to a role-gated collection yet? Only once the profile role AND the
 * stored rolePermissions are loaded — before that the defaults may allow a key that the stored
 * doc removed, and the rules would deny the listener. Uses the rule-exact check.
 */
export function canListenCollection(
  collection: GatedCollection,
  opts: {
    permsLoaded: boolean;
    roleKey: RoleKey | null;
    rolePermissionsList?: RolePermDoc[];
    isAppOwner?: boolean;
  },
): boolean {
  if (opts.isAppOwner) return true;
  if (!opts.permsLoaded || !opts.roleKey) return false;
  if (opts.roleKey === 'super_admin') return true;
  // Role "user" never shows these screens (UI exposes only process_doiung.*).
  if (opts.roleKey === 'user') return false;
  return ruleHasAnyPerm(
    { roleKey: opts.roleKey, rolePermissionsList: opts.rolePermissionsList, hasProfile: true },
    [...LISTENER_READ_KEYS[collection]],
  );
}
