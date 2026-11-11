/**
 * GitHub backup API — Vercel serverless function (Node runtime) AND shared handler
 * for the local Express server (server.ts).
 *
 *   POST /api/backup/github/test           – check repo access with the stored token
 *   POST /api/backup/github/sync           – back up Firestore data (JSON) to the GitHub repo
 *   POST /api/backup/github/sync-code      – Vercel: trigger redeploy via deploy hook / report latest commit
 *                                            (local Express: legacy "git push working tree")
 *   POST /api/backup/github/deploy-status  – latest GitHub deployments (Vercel posts them)
 *
 * Security
 *   - Every call needs `Authorization: Bearer <Firebase ID token>`; verified with firebase-admin.
 *   - Caller must be admin / super_admin (users/{uid}.role in DB chiphi-mkt) or the verified app owner.
 *   - The GitHub token is read server-side from settings_private/github_backup (admin-only by rules),
 *     then legacy settings/github_backup.token, then env GITHUB_BACKUP_TOKEN. Never returned to the client.
 *   - Firestore access: with env FIREBASE_SERVICE_ACCOUNT (service-account JSON) we use the Admin SDK;
 *     without it we call the Firestore REST API *as the caller* (their ID token), so Firestore
 *     security rules still enforce admin-only access.
 */
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'app-api-login-1b95b';
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'chiphi-mkt';
const APP_OWNER_EMAIL = 'thienvu1108@gmail.com';
const ADMIN_ROLES = ['admin', 'super_admin', 'super admin'];
const DEFAULT_OWNER = 'thienvu1108';
const DEFAULT_REPO = 'ChiphiMKT-v2';
const DEFAULT_BRANCH = 'main';
const LEGACY_REPOS = ['thienvu1108/realestate', 'thienvu1108/chiphimkt'];
const PUBLIC_CONFIG_PATH = 'settings/github_backup';
const PRIVATE_CONFIG_PATH = 'settings_private/github_backup';
const ACTIONS = ['test', 'sync', 'sync-code', 'deploy-status'] as const;
type Action = (typeof ACTIONS)[number];

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Firebase Admin (ID-token verification always; Firestore only with credentials)
// ---------------------------------------------------------------------------
function parseServiceAccount(): Record<string, any> | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(json);
    if (sa && typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    return sa && sa.client_email && sa.private_key ? sa : null;
  } catch {
    console.error('[backup-api] FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON');
    return null;
  }
}

let cachedAdmin: { app: App; hasCredentials: boolean } | null = null;
function getAdmin() {
  if (cachedAdmin) return cachedAdmin;
  const name = 'chiphi-backup-api';
  const sa = parseServiceAccount();
  const existing = getApps().find((a) => a.name === name);
  const app =
    existing ||
    initializeApp(
      sa ? { credential: cert(sa as any), projectId: sa.project_id || PROJECT_ID } : { projectId: PROJECT_ID },
      name,
    );
  cachedAdmin = { app, hasCredentials: !!sa };
  return cachedAdmin;
}

// ---------------------------------------------------------------------------
// Firestore value normalisation (same JSON shape as the web client backup)
// ---------------------------------------------------------------------------
function tsJson(seconds: number, nanoseconds: number) {
  return { type: 'firestore/timestamp/1.0', seconds, nanoseconds };
}

function normalizeAdminValue(v: any): any {
  if (v === null || v === undefined) return v ?? null;
  if (Array.isArray(v)) return v.map(normalizeAdminValue);
  if (typeof v !== 'object') return v;
  if (typeof v.toDate === 'function' && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') {
    return tsJson(v.seconds, v.nanoseconds);
  }
  if (typeof v.path === 'string' && v.firestore && typeof v.id === 'string') return v.path; // DocumentReference
  if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && Object.keys(v).length <= 2) {
    return { latitude: v.latitude, longitude: v.longitude };
  }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.from(v).toString('base64');
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(v)) out[k] = normalizeAdminValue(val);
  return out;
}

function parseRestTimestamp(s: string) {
  const ms = Date.parse(s);
  const frac = /\.(\d+)Z$/i.exec(s)?.[1] || '';
  const nanos = frac ? Number(frac.padEnd(9, '0').slice(0, 9)) : 0;
  return tsJson(Math.floor(ms / 1000), nanos);
}

function decodeRestValue(v: any): any {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return parseRestTimestamp(v.timestampValue);
  if ('stringValue' in v) return v.stringValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('referenceValue' in v) return String(v.referenceValue).replace(/^projects\/[^/]+\/databases\/[^/]+\/documents\//, '');
  if ('geoPointValue' in v) return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 };
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeRestValue);
  if ('mapValue' in v) return decodeRestFields(v.mapValue.fields || {});
  return null;
}

function decodeRestFields(fields: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, val] of Object.entries(fields || {})) out[k] = decodeRestValue(val);
  return out;
}

function restDocToJson(d: any) {
  const id = String(d.name || '').split('/').pop();
  return { id, ...decodeRestFields(d.fields || {}) };
}

// ---------------------------------------------------------------------------
// Data store abstraction: Admin SDK (service account) or REST-as-caller (rules apply)
// ---------------------------------------------------------------------------
interface Store {
  mode: 'admin-sdk' | 'rest-as-caller';
  getDoc(path: string): Promise<Record<string, any> | null>;
  listCollection(name: string): Promise<any[]>;
  latest(name: string, orderField: string, limit: number): Promise<any[]>;
}

async function adminStore(app: App): Promise<Store> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore(app, DATABASE_ID);
  return {
    mode: 'admin-sdk',
    async getDoc(path) {
      const snap = await db.doc(path).get();
      return snap.exists ? (normalizeAdminValue(snap.data()) as Record<string, any>) : null;
    },
    async listCollection(name) {
      const snap = await db.collection(name).get();
      return snap.docs.map((d) => ({ id: d.id, ...normalizeAdminValue(d.data()) }));
    },
    async latest(name, field, limit) {
      const snap = await db.collection(name).orderBy(field, 'desc').limit(limit).get();
      return snap.docs.map((d) => ({ id: d.id, ...normalizeAdminValue(d.data()) }));
    },
  };
}

export function restStore(idToken: string): Store {
  const emulator = (process.env.FIRESTORE_EMULATOR_HOST || '').trim();
  const origin = emulator ? `http://${emulator}` : 'https://firestore.googleapis.com';
  const base = `${origin}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
  const headers = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
  const fail = async (res: Response, what: string) => {
    const body = (await res.json().catch(() => ({}))) as any;
    const msg = body?.error?.message || res.statusText;
    if (res.status === 403) throw new HttpError(403, `Không có quyền đọc ${what} (Firestore rules): ${msg}`);
    throw new HttpError(502, `Lỗi đọc Firestore ${what}: ${msg}`);
  };
  return {
    mode: 'rest-as-caller',
    async getDoc(path) {
      const res = await fetch(`${base}/${path}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) await fail(res, path);
      return decodeRestFields(((await res.json()) as any).fields || {});
    },
    async listCollection(name) {
      const out: any[] = [];
      let pageToken = '';
      do {
        const qs = new URLSearchParams({ pageSize: '300' });
        if (pageToken) qs.set('pageToken', pageToken);
        const res = await fetch(`${base}/${name}?${qs}`, { headers });
        if (!res.ok) await fail(res, name);
        const body = (await res.json()) as any;
        for (const d of body.documents || []) out.push(restDocToJson(d));
        pageToken = body.nextPageToken || '';
      } while (pageToken);
      return out;
    },
    async latest(name, field, limit) {
      const res = await fetch(`${base}:runQuery`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: name }],
            orderBy: [{ field: { fieldPath: field }, direction: 'DESCENDING' }],
            limit,
          },
        }),
      });
      if (!res.ok) await fail(res, name);
      const rows = (await res.json()) as any[];
      return (Array.isArray(rows) ? rows : []).filter((r) => r.document).map((r) => restDocToJson(r.document));
    },
  };
}

// ---------------------------------------------------------------------------
// Auth: Firebase ID token + admin role
// ---------------------------------------------------------------------------
export interface AdminCaller {
  uid: string;
  email: string;
  role: string;
  store: Store;
}

function header(req: any, name: string): string {
  const h = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(h) ? h[0] : String(h || '');
}

export async function authenticateAdmin(req: any): Promise<AdminCaller> {
  const authz = header(req, 'authorization');
  const m = /^Bearer\s+(.+)$/i.exec(authz.trim());
  if (!m) throw new HttpError(401, 'Thiếu Firebase ID token (Authorization: Bearer ...). Vui lòng đăng nhập lại.');
  const idToken = m[1].trim();

  const { app, hasCredentials } = getAdmin();
  let decoded: any;
  try {
    decoded = await getAuth(app).verifyIdToken(idToken);
  } catch {
    throw new HttpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
  }

  const store = hasCredentials ? await adminStore(app) : restStore(idToken);
  const email = String(decoded.email || '').toLowerCase();
  const isOwner = email === APP_OWNER_EMAIL && decoded.email_verified === true;
  let role = 'user';
  try {
    const profile = await store.getDoc(`users/${decoded.uid}`);
    role = String(profile?.role || 'user');
  } catch (err) {
    if (!isOwner) throw err;
  }
  if (!isOwner && !ADMIN_ROLES.includes(role.trim().toLowerCase())) {
    throw new HttpError(403, 'Chỉ Quản trị viên (admin / super admin) mới được dùng chức năng sao lưu GitHub.');
  }
  return { uid: decoded.uid, email, role: isOwner ? 'owner' : role, store };
}

// ---------------------------------------------------------------------------
// Config + token resolution (server-side only)
// ---------------------------------------------------------------------------
export interface BackupContext {
  caller: AdminCaller;
  token: string;
  tokenSource: 'settings_private' | 'settings_legacy' | 'env' | 'request';
  owner: string;
  repo: string;
  branch: string;
  folder: string;
  publicConfig: Record<string, any> | null;
  body: Record<string, any>;
}

const SAFE_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const SAFE_BRANCH = /^[A-Za-z0-9._\/-]{1,200}$/;

function parseRepo(input: string | undefined | null) {
  const parts = String(input || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean);
  return parts.length >= 2 ? { owner: parts[0], repo: parts[1] } : null;
}

function isLegacy(owner: string, repo: string) {
  return LEGACY_REPOS.includes(`${owner}/${repo}`.toLowerCase());
}

function readBody(req: any): Record<string, any> {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return typeof b === 'object' ? b : {};
}

async function buildContext(req: any, caller: AdminCaller, action: Action): Promise<BackupContext> {
  const body = readBody(req);
  const [privateCfg, publicCfg] = await Promise.all([
    caller.store.getDoc(PRIVATE_CONFIG_PATH).catch(() => null),
    caller.store.getDoc(PUBLIC_CONFIG_PATH).catch(() => null),
  ]);

  let token = '';
  let tokenSource: BackupContext['tokenSource'] = 'env';
  // Only "test" may use a token typed in the form (to validate it before saving).
  if (action === 'test' && typeof body.token === 'string' && body.token.trim()) {
    token = body.token.trim();
    tokenSource = 'request';
  } else if (privateCfg?.token) {
    token = String(privateCfg.token).trim();
    tokenSource = 'settings_private';
  } else if (publicCfg?.token) {
    token = String(publicCfg.token).trim();
    tokenSource = 'settings_legacy';
  } else {
    token = (process.env.GITHUB_BACKUP_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
    tokenSource = 'env';
  }
  if (!token) {
    throw new HttpError(
      400,
      'Chưa có GitHub token trên máy chủ. Quản trị viên hãy nhập token và bấm "Lưu cấu hình" (hoặc cấu hình biến môi trường GITHUB_BACKUP_TOKEN trên Vercel).',
    );
  }

  const cfgRepo = parseRepo(publicCfg?.repoUrl);
  const cfgRepoUsable = cfgRepo && !isLegacy(cfgRepo.owner, cfgRepo.repo) ? cfgRepo : null;
  const owner = String(body.owner || cfgRepoUsable?.owner || DEFAULT_OWNER).trim();
  const repo = String(body.repo || cfgRepoUsable?.repo || DEFAULT_REPO).trim();
  const branch = String(body.branch || (cfgRepoUsable && publicCfg?.branch) || DEFAULT_BRANCH).trim();
  const folder = String(body.folderPath || publicCfg?.targetFolder || 'backups')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo)) throw new HttpError(400, 'Tên repository không hợp lệ.');
  if (!SAFE_BRANCH.test(branch) || branch.includes('..')) throw new HttpError(400, 'Tên nhánh không hợp lệ.');
  if (folder.split('/').some((p) => p === '..' || p === '.') || !/^[A-Za-z0-9._\/-]*$/.test(folder)) {
    throw new HttpError(400, 'Thư mục sao lưu không hợp lệ.');
  }
  if ((action === 'sync' || action === 'sync-code') && isLegacy(owner, repo)) {
    throw new HttpError(400, `Không được ghi vào repository cũ ${owner}/${repo}. Hãy dùng ${DEFAULT_OWNER}/${DEFAULT_REPO}.`);
  }

  return { caller, token, tokenSource, owner, repo, branch, folder, publicConfig: publicCfg, body };
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------
function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Mayhomes-Backup-App',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function gh(ctx: BackupContext, path: string, init: { method?: string; body?: any } = {}) {
  const res = await fetch(`https://api.github.com/repos/${ctx.owner}/${ctx.repo}${path}`, {
    method: init.method || 'GET',
    headers: { ...ghHeaders(ctx.token), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as any;
  return { ok: res.ok, status: res.status, data };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function actionTest(ctx: BackupContext) {
  const repoRes = await gh(ctx, '');
  if (!repoRes.ok) {
    if (repoRes.status === 401) throw new HttpError(400, 'GitHub token không hợp lệ hoặc đã hết hạn (401 Bad credentials).');
    if (repoRes.status === 404) {
      throw new HttpError(404, `Không tìm thấy repository '${ctx.owner}/${ctx.repo}' hoặc token không có quyền truy cập (404).`);
    }
    throw new HttpError(502, repoRes.data?.message || 'Lỗi kết nối tới GitHub.');
  }
  const branchRes = await gh(ctx, `/branches/${encodeURIComponent(ctx.branch)}`);
  const r = repoRes.data;
  return {
    success: true,
    repo: {
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch || 'main',
      htmlUrl: r.html_url,
      permissions: r.permissions,
    },
    branchExists: branchRes.ok,
    checkedBranch: ctx.branch,
    tokenSource: ctx.tokenSource,
    dataAccess: ctx.caller.store.mode,
  };
}

const ARRAY_COLLECTIONS = [
  'reciprocal_budgets',
  'block_budgets',
  'blocks',
  'teams',
  'projects',
  'budgets',
  'costs',
  'acceptances',
  'finalAcceptances',
  'efficiencyReports',
  'docProcessing',
  'supportRequests',
  'rolePermissions',
];

export async function collectBackupData(store: Store) {
  const entries = await Promise.all(ARRAY_COLLECTIONS.map(async (c) => [c, await store.listCollection(c)] as const));
  const [auditLogs, users, systemSettings] = await Promise.all([
    store.latest('auditLogs', 'timestamp', 500).catch(() => store.listCollection('auditLogs').then((a) => a.slice(0, 500))),
    store.listCollection('users'),
    store.getDoc('settings/global'),
  ]);
  const cleanUsers = users.map((u: any) => ({
    id: u.id || u.uid,
    uid: u.uid || u.id,
    email: u.email,
    fullName: u.fullName || u.displayName,
    role: u.role,
    teamName: u.teamName,
    assignedBlock: u.assignedBlock,
    assignedBlocks: u.assignedBlocks,
    assignedProjects: u.assignedProjects,
  }));
  const byName = Object.fromEntries(entries) as Record<string, any[]>;
  // Same keys/order as the web client's previous payload.
  return {
    reciprocal_budgets: byName.reciprocal_budgets,
    block_budgets: byName.block_budgets,
    blocks: byName.blocks,
    teams: byName.teams,
    projects: byName.projects,
    budgets: byName.budgets,
    costs: byName.costs,
    acceptances: byName.acceptances,
    finalAcceptances: byName.finalAcceptances,
    efficiencyReports: byName.efficiencyReports,
    docProcessing: byName.docProcessing,
    auditLogs,
    supportRequests: byName.supportRequests,
    users: cleanUsers,
    rolePermissions: byName.rolePermissions,
    systemSettings: systemSettings || {},
  } as Record<string, any>;
}

async function actionSync(ctx: BackupContext) {
  const startedAt = Date.now();
  const collections = await collectBackupData(ctx.caller.store);

  const repoRes = await gh(ctx, '');
  if (!repoRes.ok) throw new HttpError(502, repoRes.data?.message || 'Không thể truy cập repository trên GitHub.');
  const targetBranch = ctx.branch || repoRes.data.default_branch || 'main';

  let baseCommitSha: string | null = null;
  let baseTreeSha: string | null = null;
  const refRes = await gh(ctx, `/git/ref/heads/${targetBranch}`);
  if (refRes.ok) {
    baseCommitSha = refRes.data.object.sha;
    const commitRes = await gh(ctx, `/git/commits/${baseCommitSha}`);
    if (commitRes.ok) baseTreeSha = commitRes.data.tree?.sha || null;
  }

  const nowIso = new Date().toISOString();
  const summary: Record<string, number> = {};
  let totalRecords = 0;
  const files: { path: string; content: string }[] = [];
  const p = (name: string) => (ctx.folder ? `${ctx.folder}/${name}` : name);

  for (const [colName, colData] of Object.entries(collections)) {
    const count = Array.isArray(colData) ? colData.length : colData && Object.keys(colData).length ? 1 : 0;
    summary[colName] = count;
    totalRecords += count;
    files.push({ path: p(`${colName}.json`), content: JSON.stringify(colData, null, 2) });
  }

  const manifest = {
    syncDate: nowIso,
    syncedBy: ctx.caller.email || 'Mayhomes System',
    repository: `${ctx.owner}/${ctx.repo}`,
    branch: targetBranch,
    folder: ctx.folder,
    totalCollections: Object.keys(collections).length,
    totalRecords,
    collectionsSummary: summary,
    source: `firestore:${DATABASE_ID} (${ctx.caller.store.mode})`,
  };
  files.push({ path: p('manifest.json'), content: JSON.stringify(manifest, null, 2) });
  files.push({
    path: p('all_database_backup.json'),
    content: JSON.stringify({ metadata: manifest, data: collections }, null, 2),
  });

  // Upload blobs separately (keeps each request small; large collections are fine).
  const blobs = await mapLimit(files, 4, async (f) => {
    const r = await gh(ctx, '/git/blobs', { method: 'POST', body: { content: f.content, encoding: 'utf-8' } });
    if (!r.ok) throw new HttpError(502, `Tải file ${f.path} lên GitHub thất bại: ${r.data?.message || r.status}`);
    return { path: f.path, mode: '100644', type: 'blob', sha: r.data.sha };
  });

  const treeRes = await gh(ctx, '/git/trees', {
    method: 'POST',
    body: baseTreeSha ? { base_tree: baseTreeSha, tree: blobs } : { tree: blobs },
  });
  if (!treeRes.ok) throw new HttpError(502, `Tạo Git Tree thất bại: ${treeRes.data?.message || treeRes.status}`);

  const commitMessage =
    typeof ctx.body.commitMessage === 'string' && ctx.body.commitMessage.trim()
      ? ctx.body.commitMessage.trim().slice(0, 500)
      : `Backup dữ liệu Mayhomes Realestate (${totalRecords} bản ghi) - ${nowIso}`;
  const newCommit = await gh(ctx, '/git/commits', {
    method: 'POST',
    body: { message: commitMessage, tree: treeRes.data.sha, parents: baseCommitSha ? [baseCommitSha] : [] },
  });
  if (!newCommit.ok) throw new HttpError(502, `Tạo Git Commit thất bại: ${newCommit.data?.message || newCommit.status}`);
  const newCommitSha: string = newCommit.data.sha;

  const refUpdate = baseCommitSha
    ? await gh(ctx, `/git/refs/heads/${targetBranch}`, { method: 'PATCH', body: { sha: newCommitSha, force: false } })
    : await gh(ctx, '/git/refs', { method: 'POST', body: { ref: `refs/heads/${targetBranch}`, sha: newCommitSha } });
  if (!refUpdate.ok) throw new HttpError(502, `Cập nhật nhánh thất bại: ${refUpdate.data?.message || refUpdate.status}`);

  return {
    success: true,
    commitSha: newCommitSha,
    commitShortSha: newCommitSha.substring(0, 7),
    commitUrl: `https://github.com/${ctx.owner}/${ctx.repo}/commit/${newCommitSha}`,
    folderUrl: `https://github.com/${ctx.owner}/${ctx.repo}/tree/${targetBranch}/${ctx.folder}`,
    repoUrl: `https://github.com/${ctx.owner}/${ctx.repo}`,
    filesCount: blobs.length,
    totalRecords,
    syncedAt: nowIso,
    summary,
    durationMs: Date.now() - startedAt,
  };
}

async function actionDeploy(ctx: BackupContext) {
  const commitRes = await gh(ctx, `/commits/${encodeURIComponent(ctx.branch)}`);
  if (!commitRes.ok) throw new HttpError(502, `Không lấy được commit mới nhất của nhánh ${ctx.branch}: ${commitRes.data?.message || commitRes.status}`);
  const sha: string = commitRes.data.sha;
  const base = {
    success: true,
    commitSha: sha,
    commitShortSha: sha.substring(0, 7),
    commitUrl: `https://github.com/${ctx.owner}/${ctx.repo}/commit/${sha}`,
    repoUrl: `https://github.com/${ctx.owner}/${ctx.repo}`,
    branch: ctx.branch,
    commitMessage: String(commitRes.data.commit?.message || '').split('\n')[0],
    syncedAt: new Date().toISOString(),
  };

  const hook = (process.env.VERCEL_DEPLOY_HOOK_URL || '').trim();
  if (hook) {
    if (!/^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//.test(hook)) {
      throw new HttpError(500, 'VERCEL_DEPLOY_HOOK_URL không đúng định dạng Deploy Hook của Vercel.');
    }
    const r = await fetch(hook, { method: 'POST' });
    const data = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) throw new HttpError(502, `Kích hoạt Vercel Deploy Hook thất bại (HTTP ${r.status}).`);
    return {
      ...base,
      deployTriggered: true,
      deployJobId: data?.job?.id || null,
      message: `Đã yêu cầu Vercel build & deploy lại từ commit mới nhất ${base.commitShortSha} (nhánh ${ctx.branch}).`,
    };
  }
  return {
    ...base,
    deployTriggered: false,
    alreadyUpToDate: true,
    message:
      `Web đang chạy trên Vercel nên không có mã nguồn cục bộ để đẩy. Mã nguồn mới nhất đã nằm trên GitHub ` +
      `(commit ${base.commitShortSha}) và Vercel tự deploy mỗi khi có commit mới vào nhánh ${ctx.branch}. ` +
      `Muốn bấm nút để build lại thủ công, cần cấu hình biến VERCEL_DEPLOY_HOOK_URL trên Vercel.`,
  };
}

async function actionDeployStatus(ctx: BackupContext) {
  const depRes = await gh(ctx, '/deployments?per_page=5');
  if (!depRes.ok || !Array.isArray(depRes.data)) return { success: true, deployments: [] };
  const detailed = await Promise.all(
    depRes.data.slice(0, 3).map(async (dep: any) => {
      const s = await gh(ctx, `/deployments/${dep.id}/statuses?per_page=1`);
      const st = s.ok && Array.isArray(s.data) ? s.data[0] : null;
      return {
        id: dep.id,
        environment: dep.environment,
        sha: dep.sha,
        shortSha: dep.sha ? String(dep.sha).substring(0, 7) : '',
        createdAt: dep.created_at,
        state: st?.state || 'pending',
        targetUrl: st?.environment_url || st?.target_url || null,
        description: st?.description || '',
      };
    }),
  );
  return { success: true, deployments: detailed };
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------
export interface HandlerOptions {
  /** Local Express only: replace sync-code with a real "git push working tree" implementation. */
  localSyncCode?: (ctx: BackupContext) => Promise<Record<string, any>>;
}

function sendJson(res: any, status: number, payload: unknown) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(payload);
    return;
  }
  res.statusCode = status;
  res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function actionFromRequest(req: any): string {
  const fromParams = req.params?.action || req.query?.action;
  if (fromParams) return String(Array.isArray(fromParams) ? fromParams[0] : fromParams);
  const pathname = String(req.url || '').split('?')[0].replace(/\/+$/, '');
  return pathname.split('/').pop() || '';
}

export async function handleBackupRequest(req: any, res: any, opts: HandlerOptions = {}) {
  const action = actionFromRequest(req) as Action;
  if (!ACTIONS.includes(action)) return sendJson(res, 404, { error: 'Không tìm thấy API.' });
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }
  let token = '';
  try {
    const caller = await authenticateAdmin(req);
    const ctx = await buildContext(req, caller, action);
    token = ctx.token;
    let result: Record<string, any>;
    if (action === 'test') result = await actionTest(ctx);
    else if (action === 'sync') result = await actionSync(ctx);
    else if (action === 'sync-code') result = opts.localSyncCode ? await opts.localSyncCode(ctx) : await actionDeploy(ctx);
    else result = await actionDeployStatus(ctx);
    return sendJson(res, 200, result);
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    let msg = String(err?.message || err || 'Lỗi không xác định');
    if (token) msg = msg.split(token).join('***');
    if (status >= 500) console.error(`[backup-api] ${action} failed:`, msg);
    return sendJson(res, status, { success: false, error: msg });
  }
}

export default async function handler(req: any, res: any) {
  return handleBackupRequest(req, res);
}
