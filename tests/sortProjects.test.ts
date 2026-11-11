import { describe, it, expect } from 'vitest';
import { sortProjectsByCreated } from '../lib/vnext/sortProjects';
describe('sortProjectsByCreated', () => {
  it('mới trước, thiếu createdAt cuối theo tên', () => {
    const r = sortProjectsByCreated([{ name: 'Z' }, { name: 'A cũ', createdAt: '2026-01-01' }, { name: 'B' }, { name: 'Mới', createdAt: { seconds: 1800000000 } }]);
    expect(r.map((p) => p.name)).toEqual(['Mới', 'A cũ', 'B', 'Z']);
  });
});
