/** Hóa đơn Nghiệm thu (client): mime hợp lệ, suy mime từ đuôi tệp, phân loại hiển thị. Chỉ dành cho HÓA ĐƠN — ảnh nghiệm thu vẫn chỉ nhận ảnh. */
export const OK_INVOICE_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/zip', 'application/x-zip-compressed', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
export const INVOICE_EXT_RE = /\.(zip|xlsx?|csv|pdf|jpe?g|png|webp|heic|heif)$/i;
export const INVOICE_ACCEPT = 'image/*,application/pdf,application/zip,.zip,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,.xlsx,text/csv,.csv';
export const INVOICE_TYPES_MSG = 'Chỉ nhận ảnh, PDF, ZIP, Excel hoặc CSV';

type F = { name: string; type: string };

export function inferInvoiceMime(f: F): string {
  let m = f.type === 'image/jpg' ? 'image/jpeg' : f.type;
  const n = (f.name || '').toLowerCase();
  if (n.endsWith('.csv')) return 'text/csv'; // mọi biến thể (ms-excel, text/plain, x-csv, '') → text/csv
  if (!m || m === 'application/octet-stream') {
    if (n.endsWith('.pdf')) m = 'application/pdf';
    else if (n.endsWith('.zip')) m = 'application/zip';
    else if (n.endsWith('.xls')) m = 'application/vnd.ms-excel';
    else if (n.endsWith('.xlsx')) m = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (n.endsWith('.png')) m = 'image/png';
    else if (n.endsWith('.webp')) m = 'image/webp';
    else if (/\.jpe?g$/.test(n)) m = 'image/jpeg';
  }
  return m;
}

/** Tệp hợp lệ làm hóa đơn? (theo mime đã suy, hoặc đuôi tệp) */
export function isInvoiceFileOk(f: F): boolean {
  return OK_INVOICE_MIME.includes(inferInvoiceMime(f)) || INVOICE_EXT_RE.test(f.name || '');
}

/** Đuôi dùng đặt tên tệp hóa đơn. */
export function invoiceExt(f: F): string {
  return f.type === 'application/pdf' ? 'pdf' : (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
}

type M = { mime?: string; name?: string };
export const isCsvInvoice = (i: M) => (i.mime || '') === 'text/csv' || /\.csv$/i.test(i.name || '');
/** Xem trước được (ảnh/PDF). CSV/ZIP/Excel → thẻ tệp "bấm tải". */
export const isPreviewableInvoice = (i: M) => !isCsvInvoice(i) && ((i.mime || '').startsWith('image/') || i.mime === 'application/pdf');
export const isDownloadOnlyInvoice = (i: M) => isCsvInvoice(i) || /zip|excel|spreadsheet|sheet/i.test(i.mime || '') || /\.(zip|xlsx?|csv)$/i.test(i.name || '');
