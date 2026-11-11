/** Nhật ký thay đổi (changeLog) — logic thuần, dùng chung client/test. */
export const CHANGELOG = 'changeLog';
/** Collection quan trọng được ghi nhật ký (người dùng, Phòng/Khối, ngân sách/NS, báo cáo, nghiệm thu, phân quyền, cài đặt). */
export const KEY_COLS = [
  'users', 'teams', 'blocks', 'ban_kd', 'projects',
  'budgets', 'block_budgets', 'reciprocal_budgets', 'ns_lines', 'costs',
  'weekly_reports', 'efficiencyReports',
  'acceptances', 'finalAcceptances',
  'rolePermissions', 'settings',
];
/** Chỉ bật trên DB staging (live giữ nguyên cho tới khi duyệt go-live). */
export const changeLogEnabledFor = (dbId: string | undefined) => /-staging$/.test(String(dbId || ''));
export const isKeyPath = (path: string) => { const p = path.split('/'); return p.length === 2 && KEY_COLS.includes(p[0]); };
export const RETENTION_MONTHS = 12;

/** Chuyển dữ liệu ghi (có thể chứa FieldValue sentinel) thành dạng lưu được. */
export function sanitize(v: any, depth = 0): any {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object') return v;
  if (depth > 12) return '[sâu]';
  const ctor = v?.constructor?.name || '';
  if (typeof v.toDate === 'function' && 'seconds' in v) return v; // Timestamp
  if (v instanceof Date) return v;
  if (/FieldValue|Transform|Sentinel/i.test(ctor) || v._methodName) return { __fv: String(v._methodName || ctor) };
  if (typeof v.path === 'string' && v.firestore) return { __ref: v.path };
  if (Array.isArray(v)) return v.map((x) => sanitize(x, depth + 1));
  const o: Record<string, any> = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = sanitize(x, depth + 1);
  return o;
}
export type ChangeOp = 'create' | 'set' | 'update' | 'delete';
export type ChangeEntry = { col: string; docId: string; op: ChangeOp; before: Record<string, any> | null; patch: any; actor: string; actorName?: string; at: any; status?: 'failed'; restoreOf?: string };

/** Khác biệt cấp 1 (để hiển thị). */
export function diffKeys(before: Record<string, any> | null, patch: Record<string, any> | null) {
  const b = before || {}, p = patch || {};
  return Object.keys(p).filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(p[k] ?? null)).sort();
}
