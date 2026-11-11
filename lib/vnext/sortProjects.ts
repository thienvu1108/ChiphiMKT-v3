/** Mới tạo trước (createdAt giảm dần); dự án thiếu createdAt xếp cuối, theo tên. */
const ms = (v: any): number => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === 'string' || typeof v === 'number' ? (Date.parse(String(v)) || Number(v) || 0) : 0);
export function sortProjectsByCreated<T extends { name?: string; createdAt?: any }>(list: T[]): T[] {
  return list.slice().sort((a, b) => {
    const x = ms(a.createdAt), y = ms(b.createdAt);
    if (x && y) return y - x;
    if (x !== y) return x ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'vi');
  });
}
