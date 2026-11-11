import { describe, it, expect } from 'vitest';
import { rollup, byProject, validateItem, type WeeklyReport } from '../lib/vnext/weekly';
const ns = (m: Record<string, number>) => new Map(Object.entries(m));
describe('Báo cáo tuần — Số căn chốt', () => {
  it('validate: số nguyên ≥ 0, báo cáo cũ (không có trường) hợp lệ', () => {
    expect(validateItem({ projectId: 'P1', cumCost: 1, leads: 2, interested: 1 }, 0)).toBeNull();
    expect(validateItem({ projectId: 'P1', cumCost: 1, leads: 2, interested: 1, closedUnits: 3 }, 0)).toBeNull();
    expect(validateItem({ projectId: 'P1', cumCost: 1, leads: 2, interested: 1, closedUnits: -1 }, 0)).toMatch(/âm/);
    expect(validateItem({ projectId: 'P1', cumCost: 1, leads: 2, interested: 1, closedUnits: 1.5 }, 0)).toMatch(/nguyên/);
  });
  it('rollup cộng dồn User → Phòng → Khối → Tổng và theo Dự án; thiếu trường = 0', () => {
    const users = [{ uid: 'a', name: 'A', teamId: 'T1', blockId: 'B1' }, { uid: 'b', name: 'B', teamId: 'T1', blockId: 'B1' }, { uid: 'c', name: 'C', teamId: 'T2', blockId: 'B2' }];
    const rep = (uid: string, items: any[]): WeeklyReport => ({ period: '2026-11', dot: 1, uid, items, submittedAt: 'x' });
    const reports = [
      rep('a', [{ projectId: 'P1', cumCost: 10, leads: 2, interested: 1, closedUnits: 2 }, { projectId: 'P2', cumCost: 5, leads: 1, interested: 0, closedUnits: 1 }]),
      rep('b', [{ projectId: 'P1', cumCost: 10, leads: 2, interested: 1 }]),
      rep('c', [{ projectId: 'P1', cumCost: 10, leads: 2, interested: 1, closedUnits: 4 }]),
    ];
    const nsByUser = new Map([['a', ns({ P1: 100, P2: 100 })], ['b', ns({ P1: 100 })], ['c', ns({ P1: 100 })]]);
    const r = rollup({ period: '2026-11', dot: 1, users, reports, nsByUser });
    expect(r.total.closedUnits).toBe(7);
    const b1 = r.blocks.find((b) => b.blockId === 'B1')!;
    expect(b1.closedUnits).toBe(3); expect(b1.teams[0].closedUnits).toBe(3);
    expect(b1.teams[0].users.find((u) => u.uid === 'b')!.closedUnits).toBe(0);
    const bp = byProject(r.blocks);
    expect(bp.find((p) => p.projectId === 'P1')!.closedUnits).toBe(6);
    expect(bp.find((p) => p.projectId === 'P2')!.closedUnits).toBe(1);
  });
});
