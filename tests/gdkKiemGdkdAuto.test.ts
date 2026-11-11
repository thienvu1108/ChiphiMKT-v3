import { describe, it, expect, beforeEach } from 'vitest';
import { setKhoiManagers, isAutoApproved, effectiveStatus, splitByStatus } from '../lib/vnext/support';

const L = (o: any) => ({ id: 'x', period: '2026-11', projectId: 'p', amount: 20_000_000, deleted: false, ...o });
describe('GĐK / Trợ lý Khối kiêm GĐKD → NS tự duyệt', () => {
  beforeEach(() => setKhoiManagers([{ id: 'B1', directorUid: 'gdk', assistantUids: ['tl'] }, { id: 'B2', directorUid: 'other' }]));
  it('dòng user của GĐK thuộc Khối mình → tự duyệt', () => {
    const l = L({ kind: 'user', teamId: 'T1', blockId: 'B1', ownerUid: 'gdk' });
    expect(isAutoApproved(l as any)).toBe(true);
    expect(effectiveStatus(l as any, undefined, { has: true })).toBe('approved');
  });
  it('Trợ lý Khối kiêm GĐKD → tự duyệt', () => expect(isAutoApproved(L({ kind: 'user', blockId: 'B1', ownerUid: 'tl' }) as any)).toBe(true));
  it('GĐK đăng ký ở Khối khác → vẫn chờ duyệt', () => expect(effectiveStatus(L({ kind: 'user', blockId: 'B2', ownerUid: 'gdk' }) as any, undefined, { has: true })).toBe('pending'));
  it('NVKD / GĐKD thường → chờ duyệt', () => expect(isAutoApproved(L({ kind: 'user', blockId: 'B1', ownerUid: 'nv' }) as any)).toBe(false));
  it('kind khoi vẫn tự duyệt; chưa STK → Chờ STK; bị từ chối → Từ chối', () => {
    expect(isAutoApproved(L({ kind: 'khoi', blockId: 'B9', ownerUid: 'z' }) as any)).toBe(true);
    const l = L({ kind: 'user', blockId: 'B1', ownerUid: 'gdk' });
    expect(effectiveStatus(l as any, undefined, { has: false })).toBe('need_pay');
    expect(effectiveStatus(l as any, { status: 'rejected', amount: l.amount, decidedAt: '2026-10-28' } as any, { has: true })).toBe('rejected');
  });
  it('splitByStatus đếm vào Đã duyệt', () => {
    const s = splitByStatus([L({ id: 'a', kind: 'user', blockId: 'B1', ownerUid: 'gdk' }), L({ id: 'b', kind: 'user', blockId: 'B1', ownerUid: 'nv' })] as any, {}, { gdk: { has: true }, nv: { has: true } });
    expect(s.approved.n).toBe(1); expect(s.pending.n).toBe(1);
  });
});
