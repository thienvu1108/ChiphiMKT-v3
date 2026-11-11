/**
 * Two-way Ban role sync (Trưởng / Phó / Thành viên):
 *  - ban_kd.leaderUid / deputyUids / memberUids
 *  - users.assignedBanKd(s)
 *
 * Pure planners (no Firestore) so they unit-test cleanly; callers turn plans into writeBatch().
 * Always store auth uid (user.uid || user.id) in leaderUid / deputyUids / memberUids.
 * Legacy Phó (deputyUids only) keeps existing role. Explicit role pho_ban_kd syncs both ways.
 * GĐK holding Trưởng ban keeps gd_khoi; others get truong_ban_kd.
 */
import { normalizeEmail } from './userIdentity';
import { planTruongBanAssignment, userLeadsBan, type AssignBanLike, type AssignUserLike, type TruongBanPlan } from './truongBanAssignment';
export { userLeadsBan };

export type SyncUser = AssignUserLike & {
  role?: string;
  assignedBanKd?: string;
  assignedBanKds?: string[];
  migratedFromUid?: string;
};

export type SyncBan = AssignBanLike & {
  deputyUids?: string[];
  memberUids?: string[];
};

export type BanRoleOnBan = 'truong_ban' | 'pho_ban' | 'thanh_vien' | null;

/** Prefer Auth uid; fall back to doc id (pre-provision). Never store empty. */
export function authUidOf(u: { uid?: string; id?: string }): string {
  return (typeof u.uid === 'string' && u.uid) || (typeof u.id === 'string' && u.id) || '';
}

export function userIdsOf(u: SyncUser): string[] {
  return [u.uid, u.id, u.migratedFromUid].filter((x): x is string => typeof x === 'string' && x.length > 0);
}

export function assignedBanSetOf(u: SyncUser): Set<string> {
  const s = new Set<string>();
  if (typeof u.assignedBanKd === 'string' && u.assignedBanKd) s.add(u.assignedBanKd);
  if (Array.isArray(u.assignedBanKds)) u.assignedBanKds.forEach((x) => { if (typeof x === 'string' && x) s.add(x); });
  return s;
}

export function isDeputyOf(ban: SyncBan, u: SyncUser): boolean {
  const deps = Array.isArray(ban.deputyUids) ? ban.deputyUids : [];
  const ids = userIdsOf(u);
  return deps.some((d) => ids.includes(d));
}

export function isMemberOf(ban: SyncBan, u: SyncUser): boolean {
  const mem = Array.isArray(ban.memberUids) ? ban.memberUids : [];
  const ids = userIdsOf(u);
  const email = normalizeEmail(u.email);
  return mem.some((m) => ids.includes(m) || (!!email && String(m).toLowerCase() === email));
}

/** Highest Ban role this user holds on this Ban. */
export function banRoleOf(ban: SyncBan, u: SyncUser): BanRoleOnBan {
  if (userLeadsBan(ban, u)) return 'truong_ban';
  if (isDeputyOf(ban, u)) return 'pho_ban';
  if (isMemberOf(ban, u) || assignedBanSetOf(u).has(ban.id) || (!!ban.code && assignedBanSetOf(u).has(ban.code)) || (!!ban.name && assignedBanSetOf(u).has(ban.name))) {
    return 'thanh_vien';
  }
  return null;
}

export const BAN_ROLE_LABEL: Record<Exclude<BanRoleOnBan, null>, string> = {
  truong_ban: 'Trưởng ban',
  pho_ban: 'Phó ban',
  thanh_vien: 'Thành viên',
};

/** Keep Ban in assignedBanKds when still leader or member (or still deputy after the change). */
export function stillLinkedWithoutDeputy(ban: SyncBan, u: SyncUser): boolean {
  return userLeadsBan(ban, u) || isMemberOf(ban, u);
}

export function withAssignedBan(u: SyncUser, banId: string): { assignedBanKd: string; assignedBanKds: string[] } {
  const cur = [...assignedBanSetOf(u)];
  if (!cur.includes(banId)) cur.push(banId);
  // Prefer Ban id over code/name leftovers for this Ban: drop code/name aliases of banId if present elsewhere handled by caller.
  return { assignedBanKd: cur[0] || banId, assignedBanKds: cur };
}

export function withoutAssignedBan(u: SyncUser, ban: SyncBan): { assignedBanKd: string; assignedBanKds: string[] } {
  const drop = new Set([ban.id, ban.code, ban.name].filter(Boolean) as string[]);
  const next = [...assignedBanSetOf(u)].filter((x) => !drop.has(x));
  return { assignedBanKd: next[0] || '', assignedBanKds: next };
}

export type DeputyPlan = {
  banUpdate: { id: string; data: { deputyUids: string[] } };
  userUpdate: { assignedBanKd: string; assignedBanKds: string[] } | null;
  /** True when userUpdate should be written (Admin-only field). */
  needsUserWrite: boolean;
};

/** Add Phó ban: deputyUids gets auth uid; assignedBanKds includes ban.id. Role unchanged. */
export function planSetDeputy(ban: SyncBan, u: SyncUser): DeputyPlan {
  const uid = authUidOf(u);
  const cur = Array.isArray(ban.deputyUids) ? ban.deputyUids.filter(Boolean) : [];
  // Drop any stale aliases (doc id / email) for this person, then add auth uid once.
  const ids = new Set(userIdsOf(u));
  const email = normalizeEmail(u.email);
  const cleaned = cur.filter((d) => !ids.has(d) && !(email && String(d).toLowerCase() === email));
  const next = uid ? [...cleaned, uid] : cleaned;
  const assigned = withAssignedBan(u, ban.id);
  // Also strip code/name aliases of this Ban from assigned so the list stays id-based.
  const dropAlias = new Set([ban.code, ban.name].filter(Boolean) as string[]);
  const assignedClean = {
    assignedBanKds: assigned.assignedBanKds.filter((x) => x === ban.id || !dropAlias.has(x)),
    assignedBanKd: '',
  };
  if (!assignedClean.assignedBanKds.includes(ban.id) && ban.id) assignedClean.assignedBanKds.push(ban.id);
  assignedClean.assignedBanKd = assignedClean.assignedBanKds[0] || '';
  return {
    banUpdate: { id: ban.id, data: { deputyUids: next } },
    userUpdate: assignedClean,
    needsUserWrite: true,
  };
}

/** Remove Phó ban: drop from deputyUids; drop assignedBan only if not still leader/member. */
export function planUnsetDeputy(ban: SyncBan, u: SyncUser): DeputyPlan {
  const ids = new Set(userIdsOf(u));
  const email = normalizeEmail(u.email);
  const cur = Array.isArray(ban.deputyUids) ? ban.deputyUids.filter(Boolean) : [];
  const next = cur.filter((d) => !ids.has(d) && !(email && String(d).toLowerCase() === email));
  const keepAssigned = stillLinkedWithoutDeputy(ban, u);
  return {
    banUpdate: { id: ban.id, data: { deputyUids: next } },
    userUpdate: keepAssigned ? null : withoutAssignedBan(u, ban),
    needsUserWrite: !keepAssigned,
  };
}

export type LeaderSyncPlan = TruongBanPlan & {
  /** Role written to users/{id}. GĐK keeps gd_khoi; others get truong_ban_kd. */
  keepGdKhoi: boolean;
  /** Drop this user from deputyUids on every Ban (không kiêm Phó). */
  deputyClears: Array<{ id: string; data: { deputyUids: string[] } }>;
  /** Cảnh báo UI: Ban khác bị gỡ Trưởng/Phó. */
  warnLines: string[];
};

/** RoleCard / Users: set Trưởng ban. Đúng 1 Ban — gỡ Trưởng/Phó Ban khác; không kiêm Phó. */
export function planLeaderSync(user: SyncUser, ban: SyncBan, allBans: SyncBan[], opts: { leaderUid?: string } = {}): LeaderSyncPlan {
  const base = planTruongBanAssignment(user, ban, allBans, opts);
  const keepGdKhoi = (user.role || '') === 'gd_khoi';
  const deputyClears: LeaderSyncPlan['deputyClears'] = [];
  const warnLines: string[] = [];
  for (const b of allBans) {
    if (!b) continue;
    if (isDeputyOf(b, user)) {
      const plan = planUnsetDeputy(b, user);
      deputyClears.push({ id: b.id, data: plan.banUpdate.data });
      warnLines.push(`Gỡ Phó Ban ở «${b.name || b.id}»`);
    }
  }
  for (const name of base.clearedBans) warnLines.push(`Gỡ Trưởng Ban ở «${name}»`);
  if (base.replacedLeader) warnLines.push(`Thay Trưởng Ban hiện tại của «${ban.name || ban.id}» (${base.replacedLeader})`);
  return {
    ...base,
    keepGdKhoi,
    deputyClears,
    warnLines,
    // Phong t341u: Trưởng Ban thuộc đúng 1 Ban — không giữ assignedBanKds khác.
    userUpdate: keepGdKhoi
      ? { role: 'gd_khoi', assignedBanKd: ban.id, assignedBanKds: [ban.id] }
      : { role: 'truong_ban_kd', assignedBanKd: ban.id, assignedBanKds: [ban.id] },
  };
}

export type ClearLeaderPlan = {
  banUpdates: Array<{ id: string; data: { leaderUid: string; leaderEmail: string; leaderName: string; leaderId?: string } }>;
  /** Ban ids cleared. */
  clearedBanIds: string[];
};

/** When role leaves truong_ban_kd: clear leader fields on every Ban this user leads. */
export function planClearLeadership(user: SyncUser, allBans: SyncBan[]): ClearLeaderPlan {
  const banUpdates: ClearLeaderPlan['banUpdates'] = [];
  const clearedBanIds: string[] = [];
  for (const b of allBans) {
    if (!b || !userLeadsBan(b, user)) continue;
    const data: ClearLeaderPlan['banUpdates'][0]['data'] = { leaderUid: '', leaderEmail: '', leaderName: '' };
    if (b.leaderId) data.leaderId = '';
    banUpdates.push({ id: b.id, data });
    clearedBanIds.push(b.id);
  }
  return { banUpdates, clearedBanIds };
}

/** Roles that must NOT be overwritten when Đặt Phó / gán pho_ban_kd. */
export const DEPUTY_ROLE_PRESERVE = new Set([
  'super_admin', 'admin', 'mod', 'accountant', 'gd_khoi', 'tro_ly_khoi', 'gdda',
]);
// truong_ban_kd NOT preserved: gán Phó → role pho_ban_kd (không kiêm Trưởng).

export type DeputyRoleSyncPlan = {
  banUpdate: { id: string; data: { deputyUids: string[] } };
  /** Gỡ Phó ở Ban khác + gỡ Trưởng nếu đang lead (không kiêm). */
  sideBanUpdates: Array<{ id: string; data: Record<string, unknown> }>;
  userUpdate: { role: string; assignedBanKd: string; assignedBanKds: string[] };
  keepExistingRole: boolean;
  warnLines: string[];
};

/**
 * Gán Phó Ban — đúng 1 Ban: gỡ Phó Ban khác, gỡ mọi Trưởng Ban đang giữ, assignedBanKds = [ban.id].
 * Không cho kiêm Trưởng+Phó. Higher roles giữ role nhưng vẫn exclusive Ban.
 */
export function planDeputyRoleSync(user: SyncUser, ban: SyncBan, allBans: SyncBan[] = []): DeputyRoleSyncPlan {
  if (userLeadsBan(ban, user)) {
    throw new Error('Không thể vừa là Trưởng Ban vừa là Phó Ban của cùng một Ban.');
  }
  const dep = planSetDeputy(ban, user);
  const keep = DEPUTY_ROLE_PRESERVE.has(String(user.role || ''));
  const sideBanUpdates: DeputyRoleSyncPlan['sideBanUpdates'] = [];
  const warnLines: string[] = [];
  for (const b of allBans) {
    if (!b || b.id === ban.id) continue;
    if (isDeputyOf(b, user)) {
      const u = planUnsetDeputy(b, user);
      sideBanUpdates.push({ id: b.id, data: u.banUpdate.data });
      warnLines.push(`Gỡ Phó Ban ở «${b.name || b.id}»`);
    }
    if (userLeadsBan(b, user)) {
      const data: Record<string, string> = { leaderUid: '', leaderEmail: '', leaderName: '' };
      if (b.leaderId) data.leaderId = '';
      sideBanUpdates.push({ id: b.id, data });
      warnLines.push(`Gỡ Trưởng Ban ở «${b.name || b.id}»`);
    }
  }
  // Also strip leadership on target if somehow set (safety)
  if (userLeadsBan(ban, user)) {
    const data: Record<string, string> = { leaderUid: '', leaderEmail: '', leaderName: '' };
    if (ban.leaderId) data.leaderId = '';
    sideBanUpdates.push({ id: ban.id, data });
  }
  return {
    banUpdate: dep.banUpdate,
    sideBanUpdates,
    userUpdate: {
      role: keep ? String(user.role) : 'pho_ban_kd',
      assignedBanKd: ban.id,
      assignedBanKds: [ban.id],
    },
    keepExistingRole: keep,
    warnLines,
  };
}

/** Đặt Phó từ Ban UI (exclusive): cùng planDeputyRoleSync + role patch. */
export function planExclusiveSetDeputy(user: SyncUser, ban: SyncBan, allBans: SyncBan[]): DeputyRoleSyncPlan {
  return planDeputyRoleSync(user, ban, allBans);
}

export type ClearDeputyPlan = {
  banUpdates: Array<{ id: string; data: { deputyUids: string[] } }>;
  clearedBanIds: string[];
  /** assignedBan fields after dropping Bans that were only held as Phó. */
  userAssigned: { assignedBanKd: string; assignedBanKds: string[] } | null;
};

/** When role leaves pho_ban_kd: remove from every Ban's deputyUids; drop assignedBan if no longer linked. */
export function planClearDeputyship(user: SyncUser, allBans: SyncBan[]): ClearDeputyPlan {
  const banUpdates: ClearDeputyPlan['banUpdates'] = [];
  const clearedBanIds: string[] = [];
  let working: SyncUser = { ...user };
  for (const b of allBans) {
    if (!b || !isDeputyOf(b, working)) continue;
    const plan = planUnsetDeputy(b, working);
    banUpdates.push({ id: b.id, data: plan.banUpdate.data });
    clearedBanIds.push(b.id);
    if (plan.userUpdate) working = { ...working, ...plan.userUpdate };
  }
  const assigned = {
    assignedBanKd: String(working.assignedBanKd || ''),
    assignedBanKds: Array.isArray(working.assignedBanKds) ? working.assignedBanKds : [],
  };
  return {
    banUpdates,
    clearedBanIds,
    userAssigned: clearedBanIds.length ? assigned : null,
  };
}

/** When Đặt Phó from Ban UI: also set role → pho_ban_kd unless preserved. */
export function roleAfterSetDeputy(user: SyncUser): string | null {
  const r = String(user.role || 'user');
  if (DEPUTY_ROLE_PRESERVE.has(r) || r === 'pho_ban_kd') return null;
  return 'pho_ban_kd';
}

/** When Bỏ Phó and no longer deputy of any Ban: demote pho_ban_kd → user. */
export function roleAfterUnsetDeputy(user: SyncUser, allBans: SyncBan[], justClearedBanId: string): string | null {
  if (String(user.role || '') !== 'pho_ban_kd') return null;
  const still = allBans.some((b) => b.id !== justClearedBanId && isDeputyOf(b, user));
  return still ? null : 'user';
}
