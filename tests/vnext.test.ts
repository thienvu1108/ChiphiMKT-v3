import { describe, it, expect } from 'vitest';
import { getPeriodOf, periodLabel, dotsOf, currentDot, dotReportWindow, isDotReportOpen, openReportDot, DOT_REPORT_OPEN_SPAN } from '../lib/vnext/period';
import { normLocks, openNsPeriods } from '../lib/vnext/platform';
import { summarizeTeam, summarizeBlock, checkEdit, nsLineId, userNsByProject, visibleTeams, gdkdTeamIdsFor, canRegisterAsUser, canDeleteBlock, type NsLine } from '../lib/vnext/budget';
import { formProjects, itemMetrics, prevCum, validateItem, freezeOnSubmit, rollup, byProject, type WeeklyReport } from '../lib/vnext/weekly';
import { buildReport, buildReconcile, recordCostBeforeVat, imageSlides, shareLinkValid, clampShareDays, newToken, leadGroup } from '../lib/vnext/ntReport';

const vn = (s: string) => new Date(s + '+07:00');

describe('period 21→20', () => {
  it('kỳ mới từ Tháng 11/2026', () => {
    expect(getPeriodOf(vn('2026-10-21T00:00:00'))).toBe('2026-11');
    expect(getPeriodOf(vn('2026-11-20T23:59:00'))).toBe('2026-11');
    expect(getPeriodOf(vn('2026-11-21T00:00:00'))).toBe('2026-12');
    expect(getPeriodOf(vn('2027-01-05T10:00:00'))).toBe('2027-01');
    expect(getPeriodOf(vn('2026-12-25T10:00:00'))).toBe('2027-01');
  });
  it('trước mốc giữ công thức cũ nhưng không nhảy sang 2026-11 trước 21/10', () => {
    expect(getPeriodOf(vn('2026-09-16T10:00:00'))).toBe('2026-10');
    expect(getPeriodOf(vn('2026-10-10T10:00:00'))).toBe('2026-10');
    expect(getPeriodOf(vn('2026-10-17T10:00:00'))).toBe('2026-10');
  });
  it('UTC boundary: 20/10 17:00Z = 21/10 00:00 VN', () => {
    expect(getPeriodOf(new Date('2026-10-20T17:00:00Z'))).toBe('2026-11');
    expect(getPeriodOf(new Date('2026-10-20T16:59:00Z'))).toBe('2026-10');
  });
  it('label', () => {
    expect(periodLabel('2026-11')).toBe('Tháng 11/2026 (21/10–20/11)');
    expect(periodLabel('2027-01')).toBe('Tháng 1/2027 (21/12–20/1)');
  });
  it('4 đợt (đợt 3 = 4–11, đợt 4 = 12–19)', () => {
    const d = dotsOf('2026-11');
    expect(d.map((x) => x.label)).toEqual(['21/10 – 27/10', '21/10 – 03/11', '21/10 – 11/11', '21/10 – 19/11']);
    expect(currentDot('2026-11', vn('2026-10-29T08:00:00'))).toBe(2);
    expect(currentDot('2026-11', vn('2026-11-11T12:00:00'))).toBe(3);
    expect(currentDot('2026-11', vn('2026-11-12T08:00:00'))).toBe(4);
    expect(currentDot('2026-11', vn('2026-11-19T23:00:00'))).toBe(4);
    expect(currentDot('2026-11', vn('2026-11-20T12:00:00'))).toBe(5); // ngày 20 ngoài biên nội dung đợt 4
    expect(currentDot('2026-11', vn('2026-11-21T01:00:00'))).toBe(5);
    expect(currentDot('2026-11', vn('2026-10-20T01:00:00'))).toBe(0);
  });
  it('cửa sổ nộp Báo cáo tuần theo đợt', () => {
    expect(DOT_REPORT_OPEN_SPAN).toEqual([2, 2, 1, 2]);
    // Đợt 1: mở 27–28/10 (hôm nay 28/10 phải còn mở)
    expect(isDotReportOpen('2026-11', 1, vn('2026-10-27T00:00:00'))).toBe(true);
    expect(isDotReportOpen('2026-11', 1, vn('2026-10-28T23:00:00'))).toBe(true);
    expect(isDotReportOpen('2026-11', 1, vn('2026-10-26T23:00:00'))).toBe(false);
    expect(isDotReportOpen('2026-11', 1, vn('2026-10-29T00:00:00'))).toBe(false);
    expect(openReportDot('2026-11', vn('2026-10-28T12:00:00'))).toBe(1);
    // Đợt 2: mở 3–4/11
    expect(dotReportWindow('2026-11', 2, vn('2026-11-03T08:00:00')).openLabel).toBe('03/11 – 04/11');
    expect(isDotReportOpen('2026-11', 2, vn('2026-11-03T08:00:00'))).toBe(true);
    expect(isDotReportOpen('2026-11', 2, vn('2026-11-04T23:00:00'))).toBe(true);
    expect(isDotReportOpen('2026-11', 2, vn('2026-11-05T00:00:00'))).toBe(false);
    // Đợt 3: chỉ 11/11
    expect(dotReportWindow('2026-11', 3).openLabel).toBe('11/11');
    expect(isDotReportOpen('2026-11', 3, vn('2026-11-11T08:00:00'))).toBe(true);
    expect(isDotReportOpen('2026-11', 3, vn('2026-11-12T00:00:00'))).toBe(false);
    // Đợt 4: 19–20/11
    expect(dotReportWindow('2026-11', 4).openLabel).toBe('19/11 – 20/11');
    expect(isDotReportOpen('2026-11', 4, vn('2026-11-19T00:00:00'))).toBe(true);
    expect(isDotReportOpen('2026-11', 4, vn('2026-11-20T23:00:00'))).toBe(true);
    expect(isDotReportOpen('2026-11', 4, vn('2026-11-21T00:00:00'))).toBe(false);
  });
  it('kỳ mở đăng ký NS chỉ theo «Thời gian MỞ» (14 → 5, Tháng này) + khoá kỳ đã qua', () => {
    const rec = (apply: number | null) => ({ on: true, fromDay: 14, fromMin: 0, toDay: 5, toMin: 0, apply, exceptions: [] });
    const lk = (apply: number | null) => normLocks({ open: { nsCreate: { on: true, rec: rec(apply), ranges: [] }, nsEdit: { on: true, rec: rec(null), ranges: [] } }, pastLock: { ns: { on: true, day: 27, min: 0, offset: 1 } } });
    const t = vn('2026-10-24T23:00:00').getTime();
    expect(openNsPeriods(lk(0), 'nsCreate', t)).toEqual(['2026-10']);
    expect(openNsPeriods(lk(1), 'nsCreate', t)).toEqual(['2026-11']);
    expect(openNsPeriods(lk(0), 'nsCreate', vn('2026-11-06T08:00:00').getTime())).toEqual([]);
    // Sửa NS «Mọi tháng»: mọi kỳ chưa khoá kỳ đã qua (09/2026 khoá từ 27/10)
    expect(openNsPeriods(lk(0), 'nsEdit', t)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(openNsPeriods(lk(0), 'nsEdit', vn('2026-10-27T08:00:00').getTime())).toEqual(['2026-10', '2026-11', '2026-12']);
    // Không cấu hình MỞ / khoá → không khoá (giống rules)
    expect(openNsPeriods(normLocks({}), 'nsCreate', t)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  });
});

const L = (p: Partial<NsLine>): NsLine => ({ id: 'x', period: '2026-11', kind: 'user', projectId: 'P1', amount: 0, ...p } as NsLine);

describe('budget', () => {
  const lines: NsLine[] = [
    L({ kind: 'user', teamId: 'T1', ownerUid: 'a', projectId: 'P1', amount: 10 }),
    L({ kind: 'user', teamId: 'T1', ownerUid: 'b', projectId: 'P1', amount: 5 }),
    L({ kind: 'user', teamId: 'T1', ownerUid: 'b', projectId: 'P2', amount: 7 }),
    L({ kind: 'gdkd', teamId: 'T1', projectId: 'P1', amount: 3 }),
    L({ kind: 'user', teamId: 'T2', ownerUid: 'c', projectId: 'P1', amount: 4 }),
    L({ kind: 'user', teamId: 'T2', ownerUid: 'd', projectId: 'P1', amount: 9, deleted: true }),
    L({ kind: 'gdk', blockId: 'B1', projectId: 'P1', amount: 100 }),
    L({ kind: 'user', teamId: 'T1', ownerUid: 'a', projectId: 'P1', amount: 99, period: '2026-12' }),
  ];
  it('NS Phòng = Σ user + bổ sung GĐKD', () => {
    const t = summarizeTeam(lines, '2026-11', 'T1');
    expect(t.total).toBe(25); expect(t.gdkd).toBe(3); expect(t.users).toBe(22);
    expect(t.rows.find((r) => r.projectId === 'P1')!.userCount).toBe(2);
  });
  it('NS Khối = Σ Phòng + bổ sung GĐK', () => {
    const b = summarizeBlock(lines, '2026-11', 'B1', ['T1', 'T2']);
    expect(b.phong).toBe(29); expect(b.gdk).toBe(100); expect(b.total).toBe(129);
    expect(b.rows.find((r) => r.projectId === 'P1')!.teams.size).toBe(2);
  });
  it('ids & user map', () => {
    expect(nsLineId('user', '2026-11', 'T1', 'P1', 'u')).toBe('u_2026-11_T1_P1_u');
    expect(nsLineId('gdkd', '2026-11', 'T1', 'P1')).toBe('p_2026-11_T1_P1');
    expect(nsLineId('gdk', '2026-11', 'B1', 'P1')).toBe('k_2026-11_B1_P1');
    expect(userNsByProject(lines, '2026-11', 'b').get('P2')).toBe(7);
  });
  it('quyền sửa', () => {
    const userLine = { kind: 'user' as const, teamId: 'T1', ownerUid: 'a' };
    expect(checkEdit({ uid: 'a', role: 'user', teamId: 'T1' }, userLine, { windowOpen: true, isNew: true }).ok).toBe(true);
    expect(checkEdit({ uid: 'a', role: 'user', teamId: 'T1' }, userLine, { windowOpen: false, isNew: false }).ok).toBe(false);
    expect(checkEdit({ uid: 'z', role: 'admin' }, userLine, { windowOpen: false, isNew: false }).ok).toBe(true);
    const g = checkEdit({ uid: 'g', role: 'gdkd', gdkdTeamIds: ['T1'] }, userLine, { windowOpen: true, isNew: false });
    expect(g).toMatchObject({ ok: true, needsReason: true, notifyOwner: true });
    expect(checkEdit({ uid: 'g', role: 'gdkd', gdkdTeamIds: ['T1'] }, userLine, { windowOpen: true, isNew: true }).ok).toBe(false);
    expect(checkEdit({ uid: 'g', role: 'gdkd', gdkdTeamIds: ['T2'] }, userLine, { windowOpen: true, isNew: false }).ok).toBe(false);
    expect(checkEdit({ uid: 'g2', role: 'gdkd', gdkdTeamIds: ['T1'] }, { kind: 'gdkd', teamId: 'T1' }, { windowOpen: true, isNew: true }).ok).toBe(false); // đã bỏ bổ sung GĐKD
    expect(checkEdit({ uid: 'k', role: 'gd_khoi', blockIds: ['B1'] }, { kind: 'gdkd', teamId: 'T1' }, { windowOpen: true, isNew: false }).ok).toBe(false);
    expect(checkEdit({ uid: 'k', role: 'gd_khoi', blockIds: ['B1'] }, { kind: 'gdk', blockId: 'B1' }, { windowOpen: true, isNew: true }).ok).toBe(false); // đã bỏ bổ sung GĐK
    expect(checkEdit({ uid: 'k', role: 'gd_khoi', blockIds: ['B1'] }, { kind: 'khoi', blockId: 'B1', ownerUid: 'k' }, { windowOpen: true, isNew: true }).ok).toBe(true);
    expect(checkEdit({ uid: 'k', role: 'gd_khoi', blockIds: ['B1'] }, { kind: 'khoi', blockId: 'B2', ownerUid: 'k' }, { windowOpen: true, isNew: true }).ok).toBe(false);
    expect(checkEdit({ uid: 'k', role: 'gd_khoi', blockIds: ['B1'] }, { kind: 'khoi', blockId: 'B1', ownerUid: 'k' }, { windowOpen: false, isNew: true }).ok).toBe(false);
    expect(checkEdit({ uid: 't', role: 'tro_ly_khoi', blockIds: ['B1'] }, { kind: 'khoi', blockId: 'B1', ownerUid: 't' }, { windowOpen: true, isNew: true }).ok).toBe(true); // Trợ lý Khối cũng Đăng ký MKT
    expect(checkEdit({ uid: 'z', role: 'admin' }, { kind: 'gdkd', teamId: 'T1' }, { windowOpen: true, isNew: true }).ok).toBe(false); // bỏ hẳn bổ sung, kể cả Admin
    expect(checkEdit({ uid: 'z', role: 'admin' }, { kind: 'gdk', blockId: 'B1' }, { windowOpen: true, isNew: false }).ok).toBe(false);
    expect(canRegisterAsUser('gd_khoi')).toBe(false); expect(canRegisterAsUser('mod')).toBe(false); expect(canRegisterAsUser('gdkd')).toBe(true);
  });
  it('team Ngừng hoạt động & nhiều GĐKD', () => {
    const ts = [{ id: 'T1', status: 'active' }, { id: 'T2', status: 'inactive' }, { id: 'T3' }];
    expect(visibleTeams(ts, 'user').map((t) => t.id)).toEqual(['T1', 'T3']);
    expect(visibleTeams(ts, 'admin').length).toBe(3);
    expect(visibleTeams(ts, 'mod').map((t) => t.id)).toEqual(['T1', 'T3']); // Mod cũng ẩn Phòng ngừng
    expect(gdkdTeamIdsFor('g2', 'gdkd', 'T9', [{ id: 'T1', gdkdUids: ['g1', 'g2'] }])).toEqual(['T9', 'T1']);
    expect(gdkdTeamIdsFor('g2', 'user', 'T9', [{ id: 'T1', gdkdUids: ['g2'] }])).toEqual([]);
  });
});

describe('weekly', () => {
  const ns = new Map([['P1', 100], ['P2', 50]]);
  const reps: WeeklyReport[] = [
    { period: '2026-11', dot: 1, uid: 'a', items: [{ projectId: 'P1', cumCost: 30, leads: 3, interested: 1, nsAtSubmit: 80 }, { projectId: 'P3', cumCost: 5, leads: 0, interested: 0 }], submittedAt: 'x' },
    { period: '2026-11', dot: 2, uid: 'a', items: [{ projectId: 'P1', cumCost: 120, leads: 10, interested: 2 }] },
  ];
  it('dự án có NS tự hiện; orphan (NS bị gỡ) mặc định bị bỏ — includeOrphans để audit', () => {
    const f = formProjects(ns, reps);
    expect(f.map((x) => x.projectId).sort()).toEqual(['P1', 'P2']);
    const orphans = formProjects(ns, reps, { includeOrphans: true });
    expect(orphans.map((x) => x.projectId).sort()).toEqual(['P1', 'P2', 'P3']);
    expect(orphans.find((x) => x.projectId === 'P3')!.noBudget).toBe(true);
    expect(formProjects(new Map(), []).length).toBe(0);
  });
  it('metrics luôn dùng NS hiện hành; freezeOnSubmit vẫn ghi nsAtSubmit để lịch sử', () => {
    const m = itemMetrics(reps[1].items[0], { liveNs: 100, prevCum: prevCum(reps, 2, 'P1'), submitted: false });
    expect(m).toMatchObject({ ns: 100, cum: 120, dotCost: 90, remaining: -20, pct: 120, over: true, cpl: 12 });
    const s = itemMetrics(reps[0].items[0], { liveNs: 100, prevCum: 0, submitted: true });
    expect(s.ns).toBe(100); // không còn giữ nsAtSubmit=80
    const s2 = itemMetrics(reps[0].items[0], { liveNs: 150, prevCum: 0, submitted: true });
    expect(s2).toMatchObject({ ns: 150, remaining: 120, pct: 20 });
    expect(validateItem({ projectId: 'P1', cumCost: 20, leads: 1, interested: 0 }, 30)).toMatch(/nhỏ hơn/);
    expect(validateItem({ projectId: 'P1', cumCost: 40, leads: 1, interested: 2 }, 30)).toMatch(/quan tâm/);
    expect(freezeOnSubmit([{ projectId: 'P2', cumCost: 1, leads: 0, interested: 0 }], ns)[0].nsAtSubmit).toBe(50);
  });
  it('rollup Khối → Phòng → User với Đã nộp/Chưa nộp', () => {
    const users = [{ uid: 'a', name: 'A', teamId: 'T1', blockId: 'B1' }, { uid: 'b', name: 'B', teamId: 'T1', blockId: 'B1' }, { uid: 'c', name: 'C', teamId: 'T2', blockId: 'B1' }];
    const nsByUser = new Map([['a', ns], ['b', new Map([['P1', 10]])]]);
    const r = rollup({ period: '2026-11', dot: 1, users, reports: reps, nsByUser });
    expect(r.total.expected).toBe(2); expect(r.total.submitted).toBe(1);
    expect(r.blocks[0].teams[0].users.find((u) => u.uid === 'b')!.submitted).toBe(false);
    // P3 orphan (không còn NS) bị bỏ → chỉ còn P1 cum=30
    expect(r.total.cum).toBe(30);
    expect(byProject(r.blocks).find((p) => p.projectId === 'P1')!.cum).toBe(30);
    expect(byProject(r.blocks).find((p) => p.projectId === 'P3')).toBeUndefined();
  });
});

describe('nghiệm thu report', () => {
  const recs = [
    { id: 'r1', month: '2026-11', teamId: 'T1', projectId: 'P1', projectName: 'Dự án 1', status: 'Đã nghiệm thu', caNhanFb: 100, caNhanZalo: 20, visaFb: 10, caNhanNopTien: 12 },
    { id: 'r2', month: '2026-11', teamId: 'T1', projectId: 'P1', projectName: 'Dự án 1', status: 'Đã nghiệm thu', dangTinCtyChuaVat: 50, caNhanNapTienQuaCty: 30, caNhanNopTien: 4 },
    { id: 'r3', month: '2026-11', teamId: 'T1', projectId: 'P2', status: 'Chưa nghiệm thu', digitalFb: 999 },
  ];
  it('chỉ Đã nghiệm thu; nhóm Công ty; lead cộng theo dự án', () => {
    const r = buildReport(recs, { month: '2026-11' });
    expect(r.records.length).toBe(2);
    expect(r.groups.map((g) => g.group)).toEqual(['caNhan', 'visa', 'congTy']);
    expect(r.groups.find((g) => g.group === 'congTy')!.cost).toBe(80);
    expect(r.projects[0]).toMatchObject({ projectId: 'P1', cost: 210, leads: 16 });
    expect(r.total.leads).toBe(16);
    expect(leadGroup(recs[0])).toBe('caNhan');
    expect(r.groups.find((g) => g.group === 'visa')!.projects[0].rows[0].leads).toBeNull();
  });
  it('slide ảnh: chưa có ảnh vẫn có 1 slide; 3 ảnh/slide', () => {
    const s = imageSlides([{ id: 'r1' }, { id: 'r2' }], [1, 2, 3, 4].map((i) => ({ acceptanceId: 'r1', order: i })));
    expect(s.length).toBe(3); expect(s[2]).toMatchObject({ recordId: 'r2', images: [] });
  });
  it('share link', () => {
    const now = new Date('2026-11-01T00:00:00Z');
    expect(shareLinkValid({ expiresAt: '2026-11-02T00:00:00Z' } as any, now).ok).toBe(true);
    expect(shareLinkValid({ expiresAt: '2026-10-02T00:00:00Z' } as any, now).ok).toBe(false);
    expect(shareLinkValid({ expiresAt: '2026-11-02T00:00:00Z', revokedAt: 'x' } as any, now).reason).toMatch(/thu hồi/);
    expect(clampShareDays(90)).toBe(30); expect(clampShareDays(0)).toBe(7); expect(clampShareDays(-3)).toBe(1);
    expect(newToken()).toHaveLength(32);
  });
});

import { resolveFirestoreDbId } from '../src/vnext/dbTarget';
describe('staging DB guard', () => {
  it('host lạ không bao giờ dùng DB thật', () => {
    expect(resolveFirestoreDbId('chiphi-mkt', 'chiphi.mayhomes.net')).toBe('chiphi-mkt');
    expect(resolveFirestoreDbId('chiphi-mkt', 'chiphimkt-v2-git-feat-v-next-x.vercel.app')).toBe('chiphi-mkt-staging');
    expect(resolveFirestoreDbId('chiphi-mkt', 'chiphimkt-v2-staging.vercel.app', 'chiphi-mkt')).toBe('chiphi-mkt-staging');
    expect(resolveFirestoreDbId('chiphi-mkt', 'chiphimkt-v2-staging.vercel.app', 'chiphi-mkt-staging')).toBe('chiphi-mkt-staging');
    expect(resolveFirestoreDbId('chiphi-mkt', 'localhost', 'chiphi-mkt-staging')).toBe('chiphi-mkt-staging');
  });
});

import { resolveTeamId } from '../src/vnext/ctx';
describe('resolveTeamId', () => {
  it('teamId hoặc teamName', () => {
    const ts = [{ id: 'T1', name: 'MAY05.19 - A', teamCode: 'MAY05.19' }];
    expect(resolveTeamId(ts, 'T1')).toBe('T1');
    expect(resolveTeamId(ts, '', 'MAY05.19  - A')).toBe('T1');
    expect(resolveTeamId(ts, '', 'may05.19')).toBe('T1');
    expect(resolveTeamId(ts, '', 'X')).toBe('');
  });
});

import { normalizeMonth } from '../lib/vnext/ntReport';
describe('normalizeMonth', () => {
  it('formats', () => {
    expect(normalizeMonth('2026-09')).toBe('2026-09');
    expect(normalizeMonth('09.2026')).toBe('2026-09');
    expect(normalizeMonth('Kì 1 - Tháng 8')).toBe('2026-08');
    expect(normalizeMonth('Kì 2 - Tháng 8')).toBe('2026-08');
  });
});


describe('buildReconcile NS ↔ NT', () => {
  const ns = [
    { kind: 'user', period: '2026-11', ownerUid: 'u1', ownerName: 'An', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 100 },
    { kind: 'user', period: '2026-11', ownerUid: 'u1', ownerName: 'An', teamId: 'T1', blockId: 'B1', projectId: 'P2', amount: 50 },
    { kind: 'gdkd', period: '2026-11', teamId: 'T1', projectId: 'P1', amount: 999 }, // không tính
  ];
  const acc = [
    { id: 'A1', status: 'Đã nghiệm thu', month: '2026-11', implementerUid: 'u1', implementerName: 'An', teamId: 'T1', blockId: 'B1', projectId: 'P1', projectName: 'Park', digitalFb: 40, visaFb: 10 },
    { id: 'A2', status: 'Đã nghiệm thu', month: '2026-11', implementerUid: 'u1', implementerName: 'An', teamId: 'T1', projectId: 'P2', projectName: 'Rivus', caNhanFb: 80 },
    { id: 'A3', status: 'Chưa', month: '2026-11', implementerUid: 'u1', projectId: 'P1', digitalFb: 999 },
  ];
  it('gom theo user×dự án, % và chênh', () => {
    const rows = buildReconcile(ns, acc, { month: '2026-11' });
    expect(rows).toHaveLength(2);
    const p1 = rows.find((r) => r.projectId === 'P1')!;
    expect(p1.ns).toBe(100); expect(p1.cost).toBe(50); expect(p1.diff).toBe(50); expect(p1.pct).toBe(50);
    const p2 = rows.find((r) => r.projectId === 'P2')!;
    expect(p2.ns).toBe(50); expect(p2.cost).toBe(80); expect(p2.diff).toBe(-30); expect(p2.pct).toBe(160);
  });
  it('recordCostBeforeVat', () => expect(recordCostBeforeVat({ digitalFb: 10, visaFb: 5, caNhanFb: 3 })).toBe(18));

  it('gồm cả đăng ký khoi của GĐ Khối (gắn theo blockId, không teamId), bỏ gdkd', () => {
    const ns2 = [
      { kind: 'khoi', period: '2026-11', ownerUid: 'g1', ownerName: 'GĐ Khối', blockId: 'B1', projectId: 'PK', amount: 200 },
      { kind: 'gdkd', period: '2026-11', teamId: 'T1', blockId: 'B1', projectId: 'PK', amount: 999 }, // không tính
    ];
    const acc2 = [
      { id: 'K1', status: 'Đã nghiệm thu', month: '2026-11', implementerUid: 'g1', implementerName: 'GĐ Khối', blockId: 'B1', projectId: 'PK', digitalFb: 120 },
    ];
    // Lọc theo Khối B1 → NS khoi + NT của GĐK khớp theo uid×dự án
    const rows = buildReconcile(ns2, acc2, { month: '2026-11', blockId: 'B1' });
    const pk = rows.find((r) => r.projectId === 'PK')!;
    expect(pk.ns).toBe(200); expect(pk.cost).toBe(120); expect(pk.blockId).toBe('B1');
  });
});

describe('Xoá Khối + ẩn Phòng Ngừng hoạt động', () => {
  const teams = [
    { id: 'T1', blockId: 'B1', status: 'active', teamCode: 'A1' },
    { id: 'T2', blockId: 'B1', status: 'inactive', teamCode: 'A2' },
    { id: 'T3', blockId: 'B2', status: 'inactive', teamCode: 'B1' },
  ];
  it('chỉ Admin', () => expect(canDeleteBlock('mod', { id: 'B2' }, teams).ok).toBe(false));
  it('chặn khi còn Phòng hoạt động', () => { const r = canDeleteBlock('admin', { id: 'B1' }, teams); expect(r.ok).toBe(false); expect(r.reason).toContain('A1'); });
  it('cho xoá khi chỉ còn Phòng ngừng', () => expect(canDeleteBlock('admin', { id: 'B2' }, teams).ok).toBe(true));
  it('user không thấy Phòng ngừng, admin thấy', () => {
    expect(visibleTeams(teams, 'user').map((t) => t.id)).toEqual(['T1']);
    expect(visibleTeams(teams, 'admin')).toHaveLength(3);
  });
});

import { ntImplementerRequired, cutoffInputValue, cutoffFromInput } from '../lib/vnext/ntCutoff';
describe('NT cutoff Người phụ trách', () => {
  it('chưa cấu hình → không bắt buộc', () => expect(ntImplementerRequired(undefined)).toBe(false));
  it('trước/sau mốc (giờ VN)', () => {
    const c = cutoffFromInput('2026-11-01')!;
    expect(ntImplementerRequired(c, new Date('2026-10-31T16:59:59Z'))).toBe(false);
    expect(ntImplementerRequired(c, new Date('2026-10-31T17:00:00Z'))).toBe(true);
    expect(ntImplementerRequired({ seconds: c.getTime() / 1000 }, new Date('2026-11-02T00:00:00Z'))).toBe(true);
    expect(cutoffInputValue(c)).toBe('2026-11-01');
  });
});

import { gdkdTeamIdsFor as _gt, checkEdit as _ce } from '../lib/vnext/budget';
import { canApprove as _ca } from '../lib/vnext/onboarding';
describe('GĐ Khối kiêm GĐKD', () => {
  const teams = [{ id: 'T1', gdkdUids: ['k1'] }, { id: 'T2', gdkdUids: ['old'] }, { id: 'T3', gdkdUids: [] }];
  it('gdkdTeamIdsFor: GĐK theo gdkdUids (+UID cũ), không theo teamId hồ sơ', () => {
    expect(_gt('k1', 'gd_khoi', 'T3', teams)).toEqual(['T1']);
    expect(_gt('k1', 'gd_khoi', '', teams, ['old']).sort()).toEqual(['T1', 'T2']);
    expect(_gt('x', 'gd_khoi', 'T3', teams)).toEqual([]);
    expect(_gt('g', 'gdkd', 'T3', teams, ['old']).sort()).toEqual(['T2', 'T3']);
  });
  it('checkEdit: GĐK kiêm sửa dòng bổ sung GĐKD của Phòng kiêm', () => {
    const a = { uid: 'k1', role: 'gd_khoi', teamId: '', gdkdTeamIds: ['T1'], blockIds: ['B9'] } as any;
    expect(_ce(a, { kind: 'gdkd', teamId: 'T1' } as any, { windowOpen: true, isNew: true }).ok).toBe(false); // đã bỏ bổ sung GĐKD
    expect(_ce(a, { kind: 'gdkd', teamId: 'T3' } as any, { windowOpen: true, isNew: true }).ok).toBe(false);
  });
  it('canApprove: GĐK kiêm duyệt NVKD Phòng kiêm dù Phòng có GĐKD', () => {
    const r: any = { uid: 'n', position: 'nvkd', teamId: 'T1', blockId: 'B1', status: 'pending', kind: 'onboarding' };
    expect(_ca({ uid: 'k1', role: 'gd_khoi', blockIds: ['B9'], gdkdTeamIds: ['T1'] }, r, { team: teams[0] }).ok).toBe(true);
    expect(_ca({ uid: 'k2', role: 'gd_khoi', blockIds: ['B9'], gdkdTeamIds: [] }, r, { team: teams[0] }).ok).toBe(false);
  });
});
