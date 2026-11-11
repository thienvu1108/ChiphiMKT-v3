/**
 * Kỳ Marketing (v-next): Tháng M/YYYY = 21/(M-1) → 20/M (giờ Việt Nam).
 * Áp dụng từ Tháng 11/2026 (21/10/2026). Trước mốc đó giữ công thức cũ (ngày ≥ 15 → tháng sau).
 */
export const VNEXT_PERIOD_CUTOVER = '2026-11';
export const KY_START_DAY = 21;

/** Đồng hồ (staging có thể giả lập qua globalThis.__VNEXT_NOW__ — chỉ bật khi dùng DB staging). */
export function now(): Date {
  const o = (globalThis as any).__VNEXT_NOW__;
  if (o) { const d = new Date(o); if (!isNaN(d.getTime())) return d; }
  return new Date();
}

export type VnParts = { y: number; m: number; d: number; hh: number; mm: number };

/** Ngày/giờ theo Asia/Saigon (UTC+7, không có DST). */
export function vnParts(date: Date = now()): VnParts {
  const t = new Date(date.getTime() + 7 * 3600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes() };
}

export function periodKey(y: number, m: number): string {
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function parsePeriod(key: string): { y: number; m: number } {
  const [y, m] = String(key || '').split('-').map(Number);
  return { y, m };
}

export function addPeriods(key: string, n: number): string {
  const { y, m } = parsePeriod(key);
  return periodKey(y, m + n);
}

/** Kỳ chứa ngày `date` (giờ VN). */
export function getPeriodOf(date: Date = now()): string {
  const p = vnParts(date);
  const next = periodKey(p.y, p.m + 1);
  const cur = periodKey(p.y, p.m);
  const nk = p.d >= KY_START_DAY ? next : cur;
  if (nk >= VNEXT_PERIOD_CUTOVER) return nk;
  // Trước mốc áp dụng: công thức cũ (ngày ≥ 15 → tháng sau), không vượt quá kỳ trước mốc
  const legacy = p.d >= 15 ? next : cur;
  return legacy >= VNEXT_PERIOD_CUTOVER ? addPeriods(VNEXT_PERIOD_CUTOVER, -1) : legacy;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Ngày bắt đầu/kết thúc kỳ dưới dạng {y,m,d}. */
export function periodRange(key: string) {
  const { y, m } = parsePeriod(key);
  const s = parsePeriod(periodKey(y, m - 1));
  return { start: { y: s.y, m: s.m, d: KY_START_DAY }, end: { y, m, d: 20 } };
}

/** ISO cuối ngày 20/M (Asia/Saigon 23:59:59.999 = UTC 16:59:59.999 cùng ngày). Dùng làm mốc «tỉ lệ tại kỳ». */
export function periodEndIso(key: string): string {
  const { end } = periodRange(key);
  return new Date(Date.UTC(end.y, end.m - 1, end.d, 16, 59, 59, 999)).toISOString();
}

/** "Tháng 11/2026 (21/10–20/11)" */
export function periodLabel(key: string): string {
  if (!key) return '';
  const { y, m } = parsePeriod(key);
  const r = periodRange(key);
  return `Tháng ${m}/${y} (${r.start.d}/${r.start.m}–${r.end.d}/${r.end.m})`;
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * 4 đợt báo cáo trong kỳ (21/(M−1)–20/M):
 *   1: 21–27/(M−1) · 2: 28/(M−1)–3/M · 3: 4–11/M · 4: 12–19/M
 * (Đợt 3 Phong viết «3/11–11/11» chồng đợt 2; giả định 4–11 để khớp biên hiện tại + mở cửa sổ ngày 11.)
 */
export type Ymd = { y: number; m: number; d: number };
export type Dot = { n: number; from: Ymd; to: Ymd; label: string };

/** Số ngày lịch MỞ nộp/sửa báo cáo, tính từ ngày `to` của đợt (gồm cả `to`). Đợt 3 chỉ mở 1 ngày. */
export const DOT_REPORT_OPEN_SPAN: readonly [number, number, number, number] = [2, 2, 1, 2];

export function addCalendarDays(base: Ymd, k: number): Ymd {
  // UTC noon tránh lệch DST; lịch VN không DST nên ổn.
  const t = new Date(Date.UTC(base.y, base.m - 1, base.d + k, 12, 0, 0));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function dotsOf(key: string): Dot[] {
  const { start, end } = periodRange(key);
  const dim = daysInMonth(start.y, start.m);
  const add = (base: Ymd, k: number) => {
    let d = base.d + k, m = base.m, y = base.y;
    if (d > dim) { d -= dim; const p = parsePeriod(periodKey(y, m + 1)); y = p.y; m = p.m; }
    return { y, m, d };
  };
  const ranges: [Ymd, Ymd][] = [
    [add(start, 0), add(start, 6)],
    [add(start, 7), { y: end.y, m: end.m, d: 3 }],
    [{ y: end.y, m: end.m, d: 4 }, { y: end.y, m: end.m, d: 11 }],
    [{ y: end.y, m: end.m, d: 12 }, { y: end.y, m: end.m, d: 19 }],
  ];
  return ranges.map(([f, t], i) => ({ n: i + 1, from: f, to: t, // Nhãn hiển thị: chi phí cộng dồn từ đầu kỳ → mọi đợt hiện từ ngày bắt đầu kỳ (21). Biên from/to giữ nguyên.
    label: `${pad(start.d)}/${pad(start.m)} – ${pad(t.d)}/${pad(t.m)}` }));
}

const ord = (p: Ymd) => p.y * 10000 + p.m * 100 + p.d;

/** Đợt nội dung hiện tại (1..4) của kỳ `key`; 0 nếu trước kỳ, 5 nếu đã qua kỳ (kể cả ngày 20 sau đợt 4). */
export function currentDot(key: string, date: Date = now()): number {
  const p = vnParts(date);
  const o = ord(p);
  const ds = dotsOf(key);
  if (o < ord(ds[0].from)) return 0;
  for (const d of ds) if (o >= ord(d.from) && o <= ord(d.to)) return d.n;
  // Ngày 20/M nằm trong cửa sổ mở đợt 4 nhưng ngoài biên nội dung 12–19 → vẫn coi là sau đợt 4.
  return 5;
}

export type DotReportWindow = {
  n: number;
  contentFrom: Ymd; contentTo: Ymd;
  openFrom: Ymd; openTo: Ymd;
  openLabel: string;
  state: 'upcoming' | 'open' | 'closed';
  isOpen: boolean;
};

/** Cửa sổ nộp/sửa Báo cáo tuần của 1 đợt: mở từ ngày `to` trong `DOT_REPORT_OPEN_SPAN[n-1]` ngày. */
export function dotReportWindow(key: string, n: number, date: Date = now()): DotReportWindow {
  const d = dotsOf(key)[n - 1];
  if (!d) throw new Error('dot out of range');
  const span = DOT_REPORT_OPEN_SPAN[n - 1];
  const openFrom = d.to;
  const openTo = addCalendarDays(d.to, span - 1);
  const o = ord(vnParts(date));
  const state: DotReportWindow['state'] =
    o < ord(openFrom) ? 'upcoming' : o > ord(openTo) ? 'closed' : 'open';
  return {
    n, contentFrom: d.from, contentTo: d.to, openFrom, openTo,
    openLabel: span === 1
      ? `${pad(openFrom.d)}/${pad(openFrom.m)}`
      : `${pad(openFrom.d)}/${pad(openFrom.m)} – ${pad(openTo.d)}/${pad(openTo.m)}`,
    state, isOpen: state === 'open',
  };
}

export function isDotReportOpen(key: string, n: number, date: Date = now()): boolean {
  return n >= 1 && n <= 4 && dotReportWindow(key, n, date).isOpen;
}

/** Đợt đang trong cửa sổ nộp (ưu tiên đợt nhỏ hơn nếu hiếm khi chồng); null nếu không có. */
export function openReportDot(key: string, date: Date = now()): number | null {
  for (let n = 1; n <= 4; n++) if (isDotReportOpen(key, n, date)) return n;
  return null;
}

// Khung đăng ký NS cũ (settings/global.budgetStartDay/EndDay, nsUnlockedPeriods) đã BỎ — chỉ còn «Thời gian MỞ» (vnLocks/current), xem lib/vnext/platform.ts openNsPeriods.
