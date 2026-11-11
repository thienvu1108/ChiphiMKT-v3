import { describe, it, expect } from 'vitest';
import { canRegisterAsUser, canRegisterUserNs, checkEdit, gdkdTeamIdsFor } from '../lib/vnext/budget';

describe('GĐK kiêm GĐKD — đăng ký / sửa NS user', () => {
  const teams = [{ id: 'T1', gdkdUids: ['gdk'] }, { id: 'T2', gdkdUids: [] }];
  it('canRegisterAsUser vẫn chặn GĐK thuần; canRegisterUserNs mở khi có Phòng kiêm', () => {
    expect(canRegisterAsUser('gd_khoi')).toBe(false);
    expect(canRegisterUserNs('gd_khoi', [])).toBe(false);
    expect(canRegisterUserNs('gd_khoi', ['T1'])).toBe(true);
    expect(canRegisterUserNs('tro_ly_khoi', ['T1'])).toBe(true);
    expect(canRegisterUserNs('gdkd', [])).toBe(true);
  });
  it('gdkdTeamIdsFor: GĐK lấy Phòng từ gdkdUids (không cần teamId hồ sơ)', () => {
    expect(gdkdTeamIdsFor('gdk', 'gd_khoi', undefined, teams)).toEqual(['T1']);
    expect(gdkdTeamIdsFor('gdk', 'gd_khoi', 'T9', teams)).toEqual(['T1']);
  });
  it('checkEdit: GĐK kiêm tạo/sửa dòng của chính mình tại Phòng kiêm', () => {
    const actor = { uid: 'gdk', role: 'gd_khoi', teamId: '', gdkdTeamIds: ['T1'] };
    expect(checkEdit(actor, { kind: 'user', teamId: 'T1', ownerUid: 'gdk' }, { windowOpen: true, isNew: true }).ok).toBe(true);
    expect(checkEdit(actor, { kind: 'user', teamId: 'T1', ownerUid: 'gdk' }, { windowOpen: true, isNew: false }).ok).toBe(true);
    expect(checkEdit(actor, { kind: 'user', teamId: 'T2', ownerUid: 'gdk' }, { windowOpen: true, isNew: true }).ok).toBe(false);
  });
  it('checkEdit: GĐK kiêm vẫn sửa dòng user khác tại Phòng kiêm (cần lý do)', () => {
    const actor = { uid: 'gdk', role: 'gd_khoi', teamId: '', gdkdTeamIds: ['T1'] };
    const r = checkEdit(actor, { kind: 'user', teamId: 'T1', ownerUid: 'nv' }, { windowOpen: true, isNew: false });
    expect(r.ok).toBe(true); expect(r.needsReason).toBe(true);
  });
});
