/**
 * Nghiệm thu bổ sung: trong kỳ NT tháng M (đang mở), ghi bổ sung cho kỳ đã qua (M-1 … M-12).
 * Không sửa bản kỳ đã khoá: Mod tạo bản MỚI riêng cho kỳ cũ (bản gốc giữ nguyên). Lưu ở kỳ M (supplementIn = M),
 * chờ Super Admin duyệt. Duyệt: month/ntMonth chuyển về kỳ gốc (supplementFor) → tính vào kỳ gốc; vẫn hiện
 * (chỉ xem) ở mục «Nghiệm thu bổ sung» của kỳ nộp M, không tính vào tổng kỳ M.
 * (Bản cũ trước 25/10: không có supplementIn, khi duyệt vẫn ở kỳ M.)
 * Bản ghi lưu month = M (khoá/luật áp như thường) + supplementFor = M-1 + supplementStatus.
 * Chỉ bản bổ sung ĐÃ DUYỆT được tính vào tổng / báo cáo / xuất của tháng M.
 */
export type SuppStatus = 'pending' | 'approved' | 'rejected';
export const SUPP_KEYS = ['supplementStatus', 'supplementHistory', 'supplementDecidedBy', 'supplementDecidedAt', 'supplementNote'] as const;

export function prevMonth(m: unknown): string {
  const s = String(m || '');
  const r = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!r) return '';
  let y = +r[1], mo = +r[2] - 1;
  if (mo < 1) { mo = 12; y -= 1; }
  return `${y}-${String(mo).padStart(2, '0')}`;
}

export function isSupplement(a: any): boolean { return !!(a && typeof a.supplementFor === 'string' && a.supplementFor); }
export function suppStatus(a: any): SuppStatus | '' {
  if (!isSupplement(a)) return '';
  const s = a.supplementStatus;
  return s === 'approved' || s === 'rejected' ? s : 'pending';
}
/** Bản ghi có được tính vào tổng/báo cáo/xuất không (thường: có; bổ sung: chỉ khi đã duyệt). */
export function ntCountsInTotals(a: any): boolean { return !isSupplement(a) || suppStatus(a) === 'approved'; }
/** Kỳ NT nơi bản bổ sung được NỘP (hiển thị ở mục «Nghiệm thu bổ sung» của kỳ này). */
export function suppIn(a: any): string { return String(a?.supplementIn || a?.month || ''); }
/** Các kỳ được ghi bổ sung khi đang ở kỳ M: M-1 … M-n (mới nhất trước). */
export function suppMonths(m: unknown, n = 12): string[] {
  const out: string[] = []; let c = String(m || '');
  for (let i = 0; i < n; i++) { c = prevMonth(c); if (!c) break; out.push(c); }
  return out;
}
/** Thông báo rõ khi luật Firestore từ chối (permission-denied) thay cho lỗi chung. */
export function ntDeniedMsg(e: any, month?: unknown): string | null {
  const c = String(e?.code || '');
  if (!c.includes('permission-denied')) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  const ky = m ? `Kỳ tháng ${+m[2]}/${m[1]}` : 'Kỳ này';
  return `${ky} đã khoá Nghiệm thu (hoặc bạn không có quyền). Chỉ Super Admin sửa được — hãy tạo bản «Nghiệm thu bổ sung» mới trong kỳ đang mở để Super Admin duyệt.`;
}

/** Nhãn badge, vd «Bổ sung T10». */
export function suppBadge(a: any): string {
  if (!isSupplement(a)) return '';
  const mo = +String(a.supplementFor).split('-')[1];
  return `Bổ sung T${mo}`;
}
export const SUPP_STATUS_LABEL: Record<SuppStatus, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };

/** Hợp lệ: supplementFor phải đúng tháng trước của month. */
export function suppValid(month: unknown, supplementFor: unknown): boolean {
  return suppMonths(month).includes(String(supplementFor || ''));
}

/** Đếm bản bổ sung theo tháng nguồn → { '2026-10': {pending, approved, rejected, total} }. */
export function suppCounts(recs: any[]) {
  const out: Record<string, Record<SuppStatus | 'total', number>> = {};
  for (const a of recs || []) {
    if (!isSupplement(a)) continue;
    const k = a.supplementFor;
    const c = (out[k] ||= { pending: 0, approved: 0, rejected: 0, total: 0 });
    c[suppStatus(a) as SuppStatus]++; c.total++;
  }
  return out;
}

/** Patch khi Duyệt/Từ chối/Đặt lại — chỉ đụng các khoá bổ sung (luật cho phép Admin ghi kể cả khi kỳ đã khoá). */
export function suppDecisionPatch(rec: any, status: SuppStatus, by: { uid?: string; email?: string }, note = '', at = new Date().toISOString()) {
  const hist = Array.isArray(rec?.supplementHistory) ? rec.supplementHistory.slice(-49) : [];
  const who = by.email || by.uid || '';
  return {
    supplementStatus: status,
    supplementDecidedBy: who,
    supplementDecidedAt: at,
    supplementNote: note,
    supplementHistory: [...hist, { from: suppStatus(rec) || 'pending', to: status, by: who, at, note }],
  };
}

/** Hậu tố khoá ntKeys để bản bổ sung không trùng bản thường cùng user/dự án/tháng. */
export function suppKeySuffix(a: any): string { return isSupplement(a) || a?.supp ? '_bs' : ''; }

/** Nhãn hiển thị cho màn xem (Gán người phụ trách / NVKD): «Bổ sung T9 · Chờ duyệt», «… · Từ chối: lý do». */
export function suppViewLabel(a: any): string {
  if (!isSupplement(a)) return '';
  const st = suppStatus(a) as SuppStatus;
  const note = st === 'rejected' && a.supplementNote ? `: ${a.supplementNote}` : '';
  return `${suppBadge(a)} · ${SUPP_STATUS_LABEL[st]}${note}`;
}

/** Cách 2: bản bổ sung chỉ được Duyệt khi có ≥1 ảnh Nghiệm thu VÀ ≥1 hoá đơn. Trả về thông báo thiếu, hoặc '' nếu đủ. */
export function suppMissingFiles(imgCount: number, invCount: number): string {
  const noImg = !(imgCount > 0), noInv = !(invCount > 0);
  if (noImg && noInv) return 'Chưa đủ ảnh Nghiệm thu và Hoá đơn — Mod cần tải lên trước khi duyệt';
  if (noImg) return 'Chưa có ảnh Nghiệm thu — Mod cần tải lên trước khi duyệt';
  if (noInv) return 'Chưa có Hoá đơn — Mod cần tải lên trước khi duyệt';
  return '';
}
/** Nhãn badge ngắn cho danh sách Chờ duyệt. */
export function suppMissingBadge(imgCount: number, invCount: number): string {
  const m: string[] = [];
  if (!(imgCount > 0)) m.push('ảnh');
  if (!(invCount > 0)) m.push('HĐ');
  return m.length ? `Thiếu ${m.join(' + ')}` : '';
}
