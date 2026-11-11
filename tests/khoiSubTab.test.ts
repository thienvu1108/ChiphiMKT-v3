import { describe, expect, it } from 'vitest';
import { KHOI_DEFAULT_SUBTAB, normalizeKhoiSubTab } from '../src/lib/khoiSubTab';

describe('normalizeKhoiSubTab', () => {
  it('falls back Đối ứng (block-reciprocal) to default Thông tin tab', () => {
    expect(normalizeKhoiSubTab('block-reciprocal')).toBe(KHOI_DEFAULT_SUBTAB);
    expect(normalizeKhoiSubTab('block-reciprocal')).toBe('block-teams');
  });

  it('leaves other Khối tabs unchanged', () => {
    for (const id of ['block-teams', 'block-budgets', 'block-nt', 'block-support', 'block-approvals']) {
      expect(normalizeKhoiSubTab(id)).toBe(id);
    }
  });
});
