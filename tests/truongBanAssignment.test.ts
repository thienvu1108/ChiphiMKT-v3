import { describe, expect, it } from 'vitest';
import { planTruongBanAssignment, userLeadsBan } from '../src/lib/truongBanAssignment';

const bans = [
  { id: 'b1', name: 'BAN KD 1', leaderEmail: 'vicam@mayhomes.vn', leaderName: 'Vi Cầm' },
  { id: 'b2', name: 'BAN KD 2', leaderEmail: 'Tran@Example.com', leaderUid: '' },
  { id: 'b3', name: 'BAN KD 3', leaderUid: 'u-tran' },
  { id: 'b4', name: 'BAN KD 4', leaderId: 'legacy-uid', leaderName: 'Cũ' },
];
const tran = { id: 'doc-tran', uid: 'u-tran', email: 'tran@example.com', fullName: 'Trần Mạnh Trường' };

describe('planTruongBanAssignment (admin: role + Ban leader in one batch)', () => {
  it('sets role + Ban scope on the user and the leader on the Ban', () => {
    const plan = planTruongBanAssignment(tran, bans[0], bans);
    expect(plan.userUpdate).toEqual({ role: 'truong_ban_kd', assignedBanKd: 'b1', assignedBanKds: ['b1'] });
    expect(plan.banUpdates[0]).toEqual({ id: 'b1', data: { leaderUid: 'u-tran', leaderEmail: 'tran@example.com', leaderName: 'Trần Mạnh Trường' } });
    expect(plan.replacedLeader).toBe('vicam@mayhomes.vn');
  });
  it('clears leadership on the other Bans this user led (one Ban per Trưởng ban KD)', () => {
    const plan = planTruongBanAssignment(tran, bans[0], bans);
    expect(plan.banUpdates.slice(1).map((u) => u.id).sort()).toEqual(['b2', 'b3']);
    expect(plan.banUpdates.find((u) => u.id === 'b2')!.data).toEqual({ leaderUid: '', leaderEmail: '', leaderName: '' });
    expect(plan.clearedBans.sort()).toEqual(['BAN KD 2', 'BAN KD 3']);
  });
  it('re-assigning to a Ban already led keeps it and reports no replaced leader', () => {
    const plan = planTruongBanAssignment(tran, bans[2], bans);
    expect(plan.replacedLeader).toBeNull();
    expect(plan.banUpdates.map((u) => u.id).sort()).toEqual(['b2', 'b3']);
  });
  it('drops a legacy leaderId of the previous leader', () => {
    const plan = planTruongBanAssignment(tran, bans[3], bans);
    expect(plan.banUpdates[0].data.leaderId).toBe('');
    expect(plan.replacedLeader).toBe('Cũ');
  });
  it('pre-provisioning: leaderUid empty, matched by email', () => {
    const plan = planTruongBanAssignment({ id: 'ProvDoc', email: 'New@X.com', fullName: '' }, bans[0], bans, { leaderUid: '' });
    expect(plan.banUpdates[0].data).toEqual({ leaderUid: '', leaderEmail: 'new@x.com', leaderName: 'new@x.com' });
  });
  it('userLeadsBan matches uid, doc id or email (case-insensitive)', () => {
    expect(userLeadsBan(bans[1], tran)).toBe(true);
    expect(userLeadsBan(bans[2], tran)).toBe(true);
    expect(userLeadsBan({ id: 'x', leaderUid: 'doc-tran' }, tran)).toBe(true);
    expect(userLeadsBan(bans[0], tran)).toBe(false);
  });
});
