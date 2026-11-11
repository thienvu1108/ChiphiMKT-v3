import { describe, it, expect } from 'vitest';
import { assignedBanIds, diffIds } from '../src/lib/banAssignment';
const bans = [{ id: 'b1', code: 'BKD1', name: 'BAN 1', leaderId: 'L1' }, { id: 'b2', code: 'BKD2', name: 'BAN 2', memberUids: ['u9'] }, { id: 'b3', code: 'BKD3', name: 'BAN 3', deputyUids: ['dep1'] }];
describe('assignedBanIds', () => {
  it('user thiếu uid + Ban thiếu leaderUid: không tick sai (bug undefined===undefined)', () => {
    expect(assignedBanIds({ id: 'x', email: 'a@b.c' }, bans)).toEqual([]);
  });
  it('khớp theo hồ sơ / member / leaderId', () => {
    expect(assignedBanIds({ id: 'u9' }, bans)).toEqual(['b2']);
    expect(assignedBanIds({ id: 'L1' }, bans)).toEqual(['b1']);
    expect(assignedBanIds({ id: 'z', assignedBanKds: ['BKD2'] }, bans)).toEqual(['b2']);
  });
  it('khớp Phó ban qua deputyUids', () => {
    expect(assignedBanIds({ id: 'x', uid: 'dep1' }, bans)).toEqual(['b3']);
  });
  it('diff', () => { expect(diffIds(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] }); });
});
