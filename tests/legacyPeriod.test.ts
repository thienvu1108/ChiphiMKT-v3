import { describe, it, expect } from 'vitest';
import { legacyMonthKey, isLegacyPeriod } from '../lib/vnext/legacyPeriod';
describe('legacyPeriod', () => {
  it('normalises old month formats', () => {
    expect(legacyMonthKey('2026-10')).toBe('2026-10');
    expect(legacyMonthKey('10/2026')).toBe('2026-10');
    expect(legacyMonthKey('Tháng 9/2026')).toBe('2026-09');
    expect(legacyMonthKey('')).toBe('');
  });
  it('period ≤ T10/2026 is legacy, T11 is not', () => {
    expect(isLegacyPeriod('2026-10')).toBe(true);
    expect(isLegacyPeriod('2026-11')).toBe(false);
    expect(isLegacyPeriod('')).toBe(false);
  });
});
