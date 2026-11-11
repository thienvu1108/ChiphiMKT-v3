/**
 * Sao lưu / khôi phục Firestore ↔ Google Drive (server-side).
 *
 *   GET  /api/backup-drive/cron      – Vercel Cron (Authorization: Bearer $CRON_SECRET) → sao lưu + dọn theo hạn giữ
 *   POST /api/backup-drive/run       – Admin: «Sao lưu ngay»
 *   GET  /api/backup-drive/list      – Admin: danh sách bản sao lưu trên Drive
 *   POST /api/backup-drive/preview   – Admin: {fileId, scope} → số thêm/sửa/xoá theo collection
 *   POST /api/backup-drive/restore   – Admin: {fileId, scope, confirm:'KHOI PHUC'} → tự sao lưu trước → ghi theo lô → audit log
 *
 * Quyền Firestore: ID token Admin (rules áp dụng) hoặc env FIREBASE_SERVICE_ACCOUNT (cron; nên giới hạn IAM theo DB staging).
 * Drive: OAuth driveOAuth/main (refresh token mã hoá, giải mã server-side). Không trả bí mật về client.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createSign } from 'node:crypto';
import JSZip from 'jszip';
import { accessTokenFromBlob, oauthConfigured } from '../_lib/driveOAuth.js';
import { BACKUP_COLLECTIONS, backupFileName, backupFolderPath, buildManifest, retentionPlan, planRestore, chunk, BACKUP_ROOT, type RawDoc, type RestoreScope } from '../../lib/vnext/backup.js';
import { databaseIdOrNull } from '../_lib/dbId.js';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'app-api-login-1b95b';
const DATABASE_ID = databaseIdOrNull() || 'unconfigured';
const IS_STAGING = DATABASE_ID !== 'chiphi-mkt';
const DB = `projects/${PROJECT_ID}/databases/${DATABASE_ID}`;
const FS = `https://firestore.googleapis.com/v1/${DB}/documents`;
const ADMIN_ROLES = ['admin', 'super_admin'];
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

// ---------- auth ----------
function adminApp() { return getApps()[0] || initializeApp({ projectId: PROJECT_ID }); }
let saTok: { t: string; exp: number } | null = null;
async function serviceToken(): Promise<string> {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw new HttpError(503, 'Cron chưa có quyền Firestore (thiếu FIREBASE_SERVICE_ACCOUNT trên staging)');
  if (saTok && saTok.exp > Date.now() + 60e3) return saTok.t;
  const s = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  const key = String(s.private_key).replace(/\\n/g, '\n'); const now = Math.floor(Date.now() / 1000);
  const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const u = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: s.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(u).sign(key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${u}.${sig}` }) });
  if (!r.ok) throw new HttpError(502, 'Không lấy được token service account');
  const j: any = await r.json(); saTok = { t: j.access_token, exp: Date.now() + j.expires_in * 1000 }; return j.access_token;
}
type Who = { uid: string; email: string; token: string; cron?: boolean };
async function caller(req: any): Promise<Who> {
  const h = String(req.headers?.authorization || ''); const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'Thiếu đăng nhập');
  const dec = await getAuth(adminApp()).verifyIdToken(token).catch(() => { throw new HttpError(401, 'Phiên đăng nhập không hợp lệ'); });
  const u = await fsGet(`users/${dec.uid}`, token);
  const role = String(u?.fields?.role?.stringValue || '').toLowerCase().replace(/\s+/g, '_');
  if (!ADMIN_ROLES.includes(role)) throw new HttpError(403, 'Chỉ Admin được sao lưu / khôi phục');
  return { uid: dec.uid, email: String(dec.email || ''), token };
}

// ---------- Firestore REST ----------
const H = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });
async function fsGet(path: string, tok: string): Promise<any | null> { const r = await fetch(`${FS}/${path}`, { headers: H(tok) }); return r.ok ? r.json() : null; }
async function listAll(col: string, tok: string): Promise<RawDoc[]> {
  const out: RawDoc[] = []; let pt = '';
  do {
    const r = await fetch(`${FS}/${col}?pageSize=1000${pt ? `&pageToken=${pt}` : ''}`, { headers: H(tok) });
    if (!r.ok) throw new HttpError(r.status, `${col}: ${r.status}`);
    const j: any = await r.json();
    for (const d of j.documents || []) out.push({ name: d.name, fields: d.fields || {}, updateTime: d.updateTime });
    pt = j.nextPageToken || '';
  } while (pt);
  return out;
}
async function commit(writes: any[], tok: string) {
  for (const part of chunk(writes, 400)) {
    const r = await fetch(`https://firestore.googleapis.com/v1/${DB}/documents:commit`, { method: 'POST', headers: H(tok), body: JSON.stringify({ writes: part }) });
    if (!r.ok) { const t = await r.text(); throw new HttpError(r.status === 403 ? 403 : 502, `Ghi Firestore lỗi (${r.status}): ${t.slice(0, 160)}`); }
  }
}
const strV = (s: string) => ({ stringValue: s }); const intV = (n: number) => ({ integerValue: String(n) });
async function addDoc(col: string, fields: Record<string, any>, tok: string) {
  const r = await fetch(`${FS}/${col}`, { method: 'POST', headers: H(tok), body: JSON.stringify({ fields }) });
  return r.ok;
}

// ---------- Drive ----------
async function driveToken(tok: string): Promise<string> {
  if (!oauthConfigured()) throw new HttpError(503, 'Chưa cấu hình Drive OAuth');
  const d = await fsGet('driveOAuth/main', tok);
  const blob = String(d?.fields?.enc?.stringValue || '');
  if (!blob) throw new HttpError(503, 'Chưa kết nối Google Drive (Cài đặt → Drive)');
  return accessTokenFromBlob(blob).catch((e) => { throw new HttpError(502, 'Drive: ' + e.message); });
}
const DQ = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
async function dfind(dt: string, q: string, fields = 'files(id,name,createdTime,size)') {
  const out: any[] = []; let pt = '';
  do {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&${DQ}&pageSize=200&fields=nextPageToken,${fields}${pt ? `&pageToken=${pt}` : ''}`, { headers: { authorization: `Bearer ${dt}` } });
    const j: any = await r.json(); if (!r.ok) throw new HttpError(502, 'Drive list lỗi'); out.push(...(j.files || [])); pt = j.nextPageToken || '';
  } while (pt);
  return out;
}
async function ensureFolder(dt: string, parent: string | null, name: string): Promise<string> {
  const esc = name.replace(/'/g, "\\'");
  const q = `name='${esc}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parent ? `'${parent}' in parents` : `'root' in parents`}`;
  const f = await dfind(dt, q, 'files(id)'); if (f[0]) return f[0].id;
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${DQ}&fields=id`, { method: 'POST', headers: H(dt), body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent || 'root'] }) });
  const j: any = await r.json(); if (!j.id) throw new HttpError(502, 'Không tạo được thư mục Drive'); return j.id;
}
async function folderIds(dt: string, path: string[]) { let p: string | null = null; const ids: string[] = []; for (const s of path) { p = await ensureFolder(dt, p, s); ids.push(p); } return ids; }
async function uploadResumable(dt: string, parent: string, name: string, buf: Buffer): Promise<string> {
  const init = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&${DQ}&fields=id`, { method: 'POST', headers: { ...H(dt), 'x-upload-content-type': 'application/zip', 'x-upload-content-length': String(buf.length) }, body: JSON.stringify({ name, parents: [parent], mimeType: 'application/zip' }) });
  const loc = init.headers.get('location'); if (!loc) throw new HttpError(502, 'Drive không mở được phiên tải lên');
  const CH = 8 * 1024 * 1024; let off = 0; let id = '';
  while (off < buf.length) { // tải theo khúc 8 MB
    const end = Math.min(off + CH, buf.length);
    const r = await fetch(loc, { method: 'PUT', headers: { 'content-length': String(end - off), 'content-range': `bytes ${off}-${end - 1}/${buf.length}` }, body: buf.subarray(off, end) });
    if (r.status === 200 || r.status === 201) { id = ((await r.json()) as any).id; break; }
    if (r.status !== 308) throw new HttpError(502, `Tải lên Drive lỗi (${r.status})`);
    off = end;
  }
  if (!id) throw new HttpError(502, 'Tải lên Drive không hoàn tất'); return id;
}
async function listBackups(dt: string) {
  const top = await dfind(dt, `name='${BACKUP_ROOT}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, 'files(id)');
  if (!top[0]) return [];
  const all = await dfind(dt, `name contains 'MAYHOMES - Backup - ' and mimeType='application/zip' and trashed=false`, 'files(id,name,createdTime,size,parents)');
  return all.filter((f) => (IS_STAGING ? f.name.startsWith('[STAGING] ') : !f.name.startsWith('[STAGING] ')))
    .sort((a, b) => String(b.name).localeCompare(String(a.name)));
}

// ---------- core ----------
async function doBackup(tok: string, by: string, reason: string) {
  const collections: Record<string, RawDoc[]> = {}; const skipped: Record<string, string> = {};
  for (const col of BACKUP_COLLECTIONS) { try { collections[col] = await listAll(col, tok); } catch (e: any) { skipped[col] = e.message; } }
  const now = new Date();
  // changeLog: chỉ đưa phần tăng thêm (36 giờ gần nhất) vào bản sao lưu hằng đêm — tránh đọc lại toàn bộ lịch sử mỗi đêm.
  try { collections.changeLog = await clQuery(tok, 'GREATER_THAN_OR_EQUAL', new Date(now.getTime() - 36 * 3600e3), 20000); } catch (e: any) { skipped.changeLog = e.message; }
  const manifest = buildManifest(collections, { env: IS_STAGING ? 'staging' : 'production', database: DATABASE_ID, by, createdAt: now.toISOString(), skipped });
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ ...manifest, reason }, null, 1));
  for (const [c, docs] of Object.entries(collections)) zip.file(`collections/${c}.json`, JSON.stringify(docs));
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const dt = await driveToken(tok);
  const ids = await folderIds(dt, backupFolderPath(now, IS_STAGING));
  const name = backupFileName(now, IS_STAGING);
  const fileId = await uploadResumable(dt, ids[ids.length - 1], name, buf);
  const archived = await archiveChangeLog(tok, dt, now).catch((e: any) => { console.warn('archive changeLog', e?.message); return 0; });
  return { fileId, name, bytes: buf.length, manifest, dt, archived };
}
/** changeLog theo mốc thời gian 'at' (runQuery, sắp theo at). */
async function clQuery(tok: string, op: 'LESS_THAN' | 'GREATER_THAN_OR_EQUAL', t: Date, max: number): Promise<RawDoc[]> {
  const r = await fetch(`https://firestore.googleapis.com/v1/${DB}/documents:runQuery`, { method: 'POST', headers: H(tok), body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'changeLog' }], where: { fieldFilter: { field: { fieldPath: 'at' }, op, value: { timestampValue: t.toISOString() } } }, orderBy: [{ field: { fieldPath: 'at' }, direction: 'ASCENDING' }], limit: max } }) });
  if (!r.ok) throw new HttpError(r.status, `changeLog: ${r.status}`);
  const rows: any[] = await r.json();
  return rows.filter((x) => x.document).map((x) => ({ name: x.document.name, fields: x.document.fields || {}, updateTime: x.document.updateTime }));
}
/** Hạn giữ changeLog: > 12 tháng → nén lưu trữ lên Drive ('Lưu trữ changeLog', không bị dọn) rồi xoá khỏi Firestore. */
async function archiveChangeLog(tok: string, dt: string, now: Date) {
  const cutoff = new Date(now.getTime() - 365 * 864e5);
  const old = await clQuery(tok, 'LESS_THAN', cutoff, 5000);
  if (!old.length) return 0;
  const zip = new JSZip(); zip.file('changeLog.json', JSON.stringify(old));
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const ids = await folderIds(dt, [BACKUP_ROOT, ...(IS_STAGING ? ['[STAGING]'] : []), 'Lưu trữ changeLog']);
  await uploadResumable(dt, ids[ids.length - 1], `${IS_STAGING ? '[STAGING] ' : ''}MAYHOMES - changeLog lưu trữ đến ${cutoff.toISOString().slice(0, 10)} (${old.length}).zip`, buf);
  await commit(old.map((d) => ({ delete: d.name })), tok);
  return old.length;
}
async function readBackup(dt: string, fileId: string) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { authorization: `Bearer ${dt}` } });
  if (!r.ok) throw new HttpError(404, 'Không đọc được tệp sao lưu');
  const zip = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()));
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  const collections: Record<string, RawDoc[]> = {};
  for (const f of Object.keys(zip.files)) { const m = f.match(/^collections\/(.+)\.json$/); if (m) collections[m[1]] = JSON.parse(await zip.file(f)!.async('string')); }
  return { manifest, collections };
}
async function currentFor(cols: string[], tok: string) { const o: Record<string, RawDoc[]> = {}; for (const c of cols) o[c] = await listAll(c, tok).catch(() => []); return o; }
async function logRun(tok: string, f: Record<string, any>) {
  const fields: Record<string, any> = { at: { timestampValue: new Date().toISOString() } };
  for (const [k, v] of Object.entries(f)) fields[k] = typeof v === 'number' ? intV(v) : typeof v === 'boolean' ? { booleanValue: v } : strV(String(v ?? ''));
  await addDoc('backupRuns', fields, tok).catch(() => {});
}
async function notifyAdminsFail(tok: string, msg: string, by: string) {
  const r = await fetch(`https://firestore.googleapis.com/v1/${DB}/documents:runQuery`, { method: 'POST', headers: H(tok), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'IN', value: { arrayValue: { values: ['admin', 'super_admin'].map(strV) } } } } } }) }).catch(() => null);
  const rows: any[] = r && r.ok ? await r.json() : [];
  const emails = rows.map((x) => String(x.document?.fields?.email?.stringValue || '').toLowerCase()).filter(Boolean);
  if (!emails.length) return;
  await addDoc('teamNotifications', { type: strV('backup_failed'), title: strV('Sao lưu thất bại'), message: strV(msg.slice(0, 300)), targetEmails: { arrayValue: { values: emails.map(strV) } }, createdAt: strV(new Date().toISOString()), readBy: { arrayValue: { values: [] } }, ...(by ? { createdBy: strV(by) } : {}) }, tok).catch(() => {});
}
async function applyRetention(dt: string) {
  const files = await listBackups(dt); const plan = retentionPlan(files, new Date());
  for (const id of plan.trash) await fetch(`https://www.googleapis.com/drive/v3/files/${id}?${DQ}`, { method: 'PATCH', headers: H(dt), body: JSON.stringify({ trashed: true }) });
  return plan.trash.length;
}

export default async function handler(req: any, res: any) {
  if (DATABASE_ID === 'unconfigured' && String(req.query?.action || '') !== 'status') return res.status(503).json({ error: 'Máy chủ chưa cấu hình FIRESTORE_DATABASE_ID' });
  const action = String(req.query?.action || '');
  let who: Who | null = null; let tok = '';
  try {
    if (action === 'cron') {
      // Cron chỉ hoạt động khi bật rõ ràng trên project (staging). Live/merge không có cờ → no-op.
      if (process.env.BACKUP_CRON_ENABLED !== '1' || !process.env.CRON_SECRET || !process.env.FIREBASE_SERVICE_ACCOUNT) {
        return res.status(200).json({ ok: true, skipped: 'cron disabled (BACKUP_CRON_ENABLED/CRON_SECRET/FIREBASE_SERVICE_ACCOUNT chưa đặt)' });
      }
      const secret = process.env.CRON_SECRET || '';
      if (!secret || String(req.headers?.authorization || '') !== `Bearer ${secret}`) throw new HttpError(401, 'Sai CRON_SECRET');
      tok = await serviceToken(); who = { uid: '', email: 'cron', token: tok, cron: true };
    } else { who = await caller(req); tok = who.token; }

    if (action === 'run' || action === 'cron') {
      if (action === 'run' && req.method !== 'POST') throw new HttpError(405, 'POST only');
      const t0 = Date.now();
      try {
        const b = await doBackup(tok, who.email, action === 'cron' ? 'nightly' : 'manual');
        const trashed = await applyRetention(b.dt).catch(() => 0);
        await logRun(tok, { kind: action === 'cron' ? 'nightly' : 'manual', ok: true, fileId: b.fileId, name: b.name, bytes: b.bytes, total: b.manifest.total, skipped: Object.keys(b.manifest.skipped).join(','), trashed, archivedChangeLog: b.archived, by: who.email, ms: Date.now() - t0 });
        return res.status(200).json({ ok: true, fileId: b.fileId, name: b.name, bytes: b.bytes, counts: b.manifest.counts, skipped: b.manifest.skipped, total: b.manifest.total, trashed });
      } catch (e: any) {
        await logRun(tok, { kind: action === 'cron' ? 'nightly' : 'manual', ok: false, error: e.message, by: who.email, ms: Date.now() - t0 });
        await notifyAdminsFail(tok, `Sao lưu ${action === 'cron' ? 'tự động' : 'thủ công'} lỗi: ${e.message}`, who.uid);
        throw e;
      }
    }
    if (action === 'list') {
      const dt = await driveToken(tok);
      const files = await listBackups(dt);
      return res.status(200).json({ files: files.map((f) => ({ id: f.id, name: f.name, createdTime: f.createdTime, size: Number(f.size || 0) })) });
    }
    if (action === 'preview' || action === 'restore') {
      if (req.method !== 'POST') throw new HttpError(405, 'POST only');
      const { fileId, scope = {}, confirm } = req.body || {};
      if (!/^[a-zA-Z0-9_-]{10,}$/.test(String(fileId || ''))) throw new HttpError(400, 'fileId sai');
      const sc: RestoreScope = { collections: Array.isArray(scope.collections) ? scope.collections.map(String) : undefined, month: scope.month ? String(scope.month) : undefined, teamId: scope.teamId ? String(scope.teamId) : undefined };
      const dt = await driveToken(tok);
      const bk = await readBackup(dt, fileId);
      if (bk.manifest.database !== DATABASE_ID) throw new HttpError(400, `Bản sao lưu thuộc DB ${bk.manifest.database}, không phải ${DATABASE_ID}`);
      const cols = Object.keys(bk.collections).filter((c) => !sc.collections?.length || sc.collections.includes(c));
      const plan = planRestore(bk.collections, await currentFor(cols, tok), sc);
      const summary = { rows: plan.rows, writes: plan.writes.length, backup: { createdAt: bk.manifest.createdAt, counts: bk.manifest.counts } };
      if (action === 'preview') return res.status(200).json(summary);
      if (confirm !== 'KHOI PHUC') throw new HttpError(400, 'Cần xác nhận «KHOI PHUC»');
      const pre = await doBackup(tok, who.email, 'pre-restore'); // tự sao lưu trạng thái hiện tại
      await logRun(tok, { kind: 'pre-restore', ok: true, fileId: pre.fileId, name: pre.name, bytes: pre.bytes, total: pre.manifest.total, by: who.email });
      const writes = plan.writes.map((w) => (w.op === 'delete' ? { delete: `${DB}/documents/${w.col}/${w.id}` } : { update: { name: `${DB}/documents/${w.col}/${w.id}`, fields: w.fields } }));
      await commit(writes, tok);
      await addDoc('auditLogs', { action: strV('RESTORE_BACKUP'), collection: strV('*'), docId: strV(String(fileId)), userId: strV(who.uid), userEmail: strV(who.email), timestamp: { timestampValue: new Date().toISOString() }, data: strV(JSON.stringify({ scope: sc, rows: plan.rows, preBackup: pre.name })) }, tok);
      await logRun(tok, { kind: 'restore', ok: true, fileId, name: String(req.body?.name || ''), total: writes.length, by: who.email, scope: JSON.stringify(sc), preBackup: pre.name });
      return res.status(200).json({ ok: true, ...summary, preBackup: pre.name });
    }
    throw new HttpError(404, 'Không có action');
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500;
    return res.status(status).json({ error: e instanceof HttpError ? e.message : 'Lỗi máy chủ: ' + String(e?.message || e).slice(0, 160) });
  }
}
