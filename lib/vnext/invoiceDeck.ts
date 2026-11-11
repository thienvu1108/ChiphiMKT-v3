type Inv = { id: string; acceptanceId: string; fileId: string; name: string; mime: string; order: number; webViewLink: string };
type DeckImage = { id: string; recordId: string; caption?: string; order: number; provider: string; ref: string; inv?: string; link?: string };
/** Hóa đơn → ảnh trong báo cáo/slide/PPTX (sau ảnh Nghiệm thu của cùng bản ghi). PDF: ảnh trang 1 (Drive dựng). Bấm → mở Drive. */
export function invoiceDeckImages(invoices: Inv[], records: { id: string }[]): DeckImage[] {
  const ids = new Set(records.map((r) => r.id));
  return invoices.filter((i) => ids.has(i.acceptanceId) && i.fileId).map((i) => ({
    id: 'inv_' + i.id, recordId: i.acceptanceId, order: 100000 + (Number(i.order) || 0), provider: 'drive', ref: i.fileId, inv: i.id, link: i.webViewLink,
    caption: `Hóa đơn${i.mime === 'application/pdf' ? ' (PDF, trang 1)' : ''} · ${i.name}`,
  }));
}

