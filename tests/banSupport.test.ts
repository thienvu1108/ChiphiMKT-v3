import { describe, it, expect, beforeAll } from 'vitest';
import { setKhoiManagers, buildDecision, isNsReportableLine, type Support } from '../lib/vnext/support';
import {
  BAN_APPROVAL_CUTOVER_ISO, WEEKLY_REQUIRES_BAN_APPROVAL, effectiveBanStatus,
  isBanApprovedForWeekly, buildBanDecision, banReasonText,
} from '../lib/vnext/banSupport';
import '../lib/vnext/weekly'; // registers weekly ban gate

describe('Ban NS approve layer', () => {
  beforeAll(() => setKhoiManagers([{ id: 'B1', directorUid: 'gdk', assistantUids: ['tlk'] }]));
  const L = { id: 'a', period: '2026-11', kind: 'user' as const, projectId: 'P1', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', amount: 10, deleted: false } as any;
  const K = { ...L, id: 'k', kind: 'khoi' as const, ownerUid: 'gdk', teamId: '' };

  it('GĐK duyệt → banStatus pending', () => {
    const d = buildDecision(L, null, { uid: 'gdk', name: 'G' }, 'approved', '', '2026-11-01T00:00:00Z');
    expect(d.banStatus).toBe('pending');
    expect(effectiveBanStatus(L, d)).toBe('pending');
  });

  it('grandfather: thiếu banStatus + decidedAt ≤ cutover → Ban đã duyệt', () => {
    const s = { status: 'approved' as const, amount: 10, decidedAt: '2026-10-20T00:00:00Z' };
    expect(s.decidedAt <= BAN_APPROVAL_CUTOVER_ISO).toBe(true);
    expect(effectiveBanStatus(L, s)).toBe('approved');
  });

  it('sau cutover thiếu banStatus → Chờ Ban', () => {
    const s = { status: 'approved' as const, amount: 10, decidedAt: '2026-11-01T00:00:00Z' };
    expect(effectiveBanStatus(L, s)).toBe('pending');
  });

  it('Ban từ chối; sửa dòng → GĐK reapproval → Ban na', () => {
    const appr = buildDecision(L, null, { uid: 'gdk', name: 'G' }, 'approved', '', '2026-11-01T00:00:00Z');
    const ban = buildBanDecision(L, appr, { uid: 'tb', name: 'TB' }, 'rejected', 'Sai ảnh', '2026-11-02T00:00:00Z');
    expect(effectiveBanStatus(L, ban as any)).toBe('rejected');
    const edited = { ...L, amount: 12, history: [{ at: '2026-11-03T00:00:00Z', action: 'update', byUid: 'u1', byName: 'U', from: 10, to: 12 }] };
    // GĐK nền = reapproval → Ban na
    expect(effectiveBanStatus(edited as any, ban as any)).toBe('na');
  });

  it('NS Khối tự duyệt (không nsSupport) sau cutover → Chờ Ban', () => {
    const line = { ...K, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' };
    expect(effectiveBanStatus(line as any, undefined)).toBe('pending');
  });

  it('Báo cáo tuần: không bắt Ban duyệt; vẫn loại Ban từ chối', () => {
    expect(WEEKLY_REQUIRES_BAN_APPROVAL).toBe(false);
    const pending = buildDecision(L, null, { uid: 'gdk', name: 'G' }, 'approved', '', '2026-11-01T00:00:00Z');
    expect(isNsReportableLine(L, pending, { has: true })).toBe(true); // Chờ Ban vẫn báo cáo
    expect(isBanApprovedForWeekly(L, pending)).toBe(false);
    const ok = { ...pending, banStatus: 'approved' as const, banDecidedBy: 'tb', banDecidedByName: 'TB', banDecidedAt: '2026-11-02T00:00:00Z' };
    expect(isNsReportableLine(L, ok, { has: true })).toBe(true);
    expect(isNsReportableLine(L, { status: 'approved', amount: 10, decidedAt: '2026-10-20' } as Partial<Support>, { has: true })).toBe(true);
  });
});

describe('Ban đổi quyết định / grandfather ghi rõ', () => {
  beforeAll(() => setKhoiManagers([{ id: 'B1', directorUid: 'gdk', assistantUids: [] }]));
  const L = { id: 'a', period: '2026-11', kind: 'user' as const, projectId: 'P1', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', amount: 10, deleted: false } as any;

  it('Đã duyệt Ban → Từ chối / Đặt lại chờ duyệt', () => {
    const appr = buildDecision(L, null, { uid: 'gdk', name: 'G' }, 'approved', '', '2026-11-01T00:00:00Z');
    const banOk = buildBanDecision(L, appr, { uid: 'tb', name: 'TB' }, 'approved', '', '2026-11-02T00:00:00Z');
    expect(effectiveBanStatus(L, banOk as any)).toBe('approved');
    expect(isNsReportableLine(L, banOk as any, { has: true })).toBe(true);
    const rej = buildBanDecision(L, banOk as any, { uid: 'tb', name: 'TB' }, 'rejected', 'Sai ảnh', '2026-11-03T00:00:00Z');
    expect(rej.banStatus).toBe('rejected');
    expect(rej.banReason).toBe('Sai ảnh');
    expect((rej.history || []).length).toBeGreaterThanOrEqual(1);
    expect(effectiveBanStatus(L, rej as any)).toBe('rejected');
    expect(isNsReportableLine(L, rej as any, { has: true })).toBe(false); // rớt khỏi báo cáo tuần (ẩn item, không xoá)
    const reset = buildBanDecision(L, banOk as any, { uid: 'tb', name: 'TB' }, 'pending', 'Cần bổ sung chứng từ', '2026-11-04T00:00:00Z');
    expect(reset.banStatus).toBe('pending');
    expect(reset.banReason).toBeUndefined();
    expect((reset.history || []).slice(-1)[0]?.reason).toContain('Cần bổ sung chứng từ');
    expect(effectiveBanStatus(L, reset as any)).toBe('pending');
    expect(isNsReportableLine(L, reset as any, { has: true })).toBe(true); // Đặt lại chờ Ban — vẫn báo cáo tuần
  });

  it('Ban từ chối → Duyệt lại', () => {
    const appr = buildDecision(L, null, { uid: 'gdk', name: 'G' }, 'approved', '', '2026-11-01T00:00:00Z');
    const rej = buildBanDecision(L, appr, { uid: 'tb', name: 'TB' }, 'rejected', 'Thiếu', '2026-11-02T00:00:00Z');
    const again = buildBanDecision(L, rej as any, { uid: 'tb', name: 'TB' }, 'approved', '', '2026-11-03T00:00:00Z');
    expect(again.banStatus).toBe('approved');
    expect(again.banReason).toBeUndefined();
    expect(effectiveBanStatus(L, again as any)).toBe('approved');
    expect(isNsReportableLine(L, again as any, { has: true })).toBe(true);
  });

  it('grandfather thiếu banStatus: đổi quyết định ghi rõ banStatus', () => {
    const gf = { status: 'approved' as const, amount: 10, decidedAt: '2026-10-20T00:00:00Z', decidedBy: 'gdk', decidedByName: 'G', history: [] };
    expect(effectiveBanStatus(L, gf)).toBe('approved');
    const written = buildBanDecision(L, gf, { uid: 'tb', name: 'TB' }, 'rejected', 'Rà lại', '2026-11-05T00:00:00Z');
    expect(written.banStatus).toBe('rejected');
    expect(written.banReason).toBe('Rà lại');
    expect(effectiveBanStatus(L, written as any)).toBe('rejected');
  });

  it('Đặt lại: lý do trong history; Duyệt Ban không kèm banReason', () => {
    const appr = buildDecision(L, null, { uid: 'gdk', name: 'G' }, 'approved', '', '2026-11-01T00:00:00Z');
    const banOk = buildBanDecision(L, appr, { uid: 'tb', name: 'TB' }, 'approved', '', '2026-11-02T00:00:00Z');
    expect(banOk.banReason).toBeUndefined();
    const reset = buildBanDecision(L, banOk as any, { uid: 'tb', name: 'TB' }, 'pending', 'Rà lại ảnh', '2026-11-04T00:00:00Z');
    expect(reset.banReason).toBeUndefined();
    expect(banReasonText(reset as any)).toBe('Rà lại ảnh');
  });
});
