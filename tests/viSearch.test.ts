import { describe, it, expect } from 'vitest';
import { normVi, viCompare, sortOptionsVi, matchVi } from '../src/lib/viSearch';

describe('viSearch', () => {
  it('normVi bỏ dấu và đ', () => {
    expect(normVi('  Vĩnh  Đức ')).toBe('vinh duc');
    expect(normVi('VINHOMES Ocean Park 2')).toBe('vinhomes ocean park 2');
  });
  it('matchVi không phân biệt dấu', () => {
    expect(matchVi('Vĩnh Yên', 'vinh')).toBe(true);
    expect(matchVi('Đông Anh', 'dong anh')).toBe(true);
    expect(matchVi('Vinhomes Wonder City', 'wonder vin')).toBe(true);
    expect(matchVi('The Rivus', 'ocean')).toBe(false);
    expect(matchVi('anything', '')).toBe(true);
  });
  it('sort A-Z tiếng Việt, ghim mục rỗng', () => {
    const r = sortOptionsVi([
      { value: 'z', label: 'Vinhomes Wonder City' }, { value: '', label: 'Tất cả' },
      { value: 'a', label: 'Ánh Dương' }, { value: 'b', label: 'alora' }, { value: 'd', label: 'Đông Anh' }, { value: 'c', label: 'Dĩ An' },
      { value: 'p10', label: 'Park 10' }, { value: 'p2', label: 'Park 2' },
    ]);
    expect(r.map((o) => o.label)).toEqual(['Tất cả', 'alora', 'Ánh Dương', 'Dĩ An', 'Đông Anh', 'Park 2', 'Park 10', 'Vinhomes Wonder City']);
    expect(viCompare('a', 'A')).toBe(0);
  });
});
