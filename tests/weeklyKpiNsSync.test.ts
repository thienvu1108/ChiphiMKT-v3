import { describe, it, expect } from 'vitest';
import {
  rollup, projectRows, sumProjectRowKpis, itemMetrics, stripItemsForProject, formProjects,
  type WeeklyReport,
} from '../lib/vnext/weekly';

describe('KPI Đã nộp theo bộ lọc dự án (bug 80/14)', () => {
  const users = [
    { uid: 'u1', name: 'A', teamId: 't1', blockId: 'k1' },
    { uid: 'u2', name: 'B', teamId: 't1', blockId: 'k1' },
    { uid: 'u3', name: 'C', teamId: 't2', blockId: 'k1' },
  ];
  // u1,u2 có Star City (Pstar); u3 chỉ có dự án khác
  const nsByUser = new Map([
    ['u1', new Map([['Pstar', 40], ['Pother', 10]])],
    ['u2', new Map([['Pstar', 15]])],
    ['u3', new Map([['Pother', 20]])],
  ]);
  const reports: WeeklyReport[] = [
    { period: '2026-11', dot: 1, uid: 'u1', items: [{ projectId: 'Pstar', cumCost: 5, leads: 2, interested: 1, nsAtSubmit: 40 }, { projectId: 'Pother', cumCost: 1, leads: 0, interested: 0, nsAtSubmit: 10 }], submittedAt: 'x' },
    { period: '2026-11', dot: 1, uid: 'u3', items: [{ projectId: 'Pother', cumCost: 3, leads: 1, interested: 0, nsAtSubmit: 20 }], submittedAt: 'x' },
    // u2 chưa nộp
  ];

  it('lọc Pstar: expected = user có NS Pstar; submitted không tính user chỉ nộp dự án khác', () => {
    const r = rollup({ period: '2026-11', dot: 1, users, reports, nsByUser, projectId: 'Pstar' });
    // u1 + u2 expected; u3 bị loại (không có Pstar) dù đã nộp Pother
    expect(r.total.expected).toBe(2);
    expect(r.total.submitted).toBe(1); // chỉ u1
    const rows = projectRows(r.blocks, { block: (id) => id, team: (id) => id, project: (id) => id });
    expect(rows).toHaveLength(2);
    const kpi = sumProjectRowKpis(rows);
    expect(kpi.expected).toBe(2);
    expect(kpi.submitted).toBe(1); // u1 submitted Pstar; u2 missing
    expect(kpi.ns).toBe(40 + 15);
    expect(kpi.cum).toBe(5);
    expect(kpi.leads).toBe(2);
  });

  it('không lọc: submitted/expected theo user có NS', () => {
    const r = rollup({ period: '2026-11', dot: 1, users, reports, nsByUser });
    expect(r.total.expected).toBe(3);
    expect(r.total.submitted).toBe(2);
  });
});

describe('NS live sau khi cập nhật', () => {
  it('itemMetrics dùng liveNs dù đã nộp và có nsAtSubmit cũ', () => {
    const it = { projectId: 'P1', cumCost: 30, leads: 3, interested: 1, nsAtSubmit: 80 };
    expect(itemMetrics(it, { liveNs: 120, prevCum: 0, submitted: true }).ns).toBe(120);
    expect(itemMetrics(it, { liveNs: 120, prevCum: 0, submitted: true }).pct).toBe(25);
  });
});

describe('stripItemsForProject + orphan ignore', () => {
  it('strip đúng projectId; formProjects mặc định bỏ orphan', () => {
    const items = [
      { projectId: 'A', cumCost: 1, leads: 0, interested: 0 },
      { projectId: 'B', cumCost: 2, leads: 0, interested: 0 },
    ];
    expect(stripItemsForProject(items, 'A').map((i) => i.projectId)).toEqual(['B']);
    expect(stripItemsForProject(items, 'Z')).toHaveLength(2);
    const ns = new Map([['A', 10]]);
    const reps: WeeklyReport[] = [{ period: '2026-11', dot: 1, uid: 'u', items: [{ projectId: 'B', cumCost: 1, leads: 0, interested: 0 }], submittedAt: 'x' }];
    expect(formProjects(ns, reps).map((p) => p.projectId)).toEqual(['A']);
    expect(formProjects(ns, reps, { includeOrphans: true }).map((p) => p.projectId).sort()).toEqual(['A', 'B']);
  });
});
