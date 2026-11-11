/**
 * Chọn Firestore database theo môi trường — chống ghi nhầm vào dữ liệu thật.
 *  - Chỉ các host production trong PROD_HOSTS mới dùng DB thật (firebase-applet-config.json → 'chiphi-mkt').
 *  - Mọi host khác (Vercel preview của nhánh, *-staging.vercel.app, …) BẮT BUỘC dùng 'chiphi-mkt-staging'.
 *  - VITE_FIRESTORE_DATABASE_ID có thể chỉ định DB khác cho staging, nhưng KHÔNG thể ép host lạ dùng DB thật.
 */
export const LIVE_DB_ID = 'chiphi-mkt';
export const STAGING_DB_ID = 'chiphi-mkt-staging';
export const PROD_HOSTS = ['chiphi.mayhomes.net', 'chiphimkt-v2.vercel.app'];

export function resolveFirestoreDbId(configDbId: string, hostname: string, envDbId?: string): string {
  const host = String(hostname || '').toLowerCase();
  const isProdHost = PROD_HOSTS.includes(host);
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  const wanted = (envDbId || '').trim();
  if (isProdHost) return wanted && wanted !== LIVE_DB_ID ? wanted : configDbId;
  if (isLocal) return wanted || configDbId;
  // Host lạ: không bao giờ dùng DB thật
  if (!wanted || wanted === LIVE_DB_ID || wanted === configDbId) return STAGING_DB_ID;
  return wanted;
}

export function isStagingDb(dbId: string) {
  return dbId !== LIVE_DB_ID;
}

/** Giờ giả lập cho staging (VITE_VNEXT_NOW). Không bao giờ áp dụng với DB thật. */
export function installStagingClock(dbId: string, fake?: string) {
  if (!isStagingDb(dbId) || !fake) return null;
  (globalThis as any).__VNEXT_NOW__ = fake;
  return fake;
}
