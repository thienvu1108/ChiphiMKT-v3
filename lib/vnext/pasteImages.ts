/** Dán ảnh (Ctrl+V / Cmd+V), kéo-thả và nút «Dán ảnh» (navigator.clipboard.read) cho «Tải ảnh» Nghiệm thu.
 *  Thuần (không phụ thuộc React) để unit test; ảnh ra là File → đi chung đường nén/upload với ảnh chọn từ máy. */
export const PASTE_MAX_BYTES = 25 * 1024 * 1024; // ảnh gốc > 25MB: bỏ qua trước khi giải mã (tránh treo trình duyệt mobile)
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif' };

export type PasteResult = { files: File[]; skipped: number; tooLarge: string[] };

const pad = (n: number) => String(n).padStart(2, '0');
function stamp(d: Date) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; }

/** Tên file cho ảnh dán: clipboard thường đặt «image.png» / rỗng → «dan-anh-YYYYMMDD-HHMMSS-N.ext». */
export function pastedName(f: { name?: string; type?: string }, idx: number, now = new Date()) {
  const nm = String(f.name || '').trim();
  if (nm && !/^image\.(png|jpe?g|gif|webp|bmp)$/i.test(nm) && /\.[a-z0-9]{2,5}$/i.test(nm)) return nm;
  const ext = EXT[String(f.type || '').toLowerCase()] || 'png';
  return `dan-anh-${stamp(now)}-${idx + 1}.${ext}`;
}

function rename(f: File, idx: number, now: Date): File {
  const name = pastedName(f, idx, now);
  if (name === f.name) return f;
  try { return new File([f], name, { type: f.type, lastModified: f.lastModified || now.getTime() }); } catch { return f; }
}

/** Gom ảnh từ ClipboardEvent.clipboardData / DragEvent.dataTransfer. Không phải ảnh → đếm vào skipped. */
export function extractImageFiles(dt: { items?: any; files?: any } | null | undefined, now = new Date(), max = PASTE_MAX_BYTES): PasteResult {
  const out: PasteResult = { files: [], skipped: 0, tooLarge: [] };
  if (!dt) return out;
  const raw: File[] = [];
  const items = Array.from((dt.items || []) as ArrayLike<any>);
  const fileItems = items.filter((it) => it && it.kind === 'file');
  if (fileItems.length) {
    for (const it of fileItems) { const f = it.getAsFile?.(); if (f) raw.push(f); else out.skipped++; }
  } else {
    raw.push(...Array.from((dt.files || []) as ArrayLike<File>));
  }
  // Mục chữ/HTML (vd. copy text) → bỏ qua; chỉ đếm khi không có file nào (để báo «không phải ảnh»).
  if (!raw.length && items.some((it) => it && it.kind === 'string')) out.skipped++;
  return pushAll(out, raw, now, max);
}

function pushAll(out: PasteResult, raw: File[], now: Date, max: number) {
  let n = 0;
  for (const f of raw) {
    if (!String(f.type || '').toLowerCase().startsWith('image/')) { out.skipped++; continue; }
    if (f.size > max) { out.tooLarge.push(f.name || 'ảnh'); continue; }
    out.files.push(rename(f, n++, now));
  }
  return out;
}

export function clipboardReadSupported(nav: any = typeof navigator !== 'undefined' ? navigator : undefined) {
  return !!(nav && nav.clipboard && typeof nav.clipboard.read === 'function');
}

/** Nút «Dán ảnh» (mobile): navigator.clipboard.read(). unsupported=true → hiện hướng dẫn thay thế. */
export async function readClipboardImages(nav: any = typeof navigator !== 'undefined' ? navigator : undefined, now = new Date(), max = PASTE_MAX_BYTES): Promise<PasteResult & { unsupported?: boolean; denied?: boolean }> {
  const out: PasteResult & { unsupported?: boolean; denied?: boolean } = { files: [], skipped: 0, tooLarge: [] };
  if (!clipboardReadSupported(nav)) { out.unsupported = true; return out; }
  let items: any[] = [];
  try { items = await nav.clipboard.read(); }
  catch (e: any) { if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') out.denied = true; else out.unsupported = true; return out; }
  const raw: File[] = [];
  for (const it of items || []) {
    const t = (it.types || []).find((x: string) => String(x).toLowerCase().startsWith('image/'));
    if (!t) { out.skipped++; continue; }
    const b: Blob = await it.getType(t);
    raw.push(new File([b], '', { type: t || b.type, lastModified: now.getTime() }));
  }
  return pushAll(out, raw, now, max);
}

export function pasteSummary(r: PasteResult & { unsupported?: boolean; denied?: boolean }): { msg: string; err: boolean } | null {
  if (r.unsupported) return { msg: 'Trình duyệt này chưa hỗ trợ đọc ảnh từ bộ nhớ tạm — hãy nhấn giữ vào ô «Dán ảnh» rồi chọn Dán, hoặc dùng «⬆ Tải ảnh».', err: true };
  if (r.denied) return { msg: 'Chưa được cấp quyền đọc bộ nhớ tạm — cho phép trong trình duyệt hoặc dùng «⬆ Tải ảnh».', err: true };
  const parts: string[] = [];
  if (r.tooLarge.length) parts.push(`${r.tooLarge.length} ảnh quá lớn (> ${Math.round(PASTE_MAX_BYTES / 1048576)}MB) đã bỏ qua`);
  if (!r.files.length && !r.tooLarge.length) return { msg: r.skipped ? 'Nội dung dán không phải ảnh' : 'Bộ nhớ tạm không có ảnh', err: true };
  if (r.skipped && r.files.length) parts.push(`${r.skipped} mục không phải ảnh đã bỏ qua`);
  return parts.length ? { msg: parts.join(' · '), err: !r.files.length } : null;
}
