/**
 * Google Drive qua OAuth tài khoản Admin (dung lượng tính vào Drive của người kết nối).
 * Refresh token được MÃ HOÁ (AES-256-GCM, khoá suy ra từ GOOGLE_DRIVE_OAUTH_CLIENT_SECRET — chỉ có trên máy chủ)
 * rồi lưu ở Firestore driveOAuth/main. Client chỉ thấy chuỗi mã hoá, không dùng được.
 * Env (server-side): GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive';
export const ALLOWED_HOSTS = ['chiphimkt-v2-staging.vercel.app', 'chiphi.mayhomes.net'];
const cid = () => (process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || '').trim();
const csec = () => (process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || '').trim();
export const oauthConfigured = () => !!(cid() && csec());
const key = (purpose: string) => createHash('sha256').update(`${purpose}:${csec()}`).digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key('drive-rt'), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}
export function decrypt(blob: string): string {
  const [v, iv, tag, enc] = String(blob || '').split('.');
  if (v !== 'v1') throw new Error('bad blob');
  const d = createDecipheriv('aes-256-gcm', key('drive-rt'), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}
export function signState(o: Record<string, any>): string {
  const p = Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${p}.${createHmac('sha256', key('drive-state')).update(p).digest('base64url')}`;
}
export function verifyState(s: string): any | null {
  const [p, sig] = String(s || '').split('.');
  if (!p || !sig) return null;
  const want = createHmac('sha256', key('drive-state')).update(p).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  return o.exp > Date.now() ? o : null;
}
export function redirectUri(host: string) { return `https://${host}/api/drive/callback`; }
export function authUrl(host: string, state: string) {
  const q = new URLSearchParams({ client_id: cid(), redirect_uri: redirectUri(host), response_type: 'code', scope: `${OAUTH_SCOPE} openid email`, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
export async function exchangeCode(code: string, host: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: cid(), client_secret: csec(), redirect_uri: redirectUri(host), grant_type: 'authorization_code' }) });
  const j: any = await r.json();
  if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || 'Không nhận được refresh token');
  let email = '';
  try { email = JSON.parse(Buffer.from(String(j.id_token || '').split('.')[1] || '', 'base64url').toString('utf8')).email || ''; } catch { /* ignore */ }
  return { refreshToken: j.refresh_token as string, email };
}
let cached: { t: string; exp: number; blob: string } | null = null;
export async function accessTokenFromBlob(blob: string): Promise<string> {
  if (cached && cached.blob === blob && cached.exp > Date.now() + 60e3) return cached.t;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid(), client_secret: csec(), refresh_token: decrypt(blob), grant_type: 'refresh_token' }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { console.error('drive token refresh', r.status, j?.error, String(j?.error_description || '').slice(0, 200)); throw new Error(`Kết nối Google Drive đã hết hiệu lực (${r.status} ${j?.error || ''}) — Admin cần Kết nối lại`); }
  cached = { t: j.access_token, exp: Date.now() + j.expires_in * 1000, blob };
  return j.access_token;
}
