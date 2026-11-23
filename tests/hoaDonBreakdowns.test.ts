import { describe, it, expect } from 'vitest';
import { buildCostBreakdownsOfRecord, parseCurrencyFormula, HOA_DON_CHANNEL_FIELDS, COST_BREAKDOWN_FIELDS } from '../src/components/acceptance/acceptanceUtils';
import { resolveLines, resolveEditRaw } from '../src/lib/amountLines';

describe('Tiền trên hoá đơn — lưu chi tiết từng dòng như Cá nhân', () => {
  it('8 kênh hoá đơn + Cá nhân Khác nằm trong danh sách lưu costBreakdowns', () => {
    for (const f of [...HOA_DON_CHANNEL_FIELDS, 'caNhanKhac']) expect(COST_BREAKDOWN_FIELDS).toContain(f);
  });

  it('nhập nhiều dòng ở HĐ Facebook → costBreakdowns.hoaDonFb có từng dòng + tổng', () => {
    const bd = buildCostBreakdownsOfRecord({ hoaDonFb: '1000000 (HĐ số 1) + 2500000 (HĐ số 2)', hoaDonKhac: '300000+200000', caNhanKhac: '100000 + 50000' });
    expect(bd.hoaDonFb.total).toBe(3_500_000);
    expect(bd.hoaDonFb.items.map((x: any) => x.amount)).toEqual([1_000_000, 2_500_000]);
    expect(bd.hoaDonKhac.total).toBe(500_000);
    expect(bd.hoaDonKhac.items).toHaveLength(2);
    expect(bd.caNhanKhac.total).toBe(150_000);
  });

  it('sau khi lưu: mở lại hiển thị/sửa từng dòng từ costBreakdowns', () => {
    const raw = '1000000 (HĐ số 1) + 2500000 (HĐ số 2)';
    const saved = { hoaDonFb: 3_500_000, costBreakdowns: buildCostBreakdownsOfRecord({ hoaDonFb: raw }) };
    expect(resolveLines('hoaDonFb', saved, parseCurrencyFormula)).toEqual([{ amount: 1_000_000, note: 'HĐ số 1' }, { amount: 2_500_000, note: 'HĐ số 2' }]);
    expect(resolveEditRaw('hoaDonFb', saved, parseCurrencyFormula)).toBe(raw);
  });

  it('bản ghi cũ chỉ có tổng (không costBreakdowns) → vẫn 1 giá trị bình thường', () => {
    const old = { hoaDonFb: 3_500_000 };
    expect(buildCostBreakdownsOfRecord({}).hoaDonFb).toBeUndefined();
    expect(resolveLines('hoaDonFb', old, parseCurrencyFormula).map((l) => l.amount)).toEqual([3_500_000]);
    expect(resolveEditRaw('hoaDonFb', old, parseCurrencyFormula)).toBe('3500000');
  });
});
