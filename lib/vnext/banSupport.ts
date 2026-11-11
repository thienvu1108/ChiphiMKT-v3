/**
 * Duyệt NS tầng Ban KD — sau khi GĐK/Trợ lý (hoặc tự duyệt Khối) đã duyệt.
 * banStatus lưu trên nsSupport; thiếu banStatus trước BAN_APPROVAL_CUTOVER_ISO = grandfather «Đã Ban duyệt».
 */
import type { NsLine } from './budget';
import { baseStatusForBan, isAutoNow, setWeeklyBanGate, type Support } from './support';

/**
 * false (3/11/2026): Báo cáo tuần không bắt Ban đã duyệt — Chờ Ban vẫn báo cáo được.
 * Vẫn luôn loại Ban từ chối (xem setWeeklyBanGate bên dưới). Không đổi banStatus trên dòng.
 */
export const WEEKLY_REQUIRES_BAN_APPROVAL = false;

/**
 * Mốc grandfather (UTC). Quyết định GĐK / tự duyệt tại hoặc trước mốc này + không có banStatus
 * → coi như Ban đã duyệt. Không backfill live; staging dùng convention.
 * Live release 29/10/2026 17:00 VN = 10:00 UTC — mọi NS GĐK đã duyệt trước mốc này grandfather «Ban đã duyệt».
 */
export const BAN_APPROVAL_CUTOVER_ISO = '2026-10-29T10:00:00.000Z';

export type BanStoredStatus = 'pending' | 'approved' | 'rejected';
/** na = chưa tới lượt Ban (GĐK chưa duyệt / đang chờ GĐK lại). */
export type BanEffectiveStatus = BanStoredStatus | 'na';

export const BAN_STATUS_LABEL: Record<BanEffectiveStatus, string> = {
  na: '—',
  pending: 'Chờ Ban duyệt',
  approved: 'Ban đã duyệt',
  rejected: 'Ban từ chối',
};

export type BanSupportFields = {
  banStatus?: BanStoredStatus;
  banReason?: string;
  banDecidedBy?: string;
  banDecidedByName?: string;
  banDecidedAt?: string;
  banDecidedRole?: string;
};

function gdkAt(line: NsLine, s?: Partial<Support> | null): string {
  if (s?.decidedAt) return String(s.decidedAt);
  if (isAutoNow(line, s)) {
    const any = line as any;
    return String(any.updatedAt || any.createdAt || '');
  }
  return '';
}

/** Trạng thái Ban hiệu lực (sau khi GĐK nền = approved). */
export function effectiveBanStatus(line: NsLine, s?: Partial<Support> | null): BanEffectiveStatus {
  const gdk = baseStatusForBan(line, s);
  const stored = s?.banStatus;

  // Ban từ chối còn hiệu lực khi GĐK vẫn đang «Đã duyệt» (chưa sửa). Sửa → chờ GĐK lại → na.
  if (stored === 'rejected') {
    if (gdk === 'approved') return 'rejected';
    return 'na';
  }

  if (gdk !== 'approved') return 'na';

  if (stored === 'approved') return 'approved';
  if (stored === 'pending') return 'pending';

  // Thiếu banStatus: grandfather nếu quyết định GĐK ≤ cutover (hoặc không có mốc thời gian = dữ liệu cũ).
  const at = gdkAt(line, s);
  if (!at || at <= BAN_APPROVAL_CUTOVER_ISO) return 'approved';
  return 'pending';
}

export function isBanTodo(st: BanEffectiveStatus) {
  return st === 'pending';
}

/** true khi Ban đã duyệt (grandfather tính là approved). Dùng UI / audit; báo cáo tuần không còn bắt buộc. */
export function isBanApprovedForWeekly(line: NsLine, s?: Partial<Support> | null): boolean {
  return effectiveBanStatus(line, s) === 'approved';
}

/** Badge trên form Báo cáo tuần: chờ tầng Khối (GĐK) hoặc chờ Ban — null nếu không cần hiện. */
export type WeeklyPendingBadge = 'khoi' | 'ban';
export function weeklyPendingBadge(line: NsLine, s?: Partial<Support> | null): WeeklyPendingBadge | null {
  const gdk = baseStatusForBan(line, s);
  if (gdk === 'pending' || gdk === 'reapproval') return 'khoi';
  if (effectiveBanStatus(line, s) === 'pending') return 'ban';
  return null;
}

export function buildBanDecision(
  line: NsLine,
  prev: Partial<Support> | null | undefined,
  by: { uid: string; name: string; role?: 'leader' | 'deputy' | 'admin' },
  banStatus: BanStoredStatus,
  reason = '',
  at = new Date().toISOString(),
): BanSupportFields & Partial<Support> {
  const prevBan = effectiveBanStatus(line, prev);
  const base: Partial<Support> = prev && prev.status === 'approved'
    ? {
        lineId: line.id,
        period: line.period,
        ownerUid: line.ownerUid || '',
        teamId: line.teamId || '',
        blockId: line.blockId || '',
        projectId: line.projectId,
        amount: Number(line.amount),
        status: 'approved',
        decidedBy: prev.decidedBy || 'auto',
        decidedByName: prev.decidedByName || 'Tự động duyệt (GĐK/Trợ lý đăng ký)',
        decidedAt: prev.decidedAt || at,
        history: prev.history || [],
        ...(prev.reason ? { reason: prev.reason } : {}),
      }
    : {
        // Materialize auto-approved / grandfather chưa có nsSupport
        lineId: line.id,
        period: line.period,
        ownerUid: line.ownerUid || '',
        teamId: line.teamId || '',
        blockId: line.blockId || '',
        projectId: line.projectId,
        amount: Number(line.amount),
        status: 'approved',
        decidedBy: 'auto',
        decidedByName: 'Tự động duyệt (GĐK/Trợ lý đăng ký)',
        decidedAt: gdkAt(line, prev) || at,
        history: [],
      };
  const why = String(reason || '').trim().slice(0, 300);
  const note = banStatus === 'approved'
    ? `Ban: ${BAN_STATUS_LABEL[prevBan]} → ${BAN_STATUS_LABEL[banStatus]}`
    : (why
        ? (banStatus === 'pending' ? `Đặt lại: ${why}` : why)
        : `Ban: ${BAN_STATUS_LABEL[prevBan]} → ${BAN_STATUS_LABEL[banStatus]}`);
  const h = { at, byUid: by.uid, byName: by.name, layer: 'ban', ...(by.role ? { byRole: by.role } : {}), status: banStatus === 'pending' ? 'pending' as const : banStatus, amount: Number(line.amount), ...(note ? { reason: note } : {}) };
  return {
    ...base,
    history: [...((base.history as Support['history']) || []), h].slice(-100),
    banStatus,
    // Từ chối: banReason (rules bắt buộc). Đặt lại: lý do trong history (staging rules chưa nới banReason trên pending — API 503).
    ...(banStatus === 'rejected' && why ? { banReason: why } : {}),
    banDecidedBy: by.uid,
    banDecidedByName: String(by.name || '').slice(0, 120),
    banDecidedAt: at,
    ...(by.role ? { banDecidedRole: by.role } : {}),
  };
}

/** Lý do Ban hiển thị: banReason (từ chối) hoặc history gần nhất có «Đặt lại:». */
export function banReasonText(s?: Partial<Support> | null): string {
  if (!s) return '';
  if (typeof s.banReason === 'string' && s.banReason.trim()) return s.banReason.trim();
  const hist = Array.isArray(s.history) ? s.history : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const r = String((hist[i] as any)?.reason || '');
    if (r.startsWith('Đặt lại:')) return r.slice('Đặt lại:'.length).trim();
    if ((hist[i] as any)?.status === 'rejected' && r) return r;
  }
  return '';
}

setWeeklyBanGate((line, s) => {
  // Luôn loại Ban từ chối. Flag WEEKLY_REQUIRES_BAN_APPROVAL=true mới siết thêm «phải Ban đã duyệt».
  if (effectiveBanStatus(line, s) === 'rejected') return false;
  if (!WEEKLY_REQUIRES_BAN_APPROVAL) return true;
  return isBanApprovedForWeekly(line, s);
});
