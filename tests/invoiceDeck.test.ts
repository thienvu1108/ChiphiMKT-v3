import { describe, it, expect, vi } from 'vitest';
import { expandPdfInvoicePages, invoiceDeckImages, PDF_PAGE_LIMIT } from '../lib/vnext/invoiceDeck';
const inv = (id: string, acc: string, mime: string, order: number) => ({ id, acceptanceId: acc, fileId: 'f' + id, name: id + '.x', mime, order, webViewLink: 'https://drive/' + id });
describe('invoiceDeckImages', () => {
  it('lọc theo bản ghi, xếp sau ảnh NT, giữ link Drive, đánh dấu PDF', () => {
    const r = invoiceDeckImages([inv('a', 'R1', 'application/pdf', 2), inv('b', 'R1', 'image/jpeg', 1), inv('c', 'R9', 'image/png', 1)], [{ id: 'R1' }]);
    expect(r.map((x) => x.inv)).toEqual(['a', 'b']);
    expect(r[0]).toMatchObject({ provider: 'drive', ref: 'fa', recordId: 'R1', link: 'https://drive/a', order: 100002 });
    expect(r[0]).toMatchObject({ pdfName: 'a.x', caption: 'Hóa đơn (PDF, trang 1) · a.x' });
    expect(r[0].pages).toBeUndefined();
    expect(r[1].caption).not.toContain('PDF');
  });
});

describe('expandPdfInvoicePages', () => {
  const [pdf, image] = invoiceDeckImages([
    inv('a', 'R1', 'application/pdf', 1), inv('b', 'R1', 'image/jpeg', 1),
  ], [{ id: 'R1' }]);

  it('expands an old share snapshot, preserves order, and reopens a new snapshot', async () => {
    const { pdfName, ...legacy } = pdf;
    const count = vi.fn(async () => 3);
    const result = await expandPdfInvoicePages([legacy, image], count);
    expect(count).toHaveBeenCalledExactlyOnceWith(legacy);
    expect(result.map((x) => x.id)).toEqual(['inv_a', 'inv_a_p2', 'inv_a_p3', 'inv_b']);
    expect(result.slice(0, 3).map((x) => x.caption)).toEqual([1, 2, 3].map((n) => `Hóa đơn (PDF, trang ${n}/3) · a.x`));
    expect(result[2]).toMatchObject({ order: pdf.order, page: 3, pages: 3, link: pdf.link, ref: pdf.ref, inv: pdf.inv });
    expect(result[3]).toBe(image);
    expect(await expandPdfInvoicePages(result, async () => 3)).toEqual(result);
  });

  it('caps pages and reports the full page count', async () => {
    const result = await expandPdfInvoicePages([pdf], async () => PDF_PAGE_LIMIT + 7);
    expect(result).toHaveLength(PDF_PAGE_LIMIT);
    expect(result[0].warning).toContain('30/37 trang');
    expect(result.at(-1)?.caption).toContain('trang 30/37');
  });

  it.each([[new Error('Unreadable'), 'Không đọc được'], [{ status: 413 }, 'PDF lớn hơn 4 MB']])(
    'keeps the first-page thumbnail on failure (%j)', async (error, message) => {
      const result = await expandPdfInvoicePages([pdf], async () => { throw error; });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: pdf.id, caption: pdf.caption, page: 1, pages: undefined });
      expect(result[0].warning).toContain(message);
    },
  );
});
