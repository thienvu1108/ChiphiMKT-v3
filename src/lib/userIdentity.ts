/**
 * One person = one users/{authUid} doc.
 *
 * Duplicates (same email, two users docs) come from:
 *  1. Cross-project Auth UID change (old project → app-api-login-1b95b): first login copies
 *     users/{oldUid} → users/{newUid} (remap), the old doc stayed in the collection.
 *  2. Admin "Thêm thành viên" creating addDoc() random-id profiles without checking the
 *     email, then the person's own users/{uid} doc on sign-in.
 *  3. Stub users/{uid} created before the remap existed.
 *
 * Pure helpers here are shared by login (link instead of create), the admin Users list
 * (dedupe / flag) and admin provisioning (refuse a second doc for an existing email).
 * Mirrors firestore.rules (emailIndexKey / migratedSourceOk / adminProvisionOk).
 */
import { normalizeRoleKey, type RoleKey } from './rolePermissions';

export type UserDocLike = {
  id: string;
  uid?: string;
  email?: string | null;
  role?: string;
  migratedFromUid?: string;
  linkedToUid?: string;
  updatedAt?: unknown;
  createdAt?: unknown;
  lastLogin?: unknown;
  [k: string]: any;
};

export function normalizeEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

/** usersByEmail/{id}: same transform as firestore.rules emailIndexKey(). */
export function emailIndexId(email: unknown): string {
  return normalizeEmail(email).replace(/@/g, '_at_').replace(/\./g, '_dot_');
}

/** Higher = more privileged. Used only to pick / flag, never to grant. */
export const ROLE_RANK: Record<RoleKey, number> = {
  super_admin: 100,
  admin: 90,
  accountant: 70,
  mod: 60,
  gdda: 50,
  gd_khoi: 50,
  tro_ly_khoi: 40,
  truong_ban_kd: 35,
  pho_ban_kd: 34,
  gdkd: 40,
  assistant: 30,
  user: 0,
};

export function roleRank(role: unknown): number {
  return ROLE_RANK[normalizeRoleKey(role)] ?? 0;
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  const anyV = v as any;
  if (typeof anyV.toMillis === 'function') return anyV.toMillis();
  if (typeof anyV.seconds === 'number') return anyV.seconds * 1000;
  return 0;
}

/** Fields an admin assigns (role / scope). A conflict here needs a human decision. */
export const ADMIN_SCOPE_FIELDS = [
  'role',
  'assignedProjects',
  'assignedBlock',
  'assignedBlocks',
  'assignedBanKd',
  'assignedBanKds',
] as const;

function scopeValue(u: UserDocLike, k: string): string {
  const v = u[k];
  if (k === 'role') return normalizeRoleKey(v);
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  if (v === undefined || v === null) return k.endsWith('s') || k === 'assignedProjects' ? '[]' : '';
  return String(v);
}

export type DuplicateGroup<T extends UserDocLike = UserDocLike> = {
  email: string;
  canonical: T;
  others: T[];
  /** Admin scope fields whose values differ between the docs. */
  conflicts: string[];
};

/**
 * Pick the doc that represents the live account:
 *  - the doc another doc was linked to / copied into (migratedFromUid → target, linkedToUid → target)
 *  - the doc whose id is a known live Auth UID (when the caller knows it)
 *  - not itself marked linkedToUid
 *  - then highest admin-assigned role, then most recent activity.
 */
export function pickCanonicalUser<T extends UserDocLike>(docs: T[], liveUid?: string | null): T {
  if (docs.length === 1) return docs[0];
  const ids = new Set(docs.map((d) => d.id));
  const score = (d: T): number[] => {
    const isLive = liveUid && d.id === liveUid ? 1 : 0;
    const isTarget =
      docs.some((o) => o.id !== d.id && (o.linkedToUid === d.id)) ||
      (d.migratedFromUid && ids.has(d.migratedFromUid))
        ? 1
        : 0;
    const notLinkedAway = d.linkedToUid && d.linkedToUid !== d.id ? 0 : 1;
    const uidMatchesId = d.uid && d.uid === d.id ? 1 : 0;
    const activity = Math.max(toMillis(d.lastLogin), toMillis(d.updatedAt), toMillis(d.createdAt));
    return [isLive, isTarget, notLinkedAway, roleRank(d.role), uidMatchesId, activity];
  };
  return [...docs].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i];
    return a.id.localeCompare(b.id);
  })[0];
}

export function scopeConflicts(docs: UserDocLike[]): string[] {
  return ADMIN_SCOPE_FIELDS.filter((k) => new Set(docs.map((d) => scopeValue(d, k))).size > 1);
}

/** Group by normalized email; only groups with >1 doc. Docs without email are never grouped. */
export function findDuplicateGroups<T extends UserDocLike>(users: T[]): DuplicateGroup<T>[] {
  const byEmail = new Map<string, T[]>();
  for (const u of users) {
    const e = normalizeEmail(u.email);
    if (!e) continue;
    const arr = byEmail.get(e) || [];
    arr.push(u);
    byEmail.set(e, arr);
  }
  const out: DuplicateGroup<T>[] = [];
  for (const [email, docs] of byEmail) {
    if (docs.length < 2) continue;
    const canonical = pickCanonicalUser(docs);
    out.push({ email, canonical, others: docs.filter((d) => d !== canonical), conflicts: scopeConflicts(docs) });
  }
  return out;
}

export type UserListRow<T extends UserDocLike = UserDocLike> = T & {
  _dupCount: number;
  _isDuplicateSecondary: boolean;
  _canonicalId: string;
  _dupConflicts: string[];
};

/**
 * Users screen rows: one row per email by default (canonical doc), flagged with the
 * duplicate count / conflicts. With showDuplicates the secondary docs follow their
 * canonical row, marked _isDuplicateSecondary (read-only in the UI).
 */
export function buildUserListRows<T extends UserDocLike>(users: T[], showDuplicates = false): UserListRow<T>[] {
  const groups = findDuplicateGroups(users);
  const groupByMember = new Map<string, DuplicateGroup<T>>();
  for (const g of groups) for (const d of [g.canonical, ...g.others]) groupByMember.set(d.id, g);
  const rows: UserListRow<T>[] = [];
  for (const u of users) {
    const g = groupByMember.get(u.id);
    if (!g) {
      rows.push({ ...u, _dupCount: 1, _isDuplicateSecondary: false, _canonicalId: u.id, _dupConflicts: [] });
      continue;
    }
    if (u.id !== g.canonical.id) continue; // emitted right after its canonical
    const count = g.others.length + 1;
    rows.push({ ...g.canonical, _dupCount: count, _isDuplicateSecondary: false, _canonicalId: g.canonical.id, _dupConflicts: g.conflicts });
    if (showDuplicates) {
      for (const o of g.others) {
        rows.push({ ...o, _dupCount: count, _isDuplicateSecondary: true, _canonicalId: g.canonical.id, _dupConflicts: g.conflicts });
      }
    }
  }
  return rows;
}

/** Admin provisioning guard: existing doc (any id) with this email, if any. */
export function findUserByEmail<T extends UserDocLike>(users: T[], email: unknown): T | undefined {
  const e = normalizeEmail(email);
  if (!e) return undefined;
  const matches = users.filter((u) => normalizeEmail(u.email) === e);
  return matches.length ? pickCanonicalUser(matches) : undefined;
}

/**
 * users/{uid} profile linked from a pre-provisioned / migrated source doc.
 * Role / scope are copied VERBATIM (rules re-check them against the source); only identity
 * fields come from the token. The owner email keeps super_admin.
 */
export function buildLinkedProfile(
  source: Record<string, any>,
  sourceId: string,
  authUser: { uid: string; email: string | null; displayName?: string | null },
  opts: { isOwner?: boolean } = {},
): Record<string, any> {
  const { linkedToUid: _l, linkedAt: _la, ...rest } = source || {};
  const p: Record<string, any> = {
    ...rest,
    uid: authUser.uid,
    email: authUser.email,
    displayName: authUser.displayName || source?.displayName || '',
    migratedFromUid: sourceId,
    emailIndexId: emailIndexId(authUser.email),
  };
  if (opts.isOwner) p.role = 'super_admin';
  return p;
}
