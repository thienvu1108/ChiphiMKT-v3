import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  type Auth,
} from 'firebase/auth';
import { cleanupStorageQuota } from './lib/storageCleanup';

// Run cleanup immediately to ensure localStorage quota is clean for Auth
cleanupStorageQuota();
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentSingleTabManager,
  persistentMultipleTabManager, 
  memoryLocalCache,
  getFirestore,
  setLogLevel,
  doc, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';

// Silence Firestore internal diagnostic log warnings (including multi-tab lease clock skew warnings)
try {
  setLogLevel('silent');
} catch {
  // ignore
}

// Intercept benign Firestore multi-tab lease clock drift warning
if (typeof window !== 'undefined') {
  const origConsoleError = console.error;
  console.error = function (...args: any[]) {
    const msg = args.map(a => (typeof a === 'string' ? a : (a?.message || ''))).join(' ');
    if (msg.includes('Detected an update time that is in the future')) {
      return;
    }
    origConsoleError.apply(console, args);
  };
}

const app = initializeApp(firebaseConfig);

// Detect iframe or iOS or Safari where persistentMultipleTabManager / Web Locks often conflict or deadlock
const isIframe = typeof window !== 'undefined' && window.self !== window.top;
const isIOSOrSafari = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent || '')
);

import { resolveFirestoreDbId, installStagingClock } from './vnext/dbTarget';
export const FIRESTORE_DB_ID = resolveFirestoreDbId(
  firebaseConfig.firestoreDatabaseId,
  typeof window !== 'undefined' ? window.location.hostname : '',
  (import.meta as any).env?.VITE_FIRESTORE_DATABASE_ID,
);

export const STAGING_FAKE_NOW = installStagingClock(FIRESTORE_DB_ID, (import.meta as any).env?.VITE_VNEXT_NOW);

let firestoreDb;
try {
  if (isIOSOrSafari || /-staging$/.test(FIRESTORE_DB_ID)) { // staging: memory cache (tránh treo IndexedDB khi kiểm thử)
    // iOS / Safari: WebKit IndexedDB is unreliable after the tab is backgrounded
    // (e.g. Google sign-in popup opens a new tab on iPhone). A persistent cache then
    // makes getDoc/setDoc hang forever → user sees "Đăng nhập thành công" but the app
    // never finishes booting. Use the in-memory cache on WebKit to avoid IndexedDB.
    firestoreDb = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache()
    }, FIRESTORE_DB_ID);
  } else {
    // Use persistentSingleTabManager with forceOwnership in iframes to eliminate lease conflicts and deadlock
    const tabManager = isIframe ? persistentSingleTabManager({ forceOwnership: true }) : persistentMultipleTabManager();
    firestoreDb = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager
      })
    }, FIRESTORE_DB_ID);
  }
} catch (e1) {
  console.warn("Falling back to single tab / memory cache for Firestore:", e1);
  try {
    firestoreDb = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache()
    }, FIRESTORE_DB_ID);
  } catch (e2) {
    firestoreDb = getFirestore(app, FIRESTORE_DB_ID);
  }
}

export const db = firestoreDb;
// Persistence is fixed at init (localStorage first) instead of calling auth.setPersistence()
// inside the login click handler: any `await` before signInWithPopup makes Safari (macOS/iOS)
// lose the user-gesture and block the popup, which then fell back to signInWithRedirect —
// and redirect sign-in is broken on Safari (ITP partitions storage between
// chiphimkt-v2.vercel.app and the firebaseapp.com authDomain), so the user never got in.
// localStorage first also avoids WebKit's flaky IndexedDB for the auth session.
let firebaseAuth: Auth;
try {
  firebaseAuth = initializeAuth(app, {
    persistence: [browserLocalPersistence, indexedDBLocalPersistence, browserSessionPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  firebaseAuth = getAuth(app);
}
export const auth = firebaseAuth;
(globalThis as any).__CL_AUTH__ = firebaseAuth; // changeLogShim: actor = người đang đăng nhập

// Critical: Test connection on boot to diagnose network/config issues
export async function testConnection() {
  try {
    // Attempt to fetch a dummy document from the server to verify connectivity
    // If we get "Missing or insufficient permissions", it actually means we ARE connected
    // because the server responded with that error.
    await getDocFromServer(doc(db, '_internal_', 'connection_test'));
    console.log("Firestore connection verified.");
    return true;
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // If we get "Missing or insufficient permissions", it confirms the server is reachable and active
      if ((error as any).code === 'permission-denied' || msg.includes('permission')) {
        console.log("Firestore connection verified (server reached).");
        return true;
      }

      const isQuotaOrOffline = (error as any).code === 'resource-exhausted' || 
                               (error as any).code === 'unavailable' ||
                               msg.includes('quota') || 
                               msg.includes('exhausted');
      
      if (isQuotaOrOffline && typeof window !== 'undefined') {
        console.warn("Firebase Connection Test indicated Limit or Connectivity issue. Switching to Local Database fallback.");
        (window as any).isFirestoreQuotaExceeded = true;
        window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
        return true;
      }

      if (error.message.includes('the client is offline')) {
        console.error("Firestore Error: The client is offline. Check network/Firebase config.");
      } else {
        console.error("Firestore Connection Error:", error.message);
      }
    }
    return false;
  }
}
