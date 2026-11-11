/** Báo cáo tuần — quyền sửa sau khi nộp (pure). Khớp rules weekly_reports:
 *  chủ báo cáo sửa khi cửa sổ đợt còn mở; Admin (vn.reports.admin_edit) / Super Admin sửa mọi lúc. */
export type WindowState = 'upcoming' | 'open' | 'closed';
export type WeeklyEditInput = {
  windowState: WindowState;
  submitted: boolean;
  isOwner: boolean;
  canAdminEdit: boolean;
  isSuperAdmin?: boolean;
  deleted?: boolean;
};
export type WeeklyEditAccess = {
  canWrite: boolean;
  /** Đã nộp → hiển thị chỉ xem, cần bấm «Sửa báo cáo». */
  needsEditToggle: boolean;
  viaAdmin: boolean;
  reason: '' | 'upcoming' | 'closed' | 'not_owner' | 'deleted';
};

export function weeklyEditAccess(i: WeeklyEditInput): WeeklyEditAccess {
  const bypass = !!i.isSuperAdmin || i.canAdminEdit;
  const ownerOk = i.isOwner && i.windowState === 'open' && !i.deleted;
  const canWrite = ownerOk || bypass;
  let reason: WeeklyEditAccess['reason'] = '';
  if (!canWrite) reason = i.deleted ? 'deleted' : !i.isOwner ? 'not_owner' : i.windowState === 'upcoming' ? 'upcoming' : 'closed';
  return { canWrite, needsEditToggle: canWrite && i.submitted, viaAdmin: canWrite && !ownerOk, reason };
}

export type WeeklyHistoryEntry = { at: string; byUid: string; byName: string; action: string; reason?: string; prevItems?: unknown[] };

/** Trường ghi khi sửa bản đã nộp (giữ submittedAt gốc; history tối đa 100). */
export function editMeta(opts: { prevHistory?: WeeklyHistoryEntry[]; uid: string; name: string; now: string; isEdit: boolean; viaAdmin?: boolean; prevItems?: unknown[] }) {
  const action = !opts.isEdit ? 'create' : opts.viaAdmin ? 'admin_edit' : 'edit';
  const entry: WeeklyHistoryEntry = { at: opts.now, byUid: opts.uid, byName: opts.name, action };
  if (opts.isEdit && opts.prevItems) entry.prevItems = opts.prevItems;
  const history = [...(opts.prevHistory || []), entry].slice(-100);
  return opts.isEdit ? { editedBy: opts.uid, editedByName: opts.name, editedAt: opts.now, history } : { history };
}
