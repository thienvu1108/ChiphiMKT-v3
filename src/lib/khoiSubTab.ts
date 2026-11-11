/** Khối sub-tabs hidden from UI (feature/data kept elsewhere). */
export const KHOI_HIDDEN_SUBTABS = ['block-reciprocal'] as const;

/** Default Quản lý Khối tab (Thông tin). */
export const KHOI_DEFAULT_SUBTAB = 'block-teams';

/** Map deep links / stale state for hidden Khối tabs back to the default. */
export function normalizeKhoiSubTab(id: string): string {
  return (KHOI_HIDDEN_SUBTABS as readonly string[]).includes(id) ? KHOI_DEFAULT_SUBTAB : id;
}
