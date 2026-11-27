import { expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { rasterizeInvoicePages } from '../src/vnext/renderInvoicePdf';

function samplePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    ...[6, 7, 8].map((id) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 80] /Resources << >> /Contents ${id} 0 R >>`),
    ...['1 0 0', '0 1 0', '0 0 1'].map((rgb) => {
      const stream = `${rgb} rg 0 0 100 80 re f\n`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    }),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

it('rasterizes three distinct pages from a synthetic PDF', async () => {
  const task = getDocument({ data: samplePdf() });
  try {
    const pdf = await task.promise;
    const factory = pdf.canvasFactory as { create: (width: number, height: number) => { canvas: HTMLCanvasElement } };
    const { canvas } = factory.create(1, 1);
    const result = await rasterizeInvoicePages(pdf, canvas);
    expect(result.pages).toBe(3);
    expect(result.sources).toHaveLength(3);
    expect(result.sources.every((src) => src.startsWith('data:image/jpeg;base64,'))).toBe(true);
    expect(new Set(result.sources).size).toBe(3);
  } finally {
    await task.destroy();
  }
});
