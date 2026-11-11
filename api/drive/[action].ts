/**
 * Kết nối Google Drive (OAuth, chỉ Admin):
 *   GET /api/drive/start     – (Bearer ID token Admin) trả URL đăng nhập Google (scope drive, offline, consent)
 *   GET /api/drive/callback  – Google chuyển về; đổi code → refresh token, MÃ HOÁ (AES-GCM, khoá chỉ có trên máy chủ),
 *                              chuyển về /cai-dat#driveRt=<blob> để trình duyệt Admin lưu vào driveOAuth/main
 *                              (rules: chỉ Admin ghi; Admin/Mod đọc — chuỗi mã hoá vô dụng phía client).
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { ALLOWED_HOSTS, authUrl, encrypt, exchangeCode, oauthConfigured, signState, verifyState } from '../_lib/driveOAuth.js';
import { databaseIdOrNull } from '../_lib/dbId.js';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'app-api-login-1b95b';
const DATABASE_ID = databaseIdOrNull() || 'unconfigured';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const adminApp = () => getApps()[0] || initializeApp({ projectId: PROJECT_ID });
const hostOf = (req: any) => String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim().toLowerCase();
function redirect(res: any, to: string) { res.setHeader('cache-control', 'no-store'); res.setHeader('location', to); return res.status(302).end(); }

export default async function handler(req: any, res: any) {
  if (DATABASE_ID === 'unconfigured' && String(req.query?.action || '') !== 'status') return res.status(503).json({ error: 'Máy chủ chưa cấu hình FIRESTORE_DATABASE_ID' });
  const action = String(req.query?.action || '');
  const host = hostOf(req);
  try {
    if (!oauthConfigured()) return res.status(503).json({ error: 'Chưa cấu hình OAuth Google Drive trên máy chủ' });
    if (!ALLOWED_HOSTS.includes(host)) return res.status(400).json({ error: 'Tên miền chưa được đăng ký cho OAuth' });
    if (action === 'start') {
      const h = String(req.headers?.authorization || '');
      const token = h.startsWith('Bearer ') ? h.slice(7) : '';
      if (!token) return res.status(401).json({ error: 'Thiếu đăng nhập' });
      const dec = await getAuth(adminApp()).verifyIdToken(token);
      const u: any = await (await fetch(`${FS}/users/${dec.uid}`, { headers: { authorization: `Bearer ${token}` } })).json();
      const role = String(u?.fields?.role?.stringValue || '').toLowerCase();
      if (!['admin', 'super_admin'].includes(role)) return res.status(403).json({ error: 'Chỉ Admin kết nối Google Drive' });
      return res.status(200).json({ url: authUrl(host, signState({ uid: dec.uid, exp: Date.now() + 10 * 60e3 })) });
    }
    if (action === 'callback') {
      if (req.query?.error) return redirect(res, `/cai-dat#driveErr=${encodeURIComponent(String(req.query.error))}`);
      const st = verifyState(String(req.query?.state || ''));
      if (!st) return redirect(res, '/cai-dat#driveErr=state');
      const { refreshToken, email } = await exchangeCode(String(req.query?.code || ''), host);
      return redirect(res, `/cai-dat#driveRt=${encodeURIComponent(encrypt(refreshToken))}&driveEmail=${encodeURIComponent(email)}&driveUid=${encodeURIComponent(st.uid)}`);
    }
    return res.status(404).json({ error: 'Không có action' });
  } catch (e: any) {
    if (action === 'callback') return redirect(res, `/cai-dat#driveErr=${encodeURIComponent(String(e?.message || 'loi').slice(0, 120))}`);
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }
}
