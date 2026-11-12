import { describe, expect, it } from 'vitest';
import { banApprovedBefore, banPendingKind, banReapprovalChange } from '../lib/vnext/banSupport';

// Ban duyệt 5 (01/11) → chủ sửa 5→7 (03/11) → GĐK duyệt lại 7 (05/11), banStatus pending.
const reapprovalLine: any = {
  id: 'l1', period: '2026-11', kind: 'user', projectId: 'P1', amount: 7,
  history: [{ action: 'update', from: 5, to: 7, byUid: 'u1', byName: 'Nguyễn A', at: '2026-11-03T00:00:00.000Z' }],
};
const reapprovalSup: any = {
  lineId: 'l1', period: '2026-11', projectId: 'P1', status: 'approved', amount: 7,
  decidedAt: '2026-11-05T00:00:00.000Z', banStatus: 'pending',
  history: [{ layer: 'ban', status: 'approved', amount: 5, at: '2026-11-01T00:00:00.000Z', byName: 'Trưởng Ban' }],
};

// Lần đầu chờ Ban: chưa từng Ban duyệt.
const firstLine: any = { id: 'l2', period: '2026-11', kind: 'user', projectId: 'P1', amount: 5, history: [] };
const firstSup: any = { lineId: 'l2', period: '2026-11', projectId: 'P1', status: 'approved', amount: 5, decidedAt: '2026-11-05T00:00:00.000Z', banStatus: 'pending', history: [] };

describe('ban reapproval helpers', () => {
  it('banApprovedBefore: có/không history ban approved', () => {
    expect(banApprovedBefore(reapprovalSup)).toBe(true);
    expect(banApprovedBefore(firstSup)).toBe(false);
    expect(banApprovedBefore(undefined)).toBe(false);
  });

  it('banPendingKind: reapproval vs first vs null', () => {
    expect(banPendingKind(reapprovalLine, reapprovalSup)).toBe('reapproval');
    expect(banPendingKind(firstLine, firstSup)).toBe('first');
    // không ở trạng thái chờ Ban → null
    expect(banPendingKind(reapprovalLine, { ...reapprovalSup, banStatus: 'approved' })).toBeNull();
  });

  it('banReapprovalChange: trước→sau + người sửa + thời gian', () => {
    const ch = banReapprovalChange(reapprovalLine, reapprovalSup);
    expect(ch).toEqual({ before: 5, after: 7, byUid: 'u1', byName: 'Nguyễn A', at: '2026-11-03T00:00:00.000Z' });
    expect(banReapprovalChange(firstLine, firstSup)).toBeNull();
  });
});
