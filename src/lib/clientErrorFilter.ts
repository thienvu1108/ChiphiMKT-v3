// Lọc lỗi phía người dùng trước khi ghi errorLogs: bỏ lỗi từ tiện ích trình duyệt / script chèn,
// bỏ yêu cầu bị huỷ (AbortError), bỏ «Script error.» không stack, và chống ghi dồn (cùng lỗi + màn trong 60s).
export const DEDUPE_MS = 60_000;
const EXT_RE = /(chrome|moz|safari(-web)?|ms-browser|edge)-extension:\/\//i;
const URL_RE = /((?:https?|chrome-extension|moz-extension|safari-extension|safari-web-extension|ms-browser-extension|edge-extension|webkit-masked-url):\/\/[^\s)]+|<anonymous>|\beval\b)/gi;

export type DropReason = 'empty' | 'resize' | 'abort' | 'script-error' | 'extension' | 'foreign' | 'dupe' | null;

export function isAbortError(e: any, msg: string): boolean {
  if (e && typeof e === 'object' && (e.name === 'AbortError' || e.code === 20)) return true;
  return /signal is aborted|aborted without reason|The user aborted a request|The operation was aborted|AbortError|Fetch is aborted/i.test(msg);
}

/** 'own' nếu có ít nhất 1 frame thuộc origin của app; 'foreign' nếu mọi frame có URL đều ngoài app; 'unknown' nếu không có frame URL. */
export function stackOrigin(stack: string | undefined, origin: string): 'own' | 'extension' | 'foreign' | 'unknown' {
  if (!stack) return 'unknown';
  const urls = stack.match(URL_RE) || [];
  if (!urls.length) return 'unknown';
  if (origin && urls.some((u) => u.startsWith(origin))) return 'own';
  if (urls.some((u) => EXT_RE.test(u) || /^webkit-masked-url:/i.test(u))) return 'extension';
  return 'foreign';
}

export function classifyClientError(e: any, msg: string, origin: string): DropReason {
  if (!msg) return 'empty';
  if (/ResizeObserver loop/.test(msg)) return 'resize';
  if (isAbortError(e, msg)) return 'abort';
  const stack: string | undefined = e && typeof e === 'object' && typeof e.stack === 'string' ? e.stack : undefined;
  if (/^Script error\.?$/i.test(msg.trim()) && !stack) return 'script-error';
  const o = stackOrigin(stack, origin);
  if (o === 'extension') return 'extension';
  if (o === 'foreign') return 'foreign';
  return null;
}

/** Chống ghi dồn: trả true nếu được ghi; cập nhật `seen`. */
export function dedupeOk(seen: Map<string, number>, msg: string, page: string, now: number, windowMs = DEDUPE_MS): boolean {
  const k = msg.slice(0, 200) + '|' + page;
  const t = seen.get(k);
  if (t != null && now - t < windowMs) return false;
  seen.set(k, now);
  if (seen.size > 200) for (const [kk, tt] of seen) if (now - tt >= windowMs) seen.delete(kk);
  return true;
}

/** Snapshot an toàn: Safari đôi khi gọi callback với snapshot/metadata undefined. */
export function snapPending(s: any): boolean { return !!s?.metadata?.hasPendingWrites; }
export function snapExists(s: any): boolean { try { return typeof s?.exists === 'function' ? !!s.exists() : false; } catch { return false; } }
