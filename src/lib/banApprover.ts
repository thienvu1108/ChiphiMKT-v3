/** Duyệt NS tầng Ban: Trưởng Ban / Phó Ban / Admin — Trưởng Ban ưu tiên (pure). Khớp firestore.rules banSupportWriterOk. */
export type BanApproverRole = 'leader' | 'deputy' | 'admin';

export function banApproverRole(i: { isLeader: boolean; isDeputy: boolean; isAdminLike: boolean }): BanApproverRole | null {
  if (i.isLeader) return 'leader';
  if (i.isAdminLike) return 'admin';
  if (i.isDeputy) return 'deputy';
  return null;
}

/** Phó Ban không ghi đè quyết định đã có của Trưởng Ban. */
export function deputyBlocked(role: BanApproverRole | null | undefined, current?: { banDecidedRole?: string } | null): boolean {
  return role === 'deputy' && current?.banDecidedRole === 'leader';
}

export function splitWritable<T>(items: T[], role: BanApproverRole | null | undefined, cur: (t: T) => { banDecidedRole?: string } | null | undefined) {
  const writable: T[] = [], blocked: T[] = [];
  for (const it of items) (deputyBlocked(role, cur(it)) ? blocked : writable).push(it);
  return { writable, blocked };
}

export const BAN_ROLE_LABEL: Record<string, string> = { leader: 'Trưởng Ban', deputy: 'Phó Ban', admin: 'Admin/KT', gdk: 'GĐK/Trợ lý', '': '' };

export type ApproverLogRow = { at: string; who: string; role: string; action: string; reason: string };
const ACTION: Record<string, string> = { approved: 'Duyệt', rejected: 'Từ chối', pending: 'Đặt lại / Chờ duyệt' };

/** Nhật ký người duyệt (mới nhất trước). Mục không có byRole: Ban (có banStatus hoặc lý do «Ban:») hoặc GĐK. */
export function approverLog(hist: Array<Record<string, any>> | undefined): ApproverLogRow[] {
  return (Array.isArray(hist) ? hist : []).map((h) => {
    const reason = String(h?.reason || '');
    const role = h?.byRole ? (BAN_ROLE_LABEL[h.byRole] ?? String(h.byRole)) : (h?.layer === 'ban' || reason.startsWith('Ban:') ? 'Ban' : 'GĐK/Trợ lý');
    return { at: String(h?.at || ''), who: String(h?.byName || h?.byUid || ''), role, action: ACTION[String(h?.status)] || String(h?.status || ''), reason };
  }).sort((a, b) => b.at.localeCompare(a.at));
}
