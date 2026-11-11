import { describe, it, expect } from 'vitest';
import { validateKyc, normalizeKyc, isKycComplete, maskTail, canSeeOthersKyc } from '../lib/vnext/kyc';
import { buildDecision, effectiveStatus, filterRows, supportable } from '../lib/vnext/support';
describe('kyc', () => {
  it('validate', () => {
    expect(validateKyc({ cccd: '001099012345', bankAccount: '0123456', bankName: 'ACB', accountHolder: 'Trần Thị B' })).toEqual({});
    expect(Object.keys(validateKyc({ cccd: '001099012345', bankAccount: '0123456', bankName: 'ACB' }))).toEqual(['accountHolder']);
    expect(Object.keys(validateKyc({ cccd: '123', bankAccount: '1', bankName: '' })).sort()).toEqual(['accountHolder', 'bankAccount', 'bankName', 'cccd']);
    expect(normalizeKyc({ cccd: '001 099 012 345', bankAccount: '01-23', bankName: '  MB   Bank ', accountHolder: ' nguyễn  văn đức ' })).toEqual({ cccd: '001099012345', bankAccount: '0123', bankName: 'MB Bank', accountHolder: 'NGUYỄN VĂN ĐỨC' });
    expect(isKycComplete(null)).toBe(false);
    expect(maskTail('0123456789')).toBe('••••••6789');
  });
  it('GĐKD không xem', () => { expect(canSeeOthersKyc('gdkd')).toBe(false); expect(canSeeOthersKyc('gd_khoi')).toBe(true); expect(canSeeOthersKyc('mod')).toBe(false); });
});
describe('support', () => {
  const L: any = { id: 'u_1', kind: 'user', period: '2026-11', teamId: 'T', blockId: 'B', projectId: 'P', ownerUid: 'u', amount: 100 };
  it('decision + effective', () => {
    const d = buildDecision(L, null, { uid: 'g', name: 'G' }, 'approved', '', 'at');
    expect(d).toMatchObject({ lineId: 'u_1', blockId: 'B', amount: 100, status: 'approved', decidedBy: 'g' });
    expect(d.history).toHaveLength(1);
    expect(effectiveStatus(L, d)).toBe('approved');
    expect(effectiveStatus({ ...L, amount: 200 }, d)).toBe('reapproval');
    expect(effectiveStatus(L, null)).toBe('pending');
    expect(supportable({ ...L, deleted: true })).toBe(false);
    expect(supportable({ ...L, kind: 'khoi' })).toBe(true);
    expect(supportable({ ...L, kind: 'khoi', amount: 0 })).toBe(false);
    expect(supportable({ ...L, kind: 'gdkd' } as any)).toBe(false);
    expect(effectiveStatus({ ...L, kind: 'khoi' }, null)).toBe('approved');
    expect(effectiveStatus({ ...L, kind: 'khoi' }, { status: 'rejected', amount: L.amount } as any)).toBe('rejected');
    expect(effectiveStatus({ ...L, kind: 'khoi' }, { status: 'pending' } as any)).toBe('pending');
  });
  it('filter', () => {
    const rows = [{ line: L, status: 'approved' as const }, { line: { ...L, teamId: 'X' }, status: 'pending' as const }];
    expect(filterRows(rows, { teamId: 'X' })).toHaveLength(1);
    expect(filterRows(rows, { status: 'approved' })).toHaveLength(1);
    expect(filterRows(rows, {})).toHaveLength(2);
  });
});
