import { describe, expect, it } from 'vitest';
import { showNtImageUpload, showNtInvoiceUpload } from '../src/lib/ntUploadGate';

describe('ntUploadGate', () => {
  it('hides image upload without ntCtx even if canUploadImages', () => {
    expect(showNtImageUpload(null, true)).toBe(false);
    expect(showNtImageUpload(undefined, true)).toBe(false);
  });

  it('shows image upload only when ntCtx + canUploadImages (Admin/Mod path)', () => {
    expect(showNtImageUpload({ role: 'admin', perms: ['vn.nt_images.upload'] }, true)).toBe(true);
    expect(showNtImageUpload({ role: 'mod', perms: ['vn.nt_images.upload'] }, true)).toBe(true);
    expect(showNtImageUpload({ role: 'admin', perms: ['vn.nt_images.upload'] }, false)).toBe(false);
  });

  it('hides image upload for Khối / Ban roles (canUploadImages false)', () => {
    for (const role of ['gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'pho_ban_kd']) {
      expect(showNtImageUpload({ role, perms: [] }, false)).toBe(false);
    }
  });

  it('shows invoice upload for super_admin or vn.nt_invoices.upload', () => {
    expect(showNtInvoiceUpload({ role: 'super_admin', perms: [] })).toBe(true);
    expect(showNtInvoiceUpload({ role: 'mod', perms: ['vn.nt_invoices.upload'] })).toBe(true);
    expect(showNtInvoiceUpload({ role: 'admin', perms: [] })).toBe(false);
    expect(showNtInvoiceUpload(null)).toBe(false);
  });

  it('hides invoice upload for Khối / Ban roles without invoice perm', () => {
    for (const role of ['gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'pho_ban_kd']) {
      expect(showNtInvoiceUpload({ role, perms: [] })).toBe(false);
    }
  });
});
