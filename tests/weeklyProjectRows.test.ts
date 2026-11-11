import { describe, it, expect } from 'vitest';
import { rollup, projectRows, type WeeklyReport } from '../lib/vnext/weekly';

describe('projectRows: User × Dự án + trạng thái', () => {
  it('mỗi dự án đăng ký 1 dòng; dự án chưa có trong báo cáo = Chưa nộp; sắp Khối → Phòng → User → Dự án', () => {
    const users = [
      { uid: 'u2', name: 'B', teamId: 't1', blockId: 'k1' },
      { uid: 'u1', name: 'A', teamId: 't1', blockId: 'k1' },
      { uid: 'u3', name: 'C', teamId: 't2', blockId: 'k0' },
    ];
    const nsByUser = new Map([
      ['u1', new Map([['pB', 10], ['pA', 20]])],
      ['u2', new Map([['pA', 5]])],
      ['u3', new Map([['pA', 7]])],
    ]);
    const reports: WeeklyReport[] = [{ period: '2026-11', dot: 1, uid: 'u1', items: [{ projectId: 'pA', cumCost: 3, leads: 1, interested: 0 }], submittedAt: 'x' }];
    const r = rollup({ period: '2026-11', dot: 1, users, reports, nsByUser });
    const rows = projectRows(r.blocks, { block: (id) => id, team: (id) => id, project: (id) => id });
    expect(rows.map((x) => `${x.uid}:${x.projectId}:${x.status}`)).toEqual(['u3:pA:missing', 'u1:pA:submitted', 'u1:pB:missing', 'u2:pA:missing']);
  });
});
