/**
 * Khối mà người dùng được quản lý (Quản lý Khối).
 * - Khối ĐÃ có GĐ (directorUid): chỉ khi người dùng có tên ở directorUid / assistantUids / assistantUid
 *   (UID hiện tại, profile id, UID cũ đã chuyển — migratedFromUid / hồ sơ cũ linkedToUid — hoặc email).
 * - Hoặc được duyệt GĐ Khối / Trợ lý đúng Khối đó qua đăng ký mới (vnOnboarding approved, blockId).
 * - Khối CHƯA có GĐ: users.assignedBlock(s) (mã / id / tên Khối) vẫn được tính (dữ liệu cũ).
 * Khớp firestore.rules blockInMyKhoi().
 */
export type KhoiBlock = { id: string; blockCode?: string; name?: string; directorUid?: string; assistantUids?: any; assistantUid?: string; [k: string]: any };

export function resolveMyBlocks<B extends KhoiBlock>(
  blocks: B[],
  profile: Record<string, any> | null | undefined,
  authUid: string | null | undefined,
  authEmail: string | null | undefined,
  allUsers: Array<Record<string, any>> = [],
): B[] {
  const uEmail = String(authEmail || '').toLowerCase().trim();
  const pId = profile?.id;
  const oldIds = new Set<string>([profile?.migratedFromUid, ...allUsers.filter((u) => authUid && u?.linkedToUid === authUid).map((u) => u.id || u.uid)].filter(Boolean));
  const isMe = (v: any) => !!v && typeof v === 'string' && (v === authUid || v === pId || oldIds.has(v) || (!!uEmail && v.toLowerCase().trim() === uEmail));
  const assigned = new Set<string>();
  const add = (val: any) => {
    if (!val) return;
    if (typeof val === 'string') val.split(/[,;|/\n]+/).forEach((s) => { const c = s.trim().toLowerCase(); if (c) assigned.add(c); });
    else if (Array.isArray(val)) val.forEach(add);
  };
  add(profile?.assignedBlock); add(profile?.assignedBlocks); add(profile?.managedBlocks); add(profile?.blocks);
  return blocks.filter((b) => {
    const named = isMe(b.directorUid) || isMe((b as any).directorEmail) || isMe((b as any).managerUid) || isMe((b as any).managerEmail)
      || (Array.isArray(b.assistantUids) && b.assistantUids.some(isMe))
      || (typeof b.assistantUids === 'string' && b.assistantUids.split(/[,;|\s]+/).some(isMe))
      || isMe(b.assistantUid);
    if (named) return true;
    const ob = profile?.vnOnboarding;
    if (ob && ob.status === 'approved' && (ob.position === 'gd_khoi' || ob.position === 'tro_ly_khoi') && ob.blockId && ob.blockId === b.id) return true;
    if (String(b.directorUid || '').trim()) return false; // Khối đã có GĐ: assignedBlock không cấp quyền
    const id = (b.id || '').toLowerCase().trim(), code = (b.blockCode || '').toLowerCase().trim(), name = (b.name || '').toLowerCase().trim();
    return assigned.has(id) || (!!code && assigned.has(code)) || (!!name && assigned.has(name));
  });
}

/** Khi chép hồ sơ cũ lúc đăng nhập lần đầu: GĐ Khối / Trợ lý Khối không có tên trong Khối nào → hạ xuống user, cần Admin xem lại. */
export function legacyKhoiRoleCheck(source: Record<string, any>, sourceId: string, blocks: KhoiBlock[], authUid: string, authEmail: string | null | undefined): { downgrade: boolean; reason?: string } {
  const role = String(source?.role || '').toLowerCase().trim();
  if (role !== 'gd_khoi' && role !== 'tro_ly_khoi') return { downgrade: false };
  const mine = resolveMyBlocks(blocks, { ...source, id: authUid, migratedFromUid: sourceId }, authUid, authEmail);
  if (mine.length > 0) return { downgrade: false };
  return { downgrade: true, reason: `Hồ sơ cũ có vai trò ${role} (Khối ${source?.assignedBlock || '-'}) nhưng không có tên GĐ/Trợ lý trong Khối nào` };
}
