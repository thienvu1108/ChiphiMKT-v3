/**
 * Ảnh Báo cáo Nghiệm thu — Google Drive. Ưu tiên OAuth tài khoản Admin (driveOAuth/main, refresh token mã hoá);
 * dự phòng: service account (GOOGLE_DRIVE_SERVICE_ACCOUNT).
 *
 *   GET  /api/nt-images/status            – Drive đã cấu hình chưa (không lộ bí mật)
 *   POST /api/nt-images/upload            – Admin/Mod tải ảnh (JSON {acceptanceId, path[], name, mime, dataBase64})
 *   POST /api/nt-images/delete            – Admin/Mod: chuyển file ảnh vào Thùng rác Drive (trashed=true), chỉ file thuộc thư mục gốc
 *   GET  /api/nt-images/file?id=…         – proxy ảnh (đăng nhập: Bearer ID token; công khai: &share=<token>)
 *
 * Cần env (Vercel, KHÔNG commit):
 *   GOOGLE_DRIVE_SERVICE_ACCOUNT  – JSON service account (hoặc base64), có quyền Content manager trên Shared Drive
 *   FIRESTORE_DATABASE_ID         – 'chiphi-mkt-staging' ở staging, 'chiphi-mkt' ở production
 * Thư mục gốc lấy từ settings/global.ntDriveRootUrl (Admin dán link trong Cài đặt).
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createSign } from 'node:crypto';
import { accessTokenFromBlob, oauthConfigured } from '../_lib/driveOAuth.js';
import { isUnderRoot } from '../_lib/driveAncestry.js';
import { databaseIdOrNull } from '../_lib/dbId.js';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'app-api-login-1b95b';
const DATABASE_ID = databaseIdOrNull() || 'unconfigured';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

function sa(): { client_email: string; private_key: string } | null {
  const raw = (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    j.private_key = String(j.private_key || '').replace(/\\n/g, '\n');
    return j.client_email && j.private_key ? j : null;
  } catch { return null; }
}

let cachedTok: { t: string; exp: number } | null = null;
async function driveToken(): Promise<string> {
  const s = sa(); if (!s) throw new HttpError(503, 'Drive chưa được cấu hình (thiếu GOOGLE_DRIVE_SERVICE_ACCOUNT)');
  if (cachedTok && cachedTok.exp > Date.now() + 60e3) return cachedTok.t;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: s.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(s.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  if (!r.ok) throw new HttpError(502, 'Không lấy được token Drive');
  const j: any = await r.json();
  cachedTok = { t: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

/** Token Drive: OAuth (driveOAuth/main.enc, đọc bằng ID token Admin/Mod) → nếu không có thì service account. */
async function tokenFor(idToken?: string): Promise<{ tok: string; root: string }> {
  const d = oauthConfigured() ? await fsGet('driveOAuth/main', idToken) : null;
  const blob = String(fv(d, 'enc') || '');
  if (blob) return { tok: await accessTokenFromBlob(blob).catch((e) => { throw new HttpError(502, e.message); }), root: folderIdFromUrl(String(fv(d, 'rootUrl') || '')) };
  return { tok: await driveToken(), root: '' };
}

function adminApp() { return getApps()[0] || initializeApp({ projectId: PROJECT_ID }); }

async function fsGet(path: string, idToken?: string): Promise<any | null> {
  const r = await fetch(`${FS}/${path}`, { headers: idToken ? { authorization: `Bearer ${idToken}` } : {} });
  if (!r.ok) return null;
  return r.json();
}
const fv = (doc: any, k: string) => { const v = doc?.fields?.[k]; return v ? (v.stringValue ?? v.integerValue ?? v.booleanValue ?? v.timestampValue ?? v.arrayValue ?? null) : null; };

async function caller(req: any): Promise<{ uid: string; role: string; token: string }> {
  const h = String(req.headers?.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'Thiếu đăng nhập');
  const dec = await getAuth(adminApp()).verifyIdToken(token);
  const u = await fsGet(`users/${dec.uid}`, token);
  return { uid: dec.uid, role: String(fv(u, 'role') || 'user').toLowerCase(), token };
}

/** Lỗi Drive kèm lý do Google (status/reason/message) — không chứa token. */
function driveErr(what: string, status: number, body: any): HttpError {
  const g = body?.error || {}; const reason = g.errors?.[0]?.reason || g.status || '';
  console.error('drive', what, status, reason, String(g.message || '').slice(0, 300));
  const hint = reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(g.message || '') ? ' — cần bật Google Drive API trong Google Cloud'
    : reason === 'insufficientPermissions' || reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' ? ' — cần Kết nối lại và tích quyền Google Drive'
    : status === 404 ? ' — tài khoản đã kết nối không thấy thư mục gốc' : '';
  return new HttpError(502, `${what} (${status}${reason ? ' ' + reason : ''}${g.message ? ': ' + String(g.message).slice(0, 160) : ''})${hint}`);
}

function folderIdFromUrl(url: string) {
  const m = String(url || '').match(/folders\/([a-zA-Z0-9_-]+)/) || String(url || '').match(/^([a-zA-Z0-9_-]{15,})$/);
  return m ? m[1] : '';
}

async function ensureFolder(tok: string, parent: string, name: string): Promise<string> {
  const q = encodeURIComponent(`'${parent}' in parents and name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id)`, { headers: { authorization: `Bearer ${tok}` } });
  const j: any = await r.json().catch(() => ({}));
  if (j.files?.[0]?.id) return j.files[0].id;
  if (!r.ok) throw driveErr('Không đọc được thư mục Drive', r.status, j);
  const c = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) });
  const cj: any = await c.json().catch(() => ({}));
  if (!cj.id) throw driveErr('Không tạo được thư mục Drive', c.status, cj);
  return cj.id;
}


/** Thư mục gốc Hóa đơn (tách riêng thư mục ảnh): settings.ntInvoiceDriveRootUrl → «Hóa đơn Nghiệm thu» cạnh thư mục ảnh → «Hóa đơn» trong thư mục ảnh. */
async function invoiceRoot(tok: string, imgRoot: string, settings: any): Promise<string> {
  const own = folderIdFromUrl(String(fv(settings, 'ntInvoiceDriveRootUrl') || ''));
  if (own) return own;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${imgRoot}?supportsAllDrives=true&fields=parents`, { headers: { authorization: `Bearer ${tok}` } });
  const j: any = r.ok ? await r.json().catch(() => ({})) : {};
  const parent = j.parents?.[0];
  if (parent) { try { return await ensureFolder(tok, parent, 'Hóa đơn Nghiệm thu'); } catch { /* không có quyền thư mục cha */ } }
  return ensureFolder(tok, imgRoot, 'Hóa đơn');
}
function mimeFromName(name: string, mime: string): string {
  const m = String(mime || '').trim();
  if (m && m !== 'application/octet-stream') return m;
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.zip')) return 'application/zip';
  if (n.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.heic')) return 'image/heic';
  if (n.endsWith('.heif')) return 'image/heif';
  if (/\.jpe?g$/.test(n)) return 'image/jpeg';
  return m;
}

export const INVOICE_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/zip', 'application/x-zip-compressed', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

export default async function handler(req: any, res: any) {
  if (DATABASE_ID === 'unconfigured' && String(req.query?.action || '') !== 'status') return res.status(503).json({ error: 'Máy chủ chưa cấu hình FIRESTORE_DATABASE_ID' });
  const action = String(req.query?.action || '');
  try {
    if (action === 'status') {
      return res.status(200).json({ driveConfigured: DATABASE_ID !== 'unconfigured' && (!!sa() || oauthConfigured()), oauth: oauthConfigured(), serviceAccount: !!sa(), database: DATABASE_ID === 'unconfigured' ? null : DATABASE_ID });
    }
    if (action === 'upload') {
      if (req.method !== 'POST') throw new HttpError(405, 'POST only');
      const me = await caller(req);
      if (!['admin', 'super_admin', 'mod'].includes(me.role)) throw new HttpError(403, 'Chỉ Admin/Mod tải ảnh');
      const settings = await fsGet('settings/global', me.token);
      const t = await tokenFor(me.token);
      const tok = t.tok;
      const root = t.root || folderIdFromUrl(String(fv(settings, 'ntDriveRootUrl') || ''));
      if (!root) throw new HttpError(400, 'Admin chưa cấu hình thư mục gốc Drive trong Cài đặt');
      const { path = [], name, mime, dataBase64 } = req.body || {};
      if (!name || !dataBase64) throw new HttpError(400, 'Thiếu dữ liệu ảnh');
      if (!/^MAYHOMES - /.test(String(name))) throw new HttpError(400, 'Tên tệp phải theo mẫu «MAYHOMES - Mã Phòng - Dự án - NV - Tháng M YYYY - NN»');
      if (mime && !['image/jpeg', 'image/png', 'image/webp'].includes(String(mime))) throw new HttpError(400, 'Định dạng ảnh không hỗ trợ');
      let parent = root;
      for (const seg of (path as string[]).slice(0, 6)) parent = await ensureFolder(tok, parent, String(seg).slice(0, 100));
      const boundary = 'b' + Date.now();
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\ncontent-type: ${mime || 'image/jpeg'}\r\n\r\n`),
        Buffer.from(dataBase64, 'base64'), Buffer.from(`\r\n--${boundary}--`),
      ]);
      const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name', { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': `multipart/related; boundary=${boundary}` }, body });
      const uj: any = await up.json();
      if (!uj.id) throw new HttpError(502, 'Tải lên Drive thất bại');
      return res.status(200).json({ fileId: uj.id, name: uj.name });
    }
    // B4 Hóa đơn: không giới hạn dung lượng → phiên tải lên resumable của Drive; trình duyệt PUT thẳng tới Google (không qua Vercel).
    if (action === 'invoice-session') {
      if (req.method !== 'POST') throw new HttpError(405, 'POST only');
      const me = await caller(req);
      if (!['admin', 'super_admin', 'mod'].includes(me.role)) throw new HttpError(403, 'Chỉ Admin/Mod tải hóa đơn');
      const settings = await fsGet('settings/global', me.token);
      const t = await tokenFor(me.token);
      const root = t.root || folderIdFromUrl(String(fv(settings, 'ntDriveRootUrl') || ''));
      if (!root) throw new HttpError(400, 'Admin chưa cấu hình thư mục gốc Drive trong Cài đặt');
      const body = req.body || {};
      const { path = [], name, size } = body;
      let mime = mimeFromName(String(name || ''), String(body.mime || ''));
      if (!name || !/^MAYHOMES - HD - /.test(String(name))) throw new HttpError(400, 'Tên hóa đơn phải theo mẫu «MAYHOMES - HD - …»');
      if (!INVOICE_MIMES.includes(String(mime))) throw new HttpError(400, 'Chỉ nhận ảnh, PDF, ZIP hoặc Excel');
      let parent = await invoiceRoot(t.tok, root, settings);
      for (const seg of (path as string[]).slice(0, 6)) parent = await ensureFolder(t.tok, parent, String(seg).slice(0, 100));
      const origin = String(req.headers?.origin || '');
      const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,size', {
        method: 'POST',
        headers: { authorization: `Bearer ${t.tok}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': String(mime), ...(Number(size) > 0 ? { 'x-upload-content-length': String(Math.floor(Number(size))) } : {}), ...(origin ? { origin } : {}) },
        body: JSON.stringify({ name: String(name).slice(0, 250), parents: [parent] }),
      });
      const loc = init.headers.get('location');
      if (!init.ok || !loc) throw driveErr('Không tạo được phiên tải hóa đơn', init.status, await init.json().catch(() => ({})));
      return res.status(200).json({ uploadUrl: loc, folderId: parent });
    }
    if (action === 'invoice-finalize') {
      if (req.method !== 'POST') throw new HttpError(405, 'POST only');
      const me = await caller(req);
      if (!['admin', 'super_admin', 'mod'].includes(me.role)) throw new HttpError(403, 'Chỉ Admin/Mod');
      const fileId = String(req.body?.fileId || '');
      if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) throw new HttpError(400, 'Mã file sai');
      const t = await tokenFor(me.token);
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,trashed`, { headers: { authorization: `Bearer ${t.tok}` } });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || j.trashed) throw driveErr('Không thấy hóa đơn trên Drive', r.status, j);
      return res.status(200).json({ fileId: j.id, name: j.name, mime: j.mimeType, size: Number(j.size) || 0, webViewLink: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` });
    }
    if (action === 'delete') {
      if (req.method !== 'POST') throw new HttpError(405, 'POST only');
      const me = await caller(req);
      if (!['admin', 'super_admin', 'mod'].includes(me.role)) throw new HttpError(403, 'Chỉ Admin/Mod xoá ảnh');
      const imgId = String(req.body?.imgId || '');
      if (!/^[a-zA-Z0-9_-]{6,}$/.test(imgId)) throw new HttpError(400, 'imgId sai');
      const img = await fsGet(`acceptanceImages/${imgId}`, me.token);
      if (!img) throw new HttpError(404, 'Không tìm thấy bản ghi ảnh');
      if (fv(img, 'provider') !== 'drive') return res.status(200).json({ ok: true, skipped: 'not-drive' });
      const fileId = String(fv(img, 'ref') || '');
      if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) throw new HttpError(400, 'Mã file Drive sai');
      const settings = await fsGet('settings/global', me.token);
      const t = await tokenFor(me.token);
      const root = t.root || folderIdFromUrl(String(fv(settings, 'ntDriveRootUrl') || ''));
      if (!root) throw new HttpError(400, 'Chưa cấu hình thư mục gốc Drive');
      const head = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id,trashed,parents`, { headers: { authorization: `Bearer ${t.tok}` } });
      if (head.status === 404) return res.status(200).json({ ok: true, alreadyGone: true });
      if (!head.ok) throw new HttpError(502, 'Không đọc được file trên Drive');
      const hj: any = await head.json();
      if (hj.trashed) return res.status(200).json({ ok: true, alreadyTrashed: true });
      const getParents = async (id: string) => {
        if (id === fileId) return hj.parents || [];
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=parents`, { headers: { authorization: `Bearer ${t.tok}` } });
        if (!r.ok) return null; const j: any = await r.json(); return j.parents || [];
      };
      if (!(await isUnderRoot(getParents, fileId, root))) throw new HttpError(403, 'File không thuộc thư mục gốc Nghiệm thu — không xoá');
      const del = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id,trashed`, { method: 'PATCH', headers: { authorization: `Bearer ${t.tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      if (!del.ok) throw new HttpError(502, 'Drive từ chối chuyển vào Thùng rác');
      return res.status(200).json({ ok: true, trashed: true });
    }
    if (action === 'file') {
      const id = String(req.query?.id || '');
      const share = String(req.query?.share || '');
      if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) throw new HttpError(400, 'id sai');
      if (share) {
        const link = await fsGet(`shareLinks/${share}`); // rules: chỉ GET được khi còn hạn & chưa thu hồi
        const ids: string[] = (fv(link, 'imageRefs')?.values || []).map((v: any) => v.stringValue);
        if (!link || !ids.includes(id)) throw new HttpError(403, 'Link không hợp lệ');
      } else {
        const me = await caller(req);
        const inv = String(req.query?.inv || '');
        if (inv) {
          const d = await fsGet(`acceptanceInvoices/${inv}`, me.token); // rules quyết định ai xem được
          if (!d || fv(d, 'fileId') !== id) throw new HttpError(403, 'Không có quyền');
        } else {
          const img = await fsGet(`acceptanceImages/${String(req.query?.img || '')}`, me.token);
          if (!img || fv(img, 'ref') !== id) throw new HttpError(403, 'Không có quyền');
        }
      }
      const meTok = share ? undefined : String(req.headers?.authorization || '').slice(7);
      const tok = (await tokenFor(meTok || undefined)).tok;
      // Hóa đơn (preview=1): PDF → ảnh trang 1 do Drive dựng; ảnh lớn (> 4 MB, vượt giới hạn phản hồi) → bản thu nhỏ Drive (đã xoay đúng chiều).
      const dl = !!req.query?.dl && !!String(req.query?.inv || '');
      if (req.query?.preview && !dl) {
        const m = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=mimeType,size,thumbnailLink`, { headers: { authorization: `Bearer ${tok}` } });
        const mj: any = await m.json().catch(() => ({}));
        if (!m.ok) throw new HttpError(404, 'Không tìm thấy hóa đơn');
        const isImg = /^image\/(jpeg|png|webp)$/.test(String(mj.mimeType || ''));
        if (!(isImg && Number(mj.size) > 0 && Number(mj.size) <= 4 * 1024 * 1024)) {
          if (!mj.thumbnailLink) throw new HttpError(404, 'Drive chưa tạo ảnh xem trước');
          const th = await fetch(String(mj.thumbnailLink).replace(/=s\d+$/, '') + '=s2000', { headers: { authorization: `Bearer ${tok}` } });
          if (!th.ok) throw new HttpError(404, 'Không lấy được ảnh xem trước');
          res.setHeader('content-type', th.headers.get('content-type') || 'image/png');
          res.setHeader('cache-control', 'private, max-age=3600');
          return res.status(200).send(Buffer.from(await th.arrayBuffer()));
        }
      }
      if (dl) { // hóa đơn: mở/tải bản gốc qua app (không cần quyền Drive của người xem); giới hạn phản hồi Vercel ~4.5 MB
        const m = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true&fields=size`, { headers: { authorization: `Bearer ${tok}` } });
        const mj: any = await m.json().catch(() => ({}));
        if (!m.ok) throw new HttpError(404, 'Không tìm thấy hóa đơn');
        if (Number(mj.size) > 4 * 1024 * 1024) throw new HttpError(413, 'Tệp lớn hơn 4 MB — mở trên Drive');
      }
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { authorization: `Bearer ${tok}` } });
      if (!r.ok) throw new HttpError(404, 'Không tìm thấy ảnh');
      res.setHeader('content-type', r.headers.get('content-type') || 'image/jpeg');
      res.setHeader('cache-control', 'private, max-age=3600');
      return res.status(200).send(Buffer.from(await r.arrayBuffer()));
    }
    throw new HttpError(404, 'Không có action');
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500;
    return res.status(status).json({ error: e instanceof HttpError ? e.message : 'Lỗi máy chủ' });
  }
}
