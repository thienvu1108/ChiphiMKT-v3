/**
 * Căn bán (số lượng căn bán) nhập theo Tháng × Khối × Dự án.
 * Admin nhập ở mục "Căn bán". Dùng cho Báo cáo Tổng quan (theo Khối / Dự án / Ban).
 * Mỗi dòng = 1 (month, blockId, projectId) → soLuong (số nguyên ≥ 0).
 */
export const CAN_BAN_COLLECTION = 'can_ban';

export type CanBanLine = {
  id?: string;
  month: string;        // 'YYYY-MM'
  blockId: string;
  projectId: string;
  soLuong: number;      // số căn bán (nguyên ≥ 0)
  updatedAt?: string;
  updatedByUid?: string;
  updatedByName?: string;
};

const PERIOD_RE = /^[0-9]{4}-[0-9]{2}$/;

/** Id tài liệu ổn định cho 1 ô (month, blockId, projectId). */
export function canBanDocId(month: string, blockId: string, projectId: string): string {
  return `cb_${month}__${blockId}__${projectId}`;
}

export const validCanBanQty = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1000000;

/** Chuẩn hoá chuỗi nhập → số nguyên ≥ 0, hoặc null nếu không hợp lệ. '' → 0. */
export function parseCanBanQty(s: unknown): number | null {
  if (typeof s === 'number') return validCanBanQty(s) ? s : null;
  const t = String(s ?? '').trim().replace(/[.,\s]/g, '');
  if (t === '') return 0;
  if (!/^[0-9]+$/.test(t)) return null;
  const n = Number(t);
  return validCanBanQty(n) ? n : null;
}

const isLive = (l: CanBanLine | null | undefined, month?: string): l is CanBanLine =>
  !!l && PERIOD_RE.test(l.month || '') && (!month || l.month === month) && validCanBanQty(l.soLuong) && l.soLuong >= 0;

/** Số căn bán của 1 ô (month, blockId, projectId). */
export function canBanOf(lines: CanBanLine[] | null | undefined, month: string, blockId: string, projectId: string): number {
  let s = 0;
  for (const l of lines || []) {
    if (!isLive(l, month)) continue;
    if (l.blockId === blockId && l.projectId === projectId) s += l.soLuong;
  }
  return s;
}

/** Tổng căn bán theo Dự án trong kỳ: projectId → số căn. */
export function sumCanBanByProject(lines: CanBanLine[] | null | undefined, month: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines || []) {
    if (!isLive(l, month) || !l.projectId) continue;
    m.set(l.projectId, (m.get(l.projectId) || 0) + l.soLuong);
  }
  return m;
}

/** Tổng căn bán theo Khối trong kỳ: blockId → số căn. */
export function sumCanBanByBlock(lines: CanBanLine[] | null | undefined, month: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines || []) {
    if (!isLive(l, month) || !l.blockId) continue;
    m.set(l.blockId, (m.get(l.blockId) || 0) + l.soLuong);
  }
  return m;
}

/**
 * Tổng căn bán theo Ban KD trong kỳ: banId → số căn.
 * Ban của mỗi dòng suy từ Dự án (banOf trả về id Ban, '' nếu không xác định).
 */
export function sumCanBanByBan(
  lines: CanBanLine[] | null | undefined,
  month: string,
  banOf: (projectId: string) => string,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines || []) {
    if (!isLive(l, month) || !l.projectId) continue;
    const banId = banOf(l.projectId);
    if (!banId) continue;
    m.set(banId, (m.get(banId) || 0) + l.soLuong);
  }
  return m;
}
