/** Ban KD đang gán cho user. Chỉ so khớp id thật (tránh undefined === undefined khi user/Ban thiếu uid/leaderUid). */
export function userIdsOf(u: { id?: string; uid?: string; migratedFromUid?: string }): string[] {
  return [u.id, u.uid, u.migratedFromUid].filter((x): x is string => typeof x === 'string' && x.length > 0);
}
export function assignedBanIds(u: any, bans: any[]): string[] {
  const ids = userIdsOf(u);
  const email = typeof u.email === 'string' ? u.email.toLowerCase().trim() : '';
  const prof = new Set<string>([u.assignedBanKd, ...(Array.isArray(u.assignedBanKds) ? u.assignedBanKds : [])].filter((x) => typeof x === 'string' && x));
  return bans.filter((b) => {
    if (b.leaderUid && ids.includes(b.leaderUid)) return true;
    if (b.leaderId && ids.includes(b.leaderId)) return true;
    if (email && typeof b.leaderEmail === 'string' && b.leaderEmail.toLowerCase().trim() === email) return true;
    const d: unknown[] = Array.isArray(b.deputyUids) ? b.deputyUids : [];
    if (d.some((x) => typeof x === 'string' && ids.includes(x))) return true;
    const m: unknown[] = Array.isArray(b.memberUids) ? b.memberUids : [];
    if (m.some((x) => typeof x === 'string' && (ids.includes(x) || (!!email && x.toLowerCase() === email)))) return true;
    return prof.has(b.id) || (!!b.code && prof.has(b.code)) || (!!b.name && prof.has(b.name));
  }).map((b) => b.id);
}
export function diffIds(before: string[], after: string[]) {
  return { added: after.filter((x) => !before.includes(x)), removed: before.filter((x) => !after.includes(x)) };
}
