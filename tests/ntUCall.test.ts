import { describe, it, expect } from 'vitest';
import { buildReport, recordCostBeforeVat } from '../lib/vnext/ntReport';
import { getRowComputed, ntTotals, preVatOf } from '../src/components/acceptance/acceptanceUtils';
const rec = (o: any) => ({ id: 'r' + Math.random().toString(36).slice(2), status: 'Đã nghiệm thu', month: '2026-10', projectId: 'P1', projectName: 'P1', ...o });
describe('Nghiệm thu MKT – Cá nhân UCall', () => {
  it('cộng vào Cá nhân TỔNG và TỔNG, không VAT', () => {
    const c = getRowComputed(rec({ caNhanFb: 100_000, caNhanUCall: 250_000 }));
    expect(c.cnUCall).toBe(250_000);
    expect(c.cnTotal).toBe(350_000);
    expect(c.grandTotal).toBe(350_000);
  });
  it('hỗ trợ công thức và bản ghi cũ không có trường', () => {
    expect(getRowComputed(rec({ caNhanUCall: '100000+50000' })).cnUCall).toBe(150_000);
    const old = getRowComputed(rec({ caNhanFb: 10 }));
    expect(old.cnUCall).toBe(0); expect(old.cnTotal).toBe(10);
  });
  it('báo cáo Nghiệm thu khớp màn hình', () => {
    const rs = [rec({ caNhanUCall: 70_000 }), rec({ caNhanZalo: 30_000, caNhanUCall: 5_000 })];
    const rep = buildReport(rs); const t = ntTotals(rs);
    expect(rep.total.cost).toBe(t.preVat);
    expect(rep.total.cost).toBe(105_000);
    for (const r of rs) expect(recordCostBeforeVat(r)).toBe(preVatOf(getRowComputed(r)));
  });
});
describe('UCall + Native Ads cùng lúc', () => {
  it('cả hai cộng vào Cá nhân TỔNG', () => {
    const c = getRowComputed(rec({ caNhanNativeAds: 1_000, caNhanUCall: 2_000, caNhanFb: 4_000 }));
    expect(c.cnTotal).toBe(7_000); expect(c.grandTotal).toBe(7_000);
  });
});
