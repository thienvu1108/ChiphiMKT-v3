import { describe, it, expect } from 'vitest';
import { banApproverRole, deputyBlocked, splitWritable, approverLog } from '../src/lib/banApprover';
describe('banApproverRole', () => {
  it('leader first', () => expect(banApproverRole({ isLeader: true, isDeputy: true, isAdminLike: true })).toBe('leader'));
  it('admin over deputy', () => expect(banApproverRole({ isLeader: false, isDeputy: true, isAdminLike: true })).toBe('admin'));
  it('deputy', () => expect(banApproverRole({ isLeader: false, isDeputy: true, isAdminLike: false })).toBe('deputy'));
  it('none', () => expect(banApproverRole({ isLeader: false, isDeputy: false, isAdminLike: false })).toBeNull());
});
describe('priority', () => {
  it('deputy blocked by leader decision', () => { expect(deputyBlocked('deputy', { banDecidedRole: 'leader' })).toBe(true); expect(deputyBlocked('deputy', { banDecidedRole: 'deputy' })).toBe(false); expect(deputyBlocked('leader', { banDecidedRole: 'leader' })).toBe(false); expect(deputyBlocked('deputy', null)).toBe(false); });
  it('splitWritable', () => {
    const r = splitWritable([{ id: 1, r: 'leader' }, { id: 2, r: '' }, { id: 3, r: 'deputy' }], 'deputy', (x) => ({ banDecidedRole: x.r }));
    expect(r.writable.map((x) => x.id)).toEqual([2, 3]); expect(r.blocked.map((x) => x.id)).toEqual([1]);
  });
});
describe('approverLog', () => {
  it('maps + sorts newest first', () => {
    const l = approverLog([
      { at: '2026-11-01', byName: 'GĐK A', status: 'approved' },
      { at: '2026-11-03', byName: 'PB', byRole: 'deputy', status: 'rejected', reason: 'Thiếu' },
      { at: '2026-11-02', byName: 'X', status: 'approved', reason: 'Ban: Chờ → Duyệt' },
    ]);
    expect(l.map((x) => x.role)).toEqual(['Phó Ban', 'Ban', 'GĐK/Trợ lý']);
    expect(l[0]).toMatchObject({ who: 'PB', action: 'Từ chối', reason: 'Thiếu' });
  });
  it('empty', () => expect(approverLog(undefined)).toEqual([]));
});
