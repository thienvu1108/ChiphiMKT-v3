import { describe, it, expect } from 'vitest';
import { resolveAcceptanceProject, matchesProjectFilter } from '../src/components/acceptance/acceptanceUtils';
const P = [
  { id: 'sp', name: 'VINHOMES SAIGON PARK', projectCode: 'VINHOMES' },
  { id: 'ct', name: 'VINHOMES SAIGON PARK - CT', projectCode: 'VINHOMES' },
  { id: 'lu', name: 'LUMIÈRE HANOI SEASONS GARDEN', projectCode: '' },
  { id: 'd1', name: 'DUP', projectCode: '' }, { id: 'd2', name: 'DUP', projectCode: '' },
];
describe('lọc dự án Nghiệm thu theo projectId', () => {
  it('không khớp theo mã trùng', () => {
    const a = { projectId: 'lu', projectName: 'LUMIÈRE HANOI SEASONS GARDEN', projectCode: 'VINHOMES' };
    expect(matchesProjectFilter(a, 'sp', P)).toBe(false);
    expect(matchesProjectFilter(a, 'lu', P)).toBe(true);
  });
  it('projectId thắng tên cũ lưu sẵn', () => {
    expect(resolveAcceptanceProject({ projectId: 'ct', projectName: 'VINHOMES SAIGON PARK' }, P)?.id).toBe('ct');
  });
  it('fallback tên khi projectId thiếu/không hợp lệ', () => {
    expect(resolveAcceptanceProject({ projectId: 'gone', projectName: 'vinhomes saigon park' }, P)?.id).toBe('sp');
    expect(resolveAcceptanceProject({ projectName: 'sp' }, P)?.id).toBe('sp');
  });
  it('tên trùng / chỉ có mã → không đoán', () => {
    expect(resolveAcceptanceProject({ projectName: 'DUP' }, P)).toBeNull();
    expect(resolveAcceptanceProject({ projectCode: 'VINHOMES' }, P)).toBeNull();
    expect(matchesProjectFilter({ projectCode: 'VINHOMES' }, 'all', P)).toBe(true);
  });
});
