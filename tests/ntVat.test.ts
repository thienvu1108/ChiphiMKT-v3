import { describe, it, expect } from 'vitest';
import { buildReport, recordVat, recordCostBeforeVat } from '../lib/vnext/ntReport';
import { getRowComputed, ntTotals, preVatOf } from '../src/components/acceptance/acceptanceUtils';
const rec = (o: any) => ({ id: Math.random().toString(36).slice(2), status: 'Đã nghiệm thu', month: '2026-10', projectId: 'P1', projectName: 'P1', ...o });
const rs = [
  rec({ digitalFb: 1_000_001, digitalZalo: 333_333, digitalTiktok: 7, digitalKhac: 50_000, caNhanFb: 200_000 }),
  rec({ visaFb: 999_999, visaZalo: 123_457, visaTiktok: 11, visaDangTin: 45_678, dangTinCtyChuaVat: 1_234_567, caNhanNapTienQuaCty: 300_000, caNhanNopTien: 5 }),
  rec({ caNhanZalo: 10_000, caNhanGoogle: 20_000, caNhanTiktok: 30_000, caNhanDangTin: 40_000, projectId: 'P2', projectName: 'P2' }),
];
describe('Báo cáo Nghiệm thu: VAT khớp màn Nghiệm thu MKT', () => {
  it('mỗi bản ghi: trước VAT + VAT = TỔNG trên màn hình', () => {
    for (const r of rs) { const c = getRowComputed(r); expect(recordCostBeforeVat(r)).toBe(preVatOf(c)); expect(recordCostBeforeVat(r) + recordVat(r)).toBe(c.grandTotal); }
  });
  it('buildReport tổng/nhóm/dự án có VAT; withVat = tổng màn hình', () => {
    const rep = buildReport(rs);
    const t = ntTotals(rs);
    expect(rep.total.cost).toBe(t.preVat); expect(rep.total.vat).toBe(t.vat); expect(rep.total.withVat).toBe(t.total);
    expect(rep.groups.reduce((s, g) => s + g.vat, 0)).toBe(t.vat);
    expect(rep.projects.reduce((s, p) => s + p.vat, 0)).toBe(t.vat);
    expect(rep.groups.find((g) => g.group === 'caNhan')!.vat).toBe(0);
  });
  it('ntTotals: đếm + lead; rỗng = 0', () => {
    expect(ntTotals(rs).count).toBe(3); expect(ntTotals(rs).leads).toBe(5);
    expect(ntTotals([])).toEqual({ count: 0, preVat: 0, vat: 0, total: 0, leads: 0 });
  });
});
