import { describe, expect, it } from 'vitest';
import { filterNavForRole, isScreenAllowedForRole, redirectPathForRole, lockedScreenForRole, landingTabForRole, extraLockedScreenForRole } from '../src/lib/roleMenu';
import { lineFromSupport, mergeBanLines } from '../src/lib/banLinesFromSupport';
import { isBanKdDeputy } from '../src/lib/orgPermissions';

const NAV = [{ value: 'block-mgmt' }, { value: 'bankd-mgmt' }, { value: 'team-mgmt' }, { value: 'home' }];

describe('GĐK kiêm Phó Ban: menu / route', () => {
  it('gd_khoi + deputy → bankd-mgmt allowed, block-mgmt stays the landing screen', () => {
    expect(extraLockedScreenForRole('gd_khoi', true)?.tab).toBe('bankd-mgmt');
    expect(isScreenAllowedForRole('gd_khoi', 'bankd-mgmt', undefined, true)).toBe(true);
    expect(isScreenAllowedForRole('gd_khoi', 'block-mgmt', undefined, true)).toBe(true);
    expect(isScreenAllowedForRole('gd_khoi', 'home', undefined, true)).toBe(false);
    expect(redirectPathForRole('gd_khoi', '/quan-ly-ban-kd', true)).toBeNull();
    expect(redirectPathForRole('gd_khoi', '/quan-ly-ban-kd/x', true)).toBeNull();
    expect(redirectPathForRole('gd_khoi', '/trang-chu-khac', true)).toBe('/quan-ly-khoi');
    expect(filterNavForRole('gd_khoi', NAV, true).map((i) => i.value)).toEqual(['block-mgmt', 'bankd-mgmt']);
    expect(landingTabForRole('gd_khoi')).toBe('block-mgmt');
  });

  it('gd_khoi without deputy → unchanged (Ban screen blocked)', () => {
    expect(extraLockedScreenForRole('gd_khoi', false)).toBeNull();
    expect(isScreenAllowedForRole('gd_khoi', 'bankd-mgmt')).toBe(false);
    expect(redirectPathForRole('gd_khoi', '/quan-ly-ban-kd')).toBe('/quan-ly-khoi');
    expect(redirectPathForRole('gd_khoi', '/quan-ly-ban-kd', false)).toBe('/quan-ly-khoi');
    expect(filterNavForRole('gd_khoi', NAV).map((i) => i.value)).toEqual(['block-mgmt']);
  });

  it('other roles unaffected by the flag', () => {
    expect(extraLockedScreenForRole('tro_ly_khoi', true)).toBeNull();
    expect(isScreenAllowedForRole('tro_ly_khoi', 'bankd-mgmt', undefined, true)).toBe(false);
    expect(filterNavForRole('pho_ban_kd', NAV).map((i) => i.value)).toEqual(['bankd-mgmt']);
    expect(filterNavForRole('pho_ban_kd', NAV, true).map((i) => i.value)).toEqual(['bankd-mgmt']);
    expect(lockedScreenForRole('pho_ban_kd')?.tab).toBe('bankd-mgmt');
    expect(redirectPathForRole('pho_ban_kd', '/quan-ly-khoi', true)).toBe('/quan-ly-ban-kd');
    expect(filterNavForRole('admin', NAV, true)).toEqual(NAV);
    expect(redirectPathForRole('admin', '/anything', true)).toBeNull();
  });

  it('deputy match uses uid / profile id', () => {
    expect(isBanKdDeputy({ id: 'b', deputyUids: ['u1'] } as any, { uid: 'u1' } as any)).toBe(true);
    expect(isBanKdDeputy({ id: 'b', deputyUids: ['old'] } as any, { uid: 'u1' } as any, { id: 'old' } as any)).toBe(true);
    expect(isBanKdDeputy({ id: 'b', deputyUids: ['u2'] } as any, { uid: 'u1' } as any)).toBe(false);
  });
});

describe('nsSupport → Ban lines', () => {
  const sup = (o: any) => ({ id: o.id, lineId: o.id, period: '2026-12', ownerUid: 'o1', teamId: 't', blockId: 'kB', projectId: 'p1', amount: 100, status: 'approved', ...o });
  const own: any = { id: 'u_own', period: '2026-12', kind: 'user', blockId: 'kA', projectId: 'p1', amount: 50, history: [{ action: 'create' }] };

  it('synthesizes lines of other Khối from support docs', () => {
    const l = lineFromSupport(sup({ id: 'x1' }) as any, (u) => (u === 'o1' ? 'Nguyen A' : ''));
    expect(l).toMatchObject({ id: 'x1', kind: 'user', blockId: 'kB', projectId: 'p1', amount: 100, ownerUid: 'o1', ownerName: 'Nguyen A', period: '2026-12', teamId: 't' });
  });

  it('readable ns_lines win over support-built ones; filters by Ban projects and junk', () => {
    const out = mergeBanLines(
      [own],
      [sup({ id: 'u_own', amount: 999 }), sup({ id: 'x1' }), sup({ id: 'x2', projectId: 'other' }), sup({ id: 'x3', amount: 0 }), sup({ id: 'x4', period: '' })] as any,
      new Set(['p1']),
    );
    expect(out.map((l) => l.id)).toEqual(['u_own', 'x1']);
    expect(out[0]).toBe(own);
    expect(out[0].amount).toBe(50);
  });

  it('dedupes support docs and works without project filter', () => {
    const out = mergeBanLines([], [sup({ id: 'a' }), sup({ id: 'a' }), sup({ id: 'b', projectId: 'z' })] as any);
    expect(out.map((l) => l.id)).toEqual(['a', 'b']);
  });
});
