/**
 * Ngân sách MKT v-next (PHUONG-AN-v3): dòng NS đăng ký theo kỳ.
 *  - kind 'user'  : user đăng ký cho Dự án trong Phòng của mình (1 dòng / user / dự án / kỳ)
 *  - kind 'gdkd'  : "NS bổ sung GĐKD" — 1 dòng chung / Phòng / dự án / kỳ (mọi GĐKD của Phòng ngang quyền)
 *  - kind 'gdk'   : "NS bổ sung GĐK" — 1 dòng / Khối / dự án / kỳ (CŨ: không tạo mới, chỉ Admin sửa)
 *  - kind 'khoi'  : GĐ Khối / Trợ lý Khối tự Đăng ký MKT cho Khối mình (1 dòng / GĐK / Khối / dự án / kỳ) — tính vào NS Khối
 * Từ 10/2026: bỏ nút bổ sung GĐKD/GĐK, NS chỉ ghi nhận từ Đăng ký Ngân sách MKT (kể cả Admin: không tạo/sửa dòng gdkd/gdk; dòng cũ được chuyển thành đăng ký).
 * NS Phòng = Σ user + bổ sung GĐKD; NS Khối = Σ Phòng + bổ sung GĐK. Tự duyệt, không có bước phê duyệt.
 */
import { normalizeRoleKey, type RoleKey } from '../../src/lib/rolePermissions';

export const NS_COLLECTION = 'ns_lines';

export type NsKind = 'user' | 'gdkd' | 'gdk' | 'khoi';

export type NsHistory = {
  at: string; // ISO
  byUid: string;
  byName: string;
  byRole: string;
  action: 'create' | 'update' | 'delete';
  from: number;
  to: number;
  reason?: string;
};

export type NsLine = {
  id: string;
  period: string;
  kind: NsKind;
  teamId?: string;
  blockId?: string;
  projectId: string;
  ownerUid?: string;
  ownerName?: string;
  ownerEmail?: string;
  amount: number;
  deleted?: boolean;
  history?: NsHistory[];
  /** Dòng đăng ký chuyển từ NS bổ sung cũ (gdkd/gdk). */
  convertedFrom?: { srcId: string; srcKind: 'gdkd' | 'gdk'; amount: number; createdBy?: string | null; createdAt?: string | null; at: string }[];
  /** Dòng bổ sung cũ đã chuyển → id dòng đăng ký. */
  convertedTo?: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Tài khoản nhận tiền (snapshot không có STK đầy đủ). */
  payAccount?: { id: string; bankName: string; tail: string };
};

export function nsLineId(kind: NsKind, period: string, scopeId: string, projectId: string, uid?: string): string {
  if (kind === 'user') return `u_${period}_${scopeId}_${projectId}_${uid}`;
  if (kind === 'gdkd') return `p_${period}_${scopeId}_${projectId}`;
  if (kind === 'khoi') return `g_${period}_${scopeId}_${projectId}_${uid}`;
  return `k_${period}_${scopeId}_${projectId}`;
}

const live = (l: NsLine) => !l.deleted && Number(l.amount) > 0;
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** gdk = NS GĐ Khối (đăng ký 'khoi' + bổ sung GĐK cũ); gdkOld = phần bổ sung GĐK cũ trong gdk. legacy = gdkd + gdkOld (bổ sung cũ chưa chuyển). */
export type ProjectRow = { projectId: string; users: number; gdkd: number; gdk: number; gdkOld?: number; total: number; userCount: number; teams: Set<string> };
export const legacyOf = (r: { gdkd?: number; gdkOld?: number }) => (Number(r.gdkd) || 0) + (Number(r.gdkOld) || 0);

export function summarizeTeam(lines: NsLine[], period: string, teamId: string, blockId?: string) {
  const rows = new Map<string, ProjectRow>();
  const get = (pid: string) => {
    if (!rows.has(pid)) rows.set(pid, { projectId: pid, users: 0, gdkd: 0, gdk: 0, total: 0, userCount: 0, teams: new Set() });
    return rows.get(pid)!;
  };
  for (const l of lines) {
    if (l.period !== period || l.teamId !== teamId || !live(l)) continue;
    if (blockId && l.blockId && l.blockId !== blockId) continue; // dòng ghi nhận cho Khối khác (Phòng đã chuyển Khối)
    const r = get(l.projectId);
    if (l.kind === 'user') { r.users += n(l.amount); r.userCount += 1; }
    else if (l.kind === 'gdkd') r.gdkd += n(l.amount);
    r.total = r.users + r.gdkd;
    r.teams.add(teamId);
  }
  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  return { rows: list, users: list.reduce((s, r) => s + r.users, 0), gdkd: list.reduce((s, r) => s + r.gdkd, 0), total: list.reduce((s, r) => s + r.total, 0) };
}

/** Phòng tính vào Khối: Phòng hiện thuộc Khối ∪ Phòng có dòng NS (user/gdkd) mang blockId này trong kỳ. */
export function blockTeamIds(lines: NsLine[], period: string, blockId: string, currentTeamIds: string[]): string[] {
  const s = new Set(currentTeamIds);
  for (const l of lines) if (l.period === period && l.blockId === blockId && l.teamId && l.kind !== 'gdk' && live(l)) s.add(l.teamId);
  return [...s];
}

export function summarizeBlock(lines: NsLine[], period: string, blockId: string, teamIds: string[]) {
  const teams = teamIds.map((tid) => ({ teamId: tid, ...summarizeTeam(lines, period, tid, blockId) }));
  const rows = new Map<string, ProjectRow>();
  const get = (pid: string) => {
    if (!rows.has(pid)) rows.set(pid, { projectId: pid, users: 0, gdkd: 0, gdk: 0, total: 0, userCount: 0, teams: new Set() });
    return rows.get(pid)!;
  };
  for (const t of teams) for (const r of t.rows) {
    const x = get(r.projectId);
    x.users += r.users; x.gdkd += r.gdkd; x.userCount += r.userCount; x.teams.add(t.teamId);
  }
  for (const l of lines) {
    if (l.period !== period || (l.kind !== 'gdk' && l.kind !== 'khoi') || l.blockId !== blockId || !live(l)) continue;
    const x = get(l.projectId); x.gdk += n(l.amount); if (l.kind === 'gdk') x.gdkOld = (x.gdkOld || 0) + n(l.amount);
  }
  for (const r of rows.values()) r.total = r.users + r.gdkd + r.gdk;
  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  const phong = teams.reduce((s, t) => s + t.total, 0);
  const gdk = list.reduce((s, r) => s + r.gdk, 0);
  const legacy = list.reduce((s, r) => s + legacyOf(r), 0);
  return { teams, rows: list, phong, gdk, legacy, total: phong + gdk };
}

/** NS user đã đăng ký theo dự án trong kỳ (dùng cho liên kết Báo cáo tuần).
 *  opts.includeLine: nếu có, chỉ cộng dòng thỏa.
 *  opts.amountOf: nếu có, lấy số tiền qua hàm (vd. Cần duyệt lại → amount đã duyệt gần nhất). */
export function userNsByProject(lines: NsLine[], period: string, uid: string, opts?: { includeLine?: (l: NsLine) => boolean; amountOf?: (l: NsLine) => number }): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (l.period === period && (l.kind === 'user' || l.kind === 'khoi') && l.ownerUid === uid && live(l) && (!opts?.includeLine || opts.includeLine(l))) {
      const amt = opts?.amountOf ? opts.amountOf(l) : n(l.amount);
      if (!(amt > 0)) continue;
      m.set(l.projectId, (m.get(l.projectId) || 0) + amt);
    }
  }
  return m;
}

export type Actor = { uid: string; role: unknown; teamId?: string; gdkdTeamIds?: string[]; blockIds?: string[] };

/** Vai trò KHÔNG đăng ký NS như user (quyết định v3). */
export const NON_REGISTERING_ROLES: RoleKey[] = ['gd_khoi', 'tro_ly_khoi', 'mod', 'admin', 'super_admin'];

export function canRegisterAsUser(role: unknown): boolean {
  const r = normalizeRoleKey(role);
  return !NON_REGISTERING_ROLES.includes(r) && r !== 'accountant' && r !== 'truong_ban_kd';
}

/** Đăng ký NS kind user: role thường / GĐKD, hoặc GĐK·Trợ lý khi kiêm GĐKD (≥1 Phòng trong teams.gdkdUids). */
export function canRegisterUserNs(role: unknown, gdkdTeamIds: string[] = []): boolean {
  if (canRegisterAsUser(role)) return true;
  const r = normalizeRoleKey(role);
  return (r === 'gd_khoi' || r === 'tro_ly_khoi') && gdkdTeamIds.length > 0;
}

/** GĐ Khối / Trợ lý Khối tự Đăng ký MKT (dòng kind 'khoi') cho Khối mình phụ trách. */
export function canRegisterAsKhoi(role: unknown): boolean {
  const r = normalizeRoleKey(role);
  return r === 'gd_khoi' || r === 'tro_ly_khoi';
}

export function isAdminRole(role: unknown) {
  const r = normalizeRoleKey(role);
  return r === 'admin' || r === 'super_admin';
}

export type EditCheck = { ok: boolean; reason?: string; needsReason?: boolean; notifyOwner?: boolean };

/**
 * Ai được sửa dòng nào:
 *  - Admin: mọi dòng, mọi lúc (không thông báo).
 *  - User: dòng của chính mình trong hạn (xoá dòng của mình: không thông báo).
 *  - GĐKD (của Phòng): sửa dòng user đã nhập (bắt buộc lý do, thông báo user) và dòng bổ sung GĐKD; không tạo dòng thay user.
 *  - GĐK / Trợ lý Khối: chỉ dòng bổ sung GĐK của Khối; xem Phòng chỉ đọc.
 */
export function checkEdit(actor: Actor, line: Pick<NsLine, 'kind' | 'teamId' | 'blockId' | 'ownerUid'>, opts: { windowOpen: boolean; isNew: boolean }): EditCheck {
  const r = normalizeRoleKey(actor.role);
  // Bỏ hẳn «Bổ sung ngân sách» (kể cả Admin): không tạo/sửa dòng gdkd/gdk.
  if (line.kind === 'gdkd' || line.kind === 'gdk') return { ok: false, reason: 'NS chỉ ghi nhận từ Đăng ký Ngân sách MKT' };
  if (r === 'admin' || r === 'super_admin') return { ok: true };
  if (!opts.windowOpen) return { ok: false, reason: 'Ngoài thời hạn đăng ký' };
  if (line.kind === 'user') {
    if (line.ownerUid === actor.uid) {
      if (!canRegisterUserNs(r, actor.gdkdTeamIds || [])) return { ok: false, reason: 'Vai trò này không đăng ký NS' };
      // GĐK/Trợ lý kiêm GĐKD: chỉ dòng thuộc Phòng kiêm (gdkdUids), không cần teamId hồ sơ.
      if (!canRegisterAsUser(r)) {
        if (!line.teamId || !(actor.gdkdTeamIds || []).includes(line.teamId)) return { ok: false, reason: 'Chỉ đăng ký tại Phòng kiêm GĐKD' };
        return { ok: true };
      }
      if (line.teamId !== actor.teamId) return { ok: false, reason: 'Chỉ đăng ký cho Phòng của mình' };
      return { ok: true };
    }
    if ((r === 'gdkd' || r === 'gd_khoi') && line.teamId && (actor.gdkdTeamIds || []).includes(line.teamId)) {
      if (opts.isNew) return { ok: false, reason: 'GĐKD không tạo dòng thay user' };
      return { ok: true, needsReason: true, notifyOwner: true };
    }
    return { ok: false, reason: 'Không có quyền' };
  }
  if (line.kind === 'khoi') {
    if ((r === 'gd_khoi' || r === 'tro_ly_khoi') && line.ownerUid === actor.uid && line.blockId && (actor.blockIds || []).includes(line.blockId)) return { ok: true };
    return { ok: false, reason: 'Chỉ GĐ Khối / Trợ lý Khối tự đăng ký cho Khối mình' };
  }
  // NS bổ sung GĐKD / GĐK: đã bỏ — NS chỉ ghi nhận từ Đăng ký Ngân sách MKT (chỉ Admin sửa dòng cũ).
  return { ok: false, reason: 'NS chỉ ghi nhận từ Đăng ký Ngân sách MKT' };
}

export function appendHistory(line: Partial<NsLine>, h: NsHistory): NsHistory[] {
  return [...(line.history || []), h].slice(-200);
}

/** Teams thấy được: ẩn "Ngừng hoạt động" với mọi vai trò trừ Admin. */
export function isTeamActive(t: { status?: string } | null | undefined) {
  return (t?.status || 'active') !== 'inactive';
}
export function visibleTeams<T extends { status?: string }>(teams: T[], role: unknown): T[] {
  const r = normalizeRoleKey(role);
  if (r === 'admin' || r === 'super_admin') return teams;
  return teams.filter(isTeamActive);
}

/** GĐKD của Phòng: teams.gdkdUids (nhiều GĐKD, ngang quyền) hoặc user role gdkd thuộc team đó. */
/** GĐ Khối kiêm GĐKD: Phòng có teams.gdkdUids chứa uid (không dùng teamId của hồ sơ). aliasUids = UID cũ đã chuyển. */
export function gdkdTeamIdsFor(uid: string, role: unknown, myTeamId: string | undefined, teams: { id: string; gdkdUids?: string[] }[], aliasUids: string[] = []): string[] {
  const r = normalizeRoleKey(role);
  if (r !== 'gdkd' && r !== 'gd_khoi') return [];
  const ids = new Set([uid, ...aliasUids].filter(Boolean));
  const s = new Set<string>();
  if (r === 'gdkd' && myTeamId) s.add(myTeamId);
  for (const t of teams) { const g = Array.isArray(t.gdkdUids) ? t.gdkdUids : []; if (g.some((x) => ids.has(x))) s.add(t.id); }
  return [...s];
}

/** Phòng KD thuộc Khối (theo blockId hoặc blockCode). */
export function teamsInBlock<T extends { id: string; blockId?: string; blockCode?: string; status?: string }>(teams: T[], block: { id: string; blockCode?: string }): T[] {
  return (teams || []).filter((t) => t.blockId === block.id || (!!block.blockCode && !t.blockId && t.blockCode === block.blockCode));
}
/** Chỉ Admin xoá Khối; chặn khi còn Phòng KD đang hoạt động. */
export function canDeleteBlock(role: unknown, block: { id: string; blockCode?: string } | null | undefined, teams: any[]): { ok: boolean; reason?: string; activeTeams: any[] } {
  const r = String(role || '');
  if (!['admin', 'super_admin'].includes(r)) return { ok: false, reason: 'Chỉ Admin được xoá Khối', activeTeams: [] };
  if (!block?.id) return { ok: false, reason: 'Chưa chọn Khối', activeTeams: [] };
  const active = teamsInBlock(teams, block).filter(isTeamActive);
  if (active.length) return { ok: false, reason: `Khối còn ${active.length} Phòng KD đang hoạt động (${active.slice(0, 5).map((t: any) => t.teamCode || t.name).join(', ')}${active.length > 5 ? '…' : ''}). Chuyển các Phòng sang Khối khác hoặc chuyển «Ngừng hoạt động» trước khi xoá.`, activeTeams: active };
  return { ok: true, activeTeams: [] };
}
