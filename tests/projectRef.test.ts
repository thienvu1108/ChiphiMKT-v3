import { describe, it, expect } from 'vitest';
import { resolveProject, projectKeyOf, displayProjectName, storedProjectNameStale } from '../lib/vnext/projectRef';
import { filterLegacy } from '../lib/vnext/legacyFilter';
const P = [
  { id: 'sp', name: 'VINHOMES SAIGON PARK', projectCode: 'VINHOMES' },
  { id: 'ct', name: 'VINHOMES SAIGON PARK - CT', projectCode: 'VINHOMES' },
];
describe('projectRef toàn web', () => {
  it('id thắng tên cũ; không khớp mã', () => {
    expect(resolveProject(P, { projectId: 'sp', projectName: 'VINHOMES SAIGON PARK - CT' })?.id).toBe('sp');
    expect(resolveProject(P, { projectCode: 'VINHOMES' })).toBeNull();
  });
  it('projectKeyOf: id → tên khi không xác định; không chứa chuỗi con', () => {
    expect(projectKeyOf(P, { projectId: 'x', projectName: 'VINHOMES SAIGON PARK' })).toBe('sp');
    expect(projectKeyOf(P, { projectName: 'DỰ ÁN LẠ' })).toBe('DỰ ÁN LẠ');
    expect(projectKeyOf(P, { projectId: 'ct', projectName: 'x' })).not.toBe('sp');
  });
  it('filterLegacy theo dự án dùng projectId, bỏ mã', () => {
    const rows = [{ _p: '2026-09', projectId: 'sp', projectCode: 'VINHOMES' }, { _p: '2026-09', projectId: 'ct', projectCode: 'VINHOMES' }, { _p: '2026-09', projectCode: 'VINHOMES' }];
    expect(filterLegacy(rows as any, { period: '*', projectKey: 'sp' }, () => '', P).length).toBe(1);
  });
});

describe('displayProjectName: tên hiện hành theo projectId', () => {
  const P = [{ id: 'sp', name: 'VINHOMES SAIGON PARK' }, { id: 'gone', name: 'CŨ', deleted: true }];
  it('ưu tiên tên live; fallback stored khi không còn dự án', () => {
    expect(displayProjectName(P, 'sp', 'TÊN CŨ LƯU')).toBe('VINHOMES SAIGON PARK');
    expect(displayProjectName(P, 'missing', 'Tên đã lưu')).toBe('Tên đã lưu');
    expect(displayProjectName(P, 'missing')).toBe('missing');
    expect(displayProjectName(P, 'gone', 'Fallback')).toBe('Fallback'); // deleted → fallback stored
    expect(storedProjectNameStale(P, 'sp', 'TÊN CŨ LƯU')).toBe(true);
    expect(storedProjectNameStale(P, 'sp', 'VINHOMES SAIGON PARK')).toBe(false);
    expect(storedProjectNameStale(P, 'missing', 'X')).toBe(false);
  });
});
