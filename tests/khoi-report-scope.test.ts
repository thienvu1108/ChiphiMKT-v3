import { describe, expect, it } from 'vitest';
import { scopeKhoiReports, type WeeklyReport } from '../lib/vnext/weekly';
const rep = (uid: string, blockId?: string): WeeklyReport => ({ period: '2026-11', dot: 1, uid, userName: uid, teamId: 'T', blockId, items: [], submittedAt: 'x', updatedAt: 'x' } as any);
describe('Báo cáo Khối — chỉ nhân sự và báo cáo của Khối', () => {
  const users = [{ uid: 'a', blockId: 'B1' }, { uid: 'b', blockId: 'B1' }, { uid: 'c', blockId: 'B2' }];
  it('lọc nhân sự theo Khối và báo cáo theo report.blockId', () => {
    const r = scopeKhoiReports(users, [rep('a', 'B1'), rep('b', 'B2'), rep('c', 'B2'), rep('c', 'B1'), rep('zz', 'B1')], ['B1']);
    expect(r.users.map((u) => u.uid)).toEqual(['a', 'b']);
    // b chuyển sang Khối 1 nhưng báo cáo nộp cho Khối 2 → không tính; c không thuộc Khối 1; zz không còn là nhân sự
    expect(r.reports.map((x) => x.uid + x.blockId)).toEqual(['aB1']);
  });
  it('báo cáo cũ không có blockId → theo Khối hiện tại của người nộp', () => {
    expect(scopeKhoiReports(users, [rep('a'), rep('c')], ['B1']).reports.map((x) => x.uid)).toEqual(['a']);
  });
  it('không có phạm vi Khối → giữ nguyên', () => {
    const rs = [rep('a', 'B1'), rep('c', 'B2')];
    expect(scopeKhoiReports(users, rs, undefined)).toEqual({ users, reports: rs });
  });
});
