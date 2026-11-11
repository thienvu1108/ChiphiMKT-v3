import { describe, it, expect, beforeAll } from 'vitest';
import { userNsByProject, type NsLine } from '../lib/vnext/budget';
import { lineStatus, isNsReportableStatus } from '../lib/vnext/status';
import { setKhoiManagers, isNsReportableLine, reportableNsAmount, type Support } from '../lib/vnext/support';
import '../lib/vnext/weekly'; // Ban gate
import { formProjects, rollup, projectRows, sumProjectRowKpis, countHiddenNonReportableItems, type WeeklyReport } from '../lib/vnext/weekly';

describe('Báo cáo tuần: mọi NS trừ Từ chối (GĐK/Ban)', () => {
  beforeAll(() => setKhoiManagers([{ id: 'B1', directorUid: 'gdk1', assistantUids: [] }]));

  const lines: NsLine[] = [
    { id: 'a', period: '2026-11', kind: 'user', projectId: 'P1', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', amount: 10, deleted: false } as any,
    { id: 'b', period: '2026-11', kind: 'user', projectId: 'P2', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', amount: 20, deleted: false } as any,
    { id: 'c', period: '2026-11', kind: 'user', projectId: 'P3', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', amount: 30, deleted: false } as any,
    { id: 'd', period: '2026-11', kind: 'khoi', projectId: 'P4', ownerUid: 'gdk1', blockId: 'B1', amount: 40, deleted: false } as any,
    { id: 'e', period: '2026-11', kind: 'user', projectId: 'P5', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', amount: 50, deleted: false } as any,
  ];
  const sup: Record<string, Partial<Support>> = {
    a: { status: 'approved', amount: 10, decidedAt: '2026-10-22' },
    b: { status: 'rejected', amount: 20, decidedAt: '2026-10-22' },
    e: { status: 'approved', amount: 50, decidedAt: '2026-10-20' },
  };
  // c: no support → pending; d: khoi auto

  const include = (l: NsLine) => isNsReportableLine(l, sup[l.id], { has: true });

  it('isNsReportableStatus / isNsReportableLine', () => {
    expect(isNsReportableStatus('approved')).toBe(true);
    expect(isNsReportableStatus('need_pay')).toBe(true);
    expect(isNsReportableStatus('pending')).toBe(true);
    expect(isNsReportableStatus('reapproval')).toBe(true);
    expect(isNsReportableStatus('rejected')).toBe(false);
    expect(isNsReportableLine(lines[0], sup.a, { has: true })).toBe(true);
    expect(isNsReportableLine(lines[0], sup.a, { has: false })).toBe(true); // Chờ STK
    expect(lineStatus(lines[0], sup.a, { has: false })).toBe('need_pay');
    expect(isNsReportableLine(lines[1], sup.b, { has: false })).toBe(false); // Từ chối
    expect(isNsReportableLine(lines[2], undefined, { has: false })).toBe(true); // pending cũng reportable
    expect(isNsReportableLine(lines[3], undefined, { has: true })).toBe(true); // auto
  });

  it('userNsByProject cộng mọi dòng trừ từ chối; pending + khoi + Chờ STK', () => {
    const m = userNsByProject(lines, '2026-11', 'u1', { includeLine: include });
    expect([...m.keys()].sort()).toEqual(['P1', 'P3', 'P5']); // P3 pending
    expect(m.get('P1')).toBe(10);
    expect(m.get('P3')).toBe(30);
    const mPay = userNsByProject(lines, '2026-11', 'u1', {
      includeLine: (l) => isNsReportableLine(l, sup[l.id], { has: false }),
    });
    expect(mPay.get('P1')).toBe(10);
    expect(mPay.has('P2')).toBe(false); // rejected
    expect(mPay.has('P3')).toBe(true);
    const mk = userNsByProject(lines, '2026-11', 'gdk1', { includeLine: include });
    expect(mk.get('P4')).toBe(40);
  });

  it('rollup / form ẩn dự án NS từ chối; item báo cáo orphan bị bỏ khỏi view', () => {
    const ns = userNsByProject(lines, '2026-11', 'u1', { includeLine: include });
    const reports: WeeklyReport[] = [{
      period: '2026-11', dot: 1, uid: 'u1',
      items: [
        { projectId: 'P1', cumCost: 1, leads: 1, interested: 0 },
        { projectId: 'P2', cumCost: 9, leads: 9, interested: 0 },
      ],
      submittedAt: 'x',
    }];
    expect(formProjects(ns, reports).map((p) => p.projectId).sort()).toEqual(['P1', 'P3', 'P5']);
    const users = [{ uid: 'u1', name: 'U', teamId: 'T1', blockId: 'B1' }];
    const nsByUser = new Map([['u1', ns]]);
    const r = rollup({ period: '2026-11', dot: 1, users, reports, nsByUser });
    const rows = projectRows(r.blocks, { block: (i) => i, team: (i) => i, project: (i) => i });
    expect(rows.map((x) => x.projectId).sort()).toEqual(['P1', 'P3', 'P5']);
    expect(sumProjectRowKpis(rows).cum).toBe(1);
    // P2 rejected → item báo cáo ẩn (orphan)
    expect(countHiddenNonReportableItems(reports, nsByUser)).toEqual({ items: 1, docs: 1 });
  });

  it('Cần duyệt lại: reportable + amount lấy đã duyệt gần nhất', () => {
    const edited = { ...lines[0], amount: 99, history: [{ at: '2026-11-05T00:00:00Z', action: 'update', byUid: 'u1', byName: 'U', from: 10, to: 99 }] } as any;
    const s = { status: 'approved' as const, amount: 10, decidedAt: '2026-10-22' };
    expect(lineStatus(edited, s, { has: true })).toBe('reapproval');
    expect(isNsReportableLine(edited, s, { has: true })).toBe(true);
    expect(reportableNsAmount(edited, s)).toBe(10);
    expect(reportableNsAmount(lines[2], undefined)).toBe(30); // pending → current
  });
});
