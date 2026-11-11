import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { assignedBanIds, diffIds } from '../../lib/banAssignment';
import { banRoleOf, BAN_ROLE_LABEL, type BanRoleOnBan } from '../../lib/banRoleSync';
import { userLeadsBan } from '../../lib/truongBanAssignment';

/** Thanh Lưu/Huỷ dính đáy, luôn thấy trên mobile. */
function StickyFooter({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--mh-border)] bg-[var(--mh-surface)] px-4 py-3 sm:-mx-6 sm:-mb-6 sm:px-6" data-testid="assign-footer">{children}</div>;
}

/** Xác nhận 1 thay đổi (vai trò, Phòng KD) trước khi ghi. */
export type PendingChange = { title: string; lines: string[]; run: () => Promise<void> };
export function ConfirmChangeDialog({ pending, onClose }: { pending: PendingChange | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]" data-testid="confirm-change">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          <DialogDescription>Kiểm tra thay đổi trước khi lưu.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-xs text-[var(--mh-text)]">{pending?.lines.map((l, i) => <li key={i}>• {l}</li>)}</ul>
        <StickyFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose} className="text-xs font-bold">Huỷ</Button>
          <Button disabled={busy} data-testid="confirm-save" className="bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
            onClick={async () => { if (!pending) return; setBusy(true); try { await pending.run(); } finally { setBusy(false); onClose(); } }}>Lưu</Button>
        </StickyFooter>
      </DialogContent>
    </Dialog>
  );
}

type DraftRole = 'thanh_vien' | 'pho_ban' | 'truong_ban';

/** Gán Ban KD + vai trò trên Ban (Thành viên / Phó). Trưởng ban chỉ xem (đổi qua dialog Trưởng ban). */
export function BanKdAssignDialog({ u, bans, canEdit, onSave }: {
  u: any; bans: any[]; canEdit: boolean;
  onSave: (u: any, added: string[], removed: string[], deputyOf: Record<string, boolean>) => Promise<boolean>;
}) {
  const current = assignedBanIds(u, bans);
  const roleNow = (b: any): BanRoleOnBan => banRoleOf(b, u);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(current);
  const [draftRole, setDraftRole] = useState<Record<string, DraftRole>>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const { added, removed } = diffIds(current, draft);
  const name = (id: string) => bans.find((b) => b.id === id)?.name || id;
  const openIt = () => {
    const roles: Record<string, DraftRole> = {};
    bans.forEach((b) => {
      const r = roleNow(b);
      if (r === 'truong_ban') roles[b.id] = 'truong_ban';
      else if (r === 'pho_ban') roles[b.id] = 'pho_ban';
      else if (current.includes(b.id)) roles[b.id] = 'thanh_vien';
    });
    setDraft(current);
    setDraftRole(roles);
    setReview(false);
    setOpen(true);
  };
  const userRole = String(u.role || 'user');
  const exclusiveBanRole = userRole === 'truong_ban_kd' || userRole === 'pho_ban_kd';

  const toggleBan = (id: string, on: boolean) => {
    // Trưởng/Phó (role): chỉ 1 Ban — chọn Ban mới thay Ban cũ.
    if (on && exclusiveBanRole) {
      setDraft([id]);
      setDraftRole({ [id]: userRole === 'truong_ban_kd' ? 'truong_ban' : (userRole === 'pho_ban_kd' ? 'pho_ban' : 'thanh_vien') });
      return;
    }
    setDraft((d) => on ? [...d, id] : d.filter((x) => x !== id));
    setDraftRole((r) => {
      const next = { ...r };
      if (on) {
        const b = bans.find((x) => x.id === id);
        next[id] = b && userLeadsBan(b, u) ? 'truong_ban' : (r[id] === 'pho_ban' ? 'pho_ban' : 'thanh_vien');
      } else delete next[id];
      return next;
    });
  };

  const setPhoOnBan = (id: string) => {
    // Phó chỉ 1 Ban: chỉ giữ Ban này, role pho_ban; các Ban khác bỏ khỏi draft.
    setDraft([id]);
    setDraftRole({ [id]: 'pho_ban' });
  };
  const deputyOf: Record<string, boolean> = {};
  draft.forEach((id) => { deputyOf[id] = draftRole[id] === 'pho_ban'; });
  // Also explicitly false for bans that were Phó and are now Thành viên (still in draft)
  current.forEach((id) => {
    if (draft.includes(id) && roleNow(bans.find((b) => b.id === id) || {}) === 'pho_ban' && draftRole[id] !== 'pho_ban') {
      deputyOf[id] = false;
    }
  });
  const changedDeputy = Object.entries(deputyOf).filter(([id, want]) => {
    const cur = roleNow(bans.find((b) => b.id === id) || {}) === 'pho_ban';
    return draft.includes(id) && want !== cur;
  });
  const hasChange = added.length > 0 || removed.length > 0 || changedDeputy.length > 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={openIt} data-testid="ban-assign-open"
        className="h-7 text-[10px] px-2 font-bold text-blue-700 bg-blue-50/60 border-blue-200 hover:bg-blue-100">
        Gán Ban KD ({current.length})
        {current.length > 0 && (
          <span className="ml-1 font-semibold text-[var(--mh-text-2)]">
            · {[...new Set(current.map((id) => {
              const r = roleNow(bans.find((b) => b.id === id) || {});
              return r ? BAN_ROLE_LABEL[r] : null;
            }).filter(Boolean))].join('/')}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) setOpen(false); }}>
        <DialogContent className="sm:max-w-[460px] max-h-[90dvh] flex flex-col" data-testid="ban-assign-dialog">
          <DialogHeader>
            <DialogTitle>Gán Ban KD cho {u.fullName || u.email}</DialogTitle>
            <DialogDescription>
              Thành viên: có thể nhiều Ban. <b>Phó Ban / Trưởng Ban chỉ đúng 1 Ban</b> — chọn Phó sẽ bỏ Ban khác. Trưởng ban đổi ở nút «Trưởng ban».
            </DialogDescription>
          </DialogHeader>
          {!review ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto py-2">
              {bans.map((b) => {
                const on = draft.includes(b.id);
                const isLead = userLeadsBan(b, u) || draftRole[b.id] === 'truong_ban';
                return (
                  <div key={b.id} className="flex flex-col gap-1.5 p-2.5 rounded-xl border border-[var(--mh-border)] hover:bg-[var(--mh-surface-2)]">
                    <label className="flex items-center space-x-2.5 cursor-pointer">
                      <input type={exclusiveBanRole ? 'radio' : 'checkbox'} name={exclusiveBanRole ? 'ban-exclusive' : undefined}
                        data-testid="ban-assign-check" className="w-4 h-4" disabled={!canEdit || isLead}
                        checked={on || isLead}
                        onChange={(e) => toggleBan(b.id, e.target.checked)} />
                      <span className="text-xs font-bold text-[var(--mh-text)] flex-1">{b.name} <span className="text-[var(--mh-text-3)] font-mono">({b.code || 'N/A'})</span></span>
                    </label>
                    {(on || isLead) && (
                      <div className="pl-7 flex flex-wrap gap-2 text-[10px]" data-testid="ban-role-pick">
                        {isLead ? (
                          <span className="rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5 font-bold">Trưởng ban</span>
                        ) : (
                          <>
                            <label className="inline-flex items-center gap-1 cursor-pointer">
                              <input type="radio" name={`role-${b.id}`} disabled={!canEdit}
                                checked={draftRole[b.id] !== 'pho_ban'}
                                onChange={() => setDraftRole((r) => ({ ...r, [b.id]: 'thanh_vien' }))} />
                              Thành viên
                            </label>
                            <label className="inline-flex items-center gap-1 cursor-pointer">
                              <input type="radio" name={`role-${b.id}`} disabled={!canEdit}
                                checked={draftRole[b.id] === 'pho_ban'}
                                onChange={() => setPhoOnBan(b.id)} />
                              Phó ban (1 Ban)
                            </label>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-2 py-2 text-xs" data-testid="ban-assign-summary">
              {added.length > 0 && <p><b className="text-emerald-700">Thêm:</b> {added.map((id) => `${name(id)} (${draftRole[id] === 'pho_ban' ? 'Phó ban' : 'Thành viên'})`).join(', ')}</p>}
              {removed.length > 0 && <p><b className="text-rose-700">Gỡ:</b> {removed.map(name).join(', ')}</p>}
              {changedDeputy.map(([id, want]) => (
                <p key={id}><b className="text-indigo-700">{want ? 'Đặt Phó ban' : 'Bỏ Phó ban'}:</b> {name(id)}</p>
              ))}
              {!hasChange && <p className="text-[var(--mh-text-2)]">Không có thay đổi.</p>}
            </div>
          )}
          <StickyFooter>
            <span className="mr-auto text-[11px] text-[var(--mh-text-2)]">{hasChange ? `+${added.length} / −${removed.length} / Phó ${changedDeputy.length}` : 'Chưa thay đổi'}</span>
            <Button variant="ghost" disabled={busy} className="text-xs font-bold" data-testid="ban-assign-cancel"
              onClick={() => (review ? setReview(false) : setOpen(false))}>{review ? 'Quay lại' : 'Huỷ'}</Button>
            {!review ? (
              <Button disabled={!canEdit || !hasChange} data-testid="ban-assign-save"
                className="bg-blue-600 text-white text-xs font-bold hover:bg-blue-700" onClick={() => setReview(true)}>Lưu</Button>
            ) : (
              <Button disabled={busy} data-testid="ban-assign-confirm" className="bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                onClick={async () => {
                  const phoIds = draft.filter((id) => draftRole[id] === 'pho_ban');
                  if (phoIds.length > 1) { alert('Phó Ban chỉ được chọn đúng 1 Ban.'); return; }
                  if (phoIds.length === 1 && (removed.length > 0 || current.some((id) => id !== phoIds[0]))) {
                    const ok = window.confirm(`Phó Ban chỉ thuộc đúng 1 Ban.\nSẽ gỡ khỏi các Ban khác và chỉ giữ «${name(phoIds[0])}». Tiếp tục?`);
                    if (!ok) return;
                  }
                  setBusy(true); try { if (await onSave(u, added, removed, deputyOf)) setOpen(false); } finally { setBusy(false); }
                }}>Xác nhận lưu</Button>
            )}
          </StickyFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
