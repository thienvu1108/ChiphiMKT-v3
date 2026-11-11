import { describe, it, expect } from 'vitest';
import { friendlyError, activeLock, lockUntilText, vnLocalToMs, msToVnLocal, scrubMsg, deviceOf, browserOf, errGroupKey, isSpike, normLocks } from '../lib/vnext/platform';
describe('lỗi thân thiện', () => {
  it('mạng → Thử lại; quyền → bước tiếp', () => {
    expect(friendlyError({ code: 'unavailable' }).retry).toBe(true);
    expect(friendlyError(new Error('Failed to fetch')).retry).toBe(true);
    const p = friendlyError({ code: 'permission-denied' }); expect(p.retry).toBe(false); expect(p.title).toMatch(/không có quyền/);
    expect(friendlyError({ code: 'not-found' }).next).toMatch(/Tải lại/);
    expect(friendlyError(new Error('Số tiền phải lớn hơn 0')).title).toBe('Số tiền phải lớn hơn 0');
    expect(friendlyError(new Error('xyz internal')).title).toBe('Đã có lỗi xảy ra.');
  });
});
describe('khoá theo ngày', () => {
  const t0 = vnLocalToMs('2026-10-25T08:00');
  const L = normLocks({ nsCreate: [{ from: t0, to: t0 + 36e5 }, { from: t0 + 18e5, to: t0 + 72e5, period: '2026-11' }], nsEdit: [{ from: t0 - 1, to: t0 }] });
  it('khoảng hiệu lực, theo tháng, hết hạn', () => {
    expect(activeLock(L, 'nsCreate', '2026-12', t0 + 60e3)?.until).toBe(t0 + 36e5);
    expect(activeLock(L, 'nsCreate', '2026-11', t0 + 20e5)?.until).toBe(t0 + 72e5);
    expect(activeLock(L, 'nsCreate', '2026-12', t0 + 40e5)).toBeNull();
    expect(activeLock(L, 'nsEdit', '', t0)).toBeNull();
    expect(activeLock(L, 'nt', '', t0)).toBeNull();
  });
  it('giờ VN', () => {
    expect(msToVnLocal(t0)).toBe('2026-10-25T08:00');
    expect(lockUntilText(t0)).toBe('Đang khoá đến 08:00 25/10/2026 (giờ VN)');
  });
});
describe('nhật ký lỗi', () => {
  it('không PII', () => { expect(scrubMsg('lỗi a.b@x.com stk 0123456789')).toBe('lỗi <email> stk <số>'); expect(scrubMsg('x'.repeat(900)).length).toBe(500); });
  it('thiết bị / trình duyệt / nhóm / đột biến', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari', 390)).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0) Chrome/120', 1440)).toBe('desktop');
    expect(browserOf('Mozilla/5.0 Chrome/120 Safari/537')).toBe('Chrome');
    expect(errGroupKey('Không tải ns_lines 12 lần abcdef1234')).toBe(errGroupKey('Không tải ns_lines 99 lần 99ffaa0011'));
    const n = Date.now(); expect(isSpike(Array(20).fill(n - 1000), n)).toBe(true); expect(isSpike(Array(30).fill(n - 7200e3), n)).toBe(false);
  });
});
