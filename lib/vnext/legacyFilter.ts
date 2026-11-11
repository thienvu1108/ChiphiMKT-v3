import { projectKeyOf } from './projectRef';
/** Lọc NS kỳ cũ theo Tháng / Khối / Phòng / Dự án ('' = tất cả; period '*' = mọi kỳ). */
export const legacyBlockOf = (r: any, blockOfTeam: (t: string) => string) => r.blockId || (r.teamId ? blockOfTeam(r.teamId) : '') || '';
export function filterLegacy<T extends { _p: string }>(rows: T[], f: { period: string; blockId?: string; teamKey?: string; projectKey?: string }, blockOfTeam: (t: string) => string, projects: any[] = []): T[] {
  return rows.filter((r: any) => (f.period === '*' || r._p === f.period)
    && (!f.blockId || legacyBlockOf(r, blockOfTeam) === f.blockId)
    && (!f.teamKey || (r.teamId || r.teamName) === f.teamKey)
    && (!f.projectKey || projectKeyOf(projects, r) === f.projectKey));
}
