/// <reference types="vite/client" />

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDF_PAGE_LIMIT } from '../../lib/vnext/invoiceDeck';

export async function rasterizeInvoicePages(pdf: PDFDocumentProxy, canvas: HTMLCanvasElement) {
  const sources: string[] = [];
  for (let number = 1; number <= Math.min(pdf.numPages, PDF_PAGE_LIMIT); number++) {
    const page = await pdf.getPage(number);
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1800 / Math.max(original.width, original.height) });
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvas, viewport }).promise;
    sources.push(canvas.toDataURL('image/jpeg', 0.9));
    page.cleanup();
  }
  return { pages: pdf.numPages, sources };
}

export async function renderInvoicePdf(data: ArrayBuffer) {
  const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;
  const assets = `${import.meta.env.BASE_URL}pdfjs/`;
  const task = getDocument({
    data, canvasMaxAreaInBytes: 32_000_000,
    cMapUrl: assets + 'cmaps/', standardFontDataUrl: assets + 'standard_fonts/',
    wasmUrl: assets + 'wasm/', iccUrl: assets + 'iccs/',
  });
  try {
    return await rasterizeInvoicePages(await task.promise, document.createElement('canvas'));
  } finally {
    await task.destroy();
  }
}
