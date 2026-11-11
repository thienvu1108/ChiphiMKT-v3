import { describe, it, expect } from 'vitest';
import { recActive, recNext, recWindow, normLocks, activeLock, monthIdx, idxToYm, ymToIdx, type RecLock } from '../lib/vnext/platform';
const vn = (s: string) => Date.parse(s + '+07:00');
const R = (o: Partial<RecLock> = {}): RecLock => ({ on: true, fromDay: 25, fromMin: 18 * 60, toDay: 5, toMin: 8 * 60, periodOffset: null, exceptions: [], ...o });
describe('Khoá lặp lại hằng tháng', () => {
  it('idx ↔ YYYY-MM', () => { expect(idxToYm(monthIdx(2026, 12))).toBe('2026-12'); expect(idxToYm(monthIdx(2027, 1))).toBe('2027-01'); expect(ymToIdx('2026-11')).toBe(monthIdx(2026, 11)); });
  it('vắt tháng: 25 18:00 → 05 08:00 tháng sau (giờ VN)', () => {
    const r = R();
    expect(recActive(r, '', vn('2026-10-25T17:59:00'))).toBeNull();
    expect(recActive(r, '', vn('2026-10-25T18:00:00'))).not.toBeNull();
    expect(recActive(r, '', vn('2026-11-03T12:00:00'))).not.toBeNull();
    expect(recActive(r, '', vn('2026-11-05T08:00:00'))).toBeNull();
    expect(recActive(r, '', vn('2027-01-02T00:00:00'))).not.toBeNull(); // qua năm
  });
  it('cùng tháng + ngày 31 = cuối tháng', () => {
    const r = R({ fromDay: 31, fromMin: 0, toDay: 31, toMin: 23 * 60 });
    expect(recActive(r, '', vn('2027-02-28T10:00:00'))).not.toBeNull();
    expect(recActive(r, '', vn('2026-11-30T10:00:00'))).not.toBeNull();
    expect(recActive(r, '', vn('2026-11-29T10:00:00'))).toBeNull();
  });
  it('ngoại lệ + periodOffset', () => {
    expect(recActive(R({ exceptions: [monthIdx(2026, 10)] }), '', vn('2026-10-28T10:00:00'))).toBeNull();
    const r = R({ periodOffset: 1 });
    expect(recActive(r, '2026-11', vn('2026-10-28T10:00:00'))).not.toBeNull();
    expect(recActive(r, '2026-12', vn('2026-10-28T10:00:00'))).toBeNull();
    expect(recActive(r, '2026-11', vn('2026-11-02T10:00:00'))).not.toBeNull();
  });
  it('tắt → không khoá; lần khoá tới', () => {
    expect(recActive(R({ on: false }), '', vn('2026-10-28T10:00:00'))).toBeNull();
    const n = recNext(R(), vn('2026-10-24T10:00:00'))!; expect(n.start).toBe(vn('2026-10-25T18:00:00'));
    expect(recNext(R({ exceptions: [monthIdx(2026, 10)] }), vn('2026-10-24T10:00:00'))!.start).toBe(vn('2026-11-25T18:00:00'));
    expect(recWindow(R(), monthIdx(2026, 10)).end).toBe(vn('2026-11-05T08:00:00'));
  });
  it('kết hợp với khoảng lẻ trong activeLock', () => {
    const L = normLocks({ nsCreate: [], recurring: { nsCreate: R() } });
    const a = activeLock(L, 'nsCreate', '', vn('2026-10-26T00:00:00'))!; expect(a.until).toBe(vn('2026-11-05T08:00:00'));
    const L2 = normLocks({ nsCreate: [{ from: vn('2026-10-20T00:00:00'), to: vn('2026-10-21T00:00:00') }], recurring: { nsCreate: R() } });
    expect(activeLock(L2, 'nsCreate', '', vn('2026-10-20T10:00:00'))).not.toBeNull();
    expect(activeLock(L2, 'nsEdit', '', vn('2026-10-26T00:00:00'))).toBeNull();
  });
});
import { compileLockWin } from '../lib/vnext/platform';
describe('compileLockWin', () => {
  it('đặt cửa sổ vào mọi tháng giao nhau; báo tràn >3/tháng', () => {
    const t = vn('2026-10-24T10:00:00');
    const r = { on: true, fromDay: 25, fromMin: 1080, toDay: 5, toMin: 480, periodOffset: 1, exceptions: [monthIdx(2026, 12)] };
    const { win, overflow } = compileLockWin([{ from: vn('2026-10-30T00:00:00'), to: vn('2026-11-02T00:00:00'), period: '' }], r, t);
    expect(win[String(monthIdx(2026, 10))].length).toBe(3); // đuôi T9 + lẻ + lặp T10
    expect(win[String(monthIdx(2026, 11))].map((w) => w.period)).toEqual(['', '2026-11', '2026-12']); // lẻ, đuôi T10, đầu T11
    expect(win[String(monthIdx(2027, 1))].map((w) => w.period)).toEqual(['2027-02']); // T12 ngoại lệ → đầu T1 không có đuôi T12
    expect(overflow).toEqual([]);
    const many = Array.from({ length: 4 }, (_, i) => ({ from: vn(`2026-11-1${i}T00:00:00`), to: vn(`2026-11-1${i}T01:00:00`), period: '' }));
    expect(compileLockWin(many, undefined, t).overflow).toEqual(['2026-11']);
  });
});
import { monthIdxOf, pastLocked, pastLockAt, compilePastWin } from '../lib/vnext/platform';
describe('Khoá kỳ đã qua', () => {
  it('đọc tháng nhiều dạng', () => {
    expect(monthIdxOf('2026-09')).toBe(monthIdx(2026, 9)); expect(monthIdxOf('09.2026')).toBe(monthIdx(2026, 9));
    expect(monthIdxOf('9/2026')).toBe(monthIdx(2026, 9)); expect(monthIdxOf('Kì 1 - Tháng 8')).toBe(monthIdx(2026, 8)); expect(monthIdxOf('xyz')).toBe(-1);
  });
  it('tháng M khoá từ ngày X của M+offset; tắt / Super Admin không áp', () => {
    const c = { on: true, day: 5, min: 600, offset: 1 };
    expect(pastLockAt(c, monthIdx(2026, 9))).toBe(vn('2026-10-05T10:00:00'));
    expect(pastLocked(c, '2026-09', vn('2026-10-05T09:59:00'))).toBe(false);
    expect(pastLocked(c, '2026-09', vn('2026-10-05T10:00:00'))).toBe(true);
    expect(pastLocked(c, 'Kì 2 - Tháng 8', vn('2026-10-01T00:00:00'))).toBe(true);
    expect(pastLocked({ ...c, on: false }, '2026-01', vn('2026-10-01T00:00:00'))).toBe(false);
    const w = compilePastWin(c, vn('2026-10-24T00:00:00'))[String(monthIdx(2026, 10))];
    expect(w.m).toBe('2026-09'); expect(w.at).toBe(vn('2026-10-05T10:00:00'));
  });
});
