/**
 * Từ kỳ 11/2026, dự án trên phiếu Nghiệm thu lấy từ đăng ký NS MKT (ns_lines)
 * của đúng người phụ trách + đúng Phòng + đúng kỳ. Không xét ngày tạo bản ghi.
 * Kỳ trước mốc: null = giữ danh mục dự án đầy đủ (hành vi cũ).
 */
import { VNEXT_PERIOD_CUTOVER, periodKey } from './period';
import { normalizeMonth } from './ntReport';
import type { NsLine } from './budget';
import { isNsReportableLine, type Support } from './support';
import './banSupport';

export const NT_BUDGET_PROJECTS_FROM = VNEXT_PERIOD_CUTOVER;

export type NtBudgetLine = {
  id?: string;
  period?: string;
  teamId?: string;
  blockId?: string;
  ownerUid?: string;
  ownerName?: string;
  projectId?: string;
  projectName?: string;
  kind?: string;
  deleted?: boolean;
  amount?: number;
  history?: NsLine['history'];
  updatedAt?: string;
  createdAt?: string;
};

export type NtProjectChoice = { projectId: string; lineIds: string[]; projectName?: string };

const PERIOD_RE = /^[0-9]{4}-[0-9]{2}$/;

export function ntPeriodKey(month: unknown): string {
  const p = normalizeMonth(month);
  return PERIOD_RE.test(p) ? p : '';
}

/** Kỳ M từ 2026-11 trở đi (so chuỗi YYYY-MM). */
export function ntUsesBudgetProjects(month: unknown): boolean {
  const p = ntPeriodKey(month);
  return !!p && p >= NT_BUDGET_PROJECTS_FROM;
}

/** Id tài khoản dùng để khớp ownerUid: uid hiện tại, id doc, UID cũ đã chuyển. Không dùng tên hiển thị. */
export function personAccountIds(user: { uid?: string; id?: string; migratedFromUid?: string; aliasUids?: string[] } | null | undefined, selectedUid?: string): string[] {
  const ids = [selectedUid, user?.uid, user?.id, user?.migratedFromUid, ...(user?.aliasUids || [])];
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

/**
 * null: kỳ cũ — không lọc theo đăng ký.
 * []: kỳ mới nhưng chưa đủ Phòng/người, hoặc không có dòng hợp lệ.
 *
 * Dòng tính:
 *  - Thành viên Phòng: kind user/khoi, cùng period + teamId.
 *  - GĐ Khối / Trợ lý Khối (đăng ký 'khoi', gắn theo blockId, KHÔNG thuộc teamId nào):
 *    cùng period + blockId. (Chỉ xét khi truyền blockId.)
 * Thêm điều kiện: ownerUid thuộc id tài khoản, chưa xoá, chưa bị GĐK/Ban từ chối
 * (cùng luật Báo cáo tuần). Chờ duyệt / Cần duyệt lại / Chờ STK / Chờ Ban vẫn tính.
 * Nhiều dòng cùng dự án gộp một mục.
 */
export function acceptanceBudgetProjects(args: {
  month: unknown;
  teamId?: string;
  blockId?: string;
  personUid?: string;
  accountIds?: string[];
  lines?: NtBudgetLine[] | null;
  support?: Record<string, Partial<Support> | undefined>;
}): NtProjectChoice[] | null {
  if (!ntUsesBudgetProjects(args.month)) return null;
  const period = ntPeriodKey(args.month);
  const teamId = String(args.teamId || '');
  const blockId = String(args.blockId || '');
  const personUid = String(args.personUid || '');
  if (!period || !personUid || (!teamId && !blockId)) return [];
  const inScope = (l: NtBudgetLine) =>
    (!!teamId && l.teamId === teamId) || (!!blockId && l.kind === 'khoi' && l.blockId === blockId);
  const ids = new Set(personAccountIds(null, personUid).concat(args.accountIds || []));
  const byProject = new Map<string, NtProjectChoice>();
  for (const l of args.lines || []) {
    if (!l || l.deleted) continue;
    if (l.period !== period || !inScope(l)) continue;
    if (!l.ownerUid || !ids.has(l.ownerUid)) continue;
    if (l.kind !== 'user' && l.kind !== 'khoi') continue;
    if (!l.projectId) continue;
    if (!isNsReportableLine(l as NsLine, l.id ? args.support?.[l.id] : undefined)) continue;
    const cur = byProject.get(l.projectId);
    if (cur) {
      if (l.id) cur.lineIds.push(l.id);
      if (!cur.projectName && l.projectName) cur.projectName = l.projectName;
    } else {
      byProject.set(l.projectId, { projectId: l.projectId, lineIds: l.id ? [l.id] : [], projectName: l.projectName });
    }
  }
  return [...byProject.values()].sort((a, b) => a.projectId.localeCompare(b.projectId));
}

export function acceptanceChoicesFor(row: { month?: unknown; teamId?: string; blockId?: string; implementerUid?: string; implementerManual?: boolean }, lines: NtBudgetLine[] | null | undefined, support: Record<string, Partial<Support> | undefined> | undefined, users: { uid?: string; id?: string; migratedFromUid?: string; aliasUids?: string[] }[] = []) {
  const personUid = row.implementerManual ? '' : String(row.implementerUid || '');
  const user = users.find((u) => (u.uid || u.id) === personUid);
  return acceptanceBudgetProjects({
    month: row.month,
    teamId: row.teamId,
    blockId: row.blockId,
    personUid,
    accountIds: personAccountIds(user, personUid),
    lines,
    support,
  });
}

export function projectAllowedForAcceptance(choices: NtProjectChoice[] | null, projectId?: string): boolean {
  if (choices === null) return true;
  return !!projectId && choices.some((c) => c.projectId === projectId);
}

/** Bỏ dự án đang chọn nếu không còn trong tập mới. Kỳ cũ không xoá. */
export function clearStaleProject<T extends { projectId?: string; projectName?: string; projectCode?: string }>(row: T, choices: NtProjectChoice[] | null): T {
  if (choices === null || !row.projectId) return row;
  if (choices.some((c) => c.projectId === row.projectId)) return row;
  return { ...row, projectId: '', projectName: '', projectCode: '' };
}

/**
 * Tập ownerUid có đăng ký NS hợp lệ cho đúng Phòng + kỳ (kỳ ≥ 2026-11).
 * null: kỳ cũ — không lọc Người phụ trách theo đăng ký.
 * Set rỗng: kỳ mới nhưng chưa chọn Phòng, hoặc Phòng/kỳ này chưa ai đăng ký.
 * Luật dòng tính giống dự án: kind user/khoi, cùng period + teamId, chưa xoá,
 * chưa bị GĐK/ Ban từ chối (isNsReportableLine). Chờ duyệt vẫn tính.
 */
export function acceptanceAssigneeUids(args: {
  month: unknown;
  teamId?: string;
  lines?: NtBudgetLine[] | null;
  support?: Record<string, Partial<Support> | undefined>;
}): Set<string> | null {
  if (!ntUsesBudgetProjects(args.month)) return null;
  const period = ntPeriodKey(args.month);
  const teamId = String(args.teamId || '');
  const uids = new Set<string>();
  if (!period || !teamId) return uids;
  for (const l of args.lines || []) {
    if (!l || l.deleted) continue;
    if (l.period !== period || l.teamId !== teamId) continue;
    if (l.kind !== 'user' && l.kind !== 'khoi') continue;
    if (!l.ownerUid) continue;
    if (!isNsReportableLine(l as NsLine, l.id ? args.support?.[l.id] : undefined)) continue;
    uids.add(l.ownerUid);
  }
  return uids;
}

export type KhoiAssignee = { uid: string; name: string; role: 'khoi' };

/**
 * GĐ Khối / Trợ lý Khối có đăng ký NS 'khoi' hợp lệ cho đúng Khối (blockId) + kỳ (≥ 2026-11).
 * Họ KHÔNG thuộc Phòng nào nên không có trong implementerOptions của Phòng; lấy thẳng uid + tên
 * từ dòng NS 'khoi'. Dùng để bổ sung vào dropdown Người phụ trách sau khi đã chọn Phòng.
 * null: kỳ cũ. []: chưa chọn Khối, hoặc Khối/kỳ này chưa có đăng ký 'khoi'.
 */
export function acceptanceKhoiAssignees(args: {
  month: unknown;
  blockId?: string;
  lines?: NtBudgetLine[] | null;
  support?: Record<string, Partial<Support> | undefined>;
}): KhoiAssignee[] | null {
  if (!ntUsesBudgetProjects(args.month)) return null;
  const period = ntPeriodKey(args.month);
  const blockId = String(args.blockId || '');
  if (!period || !blockId) return [];
  const byUid = new Map<string, KhoiAssignee>();
  for (const l of args.lines || []) {
    if (!l || l.deleted) continue;
    if (l.period !== period || l.kind !== 'khoi' || l.blockId !== blockId) continue;
    if (!l.ownerUid) continue;
    if (!isNsReportableLine(l as NsLine, l.id ? args.support?.[l.id] : undefined)) continue;
    const cur = byUid.get(l.ownerUid);
    if (!cur) byUid.set(l.ownerUid, { uid: l.ownerUid, name: l.ownerName || l.ownerUid, role: 'khoi' });
    else if ((cur.name === cur.uid) && l.ownerName) cur.name = l.ownerName;
  }
  return [...byUid.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));
}

/**
 * Lọc danh sách lựa chọn Người phụ trách theo tập ownerUid đã đăng ký.
 * null (kỳ cũ) → giữ nguyên. Khớp theo id tài khoản (gồm UID cũ đã chuyển), không theo tên.
 */
export function filterAssigneeOptions<T extends { uid?: string }>(
  options: T[],
  uids: Set<string> | null,
  users: { uid?: string; id?: string; migratedFromUid?: string; aliasUids?: string[] }[] = [],
): T[] {
  if (uids === null) return options;
  return options.filter((o) => {
    const u = users.find((x) => (x.uid || x.id) === o.uid);
    return personAccountIds(u, o.uid).some((id) => uids.has(id));
  });
}

export { periodKey };
