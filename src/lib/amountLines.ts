/** Khoản tiền kèm ghi chú — dùng cho ô công thức NT và cột Tiền trên Hóa đơn. */
export type AmountLine = { amount: number; note: string };

export const sumLines = (lines: AmountLine[] | null | undefined): number =>
  (lines || []).reduce((s, x) => s + (Number(x?.amount) || 0), 0);

/** Chuỗi công thức tương thích parseCurrencyFormula: «1.000.000 (ghi chú) + 500.000». */
export function linesToFormula(lines: AmountLine[]): string {
  return (lines || [])
    .filter((x) => Number(x.amount) || (x.note || '').trim())
    .map((x) => {
      const n = Math.round(Number(x.amount) || 0);
      const note = String(x.note || '').trim();
      return note ? `${n} (${note})` : String(n);
    })
    .join(' + ');
}

/** Từ items của parseCurrencyFormula / costBreakdowns. */
export function itemsToLines(items: { amount: number; label?: string }[] | null | undefined): AmountLine[] {
  return (items || []).map((it) => ({
    amount: Number(it.amount) || 0,
    note: it.label && it.label !== 'Khoản chi' ? String(it.label) : '',
  }));
}

/**
 * Lấy dòng chi tiết để hiển thị/sửa lại sau khi lưu.
 * Ưu tiên: costBreakdowns[field].items → rawInput (công thức) → số trần (1 dòng).
 */
export function resolveLines(
  field: string,
  row: any,
  parseFormula: (v: any) => { total: number; items: { amount: number; label: string }[] },
): AmountLine[] {
  const bd = row?.costBreakdowns?.[field];
  if (bd?.items?.length) return itemsToLines(bd.items);
  if (bd?.rawInput != null && String(bd.rawInput).trim() !== '') return itemsToLines(parseFormula(bd.rawInput).items);
  // Trường riêng cho hóa đơn
  if (field === 'hoaDonTien' && Array.isArray(row?.hoaDonLines) && row.hoaDonLines.length)
    return row.hoaDonLines.map((x: any) => ({ amount: Number(x.amount) || 0, note: String(x.note || '') }));
  const raw = row?.[field];
  if (raw == null || raw === '' || raw === 0) return [];
  return itemsToLines(parseFormula(raw).items);
}

/** Chuỗi đưa vào ô edit (công thức) từ bản ghi đã lưu. */
export function resolveEditRaw(
  field: string,
  row: any,
  parseFormula: (v: any) => { total: number; items: { amount: number; label: string }[] },
): string {
  const bd = row?.costBreakdowns?.[field];
  if (bd?.rawInput != null && String(bd.rawInput).trim() !== '') return String(bd.rawInput);
  if (bd?.items?.length) return linesToFormula(itemsToLines(bd.items));
  if (field === 'hoaDonTien' && Array.isArray(row?.hoaDonLines) && row.hoaDonLines.length)
    return linesToFormula(row.hoaDonLines);
  const raw = row?.[field];
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string' && /[+\n;(]/.test(raw)) return raw;
  const n = Number(raw);
  return Number.isFinite(n) && n !== 0 ? String(Math.round(n)) : raw === 0 || raw === '0' ? '' : String(raw ?? '');
}

export function debtOf(invoiceSum: number, tong: number): number {
  return (Number(invoiceSum) || 0) - (Number(tong) || 0);
}

export function buildBreakdown(field: string, lines: AmountLine[] | string | number) {
  const arr = Array.isArray(lines)
    ? lines.filter((x) => Number(x.amount) || (x.note || '').trim())
    : null;
  if (arr) {
    const total = sumLines(arr);
    return {
      rawInput: linesToFormula(arr),
      total,
      items: arr.map((x) => ({ amount: Number(x.amount) || 0, label: (x.note || '').trim() || 'Khoản chi' })),
    };
  }
  return null;
}
