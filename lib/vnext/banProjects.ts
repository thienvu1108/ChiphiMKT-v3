/** 1 dự án chỉ thuộc đúng 1 Ban KD. «Chưa thuộc Ban» = không có banKdId và không có banKdName (khớp rules). */
export const isProjectUnassigned = (p: any) => !!p && !p.deleted && !String(p.banKdId || '').trim() && !String(p.banKdName || '').trim();
export const unassignedProjects = <T extends { id: string }>(projects: T[]) => projects.filter(isProjectUnassigned);
const n = (s?: string) => (s || '').toLowerCase().trim();
/** Dự án «thuộc nhiều Ban»: banKdId trỏ 1 Ban nhưng banKdName là tên Ban khác. */
export function multiBanConflicts(projects: any[], bans: { id: string; name?: string }[]) {
  const byName = new Map(bans.map((b) => [n(b.name), b.id]));
  return projects.filter((p) => !p.deleted && p.banKdId && p.banKdName && byName.has(n(p.banKdName)) && byName.get(n(p.banKdName)) !== p.banKdId);
}
