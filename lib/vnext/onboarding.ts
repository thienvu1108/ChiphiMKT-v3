/**
 * v-next: Đăng ký tài khoản lần đầu, duyệt chức vụ/Phòng, xin chuyển Phòng/Khối.
 * Logic thuần (không Firebase) — UI và test dùng chung; firestore.rules kiểm tra lại cùng các điều kiện.
 */
import { isKycComplete } from './kyc';
import { normalizeRoleKey, type RoleKey } from '../../src/lib/rolePermissions';

export const ACCESS_REQUESTS = 'accessRequests';
export const GDKD_MAX_PER_TEAM = 4;

export type Dept = 'kd' | 'bo';
export type Position = 'gd_khoi' | 'tro_ly_khoi' | 'gdkd' | 'nvkd' | 'bo_truong_ban' | 'bo_pho_ban' | 'bo_nhan_vien';
export type BoUnit = 'ban_kd' | 'digital';
export type ReqStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export const POSITION_LABEL: Record<Position, string> = {
  gd_khoi: 'Giám đốc Khối', tro_ly_khoi: 'Trợ lý Khối', gdkd: 'Giám đốc Kinh doanh (GĐKD)', nvkd: 'Nhân viên Kinh doanh (NVKD)',
  bo_truong_ban: 'Trưởng ban', bo_pho_ban: 'Phó Ban', bo_nhan_vien: 'Nhân viên',
};
export const KD_POSITIONS: Position[] = ['gd_khoi', 'tro_ly_khoi', 'gdkd', 'nvkd'];
export const BO_POSITIONS: Position[] = ['bo_truong_ban', 'bo_pho_ban', 'bo_nhan_vien'];
export const BO_UNIT_LABEL: Record<BoUnit, string> = { ban_kd: 'Ban KD', digital: 'Phòng Digital' };

export const APPROVER_HINT: Record<Position, string> = {
  gd_khoi: 'Không chọn Phòng · Duyệt: Admin',
  tro_ly_khoi: 'Không chọn Phòng · Duyệt: GĐK của Khối hoặc Admin',
  gdkd: `Duyệt: GĐK của Khối hoặc Admin · tối đa ${GDKD_MAX_PER_TEAM} GĐKD/Phòng`,
  nvkd: 'Duyệt: GĐKD của Phòng, GĐK / Trợ lý Khối của Khối hoặc Admin',
  bo_truong_ban: 'Duyệt: Admin', bo_pho_ban: 'Duyệt: Admin', bo_nhan_vien: 'Duyệt: Admin',
};

export type AccessRequest = {
  id?: string;
  uid: string; email: string; name: string;
  kind: 'onboarding' | 'transfer';
  dept: Dept; position: Position;
  blockId?: string; blockCode?: string; teamId?: string; teamName?: string; teamCode?: string; boUnit?: BoUnit;
  fromTeamId?: string; fromBlockId?: string;
  reason?: string; note?: string;
  status: ReqStatus; createdAt: string; decidedBy?: string; decidedByName?: string; decidedAt?: string;
};

/** Vai trò không phải đăng ký lại (giữ nguyên quyền hiện có). */
export const ONBOARDING_EXEMPT: RoleKey[] = ['gd_khoi', 'tro_ly_khoi', 'mod', 'admin', 'super_admin'];

export function needsOnboarding(profile: any, opts: { isAppOwner?: boolean } = {}): boolean {
  if (opts.isAppOwner) return false;
  if (!profile) return false;
  if (ONBOARDING_EXEMPT.includes(normalizeRoleKey(profile.role))) return false;
  return profile?.vnOnboarding?.status !== 'approved';
}

/** Luồng bắt buộc khi đăng nhập (chưa được duyệt): B1 gửi đăng ký Phòng → B2 thông tin thanh toán → chờ duyệt.
 *  'register' = «Đã đăng nhập, chưa gửi đăng ký» (không có yêu cầu onboarding đang chờ; huỷ/bị từ chối cũng tính). */
/** Vai trò KHÔNG bắt buộc khai thông tin thanh toán (vẫn tự sửa được qua menu tài khoản). */
export const KYC_EXEMPT: RoleKey[] = ['mod', 'admin', 'super_admin', 'truong_ban_kd', 'pho_ban_kd'];
/** Bắt buộc khai STK/CCCD khi đăng nhập. Trưởng Ban / Phó Ban (ban_kd.leaderUid / deputyUids) miễn — như Admin/Mod. */
export const isBoProfile = (profile: any): boolean => profile?.vnOnboarding?.dept === 'bo';
export const missingRequiredKyc = (profile: any, kyc: any): boolean => !profile?.linkedToUid && !profile?.mergedInto && !isBoProfile(profile) && !isKycComplete(kyc);
export const onboardingNeedsKyc = (dept?: unknown): boolean => dept !== 'bo';
export function kycRequired(role: unknown, opts: { isAppOwner?: boolean; isBanLeader?: boolean; isBanDeputy?: boolean; profile?: any } = {}): boolean {
  if (opts.isAppOwner || opts.isBanLeader || opts.isBanDeputy || isBoProfile(opts.profile)) return false;
  return !KYC_EXEMPT.includes(normalizeRoleKey(role));
}

export function onboardingStep(profile: any, req: { status?: string; kind?: string; dept?: string } | null | undefined, kycComplete: boolean, opts: { isAppOwner?: boolean } = {}): 'register' | 'kyc' | 'pending' | null {
  if (!needsOnboarding(profile, opts)) return null;
  const submitted = !!req && req.status === 'pending' && (req.kind || 'onboarding') === 'onboarding';
  if (!submitted) return 'register';
  return kycComplete || !onboardingNeedsKyc(req?.dept) ? 'pending' : 'kyc';
}

export const positionNeedsBlock = (p: Position) => KD_POSITIONS.includes(p);
export const positionNeedsTeam = (p: Position) => p === 'gdkd' || p === 'nvkd';

/** Role được ghi khi duyệt. BO: giữ role đang có (mặc định user). */
export function roleForPosition(p: Position, currentRole?: unknown): string {
  if (p === 'gd_khoi') return 'gd_khoi';
  if (p === 'tro_ly_khoi') return 'tro_ly_khoi';
  if (p === 'gdkd') return 'gdkd';
  if (p === 'nvkd') return 'user';
  const r = String(currentRole || 'user');
  return ['gd_khoi', 'tro_ly_khoi', 'gdkd'].includes(normalizeRoleKey(r)) ? 'user' : r;
}

export function validateRequest(r: Partial<AccessRequest>): string | null {
  if (!r.dept) return 'Chọn bộ phận';
  if (!r.position) return 'Chọn chức vụ';
  if (r.dept === 'kd' && !KD_POSITIONS.includes(r.position)) return 'Chức vụ không hợp lệ';
  if (r.dept === 'bo' && !BO_POSITIONS.includes(r.position)) return 'Chức vụ không hợp lệ';
  if (r.dept === 'kd' && !r.blockId) return 'Chọn Khối';
  if (positionNeedsTeam(r.position) && !r.teamId) return 'Chọn Phòng Kinh doanh';
  if (r.dept === 'bo' && !r.boUnit) return 'Chọn Ban KD hoặc Phòng Digital';
  if (!String(r.name || '').trim()) return 'Nhập họ tên';
  return null;
}

/** Số GĐKD hiện có của Phòng: teams.gdkdUids ∪ user role gdkd có teamId = Phòng. */
export function gdkdCount(team: { id: string; gdkdUids?: string[] } | undefined, users: any[] = []): number {
  if (!team) return 0;
  const s = new Set<string>(team.gdkdUids || []);
  for (const u of users) if (normalizeRoleKey(u.role) === 'gdkd' && u.teamId === team.id && u?.vnOnboarding?.status !== 'pending') s.add(u.uid || u.id);
  return s.size;
}

export type Approver = { uid: string; role: unknown; blockIds: string[]; gdkdTeamIds: string[] };

/** Ai được duyệt yêu cầu này. Trả về { ok, reason } (reason dùng làm thông báo khi bị khoá). */
export function canApprove(a: Approver, r: AccessRequest, ctx: { team?: { id: string; gdkdUids?: string[] }; users?: any[] }): { ok: boolean; reason?: string } {
  if (r.status !== 'pending') return { ok: false, reason: 'Yêu cầu đã được xử lý' };
  if (a.uid === r.uid) return { ok: false, reason: 'Không tự duyệt yêu cầu của mình' };
  const role = normalizeRoleKey(a.role);
  const admin = role === 'admin' || role === 'super_admin';
  const isGdkOfBlock = (role === 'gd_khoi' || role === 'tro_ly_khoi') && !!r.blockId && a.blockIds.includes(r.blockId);
  // Chuyển Phòng đã bỏ khỏi Quản lý Khối / Phòng KD: yêu cầu «Xin chuyển» cũ chỉ Admin xử lý.
  if (r.kind === 'transfer' && !admin) return { ok: false, reason: 'Chuyển Phòng: chỉ Admin (Cài đặt → Users)' };
  const count = gdkdCount(ctx.team, ctx.users);
  if (r.position === 'gdkd') {
    if (!admin && !isGdkOfBlock) return { ok: false, reason: 'Chỉ GĐK của Khối hoặc Admin' };
    const already = (ctx.team?.gdkdUids || []).includes(r.uid);
    if (!already && count >= GDKD_MAX_PER_TEAM) return { ok: false, reason: `Phòng đã đủ ${GDKD_MAX_PER_TEAM} GĐKD — không thể duyệt thêm. Gỡ bớt 1 GĐKD hoặc từ chối.` };
    return { ok: true };
  }
  if (admin) return { ok: true };
  if (r.position === 'tro_ly_khoi') return isGdkOfBlock ? { ok: true } : { ok: false, reason: 'Chỉ GĐK của Khối hoặc Admin' };
  if (r.position === 'nvkd') {
    if (r.teamId && a.gdkdTeamIds.includes(r.teamId) && ['gdkd', 'gd_khoi'].includes(normalizeRoleKey(a.role))) return { ok: true };
    // B5: GĐ Khối / Trợ lý Khối duyệt thành viên vào mọi Phòng KD thuộc Khối mình (kể cả Phòng đã có GĐKD).
    if (isGdkOfBlock) return { ok: true };
    return { ok: false, reason: 'Chỉ GĐKD của Phòng, GĐK / Trợ lý Khối của Khối hoặc Admin' };
  }
  return { ok: false, reason: 'Chỉ Admin duyệt' };
}

/** Danh sách yêu cầu người duyệt nhìn thấy (badge “Chờ duyệt”). */
export function pendingFor(a: Approver, reqs: AccessRequest[], teams: any[], users: any[]): AccessRequest[] {
  return reqs.filter((r) => r.status === 'pending' && canSee(a, r));
  function canSee(ap: Approver, r: AccessRequest) {
    const role = normalizeRoleKey(ap.role);
    if (role === 'admin' || role === 'super_admin') return true;
    const team = teams.find((t) => t.id === r.teamId);
    const res = canApprove(ap, r, { team, users });
    // GĐK vẫn thấy GĐKD thứ 5 (bị khoá) để từ chối.
    return res.ok || (r.kind !== 'transfer' && r.position === 'gdkd' && (role === 'gd_khoi' || role === 'tro_ly_khoi') && !!r.blockId && ap.blockIds.includes(r.blockId));
  }
}

/** Các trường ghi lên users/{uid} khi duyệt. */
export function approvalUserPatch(r: AccessRequest, currentRole: unknown, byUid: string, nowIso: string) {
  const patch: Record<string, any> = {
    role: roleForPosition(r.position, currentRole),
    vnOnboarding: { status: 'approved', dept: r.dept, position: r.position, blockId: r.blockId || '', teamId: r.teamId || '', boUnit: r.boUnit || '', approvedBy: byUid, approvedAt: nowIso },
    updatedAt: nowIso,
  };
  // Tên nhập khi đăng ký là tên chính thức (thay tên Google mặc định).
  const nm = String(r.name || '').trim();
  if (r.kind !== 'transfer' && nm) { patch.fullName = nm; patch.displayName = nm; }
  if (positionNeedsTeam(r.position)) { patch.teamId = r.teamId; patch.teamName = r.teamName || ''; patch.teamCode = r.teamCode || ''; }
  if (r.position === 'gd_khoi' || r.position === 'tro_ly_khoi') patch.assignedBlock = r.blockCode || '';
  return patch;
}

/* ----------------------- Nghiệm thu: tên tệp / thư mục Drive / khoá trùng ----------------------- */
const pad2 = (n: number) => String(n).padStart(2, '0');
export function monthParts(month: string) { const m = /^(\d{4})-(\d{2})$/.exec(month); return m ? { y: m[1], m: m[2] } : { y: '', m: '' }; }
const clean = (s: any) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

/** 'MAYHOMES - <Mã Phòng> - <Dự án> - <NV phụ trách> - Tháng M YYYY - NN' */
export function ntFileBase(p: { teamCode: string; projectName: string; implementerName: string; month: string }) {
  const { y, m } = monthParts(p.month);
  return ['MAYHOMES', clean(p.teamCode), clean(p.projectName), clean(p.implementerName), `Tháng ${Number(m)} ${y}`].join(' - ');
}
export function ntFileName(p: Parameters<typeof ntFileBase>[0] & { order: number; ext?: string }) {
  return `${ntFileBase(p)} - ${pad2(p.order)}.${p.ext || 'jpg'}`;
}
/** Thư mục Drive: Tháng/Khối/Phòng/User/Dự án */
export function ntDrivePath(p: { month: string; blockCode: string; teamCode: string; implementerName: string; projectName: string }) {
  const { y, m } = monthParts(p.month);
  return [`Tháng ${m}-${y}`, clean(p.blockCode) || 'Chưa gán Khối', clean(p.teamCode) || 'Chưa gán Phòng', clean(p.implementerName) || 'Chưa có người phụ trách', clean(p.projectName) || 'Dự án'];
}
/** Khoá duy nhất 1 bản ghi / user / dự án / tháng (doc id của ntKeys). */
export function ntKey(month: string, uid: string, projectId: string) { return `${month}_${uid}_${projectId}`; }

export function findDuplicate(records: any[], rec: { id?: string; month: string; implementerUid?: string; projectId: string }, normMonth: (m: any) => string = (m) => m) {
  if (!rec.implementerUid) return null;
  return records.find((r) => r.id !== rec.id && r.implementerUid === rec.implementerUid && r.projectId === rec.projectId && normMonth(r.month) === rec.month) || null;
}

/** Người phụ trách: chỉ user đã duyệt (hoặc dữ liệu cũ) của Phòng đã chọn. */
/** Thành viên đã duyệt của Phòng (GĐKD + NVKD + gdkdUids). Không gồm chờ duyệt / từ chối. */
export function implementerOptions(users: any[], teamId: string, team?: { gdkdUids?: string[] }) {
  if (!teamId) return [];
  const gdkd = new Set<string>(team?.gdkdUids || []);
  return users.filter((u) => {
    const uid = u.uid || u.id;
    if (!uid) return false;
    if (!(u.teamId === teamId || gdkd.has(uid))) return false;
    const st = u?.vnOnboarding?.status;
    if (st === 'rejected' || st === 'pending') return false;
    if (st === 'approved') return true;
    // GĐKD / NVKD đã gắn Phòng (hoặc GĐK exempt) trước khi có cờ onboarding
    const role = normalizeRoleKey(u.role);
    return role === 'gdkd' || role === 'user' || ONBOARDING_EXEMPT.includes(role);
  })
    .map((u) => ({ uid: u.uid || u.id, name: u.fullName || u.displayName || u.email || u.id, pending: false, role: normalizeRoleKey(u.role) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));
}
