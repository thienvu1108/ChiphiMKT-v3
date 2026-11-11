/** «Link QC» trên bản ghi Nghiệm thu MKT: danh sách link quảng cáo (adLinks: string[]). */
export const AD_LINKS_MAX = 20;
export const AD_LINK_MAX_LEN = 2000;

/** Chuẩn hoá 1 link: thêm https:// nếu thiếu; trả '' nếu không hợp lệ (chỉ http/https). */
export function normalizeAdLink(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (!u.hostname.includes('.') || /\s/.test(s)) return '';
    return s.length > AD_LINK_MAX_LEN ? '' : u.toString();
  } catch { return ''; }
}

export function adLinksOf(item: any): string[] {
  const v = item?.adLinks;
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
}

/** Gộp/kiểm tra danh sách trước khi lưu: bỏ trùng, bỏ trống; lỗi nếu có link sai hoặc quá số lượng. */
export function cleanAdLinks(list: string[]): { links: string[]; error?: string } {
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    if (!String(list[i] || '').trim()) continue;
    const n = normalizeAdLink(list[i]);
    if (!n) return { links: out, error: `Link thứ ${i + 1} không hợp lệ (cần http/https).` };
    if (!out.includes(n)) out.push(n);
  }
  if (out.length > AD_LINKS_MAX) return { links: out, error: `Tối đa ${AD_LINKS_MAX} link.` };
  return { links: out };
}
