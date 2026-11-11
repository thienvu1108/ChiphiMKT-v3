/**
 * Tự phục hồi khi deploy mới làm file JS cũ (chunk) biến mất (lỗi
 * "Failed to fetch dynamically imported module").
 * - lazyRetry: thử import lại 1 lần; vẫn lỗi -> tải lại trang 1 lần (chặn vòng lặp bằng sessionStorage).
 * - Nếu đang có dữ liệu chưa lưu (vd đang upload ảnh) -> không tự tải lại, hiện banner hỏi người dùng.
 * - Kiểm tra /version.json để báo có bản mới.
 */
import React from 'react';

const KEY = 'mh:chunk-reload-at';
const GUARD_MS = 30_000;
const listeners = new Set<() => void>();
let dirty = 0;
let reloading = false;
let pending = false; // có bản mới / chunk lỗi, đang chờ người dùng tải lại

export function isChunkLoadError(err: unknown): boolean {
  const m = String((err as any)?.message || err || '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload CSS/i.test(m);
}

export function isDirty() { return dirty > 0; }
export function hasPendingUpdate() { return pending; }
export function onPendingChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function setPending() { if (!pending) { pending = true; listeners.forEach((f) => f()); } }

/** Đánh dấu đang có thao tác chưa lưu; trả về hàm bỏ đánh dấu. */
export function markDirty(): () => void {
  dirty++; let done = false;
  return () => { if (!done) { done = true; dirty = Math.max(0, dirty - 1); } };
}
export function useDirtyGuard(active: boolean) {
  React.useEffect(() => (active ? markDirty() : undefined), [active]);
}

export function hardReload() {
  reloading = true;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch {}
  window.location.reload();
}

/** Chunk lỗi: tự tải lại 1 lần nếu an toàn. Trả về true nếu đã ra lệnh tải lại. */
export function handleChunkError(): boolean {
  if (reloading) return true;
  if (isDirty()) { setPending(); return false; }
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch {}
  if (Date.now() - last < GUARD_MS) { setPending(); return false; } // vừa tải lại mà vẫn lỗi -> không lặp
  hardReload();
  return true;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function lazyRetry<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return React.lazy(async () => {
    try { return await factory(); } catch (e) {
      if (!isChunkLoadError(e)) throw e;
      await wait(400);
      try { return await factory(); } catch (e2) {
        if (isChunkLoadError(e2) && handleChunkError()) await new Promise(() => {}); // đang tải lại: treo Suspense
        throw e2;
      }
    }
  });
}

declare const __BUILD_ID__: string;
export const BUILD_ID: string = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

async function checkVersion() {
  if (BUILD_ID === 'dev' || pending) return;
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (j?.build && j.build !== BUILD_ID) setPending();
  } catch {}
}

export function installChunkRecovery() {
  if (typeof window === 'undefined') return;
  // Không preventDefault: để lỗi đi tiếp tới lazyRetry/ErrorBoundary (nếu chặn, import trả về undefined).
  window.addEventListener('vite:preloadError', () => { handleChunkError(); });
  window.addEventListener('unhandledrejection', (ev) => { if (isChunkLoadError(ev.reason)) { ev.preventDefault(); handleChunkError(); } });
  // Đang có bản mới mà người dùng chuyển trang/ẩn tab lúc không có dữ liệu dở -> tải lại êm.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkVersion();
    else if (pending && !isDirty()) hardReload();
  });
  setInterval(checkVersion, 5 * 60_000);
  setTimeout(checkVersion, 60_000);
  setTimeout(() => { try { sessionStorage.removeItem(KEY); } catch {} }, GUARD_MS);
}
