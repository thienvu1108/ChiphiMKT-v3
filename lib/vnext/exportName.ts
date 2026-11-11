/**
 * Tên tệp xuất báo cáo (Excel / PPTX / PDF) thống nhất toàn app:
 *   'Báo cáo - {Mã Khối} - {MM.YYYY}[ - {Mã Phòng}][ - {Tên Dự án}]'
 * Không lọc Khối → 'Tất cả Khối'; nhiều Khối → nối bằng '+' (tối đa 3, quá thì 'Nhiều Khối').
 * Không lọc tháng → 'Tất cả tháng'. Giữ dấu tiếng Việt; chỉ bỏ ký tự cấm trong tên tệp.
 */
export type ExportNameOpts = { blockCode?: string | string[] | null; month?: string | null; teamCode?: string | null; projectName?: string | null; prefix?: string };

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]+/g;
export function safeFilePart(s: any): string {
  return String(s ?? '').normalize('NFC').replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
}

/** 'YYYY-MM' | 'MM.YYYY' | 'M/YYYY' → 'MM.YYYY'; khác → giữ nguyên (đã làm sạch). */
export function exportMonth(m?: string | null): string {
  const s = String(m ?? '').trim();
  if (!s || s === 'all' || s === '*') return 'Tất cả tháng';
  let x = s.match(/^(\d{4})-(\d{1,2})$/); if (x) return `${x[2].padStart(2, '0')}.${x[1]}`;
  x = s.match(/^(\d{1,2})[./-](\d{4})$/); if (x) return `${x[1].padStart(2, '0')}.${x[2]}`;
  return safeFilePart(s);
}

export function exportBaseName(o: ExportNameOpts): string {
  const codes = (Array.isArray(o.blockCode) ? o.blockCode : o.blockCode ? [o.blockCode] : []).map(safeFilePart).filter(Boolean);
  const uniq = [...new Set(codes)];
  const khoi = !uniq.length ? 'Tất cả Khối' : uniq.length > 3 ? 'Nhiều Khối' : uniq.join('+');
  const parts = [o.prefix || 'Báo cáo', khoi, exportMonth(o.month)];
  const t = safeFilePart(o.teamCode); if (t) parts.push(t);
  const p = safeFilePart(o.projectName); if (p) parts.push(p);
  return parts.join(' - ').slice(0, 180).trim();
}
export const exportFileName = (o: ExportNameOpts, ext: 'xlsx' | 'pptx' | 'pdf') => `${exportBaseName(o)}.${ext}`;

/** In PDF qua window.print(): trình duyệt lấy document.title làm tên tệp mặc định. */
export function printWithTitle(title: string, before?: () => void, after?: () => void) {
  const prev = document.title;
  document.title = title; before?.();
  setTimeout(() => { window.print(); after?.(); document.title = prev; }, 50);
}

/** Mã Khối / Mã Phòng từ bản ghi danh mục. */
export const blockCodeOf = (b: any) => (b ? b.blockCode || b.code || b.name || '' : '');
export const teamCodeOf = (t: any) => (t ? t.teamCode || t.code || t.name || '' : '');
