import { describe, it, expect, beforeAll } from 'vitest';
import { setKhoiManagers, buildDecision, effectiveStatus } from '../lib/vnext/support';
import { effectiveBanStatus, buildBanDecision, weeklyPendingBadge, WEEKLY_REQUIRES_BAN_APPROVAL } from '../lib/vnext/banSupport';
import '../lib/vnext/weekly';

/** Logic đếm popup GĐK = pending + reapproval + Ban rejected (gộp GdkBanReturnGate). */
describe('GĐK pending login popup counts', () => {
  beforeAll(() => setKhoiManagers([{ id: 'B1', directorUid: 'gdk', assistantUids: ['tlk'] }]));
  const L = { id: 'a', period: '2026-11', kind: 'user' as const, projectId: 'P1', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', amount: 10, deleted: false } as any;

  it('pending / reapproval / Ban rejected are actionable; approved Ban is not', () => {
    expect(WEEKLY_REQUIRES_BAN_APPROVAL).toBe(false);
    expect(effectiveStatus(L, undefined)).toBe('pending');
    expect(weeklyPendingBadge(L, undefined)).toBe('khoi');

    const appr = buildDecision(L, null, { uid: 'gdk', name: 'G' }, 'approved', '', '2026-11-01T00:00:00Z');
    expect(effectiveBanStatus(L, appr)).toBe('pending');
    expect(weeklyPendingBadge(L, appr)).toBe('ban');

    const banOk = buildBanDecision(L, appr, { uid: 'tb', name: 'TB' }, 'approved', '', '2026-11-02T00:00:00Z');
    expect(weeklyPendingBadge(L, banOk as any)).toBe(null);

    const rej = buildBanDecision(L, appr, { uid: 'tb', name: 'TB' }, 'rejected', 'Sai', '2026-11-03T00:00:00Z');
    expect(effectiveBanStatus(L, rej as any)).toBe('rejected');
    expect(weeklyPendingBadge(L, rej as any)).toBe(null); // rejected → không badge (và không reportable)

    const edited = { ...L, amount: 12, history: [{ at: '2026-11-04T00:00:00Z', action: 'update', byUid: 'u1', byName: 'U', from: 10, to: 12 }] };
    expect(effectiveStatus(edited as any, banOk as any)).toBe('reapproval');
    expect(weeklyPendingBadge(edited as any, banOk as any)).toBe('khoi');
  });
});

describe('BanPendingGate statuses unchanged', () => {
  beforeAll(() => setKhoiManagers([{ id: 'B1', directorUid: 'gdk', assistantUids: [] }]));
  const L = { id: 'a', period: '2026-11', kind: 'user' as const, projectId: 'P1', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', amount: 10, deleted: false } as any;

  it('Trưởng Ban vẫn thấy pending + rejected mỗi phiên (sessionStorage dismiss riêng)', () => {
    const pending = buildDecision(L, null, { uid: 'gdk', name: 'G' }, 'approved', '', '2026-11-01T00:00:00Z');
    expect(effectiveBanStatus(L, pending)).toBe('pending');
    const rej = buildBanDecision(L, pending, { uid: 'tb', name: 'TB' }, 'rejected', 'x', '2026-11-02T00:00:00Z');
    expect(effectiveBanStatus(L, rej as any)).toBe('rejected');
    // SS_KEY BanPendingGate = vn-ban-pending-gate-dismissed — khác SS_KEY GĐK
    expect('vn-ban-pending-gate-dismissed').not.toBe('vn-gdk-ban-return-dismissed');
  });
});
