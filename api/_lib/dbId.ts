/** DB Firestore cho API. Fail-closed: thiếu FIRESTORE_DATABASE_ID thì KHÔNG đoán (trước đây mặc định 'chiphi-mkt-staging' → prod đọc/ghi nhầm DB staging). */
export function databaseId(): string {
  const v = (process.env.FIRESTORE_DATABASE_ID || '').trim();
  if (v === 'chiphi-mkt' || v === 'chiphi-mkt-staging') return v;
  throw new Error('FIRESTORE_DATABASE_ID chưa cấu hình hoặc sai');
}
export function databaseIdOrNull(): string | null { try { return databaseId(); } catch { return null; } }
