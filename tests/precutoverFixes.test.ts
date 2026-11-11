import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canListenCollection } from '../src/lib/listenerGates';
import { isPermissionDeniedError, shouldSilenceFirestoreError } from '../src/lib/firestoreErrors';
import { isAdminSubTabAllowed, type AdminAccessCtx } from '../src/lib/adminSubTabAccess';
import { isLegacyVercelUrl, V2_VERCEL_URL } from '../src/lib/v2RepoConfig';
import type { RolePermDoc } from '../src/lib/rolePermissions';

// Stored rolePermissions as in prod chiphi-mkt on 2026-10-06 (relevant keys only).
const STORED: RolePermDoc[] = [
  { id: 'gdda', permissions: ['actual.view', 'admin.projects.view', 'history.view', 'home.view', 'register.view', 'report_nt.view'] },
  { id: 'assistant', permissions: ['actual.view', 'admin.projects.view', 'history.view', 'home.view', 'mkt_efficiency.view', 'register.view'] },
  { id: 'mod', permissions: ['admin.projects.view', 'block.view', 'report_nt.view', 'team_mgmt.view'] },
  { id: 'gd_khoi', permissions: ['actual.view', 'block.view', 'block_budget.create', 'block_budget.edit', 'block_budget.view', 'home.view'] },
];

describe('listener gates (bug 1)', () => {
  const base = { rolePermissionsList: STORED };
  it('never subscribes before the role AND rolePermissions are loaded', () => {
    expect(canListenCollection('reciprocal_budgets', { ...base, permsLoaded: false, roleKey: 'gdda' })).toBe(false);
    expect(canListenCollection('block_budgets', { ...base, permsLoaded: true, roleKey: null })).toBe(false);
    // Defaults would have allowed these, the stored docs remove them:
    expect(canListenCollection('reciprocal_budgets', { rolePermissionsList: [], permsLoaded: false, roleKey: 'gd_khoi' })).toBe(false);
  });
  it('uses the stored rolePermissions (rule-exact) once loaded', () => {
    const on = { ...base, permsLoaded: true };
    expect(canListenCollection('block_budgets', { ...on, roleKey: 'gdda' })).toBe(false);
    expect(canListenCollection('reciprocal_budgets', { ...on, roleKey: 'gdda' })).toBe(false);
    expect(canListenCollection('budgets', { ...on, roleKey: 'gdda' })).toBe(true);
    expect(canListenCollection('block_budgets', { ...on, roleKey: 'assistant' })).toBe(false);
    expect(canListenCollection('reciprocal_budgets', { ...on, roleKey: 'gd_khoi' })).toBe(false);
    expect(canListenCollection('block_budgets', { ...on, roleKey: 'gd_khoi' })).toBe(true);
    // mod: block.view (rules canReadBlockBudgets) but no budgets / costs / efficiency / reciprocal
    expect(canListenCollection('block_budgets', { ...on, roleKey: 'mod' })).toBe(true);
    for (const c of ['budgets', 'costs', 'efficiencyReports', 'reciprocal_budgets'] as const) {
      expect(canListenCollection(c, { ...on, roleKey: 'mod' })).toBe(false);
    }
  });
  it('admin (defaults) / super_admin / owner keep every listener; role user none', () => {
    const on = { ...base, permsLoaded: true };
    for (const c of ['budgets', 'block_budgets', 'reciprocal_budgets', 'costs', 'efficiencyReports'] as const) {
      expect(canListenCollection(c, { ...on, roleKey: 'admin' })).toBe(true);
      expect(canListenCollection(c, { ...on, roleKey: 'super_admin' })).toBe(true);
      expect(canListenCollection(c, { ...base, permsLoaded: false, roleKey: null, isAppOwner: true })).toBe(true);
      expect(canListenCollection(c, { ...on, roleKey: 'user' })).toBe(false);
    }
  });
});

describe('firestore error classification (bug 1)', () => {
  it('detects prod and emulator permission errors', () => {
    expect(isPermissionDeniedError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toBe(true);
    expect(isPermissionDeniedError(new Error('Missing or insufficient permissions.'))).toBe(true);
    expect(isPermissionDeniedError(new Error("\nfalse for 'list' @ L9, evaluation error at L684:22 for 'list' @ L684"))).toBe(true);
    expect(isPermissionDeniedError(new Error('Failed to get document because the client is offline.'))).toBe(false);
  });
  it('silences only listener reads', () => {
    const denied = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
    expect(shouldSilenceFirestoreError(denied, true)).toBe(true);
    expect(shouldSilenceFirestoreError(denied, false)).toBe(false);
    expect(shouldSilenceFirestoreError(new Error('quota exceeded'), true)).toBe(false);
  });
  it('AuthenticatedApp routes listener errors through the silencer before any toast', () => {
    const src = readFileSync(resolve(__dirname, '../src/AuthenticatedApp.tsx'), 'utf8');
    const fn = src.slice(src.indexOf('function handleFirestoreError'), src.indexOf('const normalizeMonth'));
    expect(fn.indexOf('shouldSilenceFirestoreError')).toBeGreaterThan(0);
    expect(fn.indexOf('shouldSilenceFirestoreError')).toBeLessThan(fn.indexOf('toast.error('));
  });
});

describe('isUser boot race (bug 2)', () => {
  it('isUser is false while role and profile are both unknown', () => {
    const src = readFileSync(resolve(__dirname, '../src/AuthenticatedApp.tsx'), 'utf8');
    const memo = src.slice(src.indexOf('const isUser = useMemo'), src.indexOf('const isInternalStaff = useMemo'));
    expect(memo).toMatch(/if \(!userRole && !userProfile\) return false;/);
    expect(memo.indexOf('if (!userRole && !userProfile) return false;')).toBeLessThan(memo.indexOf("role === 'user'"));
  });
});

describe('admin sub-page URL guard (bug 3)', () => {
  const perms = (keys: string[]) => (k: string) => keys.includes(k);
  const ctx = (o: Partial<AdminAccessCtx>): AdminAccessCtx => ({
    isAdmin: false, isSuperAdmin: false, isAccountant: false, isInternalStaff: true,
    canViewBlockBudget: false, canViewReciprocalBudget: false, hasPermission: perms([]), ...o,
  });
  it('gdda / mod / assistant cannot open Phân quyền, Cài đặt, Users, Nhật ký hoạt động by URL', () => {
    for (const c of [ctx({ hasPermission: perms(['admin.projects.view', 'history.view']) }), ctx({ canViewBlockBudget: true, hasPermission: perms(['block.view']) })]) {
      for (const sub of ['permissions', 'settings', 'users', 'audit']) expect(isAdminSubTabAllowed(sub, c)).toBe(false);
    }
  });
  it('catalog pages (Dự án / Team / Nghiệm thu QT) stay open to catalog roles, like their tab bar', () => {
    const c = ctx({ hasPermission: perms(['admin.projects.view']) });
    for (const sub of ['projects', 'teams', 'acceptance']) expect(isAdminSubTabAllowed(sub, c)).toBe(true);
    expect(isAdminSubTabAllowed('teams', ctx({ isInternalStaff: false }))).toBe(false);
  });
  it('rule-exact gates for Ngân sách Khối / đối ứng; history needs history.view', () => {
    expect(isAdminSubTabAllowed('block-budgets', ctx({}))).toBe(false);
    expect(isAdminSubTabAllowed('block-budgets', ctx({ canViewBlockBudget: true }))).toBe(true);
    expect(isAdminSubTabAllowed('reciprocal-budgets', ctx({ canViewReciprocalBudget: true }))).toBe(true);
    expect(isAdminSubTabAllowed('history', ctx({ hasPermission: perms(['history.view']) }))).toBe(true);
    expect(isAdminSubTabAllowed('history', ctx({}))).toBe(false);
  });
  it('admin / super_admin open everything; accountant gets system pages but not Phân quyền', () => {
    for (const sub of ['permissions', 'settings', 'users', 'audit', 'teams', 'history', 'backup']) {
      expect(isAdminSubTabAllowed(sub, ctx({ isAdmin: true }))).toBe(true);
    }
    const acct = ctx({ isAccountant: true });
    expect(isAdminSubTabAllowed('users', acct)).toBe(true);
    expect(isAdminSubTabAllowed('settings', acct)).toBe(true);
    expect(isAdminSubTabAllowed('permissions', acct)).toBe(false);
    expect(isAdminSubTabAllowed('permissions', ctx({ hasPermission: perms(['admin.permissions.edit']) }))).toBe(true);
  });
});

describe('route sync replaceTo (bug 5)', () => {
  it('guards replace the URL together with the screen', () => {
    const hook = readFileSync(resolve(__dirname, '../hooks/useAppRouteSync.ts'), 'utf8');
    expect(hook).toMatch(/const replaceTo = useCallback/);
    expect(hook).toMatch(/navigate\(next, \{ replace: true \}\)/);
    const app = readFileSync(resolve(__dirname, '../src/AuthenticatedApp.tsx'), 'utf8');
    const guard = app.slice(app.indexOf('// Landing / URL guard'), app.indexOf('const [globalSearchOpen'));
    expect(guard).toMatch(/isAdminSubTabAllowed\(adminSubTab/);
    expect(guard).not.toMatch(/\bsetActiveTab\(/);
  });
});

describe('cutover config (bugs 4, 6, follow-up)', () => {
  it('v2 production URL is chiphi.mayhomes.net and it is not treated as legacy', () => {
    expect(V2_VERCEL_URL).toBe('https://chiphi.mayhomes.net');
    expect(isLegacyVercelUrl('https://chiphi.mayhomes.net')).toBe(false);
    expect(isLegacyVercelUrl('https://chiphimkt.vercel.app')).toBe(true);
    expect(isLegacyVercelUrl('https://chiphimkt-v2.vercel.app')).toBe(false);
  });
  it('index.html preconnects to the new Firebase auth domain only', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    expect(html).toContain('https://app-api-login-1b95b.firebaseapp.com');
    expect(html).not.toContain('gen-lang-client-0981668352');
  });
  it('Kỳ nghiệm thu badge can wrap on narrow screens', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/MktProcessManager.tsx'), 'utf8');
    const line = src.split('\n').find((l, i, a) => a[i + 1]?.includes('Kỳ nghiệm thu: Từ ngày 21')) || '';
    expect(line).toMatch(/whitespace-normal/);
    expect(line).toMatch(/max-w-full/);
    expect(line).toMatch(/h-auto/);
  });
});
