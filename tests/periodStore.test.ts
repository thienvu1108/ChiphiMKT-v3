import { describe, it, expect } from 'vitest';
import { storeAcceptanceMonth, acceptanceMonthLabel, isAcceptanceMonthMatch } from '../src/components/acceptance/acceptanceUtils';
import { normPeriod, activeLock } from '../lib/vnext/platform';
describe('Kỳ chuẩn YYYY-MM', () => {
  it('lưu', () => {
    expect(storeAcceptanceMonth('09.2026')).toEqual({ month: '2026-09', kyPart: null });
    expect(storeAcceptanceMonth('Kì 2 - Tháng 8')).toEqual({ month: '2026-08', kyPart: 2 });
    expect(storeAcceptanceMonth('2026-10')).toEqual({ month: '2026-10', kyPart: null });
  });
  it('nhãn', () => {
    expect(acceptanceMonthLabel({ month: '2026-08', kyPart: 1 })).toBe('Kì 1 - Tháng 8');
    expect(acceptanceMonthLabel({ month: '2026-09' })).toBe('09.2026');
    expect(acceptanceMonthLabel({ month: '09.2026' })).toBe('09.2026');
  });
  it('khoá so khớp kỳ cũ', () => {
    expect(normPeriod('09.2026')).toBe('2026-09');
    const n = Date.now();
    const L = { nt: [{ from: n - 1000, to: n + 1000, period: '2026-09' }] } as any;
    expect(activeLock(L, 'nt', '09.2026')).not.toBeNull();
    expect(activeLock(L, 'nt', '10.2026')).toBeNull();
  });
});

describe('Lọc Tháng 8: Kì 1 và Kì 2 tách riêng (không gộp)', () => {
  const lab = (r: any) => acceptanceMonthLabel(r);
  it('bản chuẩn (month + kyPart) và bản cũ đều khớp đúng Kì', () => {
    const k1 = lab({ month: '2026-08', kyPart: 1 }), k2 = lab({ month: '2026-08', kyPart: 2 }), old1 = lab({ month: 'Kì 1 - Tháng 8' }), old2 = lab({ month: 'Kỳ 2 - Tháng 8' });
    expect(isAcceptanceMonthMatch(k1, 'Kì 1 - Tháng 8')).toBe(true);
    expect(isAcceptanceMonthMatch(k2, 'Kì 1 - Tháng 8')).toBe(false);
    expect(isAcceptanceMonthMatch(k2, 'Kì 2 - Tháng 8')).toBe(true);
    expect(isAcceptanceMonthMatch(old1, 'Kì 1 - Tháng 8')).toBe(true);
    expect(isAcceptanceMonthMatch(old2, 'Kì 1 - Tháng 8')).toBe(false);
    expect(isAcceptanceMonthMatch(old2, 'Kì 2 - Tháng 8')).toBe(true);
    expect(isAcceptanceMonthMatch(k1, '08.2026')).toBe(false);
    expect(isAcceptanceMonthMatch(lab({ month: '2026-08' }), 'Kì 2 - Tháng 8')).toBe(false);
    expect(isAcceptanceMonthMatch(lab({ month: '2026-09' }), '09.2026')).toBe(true);
  });
});
