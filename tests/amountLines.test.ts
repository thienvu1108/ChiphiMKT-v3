import { describe, it, expect } from 'vitest';
import { sumLines, linesToFormula, itemsToLines, resolveLines, resolveEditRaw, debtOf, buildBreakdown } from '../src/lib/amountLines';
import { parseCurrencyFormula, getRowComputed } from '../src/components/acceptance/acceptanceUtils';
import { channelValue, groupCost } from '../lib/vnext/ntReport';

describe('amountLines', () => {
  it('cộng dòng và serialize công thức', () => {
    const lines = [{ amount: 1_000_000, note: 'HĐ A' }, { amount: 500_000, note: '' }];
    expect(sumLines(lines)).toBe(1_500_000);
    expect(linesToFormula(lines)).toBe('1000000 (HĐ A) + 500000');
    expect(parseCurrencyFormula(linesToFormula(lines)).total).toBe(1_500_000);
  });
  it('resolveLines ưu tiên costBreakdowns sau khi lưu số trần', () => {
    const row = { digitalFb: 1_500_000, costBreakdowns: { digitalFb: { rawInput: '1000000 (a) + 500000 (b)', total: 1_500_000, items: [{ amount: 1_000_000, label: 'a' }, { amount: 500_000, label: 'b' }] } } };
    const lines = resolveLines('digitalFb', row, parseCurrencyFormula);
    expect(lines).toEqual([{ amount: 1_000_000, note: 'a' }, { amount: 500_000, note: 'b' }]);
    expect(resolveEditRaw('digitalFb', row, parseCurrencyFormula)).toContain('1000000');
  });
  it('bản ghi cũ chỉ có số / công thức vẫn đọc được', () => {
    expect(resolveLines('digitalFb', { digitalFb: 2000 }, parseCurrencyFormula)[0].amount).toBe(2000);
    expect(resolveLines('digitalFb', { digitalFb: '1000 (x) + 500' }, parseCurrencyFormula).map((x) => x.amount)).toEqual([1000, 500]);
  });
  it('hoaDonLines + debt = invoice - tong; không vào grandTotal', () => {
    expect(debtOf(3_000_000, 2_500_000)).toBe(500_000);
    expect(debtOf(1_000_000, 2_000_000)).toBe(-1_000_000);
    const c = getRowComputed({ digitalFb: 1_000_000, hoaDonTien: 3_000_000, hoaDonLines: [{ amount: 2_000_000, note: 'A' }, { amount: 1_000_000, note: 'B' }] });
    expect(c.grandTotal).toBe(Math.round(1_000_000 * 1.1)); // digital sau VAT only — HĐ không cộng
    expect(c.hoaDonTien).toBe(3_000_000);
    expect(c.hoaDonNo).toBe(3_000_000 - c.grandTotal);
  });
  it('buildBreakdown', () => {
    const b = buildBreakdown('hoaDonTien', [{ amount: 100, note: 'n' }])!;
    expect(b.total).toBe(100); expect(b.items[0].label).toBe('n');
  });
});

describe('ntReport hoaDon', () => {
  it('channelValue hoaDonTien từ hoaDonLines; hoaDonNo = HĐ - tong; không vào groupCost congTy', () => {
    const r = { dangTinCtyChuaVat: 100, caNhanNapTienQuaCty: 50, hoaDonTien: 999, hoaDonLines: [{ amount: 400, note: 'a' }, { amount: 200, note: 'b' }], grandTotal: 300, totalCost: 300 };
    expect(channelValue(r, 'hoaDonTien')).toBe(600);
    expect(channelValue(r, 'hoaDonNo')).toBe(600 - 300);
    expect(groupCost(r, 'congTy')).toBe(150); // chỉ đăng tin + nạp, không HĐ
  });
  it('bản ghi cũ không có hoaDon → 0', () => {
    expect(channelValue({ digitalFb: 1 }, 'hoaDonTien')).toBe(0);
    expect(channelValue({ grandTotal: 10 }, 'hoaDonNo')).toBe(-10);
  });
});
