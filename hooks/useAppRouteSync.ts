import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { pathFromTabs, redirectForRemovedPath, tabsFromPath } from '@/lib/routes';

/**
 * Keeps activeTab/adminSubTab in sync with the browser URL (and vice versa)
 * without rewriting all business logic that still uses setActiveTab.
 */
export function useAppRouteSync(
  activeTab: string,
  adminSubTab: string,
  setActiveTab: (tab: string) => void,
  setAdminSubTab: (sub: string) => void,
  /** Role guard: returns a path to REPLACE the current URL with (locked roles), or null. */
  redirectFor?: (pathname: string) => string | null,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const syncingFromUrl = useRef(false);
  const lastPushed = useRef('');

  // Role guard (separate effect so a role that loads later only acts when it must redirect;
  // unlocked roles never re-sync state from the URL because of it).
  useEffect(() => {
    const guarded = redirectFor?.(location.pathname);
    if (guarded && guarded !== location.pathname) {
      lastPushed.current = guarded;
      navigate(guarded, { replace: true });
    }
  }, [location.pathname, redirectFor, navigate]);

  // URL → state (back/forward + deep link)
  useEffect(() => {
    // Removed modules (e.g. /quan-ly-phong-kd) → rewrite URL in place to a live screen.
    const redirectTo = redirectForRemovedPath(location.pathname);
    if (redirectTo && redirectTo !== location.pathname) {
      navigate(redirectTo, { replace: true });
      return;
    }
    // Role-locked screens (GĐ Khối / Trợ lý Khối / Trưởng ban KD): the guard effect above
    // rewrites the URL; don't sync state from a forbidden path meanwhile.
    const guarded = redirectFor?.(location.pathname);
    if (guarded && guarded !== location.pathname) return;
    const { tab, adminSubTab: sub } = tabsFromPath(location.pathname);
    // Back/forward/deep link: remember the current URL so a later tab change back to a
    // previously pushed path still navigates (otherwise URL and screen drift apart).
    lastPushed.current = location.pathname;
    syncingFromUrl.current = true;
    if (tab !== activeTab) setActiveTab(tab);
    if (sub && sub !== adminSubTab) setAdminSubTab(sub);
    // allow state flush then clear
    queueMicrotask(() => {
      syncingFromUrl.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // state → URL
  useEffect(() => {
    if (syncingFromUrl.current) return;
    const next = pathFromTabs(activeTab, activeTab === 'admin' ? adminSubTab : undefined);
    if (next !== location.pathname && next !== lastPushed.current) {
      // A locked role never gets a history entry for a forbidden screen.
      const guarded = redirectFor?.(next);
      if (guarded) {
        if (guarded !== location.pathname) {
          lastPushed.current = guarded;
          navigate(guarded, { replace: true });
        }
        return;
      }
      lastPushed.current = next;
      navigate(next, { replace: false });
    }
  }, [activeTab, adminSubTab, location.pathname, navigate, redirectFor]);

  // Latest values for the stable replaceTo callback (guards list it as an effect dependency).
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const subRef = useRef(adminSubTab);
  subRef.current = adminSubTab;

  /**
   * Guard redirect: set the screen AND replace the URL in the same step. Needed because a
   * guard that fires right after a URL→state sync would otherwise leave the old path in the
   * address bar (state→URL is suppressed while syncing), e.g. /nghiem-thu showing Quản lý Ban KD.
   */
  const replaceTo = useCallback((tab: string, sub?: string) => {
    setActiveTab(tab);
    if (sub) setAdminSubTab(sub);
    const next = pathFromTabs(tab, tab === 'admin' ? sub || subRef.current : undefined);
    lastPushed.current = next;
    if (next !== pathRef.current) navigate(next, { replace: true });
  }, [setActiveTab, setAdminSubTab, navigate]);

  return {
    replaceTo,
    goTo: (tab: string, sub?: string) => {
      setActiveTab(tab);
      if (sub) setAdminSubTab(sub);
      const next = pathFromTabs(tab, tab === 'admin' ? sub || adminSubTab : undefined);
      lastPushed.current = next;
      navigate(next);
    },
  };
}
