import React, { useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { LogIn, Info, ChevronDown, Copy, ExternalLink, MessageCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from './firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  REDIRECT_ERROR_KEY,
  REDIRECT_PENDING_KEY,
  isRedirectUnreliableBrowser,
  copyAppLink,
  detectInAppBrowser,
  isDisallowedUserAgentError,
  shouldPreferRedirect,
  tryOpenInExternalBrowser,
  autoEscapeInApp,
  externalBrowserUrls,
  type InAppBrowserInfo,
} from './lib/inAppBrowser';

const LOGO_SRC =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 80' fill='none'><path d='M50 15 L88 53 H74 L50 28 L26 53 H12 Z' fill='%23E45A1D'/><path d='M50 28 L64 42 L50 56 L36 42 Z' fill='%23E45A1D'/><path d='M12 53 L31 21 H43 L24 53 Z' fill='%23E45A1D'/><path d='M88 53 L69 21 H57 L76 53 Z' fill='%23E45A1D'/></svg>";


function DeveloperFooter({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-[var(--mh-text-2)] ${className}`}>
      <div className="flex items-center gap-2 font-black uppercase tracking-[0.2em] text-xs">
        <span className="text-[var(--mh-text-2)]">Phát triển bởi</span>
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
        <span className="text-[var(--mh-text-2)]">Thiên Vũ - Digital Marketing Mayhomes</span>
      </div>
      <a
        href="https://zalo.me/0854642555"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 border transition-all duration-300 group min-h-11 px-4 py-2 bg-[var(--mh-surface-2)] border-[var(--mh-border)] rounded-full hover:bg-[var(--mh-surface)] hover:shadow-sm"
      >
        <div className="bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-200 group-hover:rotate-[10deg] transition-all w-6 h-6">
          <MessageCircle className="w-3.5 h-3.5 fill-current" />
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="font-black uppercase tracking-tight text-xs text-[var(--mh-text-2)]">
            Liên hệ hỗ trợ Zalo
          </span>
        </div>
      </a>
    </div>
  );
}

function mapAuthErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  const code = err?.code || '';
  if (code === 'auth/popup-blocked') {
    return 'Trình duyệt đã chặn cửa sổ bật lên. Đang thử đăng nhập bằng chuyển hướng…';
  }
  if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
    return 'Bạn đã đóng cửa sổ đăng nhập.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Tên miền này chưa được ủy quyền trong Firebase Console.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Môi trường trình duyệt hiện tại không hỗ trợ đăng nhập Google (popup/redirect).';
  }
  if (isDisallowedUserAgentError(error)) {
    return 'Google chặn đăng nhập trong trình duyệt Zalo/WebView (disallowed_useragent). Hãy mở bằng Safari hoặc Chrome.';
  }
  if (err?.message) return `Lỗi: ${err.message}`;
  return 'Đăng nhập thất bại';
}

export function LoginPage() {
  const [browserInfo, setBrowserInfo] = useState<InAppBrowserInfo>(() => detectInAppBrowser());
  const [showAuthHelper, setShowAuthHelper] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [oauthBlocked, setOauthBlocked] = useState(false);

  const isWebView = browserInfo.isInApp;
  // WebView: tự thử mở Safari/Chrome; sau ~1.5s vẫn ở đây → hiện bảng hướng dẫn.
  const [escapeShown, setEscapeShown] = useState(false);
  useEffect(() => {
    if (!isWebView) return;
    autoEscapeInApp(browserInfo);
    const t = setTimeout(() => { if (document.visibilityState !== 'hidden') setEscapeShown(true); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWebView]);
  const isZalo = browserInfo.name === 'zalo';

  useEffect(() => {
    const info = detectInAppBrowser();
    setBrowserInfo(info);
    if (info.isInApp) setShowAuthHelper(true);

    try {
      const pending = sessionStorage.getItem(REDIRECT_ERROR_KEY);
      if (pending) {
        sessionStorage.removeItem(REDIRECT_ERROR_KEY);
        setOauthBlocked(true);
        setShowAuthHelper(true);
        toast.error(pending);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const helperTitle = useMemo(() => {
    if (oauthBlocked || isZalo) return '⚠️ Không đăng nhập được trong Zalo?';
    if (isWebView) return `⚠️ Lỗi đăng nhập trên ${browserInfo.label || 'WebView'}?`;
    return 'Trợ giúp khi gặp lỗi Đăng nhập';
  }, [oauthBlocked, isZalo, isWebView, browserInfo.label]);

  const startRedirect = async (provider: GoogleAuthProvider) => {
    setIsBusy(true);
    toast.message('Đang chuyển tới Google để đăng nhập…');
    try {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    await signInWithRedirect(auth, provider);
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setIsBusy(true);
    try {
      // IMPORTANT: no `await` before signInWithPopup/signInWithRedirect — Safari drops the
      // user gesture after an await and blocks the popup. Persistence is set in firebase.ts.
      if (shouldPreferRedirect(browserInfo)) {
        // Popup gần như luôn bị chặn trong Zalo / in-app browser → dùng redirect ngay.
        try {
          await startRedirect(provider);
          return;
        } catch (redirectErr) {
          console.error('Redirect login error:', redirectErr);
          setOauthBlocked(true);
          setShowAuthHelper(true);
          toast.error(mapAuthErrorMessage(redirectErr));
          setIsBusy(false);
          return;
        }
      }

      try {
        await signInWithPopup(auth, provider);
        toast.success('Đăng nhập thành công');
      } catch (popupErr: unknown) {
        const code = (popupErr as { code?: string })?.code || '';
        const shouldFallbackRedirect =
          code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment' ||
          isDisallowedUserAgentError(popupErr);

        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          toast.error(mapAuthErrorMessage(popupErr));
          setIsBusy(false);
          return;
        }

        if (shouldFallbackRedirect && code === 'auth/popup-blocked' && isRedirectUnreliableBrowser(browserInfo)) {
          // Safari / iOS: redirect sign-in can't complete (ITP partitions storage with the
          // firebaseapp.com auth domain) → user would land back here silently. Ask for a direct tap.
          console.warn('Popup blocked on Safari/iOS; not falling back to redirect:', popupErr);
          setShowAuthHelper(true);
          toast.error('Safari đã chặn cửa sổ đăng nhập. Hãy bấm lại «Đăng nhập bằng Google» và cho phép cửa sổ bật lên.');
        } else if (shouldFallbackRedirect) {
          console.warn('Popup failed, falling back to redirect:', popupErr);
          try {
            await startRedirect(provider);
            return;
          } catch (redirectErr) {
            console.error('Redirect fallback error:', redirectErr);
            setOauthBlocked(true);
            setShowAuthHelper(true);
            toast.error(mapAuthErrorMessage(redirectErr));
          }
        } else {
          if (isDisallowedUserAgentError(popupErr)) {
            setOauthBlocked(true);
            setShowAuthHelper(true);
          }
          toast.error(mapAuthErrorMessage(popupErr));
        }
      }
    } catch (error: unknown) {
      console.error('Login Error:', error);
      if (isDisallowedUserAgentError(error)) {
        setOauthBlocked(true);
        setShowAuthHelper(true);
      }
      toast.error(mapAuthErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await copyAppLink();
      toast.success('Đã sao chép link. Dán vào Safari/Chrome để mở.');
    } catch {
      toast.error('Không sao chép được. Hãy chọn địa chỉ trên thanh URL và copy thủ công.');
    }
  };

  const handleOpenExternal = () => {
    try {
      tryOpenInExternalBrowser();
      toast.message(
        browserInfo.isAndroid
          ? 'Đang thử mở bằng Chrome… Nếu không được, hãy dùng menu Zalo → Mở bằng trình duyệt.'
          : 'Nếu vẫn ở trong Zalo: chạm … → Mở bằng Safari / trình duyệt.'
      );
    } catch {
      toast.error('Không mở được trình duyệt ngoài. Hãy sao chép link và mở thủ công.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--mh-surface-2)] p-4">
      <Card className="w-full max-w-md border-none shadow-xl bg-[var(--mh-surface)]/80 backdrop-blur">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto flex flex-col items-center gap-2">
            <div className="w-20 h-20 bg-[var(--mh-surface)] rounded-2xl flex items-center justify-center shadow-xl border border-[var(--mh-border)] overflow-hidden">
              <img
                src={LOGO_SRC}
                alt="MAYHOMES Logo"
                className="w-full h-full object-contain p-2"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="space-y-1">
              <h2 className="text-4xl font-black tracking-tighter text-[var(--mh-text)] flex justify-center items-center">
                <span className="text-[var(--mh-navy)]">MAY</span>
                <span className="text-[var(--mh-navy)]">HOMES</span>
              </h2>
              <p className="text-xs font-bold text-blue-800 tracking-[0.2em] uppercase">
                Khơi nguồn cuộc sống tinh hoa
              </p>
            </div>
          </div>
          <div className="pt-4 space-y-3">
            <CardTitle className="text-xl font-bold tracking-tight text-[var(--mh-text)]">
              Marketing Cost Control
            </CardTitle>
            <div className="space-y-4">
              <CardDescription className="text-[var(--mh-text-2)]">
                Hệ thống quản lý chi phí marketing chuyên nghiệp
              </CardDescription>
              <DeveloperFooter className="bg-[var(--mh-surface-2)]/50 p-4 rounded-2xl border border-[var(--mh-border)]" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {isWebView && (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-left space-y-3" data-testid="inapp-escape">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-[13px] text-amber-950 leading-relaxed">
                  <p className="font-black">Bạn đang mở trong {browserInfo.label || 'trình duyệt trong ứng dụng'}</p>
                  <p>Google không cho đăng nhập ở đây. Hãy mở trang này bằng <strong>{browserInfo.isIOS ? 'Safari' : 'Chrome'}</strong>{escapeShown ? '' : ' (đang thử mở…)'}.</p>
                </div>
              </div>
              <Button type="button" onClick={handleOpenExternal} data-testid="inapp-open"
                className="w-full h-12 text-base font-bold bg-[var(--mh-navy)] hover:bg-[#113273] text-white rounded-xl">
                <ExternalLink className="w-4 h-4 mr-2" /> Mở bằng {browserInfo.isIOS ? 'Safari' : 'Chrome'}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCopyLink} data-testid="inapp-copy"
                  className="flex-1 h-10 text-xs font-bold border-amber-300 bg-[var(--mh-surface)] text-amber-950 hover:bg-amber-100 rounded-xl">
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Sao chép link
                </Button>
                {browserInfo.isIOS && (
                  <Button type="button" variant="outline" data-testid="inapp-chrome"
                    onClick={() => { window.location.href = externalBrowserUrls().iosChrome; }}
                    className="flex-1 h-10 text-xs font-bold border-amber-300 bg-[var(--mh-surface)] text-amber-950 hover:bg-amber-100 rounded-xl">
                    Mở bằng Chrome
                  </Button>
                )}
              </div>
              {escapeShown && (
                <div className="rounded-xl bg-[var(--mh-surface)] border border-amber-200 p-3" data-testid="inapp-guide">
                  <p className="text-xs font-black text-[var(--mh-text)] mb-2">Nếu không tự mở được:</p>
                  <div className="flex items-center gap-3">
                    <div className="relative w-20 h-14 shrink-0 rounded-lg border-2 border-[var(--mh-border-strong)] bg-[var(--mh-surface-2)]" aria-hidden>
                      <div className="h-3 rounded-t-md bg-[var(--mh-border)] flex justify-end items-center pr-1"><span className="text-[11px] leading-none font-black text-[var(--mh-navy)] animate-pulse">⋯</span></div>
                      <span className="absolute -top-3 -right-2 text-lg">👆</span>
                    </div>
                    <ol className="text-xs text-[var(--mh-text)] space-y-1 list-decimal pl-4">
                      <li>Bấm <strong>⋯</strong> ở góc trên bên phải</li>
                      <li>Chọn <strong>Mở bằng trình duyệt</strong>{browserInfo.isIOS ? ' / Mở trong Safari' : ''}</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          )}
          {!isWebView && oauthBlocked && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950">
              Google chặn đăng nhập trong trình duyệt này. Hãy mở bằng <strong>Safari</strong> hoặc <strong>Chrome</strong>.
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleCopyLink} className="flex-1 h-9 text-xs font-bold rounded-xl"><Copy className="w-3.5 h-3.5 mr-1.5" /> Sao chép link</Button>
                <Button type="button" onClick={handleOpenExternal} className="flex-1 h-9 text-xs font-bold bg-amber-600 text-white rounded-xl"><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Mở bằng trình duyệt</Button>
              </div>
            </div>
          )}

          {!isWebView && (
          <Button
            onClick={login}
            disabled={isBusy}
            data-testid="google-login"
            className="w-full h-12 text-lg font-bold bg-[var(--mh-navy)] hover:bg-[#113273] text-white shadow-md shadow-blue-200/50 transition-all rounded-xl cursor-pointer disabled:opacity-70"
            size="lg"
          >
            {isBusy ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang đăng nhập…
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-5 w-5" /> Đăng nhập bằng Google
              </>
            )}
          </Button>
          )}

          <div
            className={`mt-2 border rounded-2xl overflow-hidden transition-all duration-300 ${
              isWebView || oauthBlocked
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-[var(--mh-border)] bg-[var(--mh-surface-2)]/50'
            }`}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between p-3.5 cursor-pointer hover:bg-[var(--mh-surface-2)] select-none transition-colors text-left"
              aria-expanded={showAuthHelper}
              aria-controls="auth-helper-panel"
              id="auth-helper-trigger"
              onClick={() => setShowAuthHelper(!showAuthHelper)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Info
                  className={`w-4 h-4 shrink-0 ${
                    isWebView || oauthBlocked ? 'text-amber-600' : 'text-[var(--mh-text-2)]'
                  }`}
                />
                <span
                  className={`text-xs font-bold truncate ${
                    isWebView || oauthBlocked ? 'text-amber-900 font-extrabold' : 'text-[var(--mh-text)]'
                  }`}
                >
                  {helperTitle}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform duration-300 ${
                  isWebView || oauthBlocked ? 'text-amber-500' : 'text-[var(--mh-text-3)]'
                } ${showAuthHelper ? 'rotate-180' : ''}`}
              />
            </button>

            {showAuthHelper && (
              <div
                id="auth-helper-panel"
                role="region"
                aria-labelledby="auth-helper-trigger"
                className="p-4 pt-0 border-t border-dashed border-[var(--mh-border)]/80 space-y-3.5 text-xs animate-in fade-in duration-200"
              >
                <div className="space-y-2 mt-3 text-[var(--mh-text)] leading-relaxed">
                  <p>
                    Ứng dụng chat như <strong>Zalo</strong>, <strong>Facebook</strong>,{' '}
                    <strong>Messenger</strong>, <strong>Instagram</strong> thường mở link bằng trình duyệt
                    tích hợp (WebView) — không phải Safari/Chrome thật.
                  </p>
                  <p className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 font-medium leading-relaxed">
                    🔒 Google{' '}
                    <strong>chặn đăng nhập (403: disallowed_useragent)</strong> trong WebView để chống giả
                    mạo. Popup đăng nhập cũng thường bị Zalo chặn.
                  </p>
                </div>

                <div
                  className={`p-3.5 rounded-xl border ${
                    isWebView || oauthBlocked
                      ? 'bg-amber-100/50 border-amber-200 text-amber-900'
                      : 'bg-blue-50/45 border-blue-100 text-[var(--mh-text)]'
                  } space-y-2`}
                >
                  <p className="font-bold text-[var(--mh-text)]">
                    {isZalo ? '💡 Cách mở CRM từ Zalo (khuyến nghị):' : '💡 Cách khắc phục nhanh:'}
                  </p>
                  {isZalo || oauthBlocked ? (
                    <ol className="list-decimal pl-4 space-y-1.5">
                      <li>
                        Trong Zalo, chạm nút <strong>⋯ (ba chấm)</strong> góc trên (hoặc biểu tượng trình
                        duyệt).
                      </li>
                      <li>
                        Chọn <strong>«Mở bằng trình duyệt»</strong> / <strong>«Mở bằng Safari»</strong> /
                        <strong> Chrome</strong>.
                      </li>
                      <li>
                        <strong>Android:</strong> có thể dùng nút «Mở bằng trình duyệt» phía trên (thử mở
                        Chrome). Nếu không được → Sao chép link → dán vào Chrome.
                      </li>
                      <li>
                        <strong>iPhone:</strong> Zalo thường giữ WebView; hãy dùng menu ⋯ → Safari, hoặc
                        Sao chép link → dán vào Safari.
                      </li>
                      <li>Trên Safari/Chrome, nhấn lại «Đăng nhập bằng Google».</li>
                    </ol>
                  ) : (
                    <ol className="list-decimal pl-4 space-y-1.5">
                      <li>Cho phép cửa sổ bật lên (popup) nếu trình duyệt hỏi.</li>
                      <li>
                        Nếu vẫn lỗi: Sao chép link → mở bằng Safari/Chrome → đăng nhập lại.
                      </li>
                      <li>
                        Với WebView (Zalo/Facebook): luôn mở bằng trình duyệt hệ thống trước khi đăng nhập
                        Google.
                      </li>
                    </ol>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={handleCopyLink}
                    className="flex-1 text-xs font-bold border-[var(--mh-border)] text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)] h-9 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-[var(--mh-text-2)]" /> Sao chép link
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleOpenExternal}
                    className="text-xs font-bold border-[var(--mh-border)] text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)] h-9 rounded-xl flex items-center justify-center gap-1.5 px-3.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[var(--mh-text-2)]" /> Mở bằng trình duyệt
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
