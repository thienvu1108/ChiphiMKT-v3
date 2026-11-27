import { describe, it, expect } from 'vitest';
import { ntManualAllowed, manualAttributionPatch } from '../lib/vnext/ntManual';
import {
  rowSupplementFor, noBudgetAvailable, rowNoBudget, validateNoBudgetReason, noBudgetPatch, noBudgetAssigneeOptions,
  activeProjects, noBudgetManualDuplicate, isNoBudgetRecord, noBudgetReasonText, noBudgetSameKy, suppTargetOk,
} from '../lib/vnext/ntNoBudget';
import { acceptanceChoicesFor, ntScopeMonth, projectAllowedForAcceptance } from '../lib/vnext/ntBudgetProjects';
import { ntCountsInTotals, suppKeySuffix } from '../lib/vnext/ntSupplement';
import { splitNoBudget, buildReport, buildReconcile } from '../lib/vnext/ntReport';

describe('Kỳ gốc của nghiệm thu bổ sung', () => {
  it('lọc theo kỳ gốc cho cả bản nháp và bản đã lưu', () => {
    const row = { month: '2026-11', teamId: 'T1', implementerUid: 'u1' };
    expect(ntScopeMonth(row)).toBe('2026-11');
    expect(ntScopeMonth({ ...row, supplement: true })).toBe('2026-10');
    expect(ntScopeMonth({ ...row, supplement: '2026-09' })).toBe('2026-09');
    const saved = { ...row, supplementFor: '2026-10' };
    expect(ntScopeMonth(saved)).toBe('2026-10');
    expect(acceptanceChoicesFor(row, [], undefined)).toEqual([]);
    expect(acceptanceChoicesFor(saved, [], undefined)).toBeNull();
    expect(acceptanceChoicesFor({ ...row, supplement: '2026-10' }, [], undefined)).toBeNull();
  });

  it('chỉ cho bổ sung cùng kỳ từ T11 khi không có đăng ký NS', () => {
    expect(noBudgetSameKy('11.2026', '2026-11')).toBe(true);
    expect(noBudgetSameKy('2026-10', '2026-10')).toBe(false);
    expect(noBudgetSameKy('2026-12', '2026-11')).toBe(false);
    expect(suppTargetOk('2026-11', '2026-11', true)).toBe(true);
    expect(suppTargetOk('2026-11', '2026-11', false)).toBe(false);
    expect(suppTargetOk('2026-10', '2026-10', true)).toBe(false);
    expect(suppTargetOk('2026-11', '2026-12', true)).toBe(false);
    expect(suppTargetOk('2026-11', '2025-11', false)).toBe(true);
    expect(suppTargetOk('2026-11', '2025-10', true)).toBe(false);
  });

  it('giữ hậu tố khoá và chỉ tính bản bổ sung cùng kỳ khi đã duyệt', () => {
    const row = { month: '2026-11', supplementFor: '2026-11', supplementIn: '2026-11', ntNoBudget: true };
    expect(suppKeySuffix(row)).toBe('_bs');
    expect(ntCountsInTotals({ ...row, supplementStatus: 'pending' })).toBe(false);
    expect(ntCountsInTotals({ ...row, supplementStatus: 'rejected' })).toBe(false);
    expect(ntCountsInTotals({ ...row, supplementStatus: 'approved' })).toBe(true);
  });
});

describe('ntManualAllowed / manualAttributionPatch mở rộng', () => {
  it('giữ hành vi cũ khi không truyền opts', () => {
    expect(ntManualAllowed('2026-10')).toBe(true);
    expect(ntManualAllowed('2026-12')).toBe(false);
    expect(ntManualAllowed('2026-12', {})).toBe(false);
    expect(ntManualAllowed('2026-12', { supplementFor: '2026-11' })).toBe(false); // thiếu cờ noBudget
  });
  it('noBudget + supplementFor ≥ 2026-11 → cho phép', () => {
    expect(ntManualAllowed('2026-12', { supplementFor: '2026-11', noBudget: true })).toBe(true);
    expect(ntManualAllowed('12.2026', { supplementFor: '11.2026', noBudget: true })).toBe(true);
    expect(ntManualAllowed('2027-01', { supplementFor: '2026-12', noBudget: true })).toBe(true);
  });
  it('noBudget nhưng kỳ gốc < 2026-11 hoặc rỗng → không', () => {
    expect(ntManualAllowed('2026-12', { supplementFor: '2026-10', noBudget: true })).toBe(false);
    expect(ntManualAllowed('2026-12', { supplementFor: '', noBudget: true })).toBe(false);
    expect(ntManualAllowed('2026-12', { noBudget: true })).toBe(false);
  });
  it('manualAttributionPatch: kỳ 10 → ntMonth 2026-10; bổ sung → ntMonth = month', () => {
    expect(manualAttributionPatch('10.2026', 'A', {}).ntMonth).toBe('2026-10');
    const p = manualAttributionPatch('2026-12', ' Nguyễn  B ', { email: 'm@x' }, { supplementFor: '2026-11', noBudget: true });
    expect(p).toMatchObject({ implementerUid: '', implementerName: 'Nguyễn B', implementerManual: true, ntMonth: '2026-12' });
    expect(() => manualAttributionPatch('2026-12', 'A', {})).toThrow();
    expect(() => manualAttributionPatch('2026-12', 'A', {}, { supplementFor: '2026-10', noBudget: true })).toThrow();
    expect(() => manualAttributionPatch('2026-12', ' ', {}, { supplementFor: '2026-11', noBudget: true })).toThrow();
  });
});

describe('ntNoBudget: công tắc & lý do', () => {
  it('rowSupplementFor / noBudgetAvailable / rowNoBudget', () => {
    expect(rowSupplementFor({ month: '2026-12', supplement: true })).toBe('2026-11');
    expect(rowSupplementFor({ month: '2026-12', supplement: '2026-10' })).toBe('2026-10');
    expect(rowSupplementFor({ month: '2026-12', supplement: false })).toBe('');
    expect(rowSupplementFor({ supplementFor: '2026-11', month: '2026-11' })).toBe('2026-11');
    expect(noBudgetAvailable('2026-11')).toBe(true);
    expect(noBudgetAvailable('2026-10')).toBe(false);
    expect(noBudgetAvailable('')).toBe(false);
    expect(rowNoBudget({ ntNoBudget: true, month: '2026-12', supplement: true })).toBe(true);
    expect(rowNoBudget({ ntNoBudget: true, month: '2026-12', supplement: '2026-10' })).toBe(false);
    expect(rowNoBudget({ ntNoBudget: true, month: '2026-12' })).toBe(false); // bản thường: không đổi gì
    expect(rowNoBudget({ ntNoBudget: false, month: '2026-12', supplement: true })).toBe(false);
  });
  it('validate lý do ≥ 3 ký tự', () => {
    expect(validateNoBudgetReason('')).toBeTruthy();
    expect(validateNoBudgetReason('  ab ')).toBeTruthy();
    expect(validateNoBudgetReason('abc')).toBeNull();
    expect(validateNoBudgetReason('x'.repeat(501))).toBeTruthy();
  });
  it('noBudgetPatch', () => {
    const p = noBudgetPatch('  Phát sinh  gấp ', { email: 'm@x.com', uid: 'u' }, '2026-12-01T00:00:00.000Z');
    expect(p).toEqual({ ntNoBudget: true, ntNoBudgetReason: 'Phát sinh gấp', ntNoBudgetBy: 'm@x.com', ntNoBudgetAt: '2026-12-01T00:00:00.000Z' });
    expect(noBudgetPatch('abc', { uid: 'u1' }).ntNoBudgetBy).toBe('u1');
    expect(() => noBudgetPatch('a')).toThrow();
  });
  it('isNoBudgetRecord / reason text chỉ cho bản bổ sung', () => {
    expect(isNoBudgetRecord({ ntNoBudget: true, supplementFor: '2026-11', ntNoBudgetReason: 'lý do' })).toBe(true);
    expect(isNoBudgetRecord({ ntNoBudget: true })).toBe(false);
    expect(noBudgetReasonText({ ntNoBudget: true, supplementFor: '2026-11', ntNoBudgetReason: 'lý do' })).toBe('lý do');
    expect(noBudgetReasonText({ ntNoBudgetReason: 'x' })).toBe('');
  });
});

describe('ntNoBudget: danh sách Người phụ trách / Dự án', () => {
  const users = [
    { uid: 'a', fullName: 'An', teamId: 'T1', role: 'user' },
    { uid: 'b', fullName: 'Bình', teamId: 'T2', role: 'user' },
    { uid: 'c', fullName: 'Cường', teamId: 'T1', role: 'user', disabled: true },
    { uid: 'd', fullName: 'Dũng', teamId: 'T1', role: 'user', vnOnboarding: { status: 'pending' } },
    { uid: 'g', fullName: 'Giang', teamId: 'T9', role: 'gdkd' },
    { uid: 'e', fullName: 'Em', role: 'user', status: 'inactive' },
  ];
  it('nhóm Phòng trước (gồm gdkdUids), sau đó toàn hệ thống; loại user không active', () => {
    const o = noBudgetAssigneeOptions(users, 'T1', { gdkdUids: ['g'] });
    expect(o.map((x) => x.uid)).toEqual(['a', 'g', 'b']);
    expect(o.filter((x) => x.group === 'team').map((x) => x.uid)).toEqual(['a', 'g']);
    expect(o[0].groupLabel).toBe('Thành viên Phòng (không cần đăng ký)');
    expect(o[2].groupLabel).toBe('Toàn hệ thống');
  });
  it('không có Phòng → mọi người ở nhóm toàn hệ thống', () => {
    expect(noBudgetAssigneeOptions(users, '').every((x) => x.group === 'all')).toBe(true);
  });
  it('acceptanceChoicesFor = null (không lọc dự án) khi noBudget; bản thường vẫn lọc', () => {
    const lines: any[] = [];
    const nb = acceptanceChoicesFor({ month: '2026-12', teamId: 'T1', implementerUid: 'a', ntNoBudget: true, supplement: true }, lines, {}, []);
    expect(nb).toBeNull();
    expect(projectAllowedForAcceptance(nb, 'ANY')).toBe(true);
    const normal = acceptanceChoicesFor({ month: '2026-12', teamId: 'T1', implementerUid: 'a', supplement: true }, lines, {}, []);
    expect(normal).toEqual([]);
    expect(projectAllowedForAcceptance(normal, 'ANY')).toBe(false);
    const saved = acceptanceChoicesFor({ month: '2026-12', teamId: 'T1', implementerUid: 'a', ntNoBudget: true, supplementFor: '2026-11' }, lines, {}, []);
    expect(saved).toBeNull();
  });
  it('activeProjects loại dự án ngừng / xoá', () => {
    const ps = [{ id: 1 }, { id: 2, status: 'inactive' }, { id: 3, deleted: true }, { id: 4, isActive: false }, { id: 5, status: 'active' }];
    expect(activeProjects(ps as any).map((p: any) => p.id)).toEqual([1, 5]);
  });
});

describe('ntNoBudget: trùng người phụ trách tự nhập', () => {
  const all = [
    { id: 'r1', implementerManual: true, implementerUid: '', implementerName: 'Nguyễn Văn A', projectId: 'P1', supplementFor: '2026-11', supplementStatus: 'pending' },
    { id: 'r2', implementerManual: true, implementerUid: '', implementerName: 'Trần B', projectId: 'P1', supplementFor: '2026-11', supplementStatus: 'rejected' },
  ];
  it('cùng tên (không phân biệt hoa/thường, khoảng trắng) + dự án + kỳ → trùng', () => {
    expect(noBudgetManualDuplicate(all, '', { name: ' nguyễn  văn a ', projectId: 'P1', supplementFor: '2026-11' })?.id).toBe('r1');
  });
  it('khác dự án / kỳ / bản bị từ chối / chính nó → không trùng', () => {
    expect(noBudgetManualDuplicate(all, '', { name: 'Nguyễn Văn A', projectId: 'P2', supplementFor: '2026-11' })).toBeNull();
    expect(noBudgetManualDuplicate(all, '', { name: 'Nguyễn Văn A', projectId: 'P1', supplementFor: '2026-12' })).toBeNull();
    expect(noBudgetManualDuplicate(all, '', { name: 'Trần B', projectId: 'P1', supplementFor: '2026-11' })).toBeNull();
    expect(noBudgetManualDuplicate(all, 'r1', { name: 'Nguyễn Văn A', projectId: 'P1', supplementFor: '2026-11' })).toBeNull();
  });
});

describe('splitNoBudget & báo cáo', () => {
  const rec = (id: string, extra: any = {}) => ({ id, month: '2026-11', status: 'Đã nghiệm thu', projectId: 'P1', teamId: 'T1', caNhanFb: 1000, ...extra });
  const supp = (id: string, extra: any = {}) => rec(id, { supplementFor: '2026-11', supplementStatus: 'approved', ...extra });
  it('tách số ngoài ĐK NS, vẫn nằm trong tổng; chưa duyệt không tính', () => {
    const recs = [
      rec('a'),
      supp('b', { ntNoBudget: true, ntNoBudgetReason: 'x lý do', caNhanFb: 3000 }),
      supp('c', { ntNoBudget: true, ntNoBudgetReason: 'chưa duyệt', supplementStatus: 'pending', caNhanFb: 9000 }),
      supp('d', { caNhanFb: 500 }),
    ];
    const s = splitNoBudget(recs);
    expect(s.total.records).toBe(3);
    expect(s.total.cost).toBe(4500);
    expect(s.noBudget).toMatchObject({ records: 1, cost: 3000 });
    const rep = buildReport(recs, { month: '2026-11' });
    expect(rep.total.cost).toBe(4500);
    expect(rep.noBudget.cost).toBe(3000);
  });
  it('rỗng', () => {
    expect(splitNoBudget([]).noBudget).toMatchObject({ records: 0, cost: 0, withVat: 0 });
  });
  it('đối chiếu NS–NT: bản tự nhập ngoài ĐK NS có NS = 0, theo manualKey + dự án', () => {
    const recs = [
      supp('m1', { implementerManual: true, implementerUid: '', implementerName: 'Nguyễn A', ntNoBudget: true, ntNoBudgetReason: 'lý do', caNhanFb: 2000 }),
      supp('m2', { implementerManual: true, implementerUid: '', implementerName: 'nguyễn a', ntNoBudget: true, ntNoBudgetReason: 'lý do', caNhanFb: 1000 }),
    ];
    const rows = buildReconcile([], recs, { month: '2026-11' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ manual: true, ns: 0, cost: 3000, records: 2 });
  });
});
