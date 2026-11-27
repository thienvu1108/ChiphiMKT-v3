import { describe, it, expect } from 'vitest';
import { ntReportMonth, ntSuppInMonth, ntKindMatch, ntKindLabel, ntExportPrefix, ntSuppExcelCols, ntSuppSummary } from '../lib/vnext/ntSuppFilter';
import { exportFileName } from '../lib/vnext/exportName';

const main = { id: 'm', month: '2026-11', channels: 0, caNhanChuaVat: 100 };
const suppNew = { id: 'n', month: '2026-10', supplementFor: '2026-10', supplementIn: '2026-11', supplementStatus: 'approved', supplementDecidedAt: '2026-11-05T18:30:00.000Z' };
const suppOld = { id: 'o', month: '2026-10', supplementFor: '2026-09', supplementStatus: 'approved' };
const suppPending = { id: 'p', month: '2026-11', supplementFor: '2026-10', supplementIn: '2026-11', supplementStatus: 'pending' };
const suppRejected = { ...suppPending, id: 'r', supplementStatus: 'rejected' };

describe('ntReportMonth', () => {
  it('hồ sơ chính → month', () => expect(ntReportMonth(main)).toBe('2026-11'));
  it('bổ sung mới month=supplementFor', () => expect(ntReportMonth(suppNew)).toBe('2026-10'));
  it('bổ sung cũ (không supplementIn) → kỳ gốc', () => expect(ntReportMonth(suppOld)).toBe('2026-09'));
  it('supplementFor rác → month', () => expect(ntReportMonth({ month: '2026-10', supplementFor: 'abc' })).toBe('2026-10'));
});
describe('ntSuppInMonth', () => {
  it('có supplementIn', () => expect(ntSuppInMonth(suppNew)).toBe('2026-11'));
  it('bổ sung cũ → month', () => expect(ntSuppInMonth(suppOld)).toBe('2026-10'));
  it('không phải bổ sung / thiếu → rỗng', () => { expect(ntSuppInMonth(main)).toBe(''); expect(ntSuppInMonth({ supplementFor: '2026-10', month: '2026-10' })).toBe(''); });
});
describe('ntKindMatch', () => {
  it('all: chính + bổ sung đã duyệt', () => {
    expect([main, suppNew, suppPending, suppRejected].filter((a) => ntKindMatch(a, 'all')).map((a) => a.id)).toEqual(['m', 'n']);
  });
  it('main', () => expect([main, suppNew].filter((a) => ntKindMatch(a, 'main')).map((a) => a.id)).toEqual(['m']));
  it('supp: loại pending/rejected', () => {
    expect([main, suppNew, suppOld, suppPending, suppRejected].filter((a) => ntKindMatch(a, 'supp')).map((a) => a.id)).toEqual(['n', 'o']);
  });
});
describe('prefix / tên file', () => {
  it('nhãn + prefix', () => {
    expect(ntKindLabel('supp')).toBe('Chỉ bổ sung');
    expect(ntExportPrefix('all')).toBe('Báo cáo');
    expect(ntExportPrefix('main')).toBe('Báo cáo HỒ SƠ CHÍNH');
    expect(ntExportPrefix('supp')).toBe('Báo cáo BỔ SUNG');
  });
  it('exportFileName', () => {
    expect(exportFileName({ blockCode: 'K1', month: '2026-10', prefix: ntExportPrefix('supp') }, 'xlsx')).toBe('Báo cáo BỔ SUNG - K1 - 10.2026.xlsx');
    expect(exportFileName({ blockCode: 'K1', month: '2026-10', prefix: ntExportPrefix('all') }, 'pdf')).toBe('Báo cáo - K1 - 10.2026.pdf');
  });
});
describe('ntSuppExcelCols', () => {
  it('chính', () => expect(ntSuppExcelCols(main)).toEqual({ 'LOẠI': 'Chính', 'BỔ SUNG CHO KỲ': '', 'KỲ NỘP': '', 'NGÀY DUYỆT BS': '' }));
  it('bổ sung (giờ VN)', () => expect(ntSuppExcelCols(suppNew)).toEqual({ 'LOẠI': 'Bổ sung', 'BỔ SUNG CHO KỲ': 'T10/2026', 'KỲ NỘP': 'T11/2026', 'NGÀY DUYỆT BS': '06/11/2026' }));
});
describe('ntSuppSummary', () => {
  it('đếm + tổng + theo kỳ', () => {
    const cost = (a: any) => a.v;
    const s = ntSuppSummary([{ ...suppNew, v: 10 }, { ...suppNew, id: 'n2', v: 5 }, { ...suppOld, v: 7 }], cost);
    expect(s.count).toBe(3); expect(s.total).toBe(22);
    expect(s.byTarget).toEqual([{ month: '2026-09', count: 1, total: 7 }, { month: '2026-10', count: 2, total: 15 }]);
  });
});
