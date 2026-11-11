/**
 * Org-scoped permission helpers for ChiphiMKT.
 * Trưởng Ban KD is NOT a ROLE_NAMES key — it lives on ban_kd.leaderUid/Email
 * and user assignedBanKd(s).
 */

export type OrgUserLike = {
  uid?: string;
  id?: string;
  email?: string;
  role?: string;
  teamName?: string;
  teamId?: string;
  assignedTeam?: string;
  assignedTeams?: string[];
  assignedBanKd?: string;
  assignedBanKds?: string[];
} | null | undefined;

export type BanKdLike = {
  id?: string;
  code?: string;
  name?: string;
  leaderUid?: string;
  leaderId?: string;
  leaderEmail?: string;
  memberUids?: string[];
  assistantUids?: string[];
  assignedUserEmails?: string[];
  deputyUids?: string[];
} | null | undefined;

function norm(s?: string | null) {
  return (s || '').toLowerCase().trim();
}

export function userIdsOf(user: OrgUserLike, profile?: OrgUserLike): string[] {
  const ids = [user?.uid, user?.id, profile?.uid, profile?.id].filter(Boolean) as string[];
  return Array.from(new Set(ids));
}

export function userEmailOf(user: OrgUserLike, profile?: OrgUserLike): string {
  return norm(user?.email || profile?.email);
}

/** True when the user is Trưởng ban of this Ban KD. */
export function isBanKdLeader(ban: BanKdLike, user: OrgUserLike, profile?: OrgUserLike): boolean {
  if (!ban) return false;
  const ids = userIdsOf(user, profile);
  const email = userEmailOf(user, profile);
  if (ban.leaderUid && ids.includes(ban.leaderUid)) return true;
  if (ban.leaderId && ids.includes(ban.leaderId)) return true;
  if (email && ban.leaderEmail && norm(ban.leaderEmail) === email) return true;
  return false;
}

/** Phó Ban: uid nằm trong ban_kd.deputyUids (Admin gán ở Quản lý Ban KD › Dự án của Ban). */
export function isBanKdDeputy(ban: BanKdLike, user: OrgUserLike, profile?: OrgUserLike): boolean {
  if (!ban || !Array.isArray(ban.deputyUids)) return false;
  const ids = userIdsOf(user, profile);
  return ban.deputyUids.some((id) => ids.includes(id));
}

/** Trưởng Ban hoặc Phó Ban: thêm/sửa/xoá dự án của Ban, đặt Tỉ lệ hỗ trợ MKT. */
export function isBanKdManager(ban: BanKdLike, user: OrgUserLike, profile?: OrgUserLike): boolean {
  return isBanKdLeader(ban, user, profile) || isBanKdDeputy(ban, user, profile);
}

/** True when user may view this Ban (leader, member, assigned, or email list). */
export function isBanKdMemberOrLeader(ban: BanKdLike, user: OrgUserLike, profile?: OrgUserLike): boolean {
  if (!ban) return false;
  if (isBanKdManager(ban, user, profile)) return true;
  const ids = userIdsOf(user, profile);
  const email = userEmailOf(user, profile);
  const assigned = new Set<string>();
  if (profile?.assignedBanKd) assigned.add(norm(profile.assignedBanKd));
  if (user?.assignedBanKd) assigned.add(norm(user.assignedBanKd));
  const lists = [
    ...(Array.isArray(profile?.assignedBanKds) ? profile!.assignedBanKds! : []),
    ...(Array.isArray(user?.assignedBanKds) ? user!.assignedBanKds! : []),
  ];
  lists.forEach((x) => x && assigned.add(norm(x)));
  const bId = norm(ban.id);
  const bCode = norm(ban.code);
  const bName = norm(ban.name);
  if ((bId && assigned.has(bId)) || (bCode && assigned.has(bCode)) || (bName && assigned.has(bName))) return true;
  if (Array.isArray(ban.memberUids) && ban.memberUids.some((id) => ids.includes(id) || (!!email && norm(id) === email))) return true;
  if (Array.isArray(ban.assistantUids) && ban.assistantUids.some((id) => ids.includes(id))) return true;
  if (email && Array.isArray(ban.assignedUserEmails) && ban.assignedUserEmails.some((e) => norm(e) === email)) return true;
  return false;
}

/**
 * Capabilities for Trưởng ban on THEIR Ban(s):
 * view + edit Ban info, view ngân sách Ban, view NT MKT theo Ban.
 */
export function banKdLeaderCapabilities(ban: BanKdLike, user: OrgUserLike, profile?: OrgUserLike) {
  const leader = isBanKdLeader(ban, user, profile);
  return {
    isLeader: leader,
    canViewBan: leader || isBanKdMemberOrLeader(ban, user, profile),
    canEditBanInfo: leader,
    canViewBanBudget: leader || isBanKdMemberOrLeader(ban, user, profile),
    canViewBanNt: leader || isBanKdMemberOrLeader(ban, user, profile),
  };
}
