/**
 * Pure planner for POST /api/users/link-on-login (no I/O — unit-tested in tests/linkOnLogin.test.ts).
 *
 * A user who existed before v2 (imported / admin pre-provisioned) has users/{oldId}. On first v2 login the
 * client copies it into users/{uid} (rules: migratedSourceOk, role/scope verbatim). This planner then retires
 * every OTHER users doc with the same email: access refs repointed oldId → uid, old doc archived to
 * users_merged_archive/{oldId} and deleted, usersByEmail → uid. Result: one users doc per email.
 *
 * Safety: an old doc is retired only when its role/scope is already carried by users/{uid}
 * (users/{uid}.migratedFromUid === oldId, or the old doc is a plain 'user' with no scope).
 * Anything else is reported as `conflict` and left untouched (Admin decides).
 */
export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
export const emailIndexId = (e: unknown) => normEmail(e).replace(/@/g, '_at_').replace(/\./g, '_dot_');

export function normRole(raw: unknown): string {
  const r = String(raw ?? 'user').toLowerCase().trim();
  if (['super_admin', 'super admin'].includes(r)) return 'super_admin';
  if (['admin', 'quản trị', 'quan tri'].includes(r)) return 'admin';
  if (['mod', 'moderator', 'điều phối', 'dieu phoi'].includes(r)) return 'mod';
  if (['accountant', 'kế toán', 'ke toan'].includes(r)) return 'accountant';
  if (['gdda', 'gđda', 'giám đốc dự án'].includes(r)) return 'gdda';
  if (['gd_khoi', 'gdkhoi', 'gđ khối', 'giám đốc khối', 'giám đốc liên khối', 'gdk', 'gd khối', 'trưởng khối'].includes(r)) return 'gd_khoi';
  if (['tro_ly_khoi', 'trợ lý khối', 'tro ly khoi', 'tro_ly_gdkhoi', 'assistant_block'].includes(r)) return 'tro_ly_khoi';
  if (['gdkd', 'gđkd', 'giám đốc kinh doanh', 'gđ kinh doanh'].includes(r)) return 'gdkd';
  if (['assistant', 'trợ lý', 'tro ly'].includes(r)) return 'assistant';
  return 'user';
}
const ADMIN_LEVEL = new Set(['super_admin', 'admin']);
const SCOPE_KEYS = ['assignedProjects', 'assignedBlock', 'assignedBlocks', 'assignedBanKd', 'assignedBanKds'];

/** Collections scanned in full for access refs (small reference collections). */
export const SCAN_COLLECTIONS = ['blocks', 'ban_kd', 'teams'] as const;
/** Ownership collections: only `createdBy == oldId` is repointed (and only for non-admin profiles). */
export const OWNERSHIP_COLLECTIONS = ['budgets', 'costs', 'block_budgets', 'reciprocal_budgets', 'efficiencyReports', 'teamNotifications'] as const;

/** Same classification as scripts/merge-duplicate-users.mjs (access refs only). */
export function isAccessField(col: string, top: string): boolean {
  if (col === 'blocks') return ['directorUid', 'assistantUids'].includes(top);
  if (col === 'ban_kd') return ['leaderUid', 'leaderId', 'memberUids'].includes(top);
  if (col === 'teams') return /uid|leader|manager|director/i.test(top) && top !== 'createdBy';
  if (col === 'supportRequests') return top === 'userId';
  if (col === 'usersByEmail') return top === 'oldUid';
  return false;
}

/** Deep replace of string `from` by `to`; string arrays de-duplicated. Returns [value, changed]. */
export function replaceIn(v: any, from: string, to: string): [any, boolean] {
  if (typeof v === 'string') return v === from ? [to, true] : [v, false];
  if (Array.isArray(v)) {
    let ch = false;
    const out: any[] = [];
    for (const x of v) {
      const [y, c] = replaceIn(x, from, to);
      ch = ch || c;
      if (typeof y === 'string' && out.includes(y)) { ch = true; continue; }
      out.push(y);
    }
    return [out, ch];
  }
  if (v && typeof v === 'object' && v.constructor === Object) {
    let ch = false;
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) { const [y, c] = replaceIn(x, from, to); out[k] = y; ch = ch || c; }
    return [out, ch];
  }
  return [v, false];
}

export type Doc = { id: string; data: Record<string, any> };
export type RefDoc = { col: string; id: string; data: Record<string, any> };
export type LinkPlan = {
  status: 'no-email' | 'no-profile' | 'clean' | 'linked' | 'conflict';
  retire: string[];
  conflicts: { id: string; reason: string }[];
  /** top-level field patches per ref doc */
  refUpdates: { col: string; id: string; patch: Record<string, any> }[];
  /** patch for users/{uid} (mergedFrom etc. added by executor) */
  profilePatch: Record<string, any>;
};

export function planLink(input: {
  uid: string; email: string;
  profile: Record<string, any> | null; // users/{uid}
  candidates: Doc[];                   // other users docs found via usersByEmail / email query / migratedFromUid
  refDocs: RefDoc[];                   // scanned ref docs
  otherAuthUidIds?: Set<string>;       // candidate ids that are a DIFFERENT live Auth account
}): LinkPlan {
  const plan: LinkPlan = { status: 'clean', retire: [], conflicts: [], refUpdates: [], profilePatch: {} };
  const email = normEmail(input.email);
  if (!email) return { ...plan, status: 'no-email' };
  if (!input.profile) return { ...plan, status: 'no-profile' };
  const p = input.profile;
  const myRole = normRole(p.role);
  const seen = new Set<string>();
  for (const c of input.candidates) {
    if (!c || c.id === input.uid || seen.has(c.id)) continue;
    seen.add(c.id);
    if (normEmail(c.data?.email) !== email) continue; // not the same person
    if (c.data?.linkedToUid && c.data.linkedToUid !== input.uid) { plan.conflicts.push({ id: c.id, reason: 'linked-to-other-uid' }); continue; }
    if (input.otherAuthUidIds?.has(c.id)) { plan.conflicts.push({ id: c.id, reason: 'is-other-auth-account' }); continue; }
    const carried = p.migratedFromUid === c.id;
    const oldRole = normRole(c.data?.role);
    const oldHasScope = SCOPE_KEYS.some((k) => { const v = c.data?.[k]; return Array.isArray(v) ? v.length > 0 : !!v; });
    const harmless = oldRole === 'user' && !oldHasScope;
    if (!carried && !harmless) { plan.conflicts.push({ id: c.id, reason: `role/scope not carried (old ${oldRole}, current ${myRole})` }); continue; }
    plan.retire.push(c.id);
  }
  if (!plan.retire.length) return { ...plan, status: plan.conflicts.length ? 'conflict' : 'clean' };

  const repointOwnership = !ADMIN_LEVEL.has(myRole);
  const pending = new Map<string, { col: string; id: string; patch: Record<string, any> }>();
  for (const r of input.refDocs) {
    if (r.col === 'users') continue;
    const key = `${r.col}/${r.id}`;
    for (const [top, val] of Object.entries(r.data || {})) {
      const ownership = (OWNERSHIP_COLLECTIONS as readonly string[]).includes(r.col) && top === 'createdBy';
      if (!isAccessField(r.col, top) && !(ownership && repointOwnership)) continue;
      let cur = pending.get(key)?.patch[top] ?? val;
      let changed = false;
      for (const old of plan.retire) { const [nv, c] = replaceIn(cur, old, input.uid); if (c) { cur = nv; changed = true; } }
      if (!changed) continue;
      if (!pending.has(key)) pending.set(key, { col: r.col, id: r.id, patch: {} });
      pending.get(key)!.patch[top] = cur;
    }
  }
  plan.refUpdates = [...pending.values()];
  // Fill empty profile fields from the retired docs (same as merge script).
  for (const k of ['fullName', 'displayName', 'teamName', 'teamId', 'teamCode']) {
    if (p[k]) continue;
    const donor = input.candidates.find((c) => plan.retire.includes(c.id) && c.data?.[k]);
    if (donor) plan.profilePatch[k] = donor.data[k];
  }
  if (!p.migratedFromUid) plan.profilePatch.migratedFromUid = plan.retire[0];
  plan.status = 'linked';
  return plan;
}
