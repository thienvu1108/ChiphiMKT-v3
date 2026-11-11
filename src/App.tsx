import { lazyRetry } from './lib/chunkReload';
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { getRedirectResult, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import { LoginPage } from './LoginPage';
import {
  REDIRECT_ERROR_KEY,
  REDIRECT_PENDING_KEY,
  isDisallowedUserAgentError,
  mapAuthErrorForStorage,
} from './lib/inAppBrowser';
import { ScreenSkeleton } from '@/components/layout/SkeletonLoaders';

const AuthenticatedApp = lazyRetry(() => import('./AuthenticatedApp'));
const ShareView = lazyRetry(() => import('./vnext/ShareView'));

/** Link chia sẻ công khai Báo cáo Nghiệm thu: /chia-se/<token> — không cần đăng nhập. */
function shareTokenFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/^\/chia-se\/([A-Za-z0-9]{24,64})\/?$/);
  return m ? m[1] : null;
}

export default function App() {
  const token = shareTokenFromPath();
  if (token) {
    return (
      <Suspense fallback={<LoadingScreen label="Đang tải báo cáo…" />}>
        <ShareView token={token} />
      </Suspense>
    );
  }
  return <MainApp />;
}

function LoadingScreen({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--mh-bg)] gap-3">
      <div className="w-10 h-10 rounded-[10px] bg-[var(--mh-navy)] grid place-items-center animate-pulse">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path d="M3 18V7l5 6 4-6 4 6 5-6v11" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="text-[var(--mh-text-2)] text-sm font-medium">{label}</div>
    </div>
  );
}

function storeRedirectError(error: unknown) {
  try {
    const msg =
      mapAuthErrorForStorage(error) ||
      (isDisallowedUserAgentError(error)
        ? 'Google chặn đăng nhập trong trình duyệt Zalo/WebView. Hãy mở bằng Safari hoặc Chrome.'
        : String((error as { message?: string })?.message || 'Đăng nhập chuyển hướng thất bại'));
    sessionStorage.setItem(REDIRECT_ERROR_KEY, msg);
  } catch {
    /* ignore */
  }
}

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingRedirect, setResolvingRedirect] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        // Bound the wait: on iOS Safari (ITP / partitioned storage) the cross-origin auth iframe
        // used by getRedirectResult can stall, leaving the app on "Đang hoàn tất đăng nhập…".
        // onAuthStateChanged below still picks up a late redirect sign-in.
        let redirectPending = false;
        try {
          redirectPending = Boolean(sessionStorage.getItem(REDIRECT_PENDING_KEY));
          sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        } catch {
          /* ignore */
        }
        const result = await Promise.race([
          getRedirectResult(auth),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
        if (redirectPending && !result && !auth.currentUser) {
          // Came back from Google but no session (typical on Safari/iOS with ITP).
          try {
            sessionStorage.setItem(
              REDIRECT_ERROR_KEY,
              'Đăng nhập chuyển hướng không hoàn tất (trình duyệt chặn lưu trữ chéo trang). Hãy mở bằng Safari/Chrome rồi bấm lại «Đăng nhập bằng Google».',
            );
          } catch {
            /* ignore */
          }
        }
      } catch (error) {
        console.error('getRedirectResult error:', error);
        storeRedirectError(error);
      } finally {
        if (!cancelled) setResolvingRedirect(false);
      }

      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (cancelled) return;
        setUser(firebaseUser);
        setLoading(false);
        if (firebaseUser) {
          try {
            sessionStorage.removeItem(REDIRECT_ERROR_KEY);
          } catch {
            /* ignore */
          }
        }
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  if (loading || resolvingRedirect) {
    return (
      <LoadingScreen
        label={resolvingRedirect ? 'Đang hoàn tất đăng nhập…' : 'Đang tải...'}
      />
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<ScreenSkeleton />}>
        <AuthenticatedApp />
      </Suspense>
    </BrowserRouter>
  );
}
