import { describe, it, expect } from 'vitest';
import { rollup, projectRows, countSubmittedDots, aggregateMonthItems, type WeeklyReport } from '../lib/vnext/weekly';

const P = '2026-11';
const rep = (dot: number, uid: string, items: any[], submitted = true, extra: any = {}): WeeklyReport =>
  ({ period: P, dot, uid, items, ...(submitted ? { submittedAt: `2026-11-0${dot}` } : {}), ...extra } as WeeklyReport);

describe('countSubmittedDots (Nộp Báo cáo x/4)', () => {
  it('đếm số đợt đã nộp trong kỳ; nháp & báo cáo đã xoá & kỳ khác không tính', () => {
    const rs = [
      rep(1, 'u', []), rep(2, 'u', []), rep(3, 'u', [], false), rep(4, 'u', [], true, { deleted: true }),
      { ...rep(1, 'u', []), period: '2026-10' } as WeeklyReport,
    ];
    expect(countSubmittedDots(rs, P)).toBe(2);
  });
  it('không có báo cáo → 0; trùng doc cùng đợt chỉ tính 1; đủ 4 đợt → 4', () => {
    expect(countSubmittedDots([], P)).toBe(0);
    expect(countSubmittedDots([rep(1, 'u', []), rep(1, 'u', [])], P)).toBe(1);
    expect(countSubmittedDots([1, 2, 3, 4].map((d) => rep(d, 'u', [])), P)).toBe(4);
  });
});

describe('aggregateMonthItems (Cả tháng)', () => {
  it('luỹ kế lấy đợt đã nộp mới nhất (không cộng); lead/quan tâm/căn chốt cộng các đợt', () => {
    const m = aggregateMonthItems([
      rep(1, 'u', [{ projectId: 'pA', cumCost: 100, leads: 10, interested: 4, closedUnits: 1 }]),
      rep(3, 'u', [{ projectId: 'pA', cumCost: 350, leads: 5, interested: 2, closedUnits: 0, difficulty: 'khó' }]),
    ]);
    expect(m.get('pA')).toMatchObject({ cumCost: 350, leads: 15, interested: 6, closedUnits: 1, difficulty: 'khó' });
  });
  it('thiếu đợt giữa kỳ vẫn đúng; dự án chỉ có ở đợt cũ lấy luỹ kế đợt đó', () => {
    const m = aggregateMonthItems([
      rep(1, 'u', [{ projectId: 'pA', cumCost: 100, leads: 1, interested: 0 }, { projectId: 'pB', cumCost: 40, leads: 2, interested: 1 }]),
      rep(4, 'u', [{ projectId: 'pA', cumCost: 300, leads: 3, interested: 1 }]),
    ]);
    expect(m.get('pA')!.cumCost).toBe(300);
    expect(m.get('pB')).toMatchObject({ cumCost: 40, leads: 2 });
  });
  it('nháp và báo cáo đã xoá bị bỏ qua dù đợt mới hơn', () => {
    const m = aggregateMonthItems([
      rep(1, 'u', [{ projectId: 'pA', cumCost: 100, leads: 1, interested: 0 }]),
      rep(2, 'u', [{ projectId: 'pA', cumCost: 999, leads: 50, interested: 0 }], false),
      rep(3, 'u', [{ projectId: 'pA', cumCost: 888, leads: 50, interested: 0 }], true, { deleted: true }),
    ]);
    expect(m.get('pA')).toMatchObject({ cumCost: 100, leads: 1 });
  });
});

describe('rollup: chế độ Cả tháng + x/4', () => {
  const users = [
    { uid: 'u1', name: 'A', teamId: 't1', blockId: 'k1' },
    { uid: 'u2', name: 'B', teamId: 't1', blockId: 'k1' },
  ];
  const nsByUser = new Map([['u1', new Map([['pA', 1000], ['pB', 500]])], ['u2', new Map([['pA', 200]])]]);
  const reports: WeeklyReport[] = [
    rep(1, 'u1', [{ projectId: 'pA', cumCost: 100, leads: 10, interested: 4 }]),
    rep(2, 'u1', [{ projectId: 'pA', cumCost: 400, leads: 20, interested: 5 }]),
    rep(3, 'u1', [{ projectId: 'pA', cumCost: 999, leads: 99, interested: 9 }], false), // nháp
  ];

  it('Cả tháng: cum = đợt mới nhất đã nộp, lead cộng, Chi cả tháng = cum, giá TB/lead tính lại', () => {
    const r = rollup({ period: P, dot: 'month', users, reports, nsByUser });
    const u1 = r.blocks[0].teams[0].users.find((u) => u.uid === 'u1')!;
    expect(u1.submitted).toBe(true);
    expect(u1.dotsSubmitted).toBe(2);
    expect(u1.cum).toBe(400);
    expect(u1.dotCost).toBe(400);
    expect(u1.leads).toBe(30);
    expect(u1.missing.map((m) => m.projectId)).toEqual(['pB']);
    const rows = projectRows(r.blocks, { block: (i) => i, team: (i) => i, project: (i) => i });
    expect(rows.find((x) => x.uid === 'u1' && x.projectId === 'pA')!.cpl).toBe(Math.round(400 / 30));
    expect(rows.find((x) => x.uid === 'u2')!.status).toBe('missing');
  });

  it('x/4 ở mọi cấp: user, Phòng/Khối/Tổng cộng dồn; mẫu số = 4 × số user; đợt đơn cũng đếm cả kỳ', () => {
    for (const dot of [1, 3, 'month'] as const) {
      const r = rollup({ period: P, dot, users, reports, nsByUser });
      expect(r.blocks[0].teams[0].dotsSubmitted).toBe(2);
      expect(r.blocks[0].dotsSubmitted).toBe(2);
      expect(r.total.dotsSubmitted).toBe(2);
      expect(r.total.expected * 4).toBe(8);
      const rows = projectRows(r.blocks, { block: (i) => i, team: (i) => i, project: (i) => i });
      expect(rows.filter((x) => x.uid === 'u1').every((x) => x.dotsSubmitted === 2)).toBe(true);
      expect(rows.filter((x) => x.uid === 'u2').every((x) => x.dotsSubmitted === 0)).toBe(true);
    }
  });

  it('đợt đơn không đổi hành vi: đợt 2 chi riêng = 400-100', () => {
    const r = rollup({ period: P, dot: 2, users, reports, nsByUser });
    const u1 = r.blocks[0].teams[0].users.find((u) => u.uid === 'u1')!;
    expect(u1.dotCost).toBe(300);
    expect(u1.leads).toBe(20);
  });
});
