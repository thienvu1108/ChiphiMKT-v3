import { describe, it, expect } from 'vitest';
import { lockRecToOpen, openNext, activeLock, type OpenCfg } from '../lib/vnext/platform';
const T = (s: string) => Date.parse(s + '+07:00');
describe('Thời gian MỞ', () => {
  it('chuyển khoá 14→27 thành mở 27→14', () => {
    const c = lockRecToOpen({ on: true, fromDay: 14, fromMin: 0, toDay: 27, toMin: 0, periodOffset: null, exceptions: [] });
    expect(c.rec).toMatchObject({ on: true, fromDay: 27, toDay: 14, apply: null }); expect(c.exact).toBe(true);
    expect(lockRecToOpen({ on: true, fromDay: 14, fromMin: 0, toDay: 27, toMin: 0, periodOffset: 0, exceptions: [] }).exact).toBe(false);
  });
  it('mở 27→14 áp dụng tháng sau: 24/10 khoá, 28/10 mở kỳ 2026-11 chứ không mở 2026-10', () => {
    const o: OpenCfg = { on: true, rec: { on: true, fromDay: 27, fromMin: 0, toDay: 14, toMin: 0, apply: 1, exceptions: [] }, ranges: [] };
    const L: any = { open: { nsCreate: o } };
    expect(activeLock(L, 'nsCreate', '2026-11', T('2026-10-24T19:00:00'))).not.toBeNull();
    expect(activeLock(L, 'nsCreate', '2026-11', T('2026-10-28T10:00:00'))).toBeNull();
    expect(activeLock(L, 'nsCreate', '2026-10', T('2026-10-28T10:00:00'))).not.toBeNull();
    const n = openNext(o, '', T('2026-10-24T19:00:00'))!; expect(n.period).toBe('2026-11'); expect(n.from).toBe(T('2026-10-27T00:00:00')); expect(n.to).toBe(T('2026-11-14T00:00:00'));
  });
});
