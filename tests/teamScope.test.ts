import { describe, it, expect } from 'vitest';
import { gdkdScopedTeamIds } from '../lib/vnext/teamScope';
describe('gdkdScopedTeamIds', () => {
  it('GĐKD: chỉ Phòng mình, bỏ trùng/rỗng', () => { expect(gdkdScopedTeamIds('gdkd', ['T1', '', 'T1', 'T2'])).toEqual(['T1', 'T2']); });
  it('GĐKD không Phòng → mảng rỗng (không đọc gì)', () => { expect(gdkdScopedTeamIds('gdkd', [])).toEqual([]); });
  it('vai trò khác → không giới hạn', () => { for (const r of ['admin', 'gd_khoi', 'tro_ly_khoi', 'user', undefined]) expect(gdkdScopedTeamIds(r as any, ['T1'])).toBeNull(); });
});
