/** Hóa đơn Nghiệm thu: mime hợp lệ + suy mime từ đuôi tệp (trình duyệt hay trả '' / octet-stream / ms-excel / text/plain cho .csv). */
export const INVOICE_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/zip', 'application/x-zip-compressed', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];


export function mimeFromName(name: string, mime: string): string {
  const m = String(mime || '').trim();
  const n = String(name || '').toLowerCase();
  // .csv: Windows/Excel báo application/vnd.ms-excel, một số máy báo text/plain, text/x-csv → chuẩn hoá text/csv
  if (n.endsWith('.csv')) return 'text/csv';
  if (m && m !== 'application/octet-stream') return m;
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.zip')) return 'application/zip';
  if (n.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.heic')) return 'image/heic';
  if (n.endsWith('.heif')) return 'image/heif';
  if (/\.jpe?g$/.test(n)) return 'image/jpeg';
  return m;
}
