/** UI gate for Nghiệm thu «Tải ảnh» / «Tải hoá đơn» (Admin/Mod via perms; rules still require admin|mod). */
export type NtUploadCtx = { role?: string; perms?: string[] } | null | undefined;

export function showNtImageUpload(ntCtx: NtUploadCtx, canUploadImages: boolean): boolean {
  return !!(ntCtx && canUploadImages);
}

export function showNtInvoiceUpload(ntCtx: NtUploadCtx): boolean {
  return !!(ntCtx && (ntCtx.role === 'super_admin' || (ntCtx.perms || []).includes('vn.nt_invoices.upload')));
}
