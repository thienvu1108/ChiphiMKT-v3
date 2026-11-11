import { describe, it, expect } from 'vitest';
import { isProjectUnassigned, multiBanConflicts } from '../lib/vnext/banProjects';
describe('banProjects', () => {
  it('chưa thuộc Ban', () => {
    expect(isProjectUnassigned({ name: 'a' })).toBe(true);
    expect(isProjectUnassigned({ name: 'a', banKdId: 'B1' })).toBe(false);
    expect(isProjectUnassigned({ name: 'a', banKdName: 'Ban cũ' })).toBe(false);
    expect(isProjectUnassigned({ name: 'a', deleted: true })).toBe(false);
  });
  it('xung đột Ban', () => {
    const bans = [{ id: 'B1', name: 'Ban 1' }, { id: 'B2', name: 'Ban 2' }];
    expect(multiBanConflicts([{ id: 'p', banKdId: 'B1', banKdName: 'ban 2' }, { id: 'q', banKdId: 'B1', banKdName: 'Ban 1' }], bans).map((x) => x.id)).toEqual(['p']);
  });
});
