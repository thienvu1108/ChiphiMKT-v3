/**
 * v-next: Đổi tên hiển thị người dùng (fullName/displayName) theo phạm vi.
 * - Admin / Super admin: mọi người.
 * - GĐ Khối / Trợ lý Khối: người thuộc Khối mình (Phòng của Khối, hoặc đăng ký duyệt vào Khối) — không đổi Admin/Mod/Kế toán.
 * - GĐKD (và GĐ Khối kiêm GĐKD): user / GĐKD trong Phòng mình.
 * - Mọi người: tự đổi tên mình (vn.users.rename_self) ở menu tài khoản.
 * Mỗi lần đổi ghi 1 auditLogs RENAME_USER (ai đổi, đổi ai, tên cũ → mới) trong CÙNG batch; firestore.rules bắt buộc điều này.
 */
import { normalizeRoleKey } from '../../src/lib/rolePermissions';

export const RENAME_FEATURE = 'vn.users.rename';
export const RENAME_SELF_FEATURE = 'vn.users.rename_self';
export const RENAME_AUDIT_ACTION = 'RENAME_USER';
export const NAME_MAX = 120;

export type RenameActor = { uid: string; email?: string; name?: string; role: unknown; can: boolean; myBlockIds: string[]; gdkdTeamIds: string[] };

const ADMIN_LEVEL = ['admin', 'super_admin'];
const STAFF_PROTECTED = ['admin', 'super_admin', 'mod', 'accountant'];

export function cleanName(s: unknown): string {
  return String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function validateName(s: unknown): string | null {
  const n = cleanName(s);
  if (!n) return 'Nhập họ tên';
  if (n.length > NAME_MAX) return `Tối đa ${NAME_MAX} ký tự`;
  return null;
}

/** Khối của target: Khối của Phòng (teams.blockId / blockCode) hoặc vnOnboarding.blockId. */
export function targetBlockIds(target: any, teams: any[], blocks: any[] = []): string[] {
  const s = new Set<string>();
  const t = teams.find((x) => x.id === target?.teamId);
  if (t?.blockId) s.add(t.blockId);
  else if (t?.blockCode) { const b = blocks.find((x) => x.blockCode === t.blockCode); if (b) s.add(b.id); }
  const ob = target?.vnOnboarding?.blockId; if (ob) s.add(ob);
  return [...s];
}

export function canRenameUser(a: RenameActor, target: any, teams: any[], blocks: any[] = []): boolean {
  if (!target) return false;
  const role = normalizeRoleKey(a.role);
  const tRole = normalizeRoleKey(target.role);
  const tid = target.id || target.uid;
  if (role === 'super_admin') return true;
  if (!a.can) return false;
  if (role === 'admin') return true;
  if (tid === a.uid) return false; // tự đổi tên: hồ sơ cá nhân
  if (ADMIN_LEVEL.includes(tRole)) return false;
  if (role === 'mod' || role === 'accountant') return true;
  if ((role === 'gd_khoi' || role === 'tro_ly_khoi') && !STAFF_PROTECTED.includes(tRole)
    && targetBlockIds(target, teams, blocks).some((b) => a.myBlockIds.includes(b))) return true;
  if ((role === 'gdkd' || role === 'gd_khoi') && ['user', 'gdkd'].includes(tRole) && !!target.teamId && a.gdkdTeamIds.includes(target.teamId)) return true;
  return false;
}

/** Bản ghi Firestore cho 1 lần đổi tên: patch users/{target} + auditLogs/{auditId}. */
export function buildRename(a: RenameActor, target: any, newName: string, nowIso: string, auditId: string) {
  const n = cleanName(newName);
  const oldName = String(target?.fullName ?? '');
  const tid = target.id || target.uid;
  return {
    userPatch: { fullName: n, displayName: n, nameUpdatedBy: a.uid, nameUpdatedAt: nowIso, nameAuditId: auditId, updatedAt: nowIso },
    audit: {
      action: RENAME_AUDIT_ACTION, collection: 'users', docId: tid, targetUid: tid,
      oldName, newName: n, data: { from: oldName, to: n, targetEmail: target?.email || '' },
      userId: a.uid, userEmail: a.email || null, userName: a.name || '', timestamp: nowIso, createdAt: nowIso,
    },
  };
}

/** Tự đổi tên mình (vn.users.rename_self). Super admin luôn được. */
export function canRenameSelf(role: unknown, can: boolean): boolean {
  return normalizeRoleKey(role) === 'super_admin' || !!can;
}
