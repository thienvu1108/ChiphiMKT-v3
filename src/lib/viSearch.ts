/** Chuẩn hoá tiếng Việt để tìm kiếm: bỏ dấu, đ→d, thường, gộp khoảng trắng. */
export function normVi(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
}
const coll = typeof Intl !== 'undefined' ? new Intl.Collator('vi', { sensitivity: 'base', numeric: true }) : null;
export function viCompare(a: unknown, b: unknown): number {
  const x = String(a ?? ''), y = String(b ?? '');
  return coll ? coll.compare(x, y) : x.localeCompare(y, 'vi', { sensitivity: 'base' });
}
/** Sắp xếp A-Z theo label; giữ các mục "ghim" (value rỗng như "Tất cả") ở đầu. */
export function sortOptionsVi<T extends { value: any; label: any }>(opts: T[]): T[] {
  const isPin = (o: any) => o.value === '' || o.value == null || o.value === 'all' || o.value === 'none';
  const pinned = opts.filter(isPin);
  const rest = opts.filter((o) => !isPin(o)).slice().sort((a, b) => viCompare(a.label, b.label));
  return [...pinned, ...rest];
}
/** Mọi từ trong truy vấn đều phải xuất hiện (bỏ dấu). */
export function matchVi(haystack: unknown, query: unknown): boolean {
  const q = normVi(query); if (!q) return true;
  const h = normVi(haystack);
  return q.split(' ').every((w) => h.includes(w));
}
