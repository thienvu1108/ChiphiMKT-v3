import { describe, it, expect } from 'vitest';
import { isNsLinePaid, nsLineId, type NsLine } from '../lib/vnext/budget';
import {
  canSaManageNs, reasonOk, deleteConfirmOk, stripUndefined, amountBeforeDelete, planProjectChange, isSaCreated,
  willNeedReapproval, mergeWeeklyItems, weeklyRemoval, buildDeleteAudit, buildSaWriteAudit, buildRestoreAudit, latestSoftDeleteAudit,
} from '../lib/vnext/nsAdmin';
import { ntNoNsRegistration } from '../lib/vnext/ntBudgetProjects';

const line: NsLine = { id: 'u_2026-11_t1_p1_uid1', period: '2026-11', kind: 'user', teamId: 't1', projectId: 'p1', ownerUid: 'uid1', amount: 5000000 };
const actor = { uid: 'sa1', email: 'Admin@X.com', name: 'SA', role: 'super_admin' };

describe('isNsLinePaid', () => {
  it('false mặc định', () => { expect(isNsLinePaid(line)).toBe(false); expect(isNsLinePaid(line, {})).toBe(false); expect(isNsLinePaid(null, null)).toBe(false); });
  it('true theo line / support', () => {
    expect(isNsLinePaid({ ...line, paid: true })).toBe(true);
    expect(isNsLinePaid({ ...line, paidAt: '2026-11-02' })).toBe(true);
    expect(isNsLinePaid(line, { paid: true })).toBe(true);
    expect(isNsLinePaid(line, { paidAt: 'x' })).toBe(true);
    expect(isNsLinePaid(line, { payoutStatus: 'paid' })).toBe(true);
    expect(isNsLinePaid(line, { payoutStatus: 'pending' })).toBe(false);
  });
});

describe('quyền hiển thị', () => {
  it('chỉ super_admin', () => {
    expect(canSaManageNs('super_admin')).toBe(true);
    for (const r of ['admin', 'mod', 'gdkd', 'gd_khoi', 'user', '', undefined]) expect(canSaManageNs(r)).toBe(false);
  });
});

describe('xác nhận', () => {
  it('lý do ≥ 3 ký tự', () => { expect(reasonOk('ab')).toBe(false); expect(reasonOk('  ab ')).toBe(false); expect(reasonOk('abc')).toBe(true); expect(reasonOk(undefined)).toBe(false); });
  it('gõ XOA', () => { expect(deleteConfirmOk('XOA')).toBe(true); expect(deleteConfirmOk(' XOA ')).toBe(true); expect(deleteConfirmOk('xoa')).toBe(false); expect(deleteConfirmOk('')).toBe(false); });
});

describe('amountBeforeDelete', () => {
  it('lấy from của delete cuối', () => {
    const l: any = { history: [{ action: 'create', from: 0, to: 10 }, { action: 'delete', from: 10, to: 0 }, { action: 'restore', from: 0, to: 10 }, { action: 'update', from: 10, to: 20 }, { action: 'delete', from: 20, to: 0 }] };
    expect(amountBeforeDelete(l)).toBe(20);
  });
  it('không có delete → 0', () => { expect(amountBeforeDelete({ history: [] })).toBe(0); expect(amountBeforeDelete(null)).toBe(0); });
});

describe('đổi dự án', () => {
  it('id mới cùng owner/period/team', () => {
    const p = planProjectChange(line, 'p2');
    expect(p.changed).toBe(true);
    expect(p.newId).toBe(nsLineId('user', '2026-11', 't1', 'p2', 'uid1'));
    expect(p.newId).toBe('u_2026-11_t1_p2_uid1');
  });
  it('không đổi → giữ id', () => { expect(planProjectChange(line, 'p1')).toEqual({ changed: false, newId: line.id }); expect(planProjectChange(line, '').changed).toBe(false); });
});

describe('isSaCreated', () => {
  it('createdByRole hoặc history[0]', () => {
    expect(isSaCreated({ createdByRole: 'super_admin' })).toBe(true);
    expect(isSaCreated({ history: [{ at: '', byUid: '', byName: '', byRole: 'super_admin', action: 'create', from: 0, to: 1 }] })).toBe(true);
    expect(isSaCreated({ history: [{ at: '', byUid: '', byName: '', byRole: 'user', action: 'create', from: 0, to: 1 }] })).toBe(false);
    expect(isSaCreated(null)).toBe(false);
  });
});

describe('willNeedReapproval', () => {
  it('chỉ khi approved và đổi tiền/dự án', () => {
    const b = { amount: 1, projectId: 'a' };
    expect(willNeedReapproval('approved', b, { amount: 2, projectId: 'a' })).toBe(true);
    expect(willNeedReapproval('approved', b, { amount: 1, projectId: 'b' })).toBe(true);
    expect(willNeedReapproval('approved', b, { ...b })).toBe(false);
    expect(willNeedReapproval('pending', b, { amount: 2, projectId: 'a' })).toBe(false);
  });
});

describe('weekly', () => {
  it('weeklyRemoval tách theo dự án', () => {
    const r = weeklyRemoval([{ projectId: 'p1', x: 1 }, { projectId: 'p2' }], 'p1');
    expect(r.removed).toEqual([{ projectId: 'p1', x: 1 }]); expect(r.remaining).toEqual([{ projectId: 'p2' }]);
  });
  it('mergeWeeklyItems không trùng (so khớp JSON)', () => {
    const cur = [{ projectId: 'p1', a: 1 }];
    const m = mergeWeeklyItems(cur, [{ projectId: 'p1', a: 1 }, { projectId: 'p1', a: 2 }]);
    expect(m.added).toBe(1); expect(m.items).toHaveLength(2);
    expect(cur).toHaveLength(1);
    expect(mergeWeeklyItems(undefined, undefined)).toEqual({ items: [], added: 0 });
  });
});

describe('stripUndefined', () => {
  it('bỏ undefined đệ quy', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: [1, undefined, { f: undefined, g: 2 }] } })).toEqual({ a: 1, c: { e: [1, { g: 2 }] } });
  });
  it('giữ null và Date', () => { const d = new Date(); const o: any = stripUndefined({ n: null, d }); expect(o.n).toBeNull(); expect(o.d).toBe(d); });
});

describe('audit payload', () => {
  const base = { line: { ...line, history: [{ at: 'a', byUid: 'u', byName: 'n', byRole: 'user', action: 'create' as const, from: 0, to: 5 }] }, reason: ' dọn dữ liệu ', actor, weekly: [{ docId: 'w1', removedItems: [{ projectId: 'p1' }] }], impact: { ntCount: 2, supportStatus: 'approved' }, at: '2026-11-27T00:00:00.000Z' };
  it('xoá mềm', () => {
    const a = buildDeleteAudit({ ...base, hard: false });
    expect(a.action).toBe('NS_LINE_SOFT_DELETE'); expect(a.collection).toBe('ns_lines'); expect(a.targetId).toBe(line.id);
    expect(a.userId).toBe('sa1'); expect(a.userEmail).toBe('admin@x.com'); expect(a.role).toBe('super_admin'); expect(a.reason).toBe('dọn dữ liệu');
    expect(a.snapshot.line.history).toHaveLength(1); expect(a.weeklySnapshot).toEqual([{ docId: 'w1', removedItems: [{ projectId: 'p1' }] }]);
    expect(a.impact).toEqual({ ntCount: 2, supportStatus: 'approved' });
  });
  it('xoá hẳn + bỏ userEmail rỗng + không có undefined', () => {
    const a = buildDeleteAudit({ ...base, hard: true, actor: { ...actor, email: '' }, line: { ...line, ownerName: undefined } as any });
    expect(a.action).toBe('NS_LINE_HARD_DELETE'); expect('userEmail' in a).toBe(false);
    expect(JSON.stringify(a)).not.toContain('undefined'); expect('ownerName' in a.snapshot.line).toBe(false);
  });
  it('SA create / update', () => {
    const c = buildSaWriteAudit({ create: true, lineId: 'x', reason: 'abc', actor, before: null, after: { amount: 1, projectId: 'p' } });
    expect(c.action).toBe('NS_LINE_SA_CREATE'); expect(c.before).toBeNull();
    const u = buildSaWriteAudit({ create: false, lineId: 'x', reason: 'abc', actor, before: { amount: 1, projectId: 'p' }, after: { amount: 2, projectId: 'q' }, extra: { movedFrom: undefined } });
    expect(u.action).toBe('NS_LINE_SA_UPDATE'); expect(u.after.projectId).toBe('q'); expect('movedFrom' in u).toBe(false);
  });
  it('restore', () => { const r = buildRestoreAudit({ lineId: 'x', amount: 9, weeklyRestored: null, actor }); expect(r.action).toBe('NS_LINE_RESTORE'); expect(r.after).toEqual({ amount: 9 }); expect(r.weeklyRestored).toBeNull(); });
  it('latestSoftDeleteAudit lấy bản mới nhất', () => {
    const l = latestSoftDeleteAudit([{ action: 'NS_LINE_SOFT_DELETE', at: '1' }, { action: 'NS_LINE_HARD_DELETE', at: '9' }, { action: 'NS_LINE_SOFT_DELETE', at: '5' }]);
    expect(l?.at).toBe('5'); expect(latestSoftDeleteAudit([])).toBeNull();
  });
});

describe('ntNoNsRegistration', () => {
  const row = { month: '2026-11', implementerUid: 'u1', projectId: 'p1' };
  it('cờ khi dự án không còn trong choices', () => {
    expect(ntNoNsRegistration(row, [], true)).toBe(true);
    expect(ntNoNsRegistration(row, [{ projectId: 'p2', lineIds: [] }], true)).toBe(true);
    expect(ntNoNsRegistration(row, [{ projectId: 'p1', lineIds: [] }], true)).toBe(false);
  });
  it('không cờ: chưa tải / nháp / kỳ cũ / thủ công / không người phụ trách', () => {
    expect(ntNoNsRegistration(row, [], false)).toBe(false);
    expect(ntNoNsRegistration({ ...row, isDraft: true }, [], true)).toBe(false);
    expect(ntNoNsRegistration({ ...row, month: '2026-10' }, null, true)).toBe(false);
    expect(ntNoNsRegistration({ ...row, implementerManual: true }, [], true)).toBe(false);
    expect(ntNoNsRegistration({ ...row, implementerUid: '' }, [], true)).toBe(false);
  });
});
