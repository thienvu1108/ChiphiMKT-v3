/** Hàm thuần (test được): lỗi thân thiện, khoá theo ngày, làm sạch nhật ký lỗi, thiết bị. */

export type Friendly = { title: string; next: string; retry: boolean; code: string };
/** Thông báo lỗi tiếng Việt + bước tiếp theo; lỗi mạng → có nút Thử lại. */
export function friendlyError(e: any): Friendly {
  const code = String(e?.code || e?.name || '').replace(/^firestore\//, '').replace(/^auth\//, '');
  const msg = String(e?.message || e || '');
  const net = /unavailable|network|deadline-exceeded|failed to fetch|offline|timeout/i.test(code + ' ' + msg);
  if (net) return { code: code || 'network', retry: true, title: 'Mất kết nối mạng hoặc máy chủ đang bận.', next: 'Kiểm tra Wi-Fi / 4G rồi bấm «Thử lại». Dữ liệu bạn nhập vẫn còn.' };
  if (/permission-denied|insufficient permissions/i.test(code + msg)) {
    if (/khoá|locked/i.test(msg)) return { code, retry: false, title: 'Chức năng đang bị khoá theo lịch.', next: 'Chờ hết thời gian khoá hoặc liên hệ Super Admin.' };
    return { code, retry: false, title: 'Bạn không có quyền thực hiện thao tác này.', next: 'Kiểm tra lại vai trò / Phòng / Khối của bạn, hoặc nhờ Admin cấp quyền trong Phân quyền.' };
  }
  if (/unauthenticated|requires-recent-login|user-token-expired/i.test(code)) return { code, retry: false, title: 'Phiên đăng nhập đã hết hạn.', next: 'Đăng xuất rồi đăng nhập lại.' };
  if (/not-found/i.test(code)) return { code, retry: false, title: 'Không tìm thấy bản ghi (có thể đã bị xoá).', next: 'Tải lại trang để xem dữ liệu mới nhất.' };
  if (/already-exists/i.test(code)) return { code, retry: false, title: 'Bản ghi này đã tồn tại.', next: 'Tìm bản ghi cũ trong danh sách và sửa thay vì tạo mới.' };
  if (/resource-exhausted|quota/i.test(code + msg)) return { code, retry: true, title: 'Hệ thống đang quá tải.', next: 'Chờ khoảng 1 phút rồi bấm «Thử lại».' };
  if (/invalid-argument|failed-precondition/i.test(code)) return { code, retry: false, title: 'Dữ liệu chưa hợp lệ.', next: 'Kiểm tra các ô bắt buộc / số tiền / ngày rồi lưu lại.' };
  if (/chunk|dynamically imported module/i.test(msg)) return { code: 'chunk', retry: true, title: 'Web vừa được cập nhật bản mới.', next: 'Bấm «Thử lại» hoặc tải lại trang.' };
  return { code: code || 'unknown', retry: false, title: msg && msg.length < 140 && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(msg) ? msg : 'Đã có lỗi xảy ra.', next: 'Thử lại; nếu vẫn lỗi, chụp màn hình gửi bộ phận kỹ thuật.' };
}
export const friendlyText = (e: any) => { const f = friendlyError(e); return `${f.title} ${f.next}`; };

// ---------- Khoá theo ngày ----------
export type LockKind = 'nsCreate' | 'nsEdit' | 'nt';
export const LOCK_LABEL: Record<LockKind, string> = { nsCreate: 'Đăng ký NS MKT mới', nsEdit: 'Sửa NS MKT', nt: 'Tạo / sửa Nghiệm thu' };
export type LockRange = { from: number; to: number; period?: string };   // ms epoch
/** Khoá lặp lại hằng tháng (giờ VN). fromMin/toMin = phút trong ngày. Ngày > số ngày của tháng → ngày cuối tháng.
 *  Kết thúc ≤ bắt đầu → vắt sang tháng sau. periodOffset: chỉ khoá tháng NS = tháng bắt đầu + offset (null = mọi tháng).
 *  exceptions: chỉ số tháng bắt đầu (năm*12 + tháng) được bỏ qua. */
export type RecLock = { on: boolean; fromDay: number; fromMin: number; toDay: number; toMin: number; periodOffset: number | null; exceptions: number[] };
export type Locks = Partial<Record<LockKind, LockRange[]>> & { open?: Partial<Record<LockKind, any>>; recurring?: Partial<Record<LockKind, RecLock>>; pastLock?: Partial<Record<'ns' | 'nt', { on: boolean; day: number; min: number; offset: number } | undefined>> };
const VN = 7 * 3600e3;
export const monthIdx = (y: number, m: number) => y * 12 + m;            // m: 1..12
export const idxToYm = (i: number) => { const y = Math.floor((i - 1) / 12); const m = i - y * 12; return `${y}-${String(m).padStart(2, '0')}`; };
export const ymToIdx = (p: string) => { const x = /^(\d{4})-(\d{2})/.exec(p || ''); return x ? monthIdx(Number(x[1]), Number(x[2])) : NaN; };
const lastDay = (i: number) => { const ym = idxToYm(i); const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const at = (i: number, day: number, min: number) => { const [y, m] = idxToYm(i).split('-').map(Number); return Date.UTC(y, m - 1, Math.min(day, lastDay(i))) + min * 60e3 - VN; };
export const recCross = (r: RecLock) => r.toDay < r.fromDay || (r.toDay === r.fromDay && r.toMin <= r.fromMin);
/** Cửa sổ khoá bắt đầu trong tháng i. */
export function recWindow(r: RecLock, i: number) { return { start: at(i, r.fromDay, r.fromMin), end: at(recCross(r) ? i + 1 : i, r.toDay, r.toMin), startIdx: i }; }
const recPeriodOk = (r: RecLock, i: number, period: string) => r.periodOffset == null || !period || ymToIdx(period) === i + r.periodOffset;
const vnIdx = (t: number) => { const d = new Date(t + VN); return monthIdx(d.getUTCFullYear(), d.getUTCMonth() + 1); };
export function recActive(r: RecLock | undefined, period = '', t = Date.now()) {
  if (!r?.on) return null;
  const cur = vnIdx(t);
  for (const i of [cur - 1, cur]) { if (r.exceptions.includes(i) || !recPeriodOk(r, i, period)) continue; const w = recWindow(r, i); if (w.start <= t && t < w.end) return w; }
  return null;
}
/** Lần khoá tới (bắt đầu sau t), bỏ qua tháng ngoại lệ. */
export function recNext(r: RecLock | undefined, t = Date.now()) {
  if (!r?.on) return null;
  const cur = vnIdx(t);
  for (let i = cur; i < cur + 24; i++) { if (r.exceptions.includes(i)) continue; const w = recWindow(r, i); if (w.start > t) return w; }
  return null;
}
export type Win = { from: number; to: number; period: string };
/** Biên dịch MỌI khoảng khoá (lẻ + lặp) cho rules: { 'năm*12+tháng (giờ VN)': [cửa sổ giao với tháng đó] }, 36 tháng từ tháng trước.
 *  Rules chỉ tra 1 khoá = tháng hiện tại → chi phí cố định, không phụ thuộc số khoảng. Tối đa 3 cửa sổ / tháng. */
export function compileLockWin(ranges: LockRange[], r: RecLock | undefined, t = Date.now(), months = 36): { win: Record<string, Win[]>; overflow: string[] } {
  const cur = vnIdx(t); const lo = cur - 1, hi = cur - 1 + months;
  const all: Win[] = ranges.filter((x) => x.to > x.from).map((x) => ({ from: x.from, to: x.to, period: x.period || '' }));
  if (r?.on) for (let i = lo - 1; i < hi; i++) { if (r.exceptions.includes(i)) continue; const w = recWindow(r, i); all.push({ from: w.start, to: w.end, period: r.periodOffset == null ? '' : idxToYm(i + r.periodOffset) }); }
  const win: Record<string, Win[]> = {};
  for (const w of all) { const a = Math.max(vnIdx(w.from), lo), b = Math.min(vnIdx(w.to - 1), hi - 1); for (let i = a; i <= b; i++) (win[String(i)] ||= []).push(w); }
  const overflow = Object.entries(win).filter(([, v]) => v.length > 3).map(([k]) => idxToYm(Number(k)));
  return { win, overflow };
}
/** Khoá KỲ ĐÃ QUA: bản ghi tháng M khoá vĩnh viễn từ ngày `day` lúc `min` (giờ VN) của tháng M+offset (trừ Super Admin). */
export type PastLock = { on: boolean; day: number; min: number; offset: number };
export type PastKind = 'ns' | 'nt';
export const PAST_LABEL: Record<PastKind, string> = { ns: 'Ngân sách MKT (NS, chi phí, duyệt hỗ trợ)', nt: 'Nghiệm thu (gồm ảnh / hoá đơn)' };
export function normPast(v: any): PastLock | undefined {
  if (!v || typeof v !== 'object') return undefined;
  return { on: v.on === true, day: int(v.day, 1, 28, 1), min: int(v.min, 0, 1439, 0), offset: int(v.offset, 0, 3, 1) };
}
/** Chuẩn hoá tháng bản ghi: 'YYYY-MM' | 'MM.YYYY' | 'MM/YYYY' | 'Kì 1 - Tháng 8' (năm 2026) → idx; -1 nếu không đọc được. */
export function monthIdxOf(s: any): number {
  const v = String(s ?? '').trim().normalize('NFC');
  let x = /^(\d{4})-(\d{1,2})$/.exec(v); if (x) return monthIdx(+x[1], +x[2]);
  x = /^(\d{1,2})[./-](\d{4})$/.exec(v); if (x) return monthIdx(+x[2], +x[1]);
  x = /th[áa]ng *(\d{1,2})(?:\D.*)?$/i.exec(v); if (x) return monthIdx(2026, +x[1]);
  return -1;
}
/** Kỳ chuẩn 'YYYY-MM' từ mọi dạng cũ ('09.2026', 'Kì 1 - Tháng 8'…); không đọc được → giữ nguyên chuỗi. */
export function normPeriod(p: any): string { const i = monthIdxOf(p); return i > 0 ? idxToYm(i) : String(p ?? '').trim(); }
/** Thời điểm tháng M bị khoá vĩnh viễn (ms). */
export const pastLockAt = (c: PastLock, M: number) => at(M + c.offset, c.day, c.min);
export function pastLocked(c: PastLock | undefined, month: any, t = Date.now()): boolean {
  if (!c?.on) return false; const M = monthIdxOf(month); return M > 0 && t >= pastLockAt(c, M);
}
/** Bảng cho rules (ns_lines): { 'idx tháng hiện tại': {m: 'YYYY-MM' kỳ đến hạn khoá trong tháng đó, at} }, 36 tháng. */
export function compilePastWin(c: PastLock | undefined, t = Date.now(), months = 36): Record<string, { m: string; at: number }> {
  const o: Record<string, { m: string; at: number }> = {}; if (!c?.on) return o;
  const cur = vnIdx(t); for (let i = cur - 1; i < cur - 1 + months; i++) o[String(i)] = { m: idxToYm(i - c.offset), at: at(i, c.day, c.min) };
  return o;
}
const int = (v: any, lo: number, hi: number, d: number) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
export function normRec(v: any): RecLock | undefined {
  if (!v || typeof v !== 'object') return undefined;
  return { on: v.on === true, fromDay: int(v.fromDay, 1, 31, 1), fromMin: int(v.fromMin, 0, 1439, 0), toDay: int(v.toDay, 1, 31, 1), toMin: int(v.toMin, 0, 1439, 0),
    periodOffset: v.periodOffset == null ? null : int(v.periodOffset, -2, 2, 0), exceptions: Array.isArray(v.exceptions) ? v.exceptions.map(Number).filter(Number.isFinite) : [] };
}
const ms = (v: any): number => (typeof v === 'number' ? v : v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : Date.parse(v) || 0);
export function normLocks(d: any): Locks {
  const o: Locks = {};
  for (const k of ['nsCreate', 'nsEdit', 'nt'] as LockKind[]) o[k] = (Array.isArray(d?.[k]) ? d[k] : []).map((r: any) => ({ from: ms(r.from), to: ms(r.to), period: r.period || '' }));
  const rec: Partial<Record<LockKind, RecLock>> = {};
  for (const k of ['nsCreate', 'nsEdit', 'nt'] as LockKind[]) { const r = normRec(d?.recurring?.[k]); if (r) rec[k] = r; }
  o.recurring = rec;
  o.pastLock = { ns: normPast(d?.pastLock?.ns), nt: normPast(d?.pastLock?.nt) };
  const op: any = {}; for (const k of ['nsCreate', 'nsEdit', 'nt'] as LockKind[]) { const x = normOpen(d?.open?.[k]); if (x?.on) op[k] = x; }
  o.open = op;
  return o;
}
/** Khoảng đang khoá (nếu có) cho loại + tháng NS; trả về mốc hết khoá muộn nhất của các khoảng đang hiệu lực. */
export function activeLock(locks: Locks | undefined, kind: LockKind, period = '', at = Date.now()): { until: number; period: string } | null {
  period = normPeriod(period);
  const oc = locks?.open?.[kind] as OpenCfg | undefined;
  if (oc?.on) { if (openHit(oc, period, at)) return null; const n = openNext(oc, period, at); return { until: n ? n.from : Infinity, period: '' }; }
  const hit = (locks?.[kind] || []).filter((r) => r.from <= at && at < r.to && (!r.period || !period || r.period === period));
  const rec = recActive(locks?.recurring?.[kind], period, at); const rp = rec && locks?.recurring?.[kind]?.periodOffset != null ? idxToYm(rec.startIdx + locks!.recurring![kind]!.periodOffset!) : '';
  if (!hit.length && !rec) return null;
  return { until: Math.max(...hit.map((r) => r.to), rec ? rec.end : 0), period: hit.find((r) => r.period)?.period || rp || '' };
}
/** «Đang khoá đến 18:00 25/10/2026 (giờ VN)». */
export function lockUntilText(until: number) {
  if (!Number.isFinite(until)) return 'Đang khoá (chưa có lịch mở)';
  const d = new Date(until + 7 * 3600e3);
  const p = (n: number) => String(n).padStart(2, '0');
  return `Đang khoá đến ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} (giờ VN)`;
}
/** «2026-10-25T18:00» (giờ VN, input datetime-local) ↔ ms. */
export const vnLocalToMs = (s: string) => Date.parse(s + ':00+07:00');
export const msToVnLocal = (t: number) => new Date(t + 7 * 3600e3).toISOString().slice(0, 16);

// ---------- Nhật ký lỗi (không PII) ----------
export function scrubMsg(m: any): string {
  return String(m?.message || m || '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>').replace(/\d{6,}/g, '<số>').replace(/(token|key|password)=\S+/gi, '$1=<ẩn>').slice(0, 500);
}
export function deviceOf(ua: string, w = 1280): 'desktop' | 'mobile' | 'tablet' {
  if (/iPad|Tablet/i.test(ua) || (w >= 600 && w < 1024 && /Android/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua) || w < 640) return 'mobile';
  return 'desktop';
}
export function browserOf(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge'; if (/OPR\/|Opera/.test(ua)) return 'Opera'; if (/CocCoc/.test(ua)) return 'Cốc Cốc';
  if (/Zalo/i.test(ua)) return 'Zalo'; if (/FBAN|FBAV/.test(ua)) return 'Facebook'; if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari'; if (/Firefox\//.test(ua)) return 'Firefox'; return 'Khác';
}
/** Khoá gộp lỗi: bỏ số / id để cùng một lỗi gom một nhóm. */
export const errGroupKey = (msg: string) => msg.replace(/<[^>]+>/g, '').replace(/[0-9a-f]{8,}/gi, '').replace(/\d+/g, '#').slice(0, 120);
/** Đột biến: ≥ ngưỡng lỗi trong 60 phút gần nhất. */
export const SPIKE_THRESHOLD = 20;
export function isSpike(times: number[], at = Date.now(), threshold = SPIKE_THRESHOLD) { return times.filter((t) => at - t < 3600e3).length >= threshold; }
export const vnDay = (t = Date.now()) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);

// ---------------------------------------------------------------- Thời gian MỞ (thay cho khoá)
/** Chế độ MỞ: chỉ được tạo / sửa TRONG khoảng mở; ngoài khoảng mở = khoá (trừ Super Admin).
 *  rec: lịch mở lặp hằng tháng (giờ VN), apply = kỳ được mở so với THÁNG BẮT ĐẦU của lần mở: -1 tháng trước, 0 tháng này, 1 tháng sau, null mọi kỳ.
 *  ranges: các lần mở có ngày cụ thể (period '' = mọi kỳ). */
export type OpenRec = { on: boolean; fromDay: number; fromMin: number; toDay: number; toMin: number; apply: number | null; exceptions: number[] };
export type OpenCfg = { on: boolean; rec: OpenRec; ranges: LockRange[] };
export const OPEN_LABEL: Record<LockKind, string> = { nsCreate: 'Thời gian MỞ đăng ký mới NS', nsEdit: 'Thời gian MỞ sửa NS', nt: 'Thời gian MỞ Nghiệm thu' };
export const APPLY_LABEL: Record<string, string> = { '-1': 'Tháng trước', '0': 'Tháng này', '1': 'Tháng sau', '': 'Mọi tháng' };
const asRec = (o: OpenRec): RecLock => ({ on: o.on, fromDay: o.fromDay, fromMin: o.fromMin, toDay: o.toDay, toMin: o.toMin, periodOffset: o.apply, exceptions: o.exceptions });
export function normOpen(v: any): OpenCfg | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = normRec(v.rec) || { on: false, fromDay: 1, fromMin: 0, toDay: 1, toMin: 0, periodOffset: null, exceptions: [] };
  const apply = v.rec?.apply == null ? null : int(v.rec.apply, -1, 1, 0);
  return { on: v.on === true, rec: { on: r.on, fromDay: r.fromDay, fromMin: r.fromMin, toDay: r.toDay, toMin: r.toMin, apply, exceptions: r.exceptions },
    ranges: (Array.isArray(v.ranges) ? v.ranges : []).map((x: any) => ({ from: ms(x.from), to: ms(x.to), period: x.period || '' })) };
}
/** Biên dịch khoảng MỞ cho rules (cùng dạng lockWin): openWin.{năm*12+tháng VN} = [≤3 cửa sổ mở giao tháng đó]. */
export function compileOpenWin(o: OpenCfg, t = Date.now(), months = 36) { return compileLockWin(o.ranges, asRec(o.rec), t, months); }
const openHit = (o: OpenCfg, period: string, t: number) => {
  const p = normPeriod(period);
  if (o.ranges.some((r) => r.from <= t && t < r.to && (!r.period || !p || r.period === p))) return true;
  return !!recActive(asRec(o.rec), p, t);
};
/** Lần mở tới (bắt đầu sau t) cho kỳ period (nếu có). */
export function openNext(o: OpenCfg, period = '', t = Date.now()): { from: number; to: number; period: string } | null {
  const p = normPeriod(period); const c: { from: number; to: number; period: string }[] = [];
  for (const r of o.ranges) if (r.from > t && (!r.period || !p || r.period === p)) c.push({ from: r.from, to: r.to, period: r.period || '' });
  if (o.rec.on) { let s = t; for (let g = 0; g < 30; g++) { const w = recNext(asRec(o.rec), s); if (!w) break; const wp = o.rec.apply == null ? '' : idxToYm(w.startIdx + o.rec.apply); if (!p || !wp || wp === p) { c.push({ from: w.start, to: w.end, period: wp }); break; } s = w.start + 1; } }
  return c.sort((a, b) => a.from - b.from)[0] || null;
}
/** Chuyển lịch KHOÁ lặp sang lịch MỞ tương đương: khoá A→B ⇒ mở B→A (vắt tháng). periodOffset giữ làm «Áp dụng cho» chỉ khi null (mọi kỳ). */
export function lockRecToOpen(r: RecLock | undefined): { rec: OpenRec; exact: boolean } {
  if (!r?.on) return { rec: { on: false, fromDay: 1, fromMin: 0, toDay: 1, toMin: 0, apply: null, exceptions: [] }, exact: true };
  return { rec: { on: true, fromDay: r.toDay, fromMin: r.toMin, toDay: r.fromDay, toMin: r.fromMin, apply: null, exceptions: [] }, exact: r.periodOffset == null && !r.exceptions.length };
}

/** Các kỳ (YYYY-MM) mà mốc khoá kỳ đã qua rơi VÀO TRONG một lần mở của chính kỳ đó (xung đột cài đặt). */
export function pastOpenConflicts(pc: PastLock | undefined, o: OpenCfg | undefined, t = Date.now(), months = 6): string[] {
  if (!pc?.on || !o?.on) return [];
  const out: string[] = []; const cur = vnIdx(t);
  for (let M = cur - 1; M < cur + months; M++) {
    const ym = idxToYm(M); const L = pastLockAt(pc, M);
    const w = openNext(o, ym, L - 200 * 864e5);
    let s = L - 200 * 864e5; let ww = w;
    for (let g = 0; g < 12 && ww; g++) { if (ww.from < L && L < ww.to && (!ww.period || ww.period === ym)) { out.push(ym); break; } if (ww.from > L) break; s = ww.from + 1; ww = openNext(o, ym, s); }
  }
  return out;
}
/** «hết ngày D» khi giờ kết thúc là 00:00 (giờ VN). */
export function fmtVnEnd(t: number): string {
  const q = (n: number) => String(n).padStart(2, '0');
  const x = new Date(t + 7 * 3600e3);
  if (x.getUTCHours() === 0 && x.getUTCMinutes() === 0) { const y = new Date(t + 7 * 3600e3 - 864e5); return `hết ngày ${q(y.getUTCDate())}/${q(y.getUTCMonth() + 1)}/${y.getUTCFullYear()}`; }
  return `${q(x.getUTCHours())}:${q(x.getUTCMinutes())} ${q(x.getUTCDate())}/${q(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`;
}

/** Các kỳ NS (YYYY-MM) đang MỞ cho `kind` lúc t — CHỈ theo «Thời gian MỞ» (vnLocks/current) + khoá kỳ đã qua (giống firestore.rules vnOpen). Xét tháng hiện tại −2 … +2. */
export function openNsPeriods(locks: Locks | undefined, kind: LockKind = 'nsCreate', t = Date.now()): string[] {
  const cur = vnIdx(t); const o: string[] = [];
  for (let i = cur - 2; i <= cur + 2; i++) { const p = idxToYm(i); if (!activeLock(locks, kind, p, t) && !pastLocked(locks?.pastLock?.ns, p, t)) o.push(p); }
  return o;
}
