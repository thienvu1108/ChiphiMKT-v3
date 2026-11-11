import { describe, it, expect } from 'vitest';
import { kycRequired } from '../lib/vnext/onboarding';
describe('kycRequired', () => {
  it('admin/mod/super_admin/truong_ban_kd miễn KYC bắt buộc', () => {
    for (const r of ['admin', 'mod', 'super_admin', 'truong_ban_kd']) expect(kycRequired(r)).toBe(false);
  });
  it('app owner miễn', () => expect(kycRequired('user', { isAppOwner: true })).toBe(false));
  it('ban_kd.leaderUid (role user) miễn qua isBanLeader', () => {
    expect(kycRequired('user', { isBanLeader: true })).toBe(false);
  });
  it('ban_kd.deputyUids (Phó Ban) miễn qua isBanDeputy', () => {
    expect(kycRequired('user', { isBanDeputy: true })).toBe(false);
    expect(kycRequired('gd_khoi', { isBanDeputy: true })).toBe(false);
  });
  it('user/gdkd/gd_khoi/tro_ly_khoi vẫn bắt buộc', () => {
    for (const r of ['user', 'gdkd', 'gd_khoi', 'tro_ly_khoi', undefined]) expect(kycRequired(r)).toBe(true);
  });
});
