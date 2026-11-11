/** Duyệt lại khi sửa khoản đã duyệt · tách 4 trạng thái · lịch sử bản đăng ký. */
import { describe, expect, it } from 'vitest';
import { buildDecision, effectiveStatus, splitByStatus, diffLine, buildHist, timeline, filterRows, lastEditAt } from '../lib/vnext/support';

const L: any = { id: 'u_2026-11_T1_P1_u1', period: '2026-11', kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', ownerUid: 'u1', amount: 100,
  history: [{ at: '2026-11-01T01:00:00Z', byUid: 'u1', byName: 'U1', byRole: 'user', action: 'create', from: 0, to: 100 }] };
const appr = buildDecision(L, null, { uid: 'gdk', name: 'GĐK' }, 'approved', '', '2026-11-02T01:00:00Z');
const edit = (l: any, at: string, to: number) => ({ ...l, amount: to, history: [...l.history, { at, byUid: 'u1', byName: 'U1', byRole: 'user', action: 'update', from: l.amount, to }] });

describe('Cần duyệt lại', () => {
  it('đã duyệt, chưa sửa → approved', () => expect(effectiveStatus(L, appr)).toBe('approved'));
  it('sửa số tiền sau khi duyệt → reapproval', () => expect(effectiveStatus(edit(L, '2026-11-03T00:00:00Z', 200), appr)).toBe('reapproval'));
  it('lưu lại cùng số tiền sau khi duyệt vẫn → reapproval (sửa gì cũng duyệt lại)', () => expect(effectiveStatus(edit(L, '2026-11-03T00:00:00Z', 100), appr)).toBe('reapproval'));
  it('sửa TRƯỚC khi duyệt → vẫn approved', () => { const l = edit(L, '2026-11-01T05:00:00Z', 100); expect(effectiveStatus(l, buildDecision(l, null, { uid: 'gdk', name: 'g' }, 'approved', '', '2026-11-02T00:00:00Z'))).toBe('approved'); });
  it('duyệt lại sau khi sửa → approved', () => { const l = edit(L, '2026-11-03T00:00:00Z', 200); expect(effectiveStatus(l, buildDecision(l, appr, { uid: 'gdk', name: 'g' }, 'approved', '', '2026-11-04T00:00:00Z'))).toBe('approved'); });
  it('bị từ chối rồi sửa → pending (nộp lại)', () => { const r = buildDecision(L, null, { uid: 'gdk', name: 'g' }, 'rejected', 'Thiếu', '2026-11-02T00:00:00Z'); expect(effectiveStatus(L, r)).toBe('rejected'); expect(effectiveStatus(edit(L, '2026-11-03T00:00:00Z', 50), r)).toBe('pending'); });
  it('NS Khối bị Đặt lại → Chờ duyệt; duyệt lại → Đã duyệt', () => {
    const K = { ...L, kind: 'khoi' };
    const reset = buildDecision(K, null, { uid: 'gdk', name: 'GĐK' }, 'pending', '', '2026-11-03T00:00:00Z');
    expect(effectiveStatus(K, reset)).toBe('pending');
    expect(effectiveStatus(K, buildDecision(K, reset, { uid: 'gdk', name: 'GĐK' }, 'approved'))).toBe('approved');
    expect(effectiveStatus(edit(K, '2026-11-09T00:00:00Z', 9), buildDecision(K, reset, { uid: 'gdk', name: 'GĐK' }, 'rejected', 'Sai', '2026-11-04T00:00:00Z'))).toBe('pending');
  });
  it('NS Khối luôn tự duyệt kể cả khi sửa', () => expect(effectiveStatus(edit({ ...L, kind: 'khoi' }, '2026-11-09T00:00:00Z', 9), appr)).toBe('approved'));
  it('bản ghi cũ không có history: chỉ so số tiền', () => { const l = { ...L, history: undefined }; expect(effectiveStatus(l, appr)).toBe('approved'); expect(effectiveStatus({ ...l, amount: 1 }, appr)).toBe('reapproval'); });
  it('lastEditAt lấy mốc mới nhất', () => expect(lastEditAt(edit(L, '2026-11-05T00:00:00Z', 3))).toBe('2026-11-05T00:00:00Z'));
  it("lọc 'todo' = chờ + duyệt lại", () => {
    const rows = [{ line: L, status: 'pending' as const }, { line: L, status: 'reapproval' as const }, { line: L, status: 'approved' as const }];
    expect(filterRows(rows, { status: 'todo' })).toHaveLength(2);
    expect(filterRows(rows, { status: 'reapproval' })).toHaveLength(1);
  });
});

describe('Tách 4 trạng thái', () => {
  it('tổng = đã duyệt + chờ + duyệt lại + từ chối; bỏ dòng xoá / 0đ / bổ sung cũ', () => {
    const a = { ...L, id: 'a', amount: 10 }, b = { ...L, id: 'b', amount: 20 }, c = edit({ ...L, id: 'c', amount: 30 }, '2026-11-09T00:00:00Z', 35), d = { ...L, id: 'd', amount: 40 }, k = { ...L, id: 'k', kind: 'khoi', amount: 5 };
    const sup: any = { a: buildDecision(a, null, { uid: 'g', name: 'g' }, 'approved', '', '2026-11-02T00:00:00Z'), c: buildDecision({ ...c, amount: 30 }, null, { uid: 'g', name: 'g' }, 'approved', '', '2026-11-02T00:00:00Z'), d: buildDecision(d, null, { uid: 'g', name: 'g' }, 'rejected', 'xx', '2026-11-02T00:00:00Z') };
    const s = splitByStatus([a, b, c, d, k, { ...L, id: 'x', deleted: true }, { ...L, id: 'z', amount: 0 }, { ...L, id: 'g', kind: 'gdk', amount: 99 }], sup);
    expect(s.approved).toEqual({ n: 2, amount: 15 });
    expect(s.pending).toEqual({ n: 1, amount: 20 });
    expect(s.reapproval).toEqual({ n: 1, amount: 35 });
    expect(s.rejected).toEqual({ n: 1, amount: 40 });
    expect(s.total).toBe(110);
  });
});

describe('Lịch sử', () => {
  it('diffLine: tạo mới / sửa số tiền / xoá', () => {
    expect(diffLine(null, { amount: 5 })).toEqual([{ field: 'amount', from: '0', to: '5' }]);
    expect(diffLine({ amount: 5, projectId: 'P1' }, { amount: 7, projectId: 'P1' })).toEqual([{ field: 'amount', from: '5', to: '7' }]);
    expect(diffLine({ amount: 5 }, { amount: 5 })).toEqual([]);
    expect(diffLine({ amount: 5 }, { amount: 0, deleted: true }).map((x) => x.field)).toEqual(['amount', 'deleted']);
  });
  it('buildHist khớp định danh dòng', () => {
    const h = buildHist(L, { uid: 'u1', name: 'U1', role: 'user' }, 'update', [{ field: 'amount', from: '1', to: '2' }], { at: 't' });
    expect(h).toMatchObject({ lineId: L.id, period: '2026-11', kind: 'user', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', projectId: 'P1', action: 'update', byUid: 'u1', at: 't' });
    expect('reason' in h).toBe(false);
  });
  it('timeline gộp lịch sử cũ (trước nsLineHistory) + mới, mới nhất trước', () => {
    const t = timeline(edit(L, '2026-11-03T00:00:00Z', 200), appr, [buildHist(L, { uid: 'gdk', name: 'GĐK', role: 'gd_khoi' }, 'approved', [], { at: '2026-11-04T00:00:00Z' })]);
    expect(t.map((x) => x.action)).toEqual(['approved', 'update', 'approved', 'create']);
    expect(t[1].changes).toEqual([{ field: 'amount', from: '100', to: '200' }]);
    expect(t[3].legacy).toBe(true);
  });
});

import { accountsOf, defaultAccount, accountForLine, snapOf, validateAccounts } from '../lib/vnext/kyc';
import { policyOf } from '../lib/vnext/supportPct';
describe('Nhiều tài khoản nhận tiền', () => {
  const old: any = { uid: 'u', cccd: '001099012345', bankAccount: '0123456789', bankName: 'ACB', accountHolder: 'A' };
  it('dữ liệu cũ 1 TK = mặc định a1', () => { expect(accountsOf(old)).toEqual([{ id: 'a1', bankName: 'ACB', bankAccount: '0123456789', accountHolder: 'A' }]); expect(defaultAccount(old)?.id).toBe('a1'); });
  it('chọn theo snapshot trên dòng; không có snapshot → mặc định', () => {
    const k: any = { ...old, accounts: [{ id: 'a1', bankName: 'ACB', bankAccount: '0123456789', accountHolder: 'A' }, { id: 'a2', bankName: 'MB', bankAccount: '55667788', accountHolder: 'A' }], defaultAccountId: 'a2' };
    expect(defaultAccount(k)?.id).toBe('a2');
    expect(accountForLine(k, null)?.id).toBe('a2');
    expect(accountForLine(k, snapOf(k.accounts[0]))?.id).toBe('a1');
    expect(snapOf(k.accounts[1])).toEqual({ id: 'a2', bankName: 'MB', tail: '7788' });
  });
  it('đổi tài khoản trên dòng = có thay đổi (→ duyệt lại)', () => {
    expect(diffLine({ amount: 5, payAccount: { id: 'a1', bankName: 'ACB', tail: '6789' } } as any, { amount: 5, payAccount: { id: 'a2', bankName: 'MB', tail: '7788' } } as any).map((x) => x.field)).toEqual(['payAccount']);
  });
  it('validateAccounts: tối đa 3, không trùng', () => {
    const a = (id: string, n: string) => ({ id, bankName: 'ACB', bankAccount: n, accountHolder: 'A B' });
    expect(validateAccounts([a('a1', '123456')])).toBe('');
    expect(validateAccounts([a('a1', '123456'), a('a2', '123456')])).toMatch(/trùng/);
    expect(validateAccounts([a('a1', '1234561'), a('a2', '1234562'), a('a3', '1234563'), a('a4', '1234564')])).toMatch(/Tối đa/);
  });
});
describe('Chính sách hỗ trợ dự án', () => {
  it('tỉ lệ cũ = Base; Ban mặc định khi dự án chưa đặt', () => {
    const bans = [{ id: 'B', name: 'Ban', supportPct: 20 }];
    expect(policyOf({ supportPct: 30, banKdId: 'B' }, bans)).toMatchObject({ base: 30, baseSource: 'project', bonus: null, cdt: '' });
    expect(policyOf({ banKdId: 'B', supportBonusPct: 5, supportCdt: 'dai_ly', supportMaxPerSale: 1000, supportBonusCond: 'x' }, bans)).toEqual({ base: 20, baseSource: 'ban', bonus: 5, bonusCond: 'x', bonusTiers: [{ pct: 5, amount: null, minUnits: null, cond: 'x' }], maxPerSale: 1000, maxSource: 'project', cdt: 'dai_ly' });
  });
});
