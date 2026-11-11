/**
 * Admin: assign role "Trưởng ban KD" (truong_ban_kd) + the Ban they lead, in ONE batch.
 * Pure planner (no Firestore import) so it can be unit tested; the caller turns the plan
 * into writeBatch().update() calls.
 *
 * - users/{id}: role = truong_ban_kd, assignedBanKd(s) = [ban.id]
 * - ban_kd/{ban.id}: leaderUid / leaderEmail (lower-case) / leaderName = this user
 * - every OTHER ban_kd this user currently leads: leader fields cleared
 *   (a Trưởng ban KD is scoped to exactly one Ban).
 */
import { normalizeEmail } from './userIdentity';

export type AssignUserLike = {
  id: string;
  uid?: string;
  email?: string;
  fullName?: string;
  displayName?: string;
};

export type AssignBanLike = {
  id: string;
  name?: string;
  code?: string;
  leaderUid?: string;
  leaderId?: string;
  leaderEmail?: string;
  leaderName?: string;
};

export type TruongBanPlan = {
  userUpdate: { role: 'truong_ban_kd' | 'gd_khoi'; assignedBanKd: string; assignedBanKds: string[] };
  banUpdates: Array<{ id: string; data: Record<string, string> }>;
  /** Person who led the target Ban before (if different) — shown in the confirm text. */
  replacedLeader: string | null;
  /** Other Bans whose leader fields get cleared. */
  clearedBans: string[];
};

export function userLeadsBan(ban: AssignBanLike, user: AssignUserLike): boolean {
  const ids = [user.uid, user.id].filter(Boolean) as string[];
  const email = normalizeEmail(user.email);
  if (ban.leaderUid && ids.includes(ban.leaderUid)) return true;
  if (ban.leaderId && ids.includes(ban.leaderId)) return true;
  if (email && ban.leaderEmail && normalizeEmail(ban.leaderEmail) === email) return true;
  return false;
}

export function planTruongBanAssignment(
  user: AssignUserLike,
  ban: AssignBanLike,
  allBans: AssignBanLike[],
  /** Override leaderUid (admin pre-provisioning: no auth uid yet → '' and match by email). */
  opts: { leaderUid?: string } = {},
): TruongBanPlan {
  const email = normalizeEmail(user.email);
  const name = (user.fullName || user.displayName || '').trim();
  const ids = [user.uid, user.id].filter(Boolean) as string[];
  const targetData: Record<string, string> = {
    leaderUid: opts.leaderUid !== undefined ? opts.leaderUid : (user.uid || user.id),
    leaderEmail: email,
    leaderName: name || email,
  };
  // A legacy leaderId of the previous leader would otherwise keep their access.
  if (ban.leaderId && !ids.includes(ban.leaderId)) targetData.leaderId = '';
  const banUpdates: TruongBanPlan['banUpdates'] = [{ id: ban.id, data: targetData }];
  const clearedBans: string[] = [];
  for (const other of allBans) {
    if (!other || other.id === ban.id) continue;
    if (userLeadsBan(other, user)) {
      const cleared: Record<string, string> = { leaderUid: '', leaderEmail: '', leaderName: '' };
      if (other.leaderId) cleared.leaderId = '';
      banUpdates.push({ id: other.id, data: cleared });
      clearedBans.push(other.name || other.id);
    }
  }
  const replacedLeader = userLeadsBan(ban, user)
    ? null
    : (ban.leaderEmail || ban.leaderName || ban.leaderUid || null);
  return {
    userUpdate: { role: 'truong_ban_kd', assignedBanKd: ban.id, assignedBanKds: [ban.id] },
    banUpdates,
    replacedLeader,
    clearedBans,
  };
}
