/** Logic thuần cho trình xem ảnh Nghiệm thu (lightbox). */
export function stepIndex(i: number, dir: number, n: number): number {
  if (n <= 0) return -1;
  return (((i + dir) % n) + n) % n;
}
export type ViewerAction = 'close' | 'prev' | 'next' | 'zoom' | null;
export function keyAction(key: string): ViewerAction {
  switch (key) {
    case 'Escape': case 'Esc': return 'close';
    case 'ArrowLeft': return 'prev';
    case 'ArrowRight': return 'next';
    case '+': case '=': case '0': return 'zoom';
    default: return null;
  }
}
/** Vuốt ngang (1 ngón) ≥ 50px và chủ yếu theo chiều ngang → prev/next. */
export function swipeAction(dx: number, dy: number, min = 50): ViewerAction {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'next' : 'prev';
}
/** data: URL không mở được ở tab mới trên nhiều trình duyệt → đổi sang blob: URL. */
export function dataUrlToBlob(u: string): Blob | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(u);
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  if (m[2]) { const bin = atob(m[3]); const a = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k); return new Blob([a], { type: mime }); }
  return new Blob([decodeURIComponent(m[3])], { type: mime });
}
export function openableUrl(u: string): string {
  if (!u.startsWith('data:')) return u;
  const b = dataUrlToBlob(u);
  return b ? URL.createObjectURL(b) : u;
}
