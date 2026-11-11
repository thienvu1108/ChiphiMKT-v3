import { describe, it, expect } from 'vitest';
import { effectiveMaxPerSale, bonusTiersOf, parseBonusTiers, policyOf, fmtTiers } from '../lib/vnext/supportPct';

describe('bonus tiers', () => {
  it('đọc bonus cũ là Mức 1', () => {
    expect(bonusTiersOf({ supportBonusPct: 5, supportBonusCond: 'Đạt 10 căn' })).toEqual([{ pct: 5, amount: null, minUnits: null, cond: 'Đạt 10 căn' }]);
    expect(bonusTiersOf({})).toEqual([]);
  });
  it('ưu tiên supportBonusTiers, bỏ giá trị sai', () => {
    const p = { supportBonusPct: 1, supportBonusTiers: [{ pct: 3, minUnits: 5, cond: 'a' }, { amount: 7000000, minUnits: 10 }, { pct: 500 }] };
    expect(bonusTiersOf(p)).toEqual([{ pct: 3, amount: null, minUnits: 5, cond: 'a' }, { pct: null, amount: 7000000, minUnits: 10, cond: '' }]);
    expect(policyOf(p, []).bonus).toBe(3);
    expect(fmtTiers(bonusTiersOf(p))).toBe('M1: 3% · M2: 7.000.000 đ');
  });
  it('parse form', () => {
    const r = parseBonusTiers([{ pct: '2,5', amount: '', minUnits: '5', cond: ' x ' }, { pct: '', amount: '', minUnits: '', cond: '' }, { pct: '', amount: '7.000.000', minUnits: '10', cond: '' }]);
    expect(r).toEqual({ tiers: [{ pct: 2.5, amount: null, minUnits: 5, cond: 'x' }, { pct: null, amount: 7000000, minUnits: 10, cond: '' }] });
    expect(parseBonusTiers([{ pct: '5', amount: '100', minUnits: '', cond: '' }])).toHaveProperty('error');
    expect(parseBonusTiers([{ pct: '', amount: '', minUnits: '3', cond: '' }])).toHaveProperty('error');
    expect(parseBonusTiers([{ pct: '101', amount: '', minUnits: '', cond: '' }])).toHaveProperty('error');
    expect(parseBonusTiers(Array.from({ length: 11 }, () => ({ pct: '1', amount: '', minUnits: '', cond: '' })))).toHaveProperty('error');
  });
  it('Max / 1 sale: riêng dự án → chung Ban → null', () => {
    const bans = [{ id: 'B', name: 'Ban', supportMaxPerSale: 20000000 }];
    expect(effectiveMaxPerSale({ banKdId: 'B', supportMaxPerSale: 5000000 }, bans)).toEqual({ value: 5000000, source: 'project' });
    expect(effectiveMaxPerSale({ banKdId: 'B' }, bans)).toEqual({ value: 20000000, source: 'ban' });
    expect(policyOf({ banKdId: 'B', supportMaxPerSale: null }, bans)).toMatchObject({ maxPerSale: 20000000, maxSource: 'ban' });
    expect(effectiveMaxPerSale({ banKdId: 'X' }, bans)).toBeNull();
  });
});
