/**
 * POST /api/users/link-on-login — after the client linked users/{uid} from an imported / pre-provisioned
 *   profile, the server (Admin SDK, env FIREBASE_SERVICE_ACCOUNT) retires every other users doc with the same
 *   verified email: refs repointed, archived to users_merged_archive, deleted, usersByEmail → uid. Idempotent.
 *   503 when not configured → client falls back to marking the old doc linkedToUid (login never breaks).
 * POST /api/users/me — đọc users/{uid} từ máy chủ bằng CHÍNH ID token (rules đọc áp dụng); trả fields REST.
 *   Dùng khi getDoc trình duyệt báo «không tồn tại» (cache IndexedDB cũ / kênh Listen bị chặn) để không tạo hồ sơ tạm.
 * POST /api/users/ensure — đảm bảo users/{uid} tồn tại sau lần đăng nhập đầu (dự phòng khi ghi từ trình duyệt bị treo).
 * Ghi bằng CHÍNH ID token của người dùng qua Firestore REST → rules self-create vẫn áp dụng (role 'user', không phạm vi).
 * Không bao giờ ghi đè hồ sơ đã có (currentDocument.exists=false).
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { databaseIdOrNull } from '../_lib/dbId.js';
import { getFirestore } from 'firebase-admin/firestore';
import { linkAdminApp, linkOnLogin, otherAuthChecker } from '../_lib/linkOnLoginExec.js';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'app-api-login-1b95b';
const DATABASE_ID = databaseIdOrNull() || 'unconfigured';
const DOCS = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const FS = `https://firestore.googleapis.com/v1/${DOCS}`;
const adminApp = () => getApps()[0] || initializeApp({ projectId: PROJECT_ID });
const s = (v: string) => ({ stringValue: v });

export default async function handler(req: any, res: any) {
  if (DATABASE_ID === 'unconfigured' && String(req.query?.action || '') !== 'status') return res.status(503).json({ error: 'Máy chủ chưa cấu hình FIRESTORE_DATABASE_ID' });
  res.setHeader('cache-control', 'no-store');
  if (String(req.query?.action || '') === 'link-on-login') return linkHandler(req, res);
  if (String(req.query?.action || '') === 'me') return meHandler(req, res);
  if (String(req.query?.action || '') !== 'ensure') return res.status(404).json({ error: 'Không có action' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
  const h = String(req.headers?.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Thiếu đăng nhập' });
  try {
    const dec = await getAuth(adminApp()).verifyIdToken(token);
    const auth = { authorization: `Bearer ${token}` };
    const cur = await fetch(`${FS}/users/${dec.uid}`, { headers: auth });
    if (cur.ok) return res.status(200).json({ created: false });
    const now = new Date().toISOString();
    const email = String(dec.email || '').toLowerCase();
    const name = String((dec as any).name || '');
    const fields = { uid: s(dec.uid), email: s(email), displayName: s(name), fullName: s(name), role: s('user'), teamId: s(''), teamName: s(''), teamCode: s(''),
      assignedProjects: { mapValue: { fields: {} } }, createdAt: { timestampValue: now }, updatedAt: { timestampValue: now } };
    const r = await fetch(`${FS}:commit`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ writes: [{ update: { name: `${DOCS}/users/${dec.uid}`, fields }, currentDocument: { exists: false } }] }) });
    if (!r.ok) return res.status(r.status === 403 ? 403 : 502).json({ error: 'Không tạo được hồ sơ', status: r.status });
    return res.status(200).json({ created: true });
  } catch (e: any) {
    return res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

async function linkHandler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
  const h = String(req.headers?.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Thiếu đăng nhập' });
  const app = linkAdminApp();
  if (!app) return res.status(503).json({ error: 'Máy chủ chưa cấu hình FIREBASE_SERVICE_ACCOUNT' });
  let dec: any;
  try { dec = await getAuth(app).verifyIdToken(token); } catch { return res.status(401).json({ error: 'Token không hợp lệ' }); }
  if (!dec.email || dec.email_verified !== true) return res.status(403).json({ error: 'Email chưa xác minh' });
  try {
    const r = await linkOnLogin(getFirestore(app, DATABASE_ID), dec.uid, String(dec.email), { isOtherAuthUid: await otherAuthChecker(app, dec.uid) });
    return res.status(200).json(r);
  } catch (e: any) {
    console.error('link-on-login', dec.uid, String(e?.message || e).slice(0, 300));
    return res.status(500).json({ error: 'Không gộp được hồ sơ cũ' });
  }
}

async function meHandler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
  const h = String(req.headers?.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Thiếu đăng nhập' });
  let dec: any;
  try { dec = await getAuth(adminApp()).verifyIdToken(token); } catch { return res.status(401).json({ error: 'Token không hợp lệ' }); }
  try {
    const r = await fetch(`${FS}/users/${dec.uid}`, { headers: { authorization: `Bearer ${token}` } });
    if (r.status === 404) return res.status(200).json({ exists: false });
    if (!r.ok) return res.status(502).json({ error: 'Không đọc được hồ sơ', status: r.status });
    const d: any = await r.json();
    return res.status(200).json({ exists: true, fields: d.fields || {} });
  } catch {
    return res.status(502).json({ error: 'Không đọc được hồ sơ' });
  }
}
