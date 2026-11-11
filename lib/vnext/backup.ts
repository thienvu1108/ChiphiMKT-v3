/**
 * Sao lưu / khôi phục Firestore ↔ Google Drive — logic thuần (không I/O), dùng chung server + test.
 * Tài liệu lưu nguyên dạng REST (`fields` kiểu Firestore Value) để khôi phục đúng kiểu dữ liệu.
 */
export const BACKUP_ROOT = 'Sao lưu ChiphiMKT';
/** Collection gốc được sao lưu (cố định — REST không liệt kê được collection bằng ID token). */
export const BACKUP_COLLECTIONS = [
  'users', 'usersByEmail', 'teams', 'blocks', 'ban_kd', 'regions', 'projects', 'types',
  'block_budgets', 'budgets', 'reciprocal_budgets', 'costs', 'ns_lines',
  'weekly_reports', 'efficiencyReports', 'acceptances', 'finalAcceptances', 'ntKeys', 'acceptanceImages',
  'docProcessing', 'accessRequests', 'rolePermissions', 'settings', 'teamNotifications', 'supportRequests',
  'shareLinks', 'backupRuns', 'auditLogs',
] as const;
/** Không bao giờ khôi phục (bí mật / nhật ký chỉ-thêm / log chính tiến trình). */
export const RESTORE_EXCLUDED = ['auditLogs', 'backupRuns', 'changeLog', 'settings_private', 'driveOAuth'];

export type RawDoc = { name: string; fields?: Record<string, any>; updateTime?: string };
export type BackupData = { manifest: Manifest; collections: Record<string, RawDoc[]> };
export type Manifest = { app: 'ChiphiMKT'; env: string; database: string; createdAt: string; by: string; counts: Record<string, number>; skipped: Record<string, string>; total: number };

const pad = (n: number) => String(n).padStart(2, '0');
/** Giờ VN (UTC+7) → các thành phần ngày. */
export function vnParts(d: Date) {
  const v = new Date(d.getTime() + 7 * 3600e3);
  return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate(), hh: v.getUTCHours(), mm: v.getUTCMinutes() };
}
export function backupFileName(d: Date, staging: boolean) {
  const p = vnParts(d);
  return `${staging ? '[STAGING] ' : ''}MAYHOMES - Backup - ${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.hh)}h${pad(p.mm)}.zip`;
}
/** Đường thư mục: Sao lưu ChiphiMKT/[STAGING]/<Năm>/<Tháng> (staging tách riêng). */
export function backupFolderPath(d: Date, staging: boolean): string[] {
  const p = vnParts(d);
  return [BACKUP_ROOT, ...(staging ? ['[STAGING]'] : []), String(p.y), `Tháng ${pad(p.m)}`];
}
/** Đọc ngày-giờ từ tên tệp (giờ VN). */
export function parseBackupName(name: string): Date | null {
  const m = String(name).match(/Backup - (\d{4})-(\d{2})-(\d{2}) (\d{2})h(\d{2})\.zip$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5]));
}

/** Giữ: bản hằng ngày 30 ngày; bản ĐẦU TIÊN mỗi tháng 12 tháng; còn lại → Thùng rác. Bản trước-khôi-phục tính như thường. */
export function retentionPlan(files: { id: string; name: string }[], now: Date, dailyDays = 30, monthlyMonths = 12) {
  const dated = files.map((f) => ({ ...f, at: parseBackupName(f.name) })).filter((f) => f.at) as { id: string; name: string; at: Date }[];
  dated.sort((a, b) => a.at.getTime() - b.at.getTime());
  const firstOfMonth = new Set<string>(); const seen = new Set<string>();
  for (const f of dated) { const p = vnParts(f.at); const k = `${p.y}-${p.m}`; if (!seen.has(k)) { seen.add(k); firstOfMonth.add(f.id); } }
  const keep: string[] = []; const trash: string[] = [];
  const nowP = vnParts(now);
  for (const f of dated) {
    const ageDays = (now.getTime() - f.at.getTime()) / 864e5;
    const p = vnParts(f.at); const monthsAgo = (nowP.y - p.y) * 12 + (nowP.m - p.m);
    if (ageDays <= dailyDays || (firstOfMonth.has(f.id) && monthsAgo < monthlyMonths)) keep.push(f.id); else trash.push(f.id);
  }
  return { keep, trash };
}

export function buildManifest(collections: Record<string, RawDoc[]>, meta: { env: string; database: string; by: string; createdAt: string; skipped?: Record<string, string> }): Manifest {
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(collections)) counts[k] = v.length;
  return { app: 'ChiphiMKT', env: meta.env, database: meta.database, createdAt: meta.createdAt, by: meta.by, counts, skipped: meta.skipped || {}, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

// ---- Bộ lọc khôi phục từng phần ----
export type RestoreScope = { collections?: string[]; month?: string; teamId?: string };
const sv = (f: any) => (f == null ? undefined : f.stringValue ?? (f.integerValue != null ? String(f.integerValue) : undefined));
export const docId = (d: RawDoc) => d.name.split('/').pop() as string;
/** Chuẩn hoá tháng về YYYY-MM (chấp nhận 2026-04, 04.2026, 4/2026, «Kì 1 - Tháng 8» không có năm → null). */
export function monthKey(v: unknown): string | null {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/); if (m) return `${m[1]}-${pad(+m[2])}`;
  m = s.match(/^(\d{1,2})[./](\d{4})$/); if (m) return `${m[2]}-${pad(+m[1])}`;
  return null;
}
function docMonth(d: RawDoc): string | null {
  const f = d.fields || {};
  for (const k of ['ntMonth', 'period', 'month']) { const mk = monthKey(sv(f[k])); if (mk) return mk; }
  return null;
}
function docTeam(d: RawDoc): string | undefined { const f = d.fields || {}; return sv(f.teamId) || sv(f.ntTeamId); }
export function inScope(col: string, d: RawDoc, s: RestoreScope): boolean {
  if (RESTORE_EXCLUDED.includes(col)) return false;
  if (s.collections?.length && !s.collections.includes(col)) return false;
  if (s.month && docMonth(d) !== s.month) return false;
  if (s.teamId && docTeam(d) !== s.teamId && !(col === 'teams' && docId(d) === s.teamId)) return false;
  return true;
}
const stable = (o: any): string => (o && typeof o === 'object' ? (Array.isArray(o) ? `[${o.map(stable).join(',')}]` : `{${Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',')}}`) : JSON.stringify(o));
export const sameFields = (a?: Record<string, any>, b?: Record<string, any>) => stable(a || {}) === stable(b || {});

export type DiffRow = { col: string; add: number; update: number; delete: number; same: number };
export type RestorePlan = { rows: DiffRow[]; writes: { col: string; id: string; op: 'set' | 'delete'; fields?: Record<string, any> }[] };
/**
 * So sánh bản sao lưu với dữ liệu hiện tại trong phạm vi.
 * Xoá chỉ áp dụng khi lọc theo collection (không lọc tháng/Phòng) — tránh xoá nhầm bản ghi không ghi được tháng/Phòng.
 */
export function planRestore(backup: Record<string, RawDoc[]>, current: Record<string, RawDoc[]>, s: RestoreScope): RestorePlan {
  const rows: DiffRow[] = []; const writes: RestorePlan['writes'] = [];
  const allowDelete = !s.month && !s.teamId;
  for (const col of Object.keys(backup)) {
    if (RESTORE_EXCLUDED.includes(col) || (s.collections?.length && !s.collections.includes(col))) continue;
    const b = backup[col].filter((d) => inScope(col, d, s));
    const cur = new Map((current[col] || []).filter((d) => inScope(col, d, s)).map((d) => [docId(d), d]));
    const row: DiffRow = { col, add: 0, update: 0, delete: 0, same: 0 };
    const keep = new Set<string>();
    for (const d of b) {
      const id = docId(d); keep.add(id); const c = cur.get(id);
      if (!c) { row.add++; writes.push({ col, id, op: 'set', fields: d.fields || {} }); }
      else if (!sameFields(c.fields, d.fields)) { row.update++; writes.push({ col, id, op: 'set', fields: d.fields || {} }); }
      else row.same++;
    }
    if (allowDelete) for (const [id] of cur) if (!keep.has(id)) { row.delete++; writes.push({ col, id, op: 'delete' }); }
    if (row.add || row.update || row.delete || row.same) rows.push(row);
  }
  return { rows, writes };
}
export const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
