export const REDIRECT_ERROR_KEY = 'chiphi_auth_redirect_error';
/** Set right before signInWithRedirect; lets App detect a redirect that came back without a user. */
export const REDIRECT_PENDING_KEY = 'chiphi_auth_redirect_pending';

/**
 * Detect in-app browsers / WebViews that typically break Google OAuth popups
 * (Zalo, Facebook, Instagram, Line, …) and often hit Google's
 * 403 disallowed_useragent when authenticating inside the embedded browser.
 */

export type InAppBrowserName =
  | 'zalo'
  | 'facebook'
  | 'instagram'
  | 'line'
  | 'tiktok'
  | 'twitter'
  | 'webview'
  | null;

export type InAppBrowserInfo = {
  isInApp: boolean;
  name: InAppBrowserName;
  label: string;
  isAndroid: boolean;
  isIOS: boolean;
};

const LABELS: Record<Exclude<InAppBrowserName, null>, string> = {
  zalo: 'Zalo',
  facebook: 'Facebook / Messenger',
  instagram: 'Instagram',
  line: 'LINE',
  tiktok: 'TikTok',
  twitter: 'X / Twitter',
  webview: 'trình duyệt trong ứng dụng',
};

export function detectInAppBrowser(): InAppBrowserInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isInApp: false, name: null, label: '', isAndroid: false, isIOS: false };
  }

  const ua = navigator.userAgent || (navigator as Navigator & { vendor?: string }).vendor || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPod|iPad/i.test(ua);

  let name: InAppBrowserName = null;
  if (/Zalo/i.test(ua)) name = 'zalo';
  else if (/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(ua)) name = 'facebook';
  else if (/Instagram/i.test(ua)) name = 'instagram';
  else if (/Line\//i.test(ua)) name = 'line';
  else if (/TikTok|musical_ly|BytedanceWebview|ByteLocale/i.test(ua)) name = 'tiktok';
  else if (/Twitter|Tweetbot|X\/\d/i.test(ua)) name = 'twitter';
  else if (/; wv\)/i.test(ua) || /\bwv\b/.test(ua)) name = 'webview';
  else if (
    isIOS &&
    /AppleWebKit/i.test(ua) &&
    !/Safari/i.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)
  ) {
    // WKWebView often omits "Safari" in the UA
    name = 'webview';
  } else if (
    isIOS &&
    /AppleWebKit/i.test(ua) &&
    /Mobile\//i.test(ua) &&
    !/Safari\//i.test(ua)
  ) {
    name = 'webview';
  }

  return {
    isInApp: name != null,
    name,
    label: name ? LABELS[name] : '',
    isAndroid,
    isIOS,
  };
}

/**
 * Safari (macOS/iOS) and every iOS browser (all WebKit + ITP): signInWithRedirect with a
 * cross-site authDomain (firebaseapp.com vs vercel.app) returns without a user because
 * storage is partitioned. Popup is the reliable path there (outside in-app WebViews).
 */
export function isRedirectUnreliableBrowser(info: InAppBrowserInfo = detectInAppBrowser()): boolean {
  if (typeof navigator === 'undefined') return false;
  if (info.isInApp) return false;
  const ua = navigator.userAgent || '';
  const isIPadOS = navigator.platform === 'MacIntel' && (navigator as Navigator).maxTouchPoints > 1;
  const isDesktopSafari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua);
  return info.isIOS || isIPadOS || isDesktopSafari;
}

/** Prefer redirect flow when popups are unreliable. */
export function shouldPreferRedirect(info: InAppBrowserInfo = detectInAppBrowser()): boolean {
  return info.isInApp;
}

export function isDisallowedUserAgentError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message || error || '').toLowerCase();
  return (
    msg.includes('disallowed_useragent') ||
    msg.includes('disallowed user agent') ||
    (msg.includes('403') && msg.includes('useragent'))
  );
}

export function copyAppLink(): Promise<void> {
  const url = window.location.href;
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(url);
  }
  const input = document.createElement('input');
  input.value = url;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
  return Promise.resolve();
}

/**
 * Best-effort open in system browser.
 * Android: Chrome Intent. iOS / others: _blank (often still trapped in WebView — copy is primary).
 */
export function tryOpenInExternalBrowser(): void {
  const url = window.location.href;
  const ua = navigator.userAgent || '';

  if (/Android/i.test(ua)) {
    window.location.href = externalBrowserUrls(url).androidChrome;
    return;
  }
  if (/iPhone|iPod|iPad/i.test(ua)) {
    window.location.href = externalBrowserUrls(url).iosSafari;
    return;
  }

  // iOS / desktop: attempt new tab (may stay inside Zalo); user should use menu → Mở bằng Safari
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.assign(url);
  }
}


/** Short Vietnamese message persisted across redirect return. */
export function mapAuthErrorForStorage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  const code = err?.code || '';
  if (isDisallowedUserAgentError(error)) {
    return 'Google chặn đăng nhập trong trình duyệt Zalo/WebView (disallowed_useragent). Hãy mở bằng Safari hoặc Chrome.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Tên miền này chưa được ủy quyền trong Firebase Console.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Môi trường trình duyệt hiện tại không hỗ trợ đăng nhập Google.';
  }
  if (err?.message) return err.message;
  return '';
}

/** URL thoát WebView, giữ nguyên deep link (path + query + hash). */
export function externalBrowserUrls(url: string = window.location.href) {
  const rest = url.replace(/^https?:\/\//i, '');
  return {
    androidChrome: `intent://${rest}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`,
    androidAny: `intent://${rest}#Intent;scheme=https;end`,
    iosSafari: `x-safari-https://${rest}`,
    iosChrome: `googlechromes://${rest}`,
  };
}

const ESCAPE_TRIED_KEY = 'chiphi_inapp_escape_tried';
/** Tự thử mở trình duyệt ngoài 1 lần / phiên (tránh vòng lặp). Trả về true nếu đã thử. */
export function autoEscapeInApp(info: InAppBrowserInfo = detectInAppBrowser(), go: (u: string) => void = (u) => { window.location.href = u; }): boolean {
  if (!info.isInApp) return false;
  try { if (sessionStorage.getItem(ESCAPE_TRIED_KEY) === window.location.href) return false; sessionStorage.setItem(ESCAPE_TRIED_KEY, window.location.href); } catch { /* storage bị chặn: vẫn thử */ }
  const u = externalBrowserUrls();
  if (info.isAndroid) {
    go(u.androidChrome);
    setTimeout(() => { if (document.visibilityState === 'visible') go(u.androidAny); }, 800);
    return true;
  }
  if (info.isIOS) { go(u.iosSafari); return true; }
  return false;
}
