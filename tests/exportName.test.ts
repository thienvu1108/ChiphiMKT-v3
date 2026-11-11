import { describe, it, expect } from 'vitest';
import { exportBaseName, exportFileName, exportMonth, safeFilePart } from '../lib/vnext/exportName';
describe('exportName', () => {
  it('mẫu của Phong', () => {
    expect(exportBaseName({ blockCode: 'A4.E44', month: '2026-09' })).toBe('Báo cáo - A4.E44 - 09.2026');
    expect(exportBaseName({ blockCode: 'A4.E44', month: '10.2026', teamCode: 'A4.E41.1', projectName: 'Vinhomes Global Gate Hạ Long' })).toBe('Báo cáo - A4.E44 - 10.2026 - A4.E41.1 - Vinhomes Global Gate Hạ Long');
    expect(exportFileName({ blockCode: 'A4.E44', month: '2026-09' }, 'xlsx')).toBe('Báo cáo - A4.E44 - 09.2026.xlsx');
  });
  it('chỉ dự án, không Phòng', () => {
    expect(exportBaseName({ blockCode: 'A4.E44', month: '2026-10', projectName: 'Vinhomes Ocean Park 2' })).toBe('Báo cáo - A4.E44 - 10.2026 - Vinhomes Ocean Park 2');
  });
  it('không lọc Khối / tháng; nhiều Khối', () => {
    expect(exportBaseName({ month: '2026-10' })).toBe('Báo cáo - Tất cả Khối - 10.2026');
    expect(exportBaseName({ blockCode: 'A4.E44', month: 'all' })).toBe('Báo cáo - A4.E44 - Tất cả tháng');
    expect(exportBaseName({ blockCode: ['A1', 'A2', 'A1'], month: '2026-10' })).toBe('Báo cáo - A1+A2 - 10.2026');
    expect(exportBaseName({ blockCode: ['A1', 'A2', 'A3', 'A4'], month: '2026-10' })).toBe('Báo cáo - Nhiều Khối - 10.2026');
  });
  it('giữ dấu, bỏ ký tự cấm', () => {
    expect(safeFilePart('Dự án: "Hạ Long" / 2?')).toBe('Dự án Hạ Long 2');
    expect(exportBaseName({ blockCode: 'A4', month: '2026-01', projectName: 'Sân bay*Long Thành.' })).toBe('Báo cáo - A4 - 01.2026 - Sân bay Long Thành');
  });
  it('exportMonth', () => {
    expect(exportMonth('9.2026')).toBe('09.2026'); expect(exportMonth('2026-9')).toBe('09.2026'); expect(exportMonth('')).toBe('Tất cả tháng');
  });
});
import { BAN_BUDGET_STATUS_LABEL, BAN_BUDGET_STATUSES } from '../lib/vnext/banBudgetStatus';
describe('Ngân sách Ban: nhãn trạng thái', () => {
  it('dùng nhãn chung + nhãn riêng', () => {
    expect(BAN_BUDGET_STATUS_LABEL.approved).toBe('Đã duyệt'); expect(BAN_BUDGET_STATUS_LABEL.pending).toBe('Chờ duyệt'); expect(BAN_BUDGET_STATUS_LABEL.rejected).toBe('Từ chối');
    for (const s of BAN_BUDGET_STATUSES) expect(BAN_BUDGET_STATUS_LABEL[s]).toBeTruthy();
  });
});
