/** Khớp dự án theo projectId (mã định danh riêng); fallback tên khi projectId thiếu/không hợp lệ; tên trùng → không đoán; projectCode chỉ để hiển thị. */
// ── Xác định dự án của bản ghi: CHỈ theo projectId; fallback tên khi projectId thiếu/không hợp lệ.
// Không bao giờ khớp theo projectCode (mã dự án bị trùng: "VINHOMES", "THE", "SUN"...).
type ProjectResolver = (rec: any) => any | null;
const resolverCache = new WeakMap<any[], ProjectResolver>();
export const makeProjectResolver = (projects: any[] = []): ProjectResolver => {
  const cached = resolverCache.get(projects);
  if (cached) return cached;
  const byId = new Map<string, any>();
  const byName = new Map<string, any | null>(); // null = tên trùng → mơ hồ
  for (const p of projects || []) {
    if (p?.id) byId.set(String(p.id), p);
    const n = String(p?.name || '').trim().toLowerCase();
    if (n) byName.set(n, byName.has(n) ? null : p);
  }
  const fn: ProjectResolver = (rec) => {
    if (!rec) return null;
    const pid = rec.projectId ? String(rec.projectId) : '';
    if (pid && byId.has(pid)) return byId.get(pid);
    const pn = rec.projectName ? String(rec.projectName) : '';
    if (pn && byId.has(pn)) return byId.get(pn); // một số bản ghi cũ lưu id ở projectName
    for (const ref of [pn, pid]) {
      const k = ref.trim().toLowerCase();
      if (k && byName.get(k)) return byName.get(k);
    }
    return null;
  };
  if (projects) resolverCache.set(projects, fn);
  return fn;
};
export const resolveProject = (projects: any[] = [], rec: any) => makeProjectResolver(projects)(rec);
/** Khoá nhóm/lọc dự án: id dự án đã xác định, nếu không có thì tên, rồi projectId thô (không bao giờ dùng mã). */
export const projectKeyOf = (projects: any[] = [], rec: any) => makeProjectResolver(projects)(rec)?.id || String(rec?.projectName || '').trim() || String(rec?.projectId || '');
export const resolveAcceptanceProject = (rec: any, projects: any[] = []) => makeProjectResolver(projects)(rec);
export const matchesProjectFilter = (rec: any, filterId: string, projects: any[] = []) =>
  !filterId || filterId === 'all' || makeProjectResolver(projects)(rec)?.id === filterId;

/** Tên hiển thị: ưu tiên tên hiện hành theo projectId; hết dự án mới fallback tên đã lưu / id. */
export function displayProjectName(projects: any[] | undefined, projectId?: string | null, storedName?: string | null): string {
  const pid = projectId != null && projectId !== '' ? String(projectId) : '';
  if (pid && Array.isArray(projects) && projects.length) {
    const live = projects.find((p) => p && String(p.id) === pid && p.deleted !== true);
    const n = live?.name != null ? String(live.name).trim() : '';
    if (n) return n;
  }
  const stored = storedName != null ? String(storedName).trim() : '';
  if (stored) return stored;
  return pid || '—';
}

/** true khi bản ghi còn projectId khớp dự án sống và tên đã lưu khác tên hiện hành (để dry-run / audit). */
export function storedProjectNameStale(projects: any[] | undefined, projectId?: string | null, storedName?: string | null): boolean {
  const pid = projectId != null && projectId !== '' ? String(projectId) : '';
  const stored = storedName != null ? String(storedName).trim() : '';
  if (!pid || !stored || !Array.isArray(projects)) return false;
  const live = projects.find((p) => p && String(p.id) === pid && p.deleted !== true);
  const n = live?.name != null ? String(live.name).trim() : '';
  return !!n && n !== stored;
}
