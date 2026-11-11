import { describe, it, expect } from 'vitest';
import { canRenameUser, canRenameSelf, validateName, cleanName, buildRename, targetBlockIds } from '../lib/vnext/rename';
import { VN_FEATURE_KEYS, vnDefaultPerms } from '../lib/vnext/featureRegistry';

const teams = [{ id: 'T1', blockId: 'B1' }, { id: 'T2', blockId: 'B2' }, { id: 'T3', blockCode: 'E03' }];
const blocks = [{ id: 'B1' }, { id: 'B2' }, { id: 'B3', blockCode: 'E03' }];
const A = (role: string, over: any = {}) => ({ uid: 'me', role, can: true, myBlockIds: [], gdkdTeamIds: [], ...over });
const U = (id: string, role: string, teamId = '', extra: any = {}) => ({ id, role, teamId, ...extra });

describe('canRenameUser', () => {
  it('admin: mọi người', () => { expect(canRenameUser(A('admin'), U('x', 'super_admin'), teams)).toBe(true); });
  it('không có quyền → không (trừ super_admin)', () => { expect(canRenameUser(A('admin', { can: false }), U('x', 'user'), teams)).toBe(false); expect(canRenameUser(A('super_admin', { can: false }), U('x', 'user'), teams)).toBe(true); });
  it('GĐK: người trong Khối', () => {
    const a = A('gd_khoi', { myBlockIds: ['B1', 'B3'] });
    expect(canRenameUser(a, U('u', 'user', 'T1'), teams, blocks)).toBe(true);
    expect(canRenameUser(a, U('u', 'user', 'T3'), teams, blocks)).toBe(true);
    expect(canRenameUser(a, U('u', 'user', 'T2'), teams, blocks)).toBe(false);
    expect(canRenameUser(a, U('t', 'tro_ly_khoi', '', { vnOnboarding: { blockId: 'B1' } }), teams, blocks)).toBe(true);
    expect(canRenameUser(a, U('m', 'mod', 'T1'), teams, blocks)).toBe(false);
    expect(canRenameUser(a, U('ad', 'admin', 'T1'), teams, blocks)).toBe(false);
  });
  it('GĐKD: user/GĐKD trong Phòng mình', () => {
    const a = A('gdkd', { gdkdTeamIds: ['T1'] });
    expect(canRenameUser(a, U('u', 'user', 'T1'), teams)).toBe(true);
    expect(canRenameUser(a, U('g', 'gdkd', 'T1'), teams)).toBe(true);
    expect(canRenameUser(a, U('u', 'user', 'T2'), teams)).toBe(false);
    expect(canRenameUser(a, U('k', 'gd_khoi', 'T1'), teams)).toBe(false);
  });
  it('không tự đổi qua nút (dùng hồ sơ cá nhân)', () => { expect(canRenameUser(A('gdkd', { gdkdTeamIds: ['T1'] }), U('me', 'gdkd', 'T1'), teams)).toBe(false); });
  it('user thường: không', () => { expect(canRenameUser(A('user'), U('u', 'user', 'T1'), teams)).toBe(false); });
});

describe('tên + bản ghi', () => {
  it('chuẩn hoá / kiểm tra', () => {
    expect(cleanName('  Nguyễn   Văn\tA ')).toBe('Nguyễn Văn A');
    expect(validateName('  ')).toBeTruthy(); expect(validateName('x'.repeat(121))).toBeTruthy(); expect(validateName('Lê B')).toBeNull();
  });
  it('buildRename: patch chỉ trường tên + audit cũ → mới', () => {
    const r = buildRename(A('gd_khoi', { email: 'me@x' }), { id: 'u', fullName: 'Cũ', email: 'u@x' }, ' Mới ', 'NOW', 'aid');
    expect(Object.keys(r.userPatch).sort()).toEqual(['displayName', 'fullName', 'nameAuditId', 'nameUpdatedAt', 'nameUpdatedBy', 'updatedAt']);
    expect(r.audit).toMatchObject({ action: 'RENAME_USER', userId: 'me', targetUid: 'u', oldName: 'Cũ', newName: 'Mới' });
  });
  it('targetBlockIds theo Phòng / blockCode / vnOnboarding', () => { expect(targetBlockIds(U('u', 'user', 'T3', { vnOnboarding: { blockId: 'B1' } }), teams, blocks).sort()).toEqual(['B1', 'B3']); });
  it('registry: vn.users.rename mặc định admin, GĐK, Trợ lý, GĐKD', () => {
    expect(VN_FEATURE_KEYS).toContain('vn.users.rename');
    for (const r of ['admin', 'gd_khoi', 'tro_ly_khoi', 'gdkd'] as const) expect(vnDefaultPerms(r)).toContain('vn.users.rename');
    for (const r of ['mod', 'user', 'accountant'] as const) expect(vnDefaultPerms(r)).not.toContain('vn.users.rename');
  });
  it('tự đổi tên: mọi vai trò mặc định có vn.users.rename_self; tắt quyền → không', () => {
    expect(VN_FEATURE_KEYS).toContain('vn.users.rename_self');
    for (const r of ['admin', 'mod', 'accountant', 'gdda', 'gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'gdkd', 'assistant', 'user'] as const) expect(vnDefaultPerms(r)).toContain('vn.users.rename_self');
    expect(canRenameSelf('user', true)).toBe(true); expect(canRenameSelf('user', false)).toBe(false); expect(canRenameSelf('super_admin', false)).toBe(true);
    const r = buildRename(A('user', { uid: 'u', email: 'u@x' }), { id: 'u', fullName: 'Cũ' }, 'Mới', 'NOW', 'aid');
    expect(r.audit).toMatchObject({ userId: 'u', targetUid: 'u', oldName: 'Cũ', newName: 'Mới' }); expect(r.userPatch.nameUpdatedBy).toBe('u');
  });
});
