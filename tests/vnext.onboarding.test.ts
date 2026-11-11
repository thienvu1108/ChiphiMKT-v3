import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { approvalUserPatch, canApprove, findDuplicate, gdkdCount, implementerOptions, needsOnboarding, ntDrivePath, ntFileName, ntKey,
  pendingFor, roleForPosition, validateRequest, type AccessRequest } from '../lib/vnext/onboarding';
import { VN_FEATURE_KEYS, editablePerms, effectiveVnPerms, rulesBlock, vnDefaultPerms, vnPermissionGroups } from '../lib/vnext/featureRegistry';

const R = (o: Partial<AccessRequest> = {}): AccessRequest => ({ uid: 'n', email: 'n@x', name: 'N', kind: 'onboarding', dept: 'kd', position: 'nvkd',
  blockId: 'B1', blockCode: 'E01', teamId: 'T1', teamName: 'MAY-01', teamCode: 'E01.1', status: 'pending', createdAt: '', ...o });
const gdk = { uid: 'k', role: 'gd_khoi', blockIds: ['B1'], gdkdTeamIds: [] };
const gdk2 = { uid: 'k2', role: 'gd_khoi', blockIds: ['B2'], gdkdTeamIds: [] };
const g1 = { uid: 'g1', role: 'gdkd', blockIds: [], gdkdTeamIds: ['T1'] };
const adm = { uid: 'a', role: 'admin', blockIds: [], gdkdTeamIds: [] };

describe('needsOnboarding', () => {
  it('GĐK/TLK/Mod/Admin bỏ qua; còn lại phải đăng ký lại', () => {
    for (const r of ['gd_khoi', 'tro_ly_khoi', 'mod', 'admin', 'super_admin']) expect(needsOnboarding({ role: r })).toBe(false);
    for (const r of ['user', 'gdkd', 'accountant', 'truong_ban_kd']) expect(needsOnboarding({ role: r, teamName: 'X' })).toBe(true);
    expect(needsOnboarding({ role: 'user', vnOnboarding: { status: 'approved' } })).toBe(false);
    expect(needsOnboarding({ role: 'user', vnOnboarding: { status: 'pending' } })).toBe(true);
    expect(needsOnboarding({ role: 'user' }, { isAppOwner: true })).toBe(false);
  });
});

describe('validate / role', () => {
  it('bắt buộc theo nhánh', () => {
    expect(validateRequest({ dept: 'kd', position: 'nvkd', blockId: 'B1', name: 'a' })).toBe('Chọn Phòng Kinh doanh');
    expect(validateRequest({ dept: 'bo', position: 'bo_nhan_vien', name: 'a' })).toBe('Chọn Ban KD hoặc Phòng Digital');
    expect(validateRequest({ dept: 'kd', position: 'tro_ly_khoi', blockId: 'B1', name: 'a' })).toBeNull();
    expect(validateRequest({ dept: 'bo', position: 'nvkd', name: 'a' })).toBe('Chức vụ không hợp lệ');
  });
  it('BO giữ role đang có', () => {
    expect(roleForPosition('bo_truong_ban', 'accountant')).toBe('accountant');
    expect(roleForPosition('bo_nhan_vien', undefined)).toBe('user');
    expect(roleForPosition('nvkd', 'gdkd')).toBe('user');
  });
});

describe('canApprove', () => {
  it('NVKD: GĐKD của Phòng; B5: GĐK của Khối duyệt cả Phòng đã có GĐKD; GĐK Khối khác không', () => {
    const team = { id: 'T1', gdkdUids: ['g1'] };
    expect(canApprove(g1, R(), { team }).ok).toBe(true);
    expect(canApprove(gdk, R(), { team }).ok).toBe(true);
    expect(canApprove(gdk2, R(), { team }).ok).toBe(false);
    expect(canApprove(gdk, R(), { team: { id: 'T1', gdkdUids: [] } }).ok).toBe(true);
    expect(canApprove(gdk2, R(), { team: { id: 'T1', gdkdUids: [] } }).ok).toBe(false);
    expect(canApprove(adm, R(), { team }).ok).toBe(true);
  });
  it('Xin chuyển (cũ): chỉ Admin duyệt; GĐK / GĐKD không', () => {
    const team = { id: 'T1', gdkdUids: [] };
    expect(canApprove(gdk, R({ kind: 'transfer' }), { team }).ok).toBe(false);
    expect(canApprove(g1, R({ kind: 'transfer' }), { team: { id: 'T1', gdkdUids: ['g1'] } }).ok).toBe(false);
    expect(canApprove(gdk, R({ kind: 'transfer', position: 'gdkd' }), { team }).ok).toBe(false);
    expect(canApprove(adm, R({ kind: 'transfer' }), { team }).ok).toBe(true);
  });
  it('GĐKD: tối đa 4', () => {
    const full = { id: 'T1', gdkdUids: ['a', 'b', 'c', 'd'] };
    const res = canApprove(gdk, R({ position: 'gdkd' }), { team: full });
    expect(res.ok).toBe(false); expect(res.reason).toMatch(/4 GĐKD/);
    expect(canApprove(adm, R({ position: 'gdkd' }), { team: full }).ok).toBe(false);
    expect(canApprove(gdk, R({ position: 'gdkd' }), { team: { id: 'T1', gdkdUids: ['a'] } }).ok).toBe(true);
    expect(gdkdCount(full, [{ uid: 'e', role: 'gdkd', teamId: 'T1' }])).toBe(5);
  });
  it('TLK: GĐK/Admin; GĐ Khối & BO: Admin; không tự duyệt', () => {
    expect(canApprove(gdk, R({ position: 'tro_ly_khoi' }), {}).ok).toBe(true);
    expect(canApprove(gdk, R({ position: 'gd_khoi' }), {}).ok).toBe(false);
    expect(canApprove(adm, R({ position: 'gd_khoi' }), {}).ok).toBe(true);
    expect(canApprove(gdk, R({ dept: 'bo', position: 'bo_pho_ban' }), {}).ok).toBe(false);
    expect(canApprove(adm, R({ uid: 'a' }), {}).ok).toBe(false);
  });
  it('pendingFor: GĐK vẫn thấy GĐKD thứ 5 để từ chối', () => {
    const teams = [{ id: 'T1', gdkdUids: ['a', 'b', 'c', 'd'] }];
    expect(pendingFor(gdk, [R({ position: 'gdkd' })], teams, [])).toHaveLength(1);
    expect(pendingFor(gdk2, [R({ position: 'gdkd' })], teams, [])).toHaveLength(0);
  });
  it('approvalUserPatch', () => {
    const p = approvalUserPatch(R(), 'user', 'g1', 'now');
    expect(p).toMatchObject({ role: 'user', teamId: 'T1', teamName: 'MAY-01', vnOnboarding: { status: 'approved', position: 'nvkd' } });
    expect(approvalUserPatch(R({ position: 'tro_ly_khoi' }), 'user', 'k', 'now')).toMatchObject({ role: 'tro_ly_khoi', assignedBlock: 'E01' });
  });
});

describe('Nghiệm thu', () => {
  it('tên tệp + đường dẫn Drive', () => {
    expect(ntFileName({ teamCode: 'E01.1', projectName: 'Sun/Urban', implementerName: 'Lê A', month: '2026-11', order: 3 }))
      .toBe('MAYHOMES - E01.1 - Sun Urban - Lê A - Tháng 11 2026 - 03.jpg');
    expect(ntDrivePath({ month: '2026-01', blockCode: 'E01', teamCode: 'E01.1', implementerName: 'Lê A', projectName: 'P' }))
      .toEqual(['Tháng 01-2026', 'E01', 'E01.1', 'Lê A', 'P']);
  });
  it('khoá trùng + người phụ trách lọc theo Phòng', () => {
    expect(ntKey('2026-11', 'u', 'P')).toBe('2026-11_u_P');
    const recs = [{ id: 'A', month: '2026-11', implementerUid: 'u', projectId: 'P' }];
    expect(findDuplicate(recs, { month: '2026-11', implementerUid: 'u', projectId: 'P' })?.id).toBe('A');
    expect(findDuplicate(recs, { id: 'A', month: '2026-11', implementerUid: 'u', projectId: 'P' })).toBeNull();
    const opts = implementerOptions([{ uid: 'x', teamId: 'T1', fullName: 'B' }, { uid: 'y', teamId: 'T2', fullName: 'A' }], 'T1');
    expect(opts.map((o) => o.uid)).toEqual(['x']);
  });
});

describe('Registry quyền', () => {
  it('mặc định + nhóm', () => {
    expect(vnDefaultPerms('mod')).toContain('vn.nt_images.upload');
    expect(vnDefaultPerms('gd_khoi')).not.toContain('vn.nt_images.upload');
    expect(vnPermissionGroups().flatMap((g) => g.items.map((i) => i.key)).sort()).toEqual([...VN_FEATURE_KEYS].sort());
  });
  it('knownKeys: khoá mới tự lấy mặc định; khoá đã biết theo doc', () => {
    expect(effectiveVnPerms('mod', { permissions: [], knownKeys: [] })).toContain('vn.nt_images.upload');
    expect(effectiveVnPerms('mod', { permissions: [], knownKeys: ['vn.nt_images.upload'] })).not.toContain('vn.nt_images.upload');
    expect(editablePerms('mod', { permissions: ['report_nt.view'] }, [])).toContain('report_nt.view');
  });
  it('firestore.rules đồng bộ registry (npm run gen:vn-rules)', () => {
    expect(readFileSync('firestore.rules', 'utf8')).toContain(rulesBlock());
  });
});

describe('implementerOptions — chỉ thành viên đã duyệt của Phòng', () => {
  const users = [
    { uid: 'a', teamId: 'T1', fullName: 'An', role: 'user', vnOnboarding: { status: 'approved' } },
    { uid: 'b', teamId: 'T1', fullName: 'Bình', role: 'gdkd', vnOnboarding: { status: 'approved' } },
    { uid: 'c', teamId: 'T1', fullName: 'Chờ', role: 'user', vnOnboarding: { status: 'pending' } },
    { uid: 'd', teamId: 'T2', fullName: 'Dũng', role: 'user', vnOnboarding: { status: 'approved' } },
    { uid: 'e', teamId: 'T9', fullName: 'Em GĐKD', role: 'gdkd', vnOnboarding: { status: 'approved' } },
  ];
  it('chỉ GĐKD+NVKD đã duyệt của Phòng, kèm gdkdUids', () => {
    const opts = implementerOptions(users, 'T1', { gdkdUids: ['e'] });
    expect(opts.map((o) => o.uid).sort()).toEqual(['a', 'b', 'e']);
    expect(opts[0].name).toBe('An'); // A-Z
  });
  it('không Phòng → []', () => expect(implementerOptions(users, '')).toEqual([]));
});
