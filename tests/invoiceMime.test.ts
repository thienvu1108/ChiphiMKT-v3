import { describe, it, expect } from 'vitest';
import { inferInvoiceMime, isInvoiceFileOk, invoiceExt, isPreviewableInvoice, isDownloadOnlyInvoice, isCsvInvoice, INVOICE_ACCEPT } from '../lib/vnext/invoiceMime';
import { mimeFromName, INVOICE_MIMES } from '../api/_lib/invoiceMime';
import { invoiceDeckImages } from '../lib/vnext/invoiceDeck';

describe('client invoice mime', () => {
  for (const type of ['', 'text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream']) {
    it(`.csv with type "${type}" → text/csv and accepted`, () => {
      const f = { name: 'hoadon.CSV', type };
      expect(inferInvoiceMime(f)).toBe('text/csv');
      expect(isInvoiceFileOk(f)).toBe(true);
    });
  }
  it('keeps real excel/xls mime for non-csv', () => {
    expect(inferInvoiceMime({ name: 'a.xls', type: 'application/vnd.ms-excel' })).toBe('application/vnd.ms-excel');
    expect(inferInvoiceMime({ name: 'a.xlsx', type: '' })).toContain('spreadsheetml');
  });
  it('images/pdf/zip/xlsx still pass', () => {
    for (const f of [{ name: 'a.jpg', type: 'image/jpeg' }, { name: 'a.png', type: '' }, { name: 'a.pdf', type: 'application/pdf' }, { name: 'a.zip', type: 'application/x-zip-compressed' }, { name: 'a.xlsx', type: '' }, { name: 'a.heic', type: '' }]) expect(isInvoiceFileOk(f)).toBe(true);
  });
  it('rejects .exe / html / txt', () => {
    expect(isInvoiceFileOk({ name: 'a.exe', type: 'application/x-msdownload' })).toBe(false);
    expect(isInvoiceFileOk({ name: 'a.exe', type: '' })).toBe(false);
    expect(isInvoiceFileOk({ name: 'a.html', type: 'text/html' })).toBe(false);
    expect(isInvoiceFileOk({ name: 'a.txt', type: 'text/plain' })).toBe(false);
  });
  it('ext + accept', () => {
    expect(invoiceExt({ name: 'x.csv', type: 'text/csv' })).toBe('csv');
    expect(INVOICE_ACCEPT).toContain('.csv');
  });
  it('csv is download-only, never previewable', () => {
    const i = { mime: 'text/csv', name: 'x.csv' };
    expect(isCsvInvoice(i)).toBe(true);
    expect(isPreviewableInvoice(i)).toBe(false);
    expect(isDownloadOnlyInvoice(i)).toBe(true);
    expect(isPreviewableInvoice({ mime: 'application/pdf', name: 'a.pdf' })).toBe(true);
    expect(isPreviewableInvoice({ mime: 'image/png', name: 'a.png' })).toBe(true);
    expect(isDownloadOnlyInvoice({ mime: 'application/zip', name: 'a.zip' })).toBe(true);
  });
  it('deck skips csv, keeps image/pdf', () => {
    const mk = (id: string, mime: string, name: string) => ({ id, acceptanceId: 'r1', fileId: 'f' + id, name, mime, order: 1, webViewLink: '' });
    const out = invoiceDeckImages([mk('1', 'text/csv', 'a.csv'), mk('2', 'image/png', 'a.png'), mk('3', 'application/pdf', 'a.pdf')], [{ id: 'r1' }]);
    expect(out.map((o) => o.inv)).toEqual(['2', '3']);
  });
});

describe('server invoice mime', () => {
  for (const type of ['', 'text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream']) {
    it(`.csv with type "${type}" → text/csv, allowed`, () => {
      const m = mimeFromName('MAYHOMES - HD - x.csv', type);
      expect(m).toBe('text/csv');
      expect(INVOICE_MIMES.includes(m)).toBe(true);
    });
  }
  it('others unchanged', () => {
    expect(INVOICE_MIMES.includes(mimeFromName('a.pdf', ''))).toBe(true);
    expect(INVOICE_MIMES.includes(mimeFromName('a.zip', ''))).toBe(true);
    expect(INVOICE_MIMES.includes(mimeFromName('a.xlsx', ''))).toBe(true);
    expect(INVOICE_MIMES.includes(mimeFromName('a.jpg', 'image/jpeg'))).toBe(true);
    expect(mimeFromName('a.xls', 'application/vnd.ms-excel')).toBe('application/vnd.ms-excel');
  });
  it('rejects exe / html / plain txt', () => {
    expect(INVOICE_MIMES.includes(mimeFromName('a.exe', ''))).toBe(false);
    expect(INVOICE_MIMES.includes(mimeFromName('a.exe', 'application/x-msdownload'))).toBe(false);
    expect(INVOICE_MIMES.includes(mimeFromName('a.html', 'text/html'))).toBe(false);
    expect(INVOICE_MIMES.includes(mimeFromName('a.txt', 'text/plain'))).toBe(false);
  });
});
