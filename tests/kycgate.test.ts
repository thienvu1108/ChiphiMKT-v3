import { describe, it, expect } from 'vitest';
import { effectiveStatus, splitByStatus } from '../lib/vnext/support';
import { hasPayInfo } from '../lib/vnext/kyc';
const L = (id: string, kind: any, owner: string, amount: number): any => ({ id, kind, ownerUid: owner, amount, period: '2026-11', projectId: 'P' });
const S = (st: string, amount: number): any => ({ status: st, amount, decidedAt: '2026-10-20T00:00:00Z' });
describe('Chờ cập nhật TT thanh toán', () => {
  it('đã duyệt / tự duyệt / chờ duyệt mà thiếu STK → need_pay; từ chối giữ nguyên', () => {
    expect(effectiveStatus(L('a', 'user', 'u', 5), S('approved', 5), false)).toBe('need_pay');
    expect(effectiveStatus(L('a', 'khoi', 'g', 5), undefined, false)).toBe('need_pay');
    expect(effectiveStatus(L('a', 'user', 'u', 5), undefined, false)).toBe('need_pay');
    expect(effectiveStatus(L('a', 'user', 'u', 5), S('rejected', 5), false)).toBe('rejected');
  });
  it('có STK lại → NS Khối tự duyệt, NS thường theo quyết định', () => {
    expect(effectiveStatus(L('a', 'khoi', 'g', 5), undefined, true)).toBe('approved');
    expect(effectiveStatus(L('a', 'user', 'u', 5), undefined, true)).toBe('pending');
    expect(effectiveStatus(L('a', 'user', 'u', 5), S('approved', 5))).toBe('approved');
  });
  it('5 ô: Chờ STK là ô riêng, tổng không đổi', () => {
    const lines = [L('1', 'user', 'u', 10), L('2', 'khoi', 'g', 20), L('3', 'user', 'v', 30)];
    const sp = splitByStatus(lines, { '1': S('approved', 10), '3': S('approved', 30) }, { u: { has: false }, g: { has: false }, v: { has: true } });
    expect(sp.approved.amount).toBe(30); expect(sp.pending.amount).toBe(0); expect(sp.need_pay).toEqual({ n: 2, amount: 30 }); expect(sp.total).toBe(60);
  });
  it('duyệt trước khi có STK → có STK sau đó: NS thường về Chưa được duyệt, NS Khối tự duyệt', () => {
    expect(effectiveStatus(L('a', 'user', 'u', 5), S('approved', 5), { has: true, since: '2026-10-23T00:00:00Z' })).toBe('pending');
    expect(effectiveStatus(L('a', 'user', 'u', 5), S('approved', 5), { has: true, since: '' })).toBe('approved');
    expect(effectiveStatus(L('a', 'user', 'u', 5), S('approved', 5), { has: true, since: '2026-10-01T00:00:00Z' })).toBe('approved');
    expect(effectiveStatus(L('a', 'khoi', 'g', 5), undefined, { has: true, since: '2026-10-23T00:00:00Z' })).toBe('approved');
  });
  it('hasPayInfo', () => {
    expect(hasPayInfo(null)).toBe(false); expect(hasPayInfo({ bankAccount: '0123456' })).toBe(true); expect(hasPayInfo({ bankAccount: '' })).toBe(false);
  });
});
