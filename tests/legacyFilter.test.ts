import { describe, it, expect } from 'vitest';
import { filterLegacy } from '../lib/vnext/legacyFilter';
const R = [{ id: 'a', _p: '2026-10', teamId: 'T1', projectId: 'P1' }, { id: 'b', _p: '2026-09', teamId: 'T2', projectId: 'P2' }, { id: 'c', _p: '2026-10', blockId: 'B2', teamName: 'Cũ', projectName: 'X' }];
const bot = (t: string) => (t === 'T1' ? 'B1' : t === 'T2' ? 'B2' : '');
describe('filterLegacy', () => {
  it('lọc Tháng / Khối / Phòng / Dự án', () => {
    expect(filterLegacy(R, { period: '2026-10' }, bot).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterLegacy(R, { period: '*', blockId: 'B2' }, bot).map((r) => r.id)).toEqual(['b', 'c']);
    expect(filterLegacy(R, { period: '*', teamKey: 'Cũ' }, bot).map((r) => r.id)).toEqual(['c']);
    expect(filterLegacy(R, { period: '*', projectKey: 'P2' }, bot).map((r) => r.id)).toEqual(['b']);
  });
});
