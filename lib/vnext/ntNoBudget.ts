/**
 * Nghiệm thu bổ sung «Không có đăng ký NS» (kỳ gốc ≥ 2026-11) — chỉ dùng trong Nghiệm thu bổ sung.
 * Bỏ kiểm tra «dự án phải nằm trong đăng ký NS của người phụ trách»; người phụ trách chọn từ Phòng/toàn hệ thống
 * hoặc tự nhập; bắt buộc ghi lý do. Duyệt như bản bổ sung thường (Super Admin, cần ảnh + hoá đơn).
 */
import { normalizeMonth } from './ntReport.js';
import { VNEXT_PERIOD_CUTOVER } from './period.js';
import { manualKey, isManualImplementer } from './ntManual.js';
import { isSupplement, prevMonth, suppMonths } from './ntSupplement.js';

export const NT_NOBUDGET_REASON_MIN = 3;
export const NT_NOBUDGET_REASON_MAX = 500;
export const NT_NOBUDGET_BADGE = 'Ngoài ĐK NS';
export const NT_NOBUDGET_GROUP_TEAM = 'Thành viên Phòng (không cần đăng ký)';
export const NT_NOBUDGET_GROUP_ALL = 'Toàn hệ thống';

/** Kỳ gốc của bản ghi / dòng nháp: bản đã lưu → supplementFor; nháp supplement=true → kỳ liền trước; chuỗi → kỳ đó; còn lại ''. */
export function rowSupplementFor(row: any): string {
  if (row?.supplementFor && typeof row.supplementFor === 'string') return row.supplementFor;
  const s = row?.supplement;
  if (s === true) return prevMonth(normalizeMonth(row?.month));
  return typeof s === 'string' ? s : '';
}

/** Có hiện công tắc «Không có đăng ký NS» không: là bản bổ sung và kỳ gốc ≥ 2026-11. */
export function noBudgetAvailable(supplementFor: unknown): boolean {
  const p = normalizeMonth(supplementFor);
  return /^\d{4}-\d{2}$/.test(p) && p >= VNEXT_PERIOD_CUTOVER;
}

export function noBudgetSameKy(month: unknown, supplementFor: unknown): boolean {
  const period = normalizeMonth(month);
  return noBudgetAvailable(period) && period === normalizeMonth(supplementFor);
}

export function suppTargetOk(month: unknown, supplementFor: unknown, noBudget: boolean): boolean {
  const period = normalizeMonth(month);
  const target = normalizeMonth(supplementFor);
  return suppMonths(period).includes(target) || (noBudget && noBudgetSameKy(period, target));
}

/** Hàng (nháp hoặc bản ghi) đang ở chế độ «Không có đăng ký NS»: cờ bật + là bổ sung + kỳ gốc ≥ 2026-11. */
export function rowNoBudget(row: any): boolean {
  return row?.ntNoBudget === true && noBudgetAvailable(rowSupplementFor(row));
}

export function isNoBudgetRecord(r: any): boolean {
  return r?.ntNoBudget === true && isSupplement(r);
}

export function cleanNoBudgetReason(s: unknown): string {
  return String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function validateNoBudgetReason(s: unknown): string | null {
  const r = cleanNoBudgetReason(s);
  if (r.length < NT_NOBUDGET_REASON_MIN) return `Nhập «Lý do không có đăng ký NS» (tối thiểu ${NT_NOBUDGET_REASON_MIN} ký tự)`;
  if (r.length > NT_NOBUDGET_REASON_MAX) return `Lý do tối đa ${NT_NOBUDGET_REASON_MAX} ký tự`;
  return null;
}

/** Các trường lưu thêm vào bản ghi. Ném lỗi nếu lý do không hợp lệ. */
export function noBudgetPatch(reason: unknown, by?: { uid?: string; email?: string }, at = new Date().toISOString()) {
  const err = validateNoBudgetReason(reason);
  if (err) throw Object.assign(new Error(err), { code: 'reason' });
  return { ntNoBudget: true as const, ntNoBudgetReason: cleanNoBudgetReason(reason), ntNoBudgetBy: by?.email || by?.uid || '', ntNoBudgetAt: at };
}

/** Dòng chữ nhỏ hiển thị lý do (badge title / dòng phụ). */
export function noBudgetReasonText(r: any): string {
  return isNoBudgetRecord(r) ? String(r?.ntNoBudgetReason || '') : '';
}

export type NoBudgetOption = { uid: string; name: string; group: 'team' | 'all'; groupLabel: string };

const userUid = (u: any) => String(u?.uid || u?.id || '');
const userName = (u: any) => String(u?.fullName || u?.displayName || u?.email || userUid(u));
/** User còn hoạt động: không bị từ chối/chờ duyệt onboarding, không khoá/ngừng. */
export function isActiveUser(u: any): boolean {
  if (!u || !userUid(u)) return false;
  if (u.disabled === true || u.isActive === false || u.active === false || u.deleted === true) return false;
  const st = u?.status;
  if (st === 'inactive' || st === 'disabled' || st === 'deleted' || st === 'blocked') return false;
  const ob = u?.vnOnboarding?.status;
  return ob !== 'rejected' && ob !== 'pending';
}

/**
 * Người phụ trách khi «Không có đăng ký NS»: nhóm 1 = mọi user active thuộc Phòng đã chọn (teamId hoặc gdkdUids),
 * nhóm 2 = toàn hệ thống (các user active còn lại). Không cần đăng ký NS.
 */
export function noBudgetAssigneeOptions(users: any[], teamId: string, team?: { gdkdUids?: string[] }): NoBudgetOption[] {
  const gdkd = new Set<string>(team?.gdkdUids || []);
  const byName = (a: NoBudgetOption, b: NoBudgetOption) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
  const inTeam: NoBudgetOption[] = [], rest: NoBudgetOption[] = [];
  const seen = new Set<string>();
  for (const u of users || []) {
    if (!isActiveUser(u)) continue;
    const uid = userUid(u);
    if (seen.has(uid)) continue;
    seen.add(uid);
    const member = !!teamId && (u.teamId === teamId || gdkd.has(uid));
    (member ? inTeam : rest).push({ uid, name: userName(u), group: member ? 'team' : 'all', groupLabel: member ? NT_NOBUDGET_GROUP_TEAM : NT_NOBUDGET_GROUP_ALL });
  }
  return [...inTeam.sort(byName), ...rest.sort(byName)];
}

/** Dự án cho «Không có đăng ký NS»: mọi dự án đang hoạt động (không xoá, không ngừng). */
export function activeProjects<T extends { status?: string; isActive?: boolean; deleted?: boolean }>(projects: T[] | null | undefined): T[] {
  return (projects || []).filter((p) => p && !p.deleted && (p.status || 'active') !== 'inactive' && p.isActive !== false);
}

/**
 * Trùng bản tự nhập: cùng manualKey(tên) + projectId + supplementFor, bản kia chưa bị từ chối.
 * Trả về bản trùng đầu tiên hoặc null. excludeId = chính bản đang sửa.
 */
export function noBudgetManualDuplicate(all: any[], excludeId: string, probe: { name: unknown; projectId?: string; supplementFor?: string }): any | null {
  const k = manualKey(probe.name);
  const sf = String(probe.supplementFor || '');
  if (!probe.projectId || !sf) return null;
  return (all || []).find((a) => a && a.id !== excludeId && isManualImplementer(a) && isSupplement(a)
    && a.supplementStatus !== 'rejected'
    && manualKey(a.implementerName) === k && a.projectId === probe.projectId && a.supplementFor === sf) || null;
}
