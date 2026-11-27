import { isCsvInvoice } from './invoiceMime';

type Inv = { id: string; acceptanceId: string; fileId: string; name: string; mime: string; order: number; webViewLink: string };
export type DeckImage = {
  id: string; recordId: string; caption?: string; order: number; provider: string; ref: string;
  inv?: string; link?: string; pdfName?: string; page?: number; pages?: number; warning?: string;
};

export const PDF_PAGE_LIMIT = 30;

export function invoiceDeckImages(invoices: Inv[], records: { id: string }[]): DeckImage[] {
  const ids = new Set(records.map((r) => r.id));
  return invoices.filter((i) => ids.has(i.acceptanceId) && i.fileId && !isCsvInvoice(i)).map((i) => ({
    id: 'inv_' + i.id, recordId: i.acceptanceId, order: 100000 + (Number(i.order) || 0), provider: 'drive', ref: i.fileId, inv: i.id, link: i.webViewLink,
    ...(i.mime === 'application/pdf' ? { pdfName: i.name } : {}),
    caption: `Hóa đơn${i.mime === 'application/pdf' ? ' (PDF, trang 1)' : ''} · ${i.name}`,
  }));
}

export function pdfInvoiceName(img: DeckImage) {
  if (img.provider !== 'drive' || !img.inv) return undefined;
  return img.pdfName ?? img.caption?.match(/^Hóa đơn \(PDF, trang 1\) · (.*)$/s)?.[1];
}

export async function expandPdfInvoicePages(
  images: DeckImage[],
  load: (img: DeckImage) => Promise<number>,
): Promise<DeckImage[]> {
  const expanded: DeckImage[] = [];
  for (const img of images) {
    const pdfName = pdfInvoiceName(img);
    if (pdfName === undefined) { expanded.push(img); continue; }
    // A new share snapshot already has one entry per page. Rebuild it from its first page.
    if (img.page && img.page !== 1) continue;
    const base = {
      ...img, pdfName, page: 1, pages: undefined,
      link: img.link || `https://drive.google.com/file/d/${encodeURIComponent(img.ref)}/view`,
    };
    try {
      const pages = await load(img);
      if (!Number.isSafeInteger(pages) || pages < 1) throw new Error('Invalid PDF page count');
      const warning = pages > PDF_PAGE_LIMIT ? `Hiển thị ${PDF_PAGE_LIMIT}/${pages} trang · Mở trên Drive để xem đủ` : undefined;
      for (let page = 1; page <= Math.min(pages, PDF_PAGE_LIMIT); page++) {
        expanded.push({ ...base, id: page === 1 ? img.id : `${img.id}_p${page}`, page, pages,
          caption: `Hóa đơn (PDF, trang ${page}/${pages}) · ${pdfName}`, warning: page === 1 ? warning : undefined });
      }
    } catch (error) {
      const warning = (error as { status?: number })?.status === 413
        ? 'PDF lớn hơn 4 MB · Mở trên Drive để xem đủ'
        : 'Không đọc được các trang PDF · Mở trên Drive để xem đủ';
      expanded.push({ ...base, caption: `Hóa đơn (PDF, trang 1) · ${pdfName}`, warning });
    }
  }
  return expanded;
}
