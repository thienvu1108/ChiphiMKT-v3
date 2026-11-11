import { describe, expect, it } from 'vitest';
import {
  authUidOf, planSetDeputy, planUnsetDeputy, planLeaderSync, planClearLeadership, banRoleOf,
  planDeputyRoleSync, planClearDeputyship, roleAfterSetDeputy, roleAfterUnsetDeputy,
} from '../src/lib/banRoleSync';

const ban = { id: 'b1', name: 'BAN 1', code: 'B1', deputyUids: [] as string[], memberUids: [] as string[] };
const u = { id: 'doc1', uid: 'auth1', email: 'a@x.com', fullName: 'An', role: 'user', assignedBanKds: [] as string[] };

describe('banRoleSync', () => {
  it('authUidOf prefers uid', () => {
    expect(authUidOf(u)).toBe('auth1');
    expect(authUidOf({ id: 'only' })).toBe('only');
  });

  it('planSetDeputy writes auth uid + assignedBanKds; keeps role', () => {
    const plan = planSetDeputy(ban, u);
    expect(plan.banUpdate.data.deputyUids).toEqual(['auth1']);
    expect(plan.userUpdate?.assignedBanKds).toContain('b1');
    expect(plan.needsUserWrite).toBe(true);
  });

  it('planSetDeputy replaces stale doc-id alias with auth uid', () => {
    const plan = planSetDeputy({ ...ban, deputyUids: ['doc1'] }, u);
    expect(plan.banUpdate.data.deputyUids).toEqual(['auth1']);
  });

  it('planUnsetDeputy drops assigned only when not member/leader', () => {
    const asDep = { ...u, assignedBanKds: ['b1'], assignedBanKd: 'b1' };
    const plan = planUnsetDeputy({ ...ban, deputyUids: ['auth1'] }, asDep);
    expect(plan.banUpdate.data.deputyUids).toEqual([]);
    expect(plan.userUpdate?.assignedBanKds).toEqual([]);
    expect(plan.needsUserWrite).toBe(true);

    const alsoMember = planUnsetDeputy(
      { ...ban, deputyUids: ['auth1'], memberUids: ['auth1'] },
      asDep,
    );
    expect(alsoMember.userUpdate).toBeNull();
    expect(alsoMember.needsUserWrite).toBe(false);
  });

  it('planLeaderSync: GĐK keeps role; others → truong_ban_kd; exclusive 1 Ban', () => {
    const gdk = planLeaderSync({ ...u, role: 'gd_khoi', assignedBanKds: ['other'] }, ban, [ban]);
    expect(gdk.keepGdKhoi).toBe(true);
    expect(gdk.userUpdate.role).toBe('gd_khoi');
    expect(gdk.userUpdate.assignedBanKds).toEqual(['b1']);
    expect(gdk.banUpdates[0].data.leaderUid).toBe('auth1');

    const normal = planLeaderSync(u, ban, [ban]);
    expect(normal.keepGdKhoi).toBe(false);
    expect(normal.userUpdate.role).toBe('truong_ban_kd');
    expect(normal.userUpdate.assignedBanKds).toEqual(['b1']);
  });

  it('planClearLeadership clears every Ban the user leads', () => {
    const bans = [
      { id: 'b1', name: 'A', leaderUid: 'auth1' },
      { id: 'b2', name: 'B', leaderEmail: 'a@x.com' },
      { id: 'b3', name: 'C', leaderUid: 'other' },
    ];
    const plan = planClearLeadership(u, bans);
    expect(plan.clearedBanIds.sort()).toEqual(['b1', 'b2']);
  });

  it('banRoleOf ranks Trưởng > Phó > Thành viên', () => {
    expect(banRoleOf({ ...ban, leaderUid: 'auth1' }, u)).toBe('truong_ban');
    expect(banRoleOf({ ...ban, deputyUids: ['auth1'] }, u)).toBe('pho_ban');
    expect(banRoleOf({ ...ban, memberUids: ['auth1'] }, u)).toBe('thanh_vien');
    expect(banRoleOf(ban, { ...u, assignedBanKds: ['b1'] })).toBe('thanh_vien');
    expect(banRoleOf(ban, u)).toBeNull();
  });
});

describe('pho_ban_kd role sync', () => {
  it('planDeputyRoleSync sets pho_ban_kd + deputyUids', () => {
    const plan = planDeputyRoleSync(u, ban);
    expect(plan.userUpdate.role).toBe('pho_ban_kd');
    expect(plan.banUpdate.data.deputyUids).toEqual(['auth1']);
    expect(plan.keepExistingRole).toBe(false);
  });
  it('planDeputyRoleSync keeps gd_khoi', () => {
    const plan = planDeputyRoleSync({ ...u, role: 'gd_khoi' }, ban);
    expect(plan.userUpdate.role).toBe('gd_khoi');
    expect(plan.keepExistingRole).toBe(true);
  });
  it('planClearDeputyship clears deputyUids', () => {
    const bans = [
      { id: 'b1', name: 'A', deputyUids: ['auth1'] },
      { id: 'b2', name: 'B', deputyUids: ['other'] },
    ];
    const plan = planClearDeputyship({ ...u, role: 'pho_ban_kd', assignedBanKds: ['b1'] }, bans);
    expect(plan.clearedBanIds).toEqual(['b1']);
    expect(plan.banUpdates[0].data.deputyUids).toEqual([]);
  });
  it('roleAfterSetDeputy / UnsetDeputy', () => {
    expect(roleAfterSetDeputy(u)).toBe('pho_ban_kd');
    expect(roleAfterSetDeputy({ ...u, role: 'admin' })).toBeNull();
    expect(roleAfterUnsetDeputy({ ...u, role: 'pho_ban_kd' }, [{ id: 'b1', deputyUids: ['auth1'] }], 'b1')).toBe('user');
    expect(roleAfterUnsetDeputy({ ...u, role: 'pho_ban_kd' }, [
      { id: 'b1', deputyUids: ['auth1'] },
      { id: 'b2', deputyUids: ['auth1'] },
    ], 'b1')).toBeNull();
  });
});

describe('exclusive one Ban (t341u)', () => {
  const b2 = { id: 'b2', name: 'BAN 2', code: 'B2', deputyUids: ['auth1'] as string[], memberUids: [] as string[], leaderUid: '' };
  const bLead = { id: 'b3', name: 'BAN 3', code: 'B3', deputyUids: [] as string[], leaderUid: 'auth1', leaderEmail: 'a@x.com' };

  it('planLeaderSync clears other Trưởng + Phó; warnLines', () => {
    const plan = planLeaderSync(
      { ...u, role: 'user', assignedBanKds: ['b2', 'b3'] },
      ban,
      [ban, b2, bLead],
    );
    expect(plan.userUpdate.assignedBanKds).toEqual(['b1']);
    expect(plan.deputyClears.map((x) => x.id)).toContain('b2');
    expect(plan.warnLines.some((l) => l.includes('BAN 2'))).toBe(true);
    expect(plan.warnLines.some((l) => l.includes('BAN 3'))).toBe(true);
  });

  it('planDeputyRoleSync exclusive: clears other Phó + Trưởng; assigned = [ban]', () => {
    const plan = planDeputyRoleSync(
      { ...u, role: 'user', assignedBanKds: ['b2', 'b3'] },
      ban,
      [ban, b2, bLead],
    );
    expect(plan.userUpdate.role).toBe('pho_ban_kd');
    expect(plan.userUpdate.assignedBanKds).toEqual(['b1']);
    expect(plan.sideBanUpdates.map((x) => x.id).sort()).toEqual(['b2', 'b3']);
    expect(plan.warnLines.length).toBeGreaterThanOrEqual(2);
  });

  it('planDeputyRoleSync throws if already Trưởng of target Ban', () => {
    expect(() => planDeputyRoleSync(u, { ...ban, leaderUid: 'auth1' }, [ban])).toThrow(/Trưởng/);
  });

  it('cannot be both: leader sync strips Phó on same Ban', () => {
    const withPho = { ...ban, deputyUids: ['auth1'] };
    const plan = planLeaderSync(u, withPho, [withPho]);
    expect(plan.deputyClears.some((x) => x.id === 'b1')).toBe(true);
  });
});
