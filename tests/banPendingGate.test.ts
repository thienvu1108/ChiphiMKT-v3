import { describe, it, expect, beforeAll } from 'vitest';
import { setKhoiManagers, buildDecision } from '../lib/vnext/support';
import { BAN_APPROVAL_CUTOVER_ISO, effectiveBanStatus, buildBanDecision } from '../lib/vnext/banSupport';

/** Popup Trưởng Ban đếm pending + rejected — cùng effectiveBanStatus với panel. */
describe('Ban pending gate counts', () => {
  beforeAll(() => setKhoiManagers([{ id: 'B1', directorUid: 'gdk', assistantUids: [] }]));
  const L = { id: 'a', period: '2026-11', kind: 'user' as const, projectId: 'P1', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', amount: 10, deleted: false } as any;

  it('pending + rejected are the actionable statuses for the login popup', () => {
    const pending = buildDecision(L, null, { uid: 'gdk', name: 'G' }, 'approved', '', '2026-11-01T00:00:00Z');
    expect(effectiveBanStatus(L, pending)).toBe('pending');
    const rej = buildBanDecision(L, pending, { uid: 'tb', name: 'TB' }, 'rejected', 'x', '2026-11-02T00:00:00Z');
    expect(effectiveBanStatus(L, rej as any)).toBe('rejected');
    const gf = { status: 'approved' as const, amount: 10, decidedAt: '2026-10-20T00:00:00Z' };
    expect(gf.decidedAt <= BAN_APPROVAL_CUTOVER_ISO).toBe(true);
    expect(effectiveBanStatus(L, gf)).toBe('approved');
  });
});
