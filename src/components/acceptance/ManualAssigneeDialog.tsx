import { createPortal } from 'react-dom';
import React, { useEffect, useState } from 'react';
import { NT_MANUAL_MAX, cleanManualName, validateManualName } from '../../../lib/vnext/ntManual';

/** Hộp nhập tay «Người phụ trách» (chỉ Tháng 10/2026). Desktop + mobile (bottom sheet). */
export function ManualAssigneeDialog({ open, initial = '', onClose, onSave }: { open: boolean; initial?: string; onClose: () => void; onSave: (name: string) => Promise<void> | void }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setV(initial); setErr(''); } }, [open, initial]);
  if (!open) return null;
  const save = async () => {
    const e = validateManualName(v); if (e) return setErr(e);
    setBusy(true);
    try { await onSave(cleanManualName(v)); onClose(); } catch (x: any) { setErr(String(x?.message || x?.code || x)); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[2100] bg-black/40 flex items-end md:items-center justify-center overflow-hidden" onClick={onClose} data-testid="nt-manual-dialog">
      <div className="w-full max-w-[100vw] md:max-w-md max-h-[min(92dvh,100%)] overflow-y-auto overscroll-contain bg-[var(--mh-surface)] rounded-t-2xl md:rounded-2xl shadow-2xl p-4 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <div className="font-bold text-[15px]">Người phụ trách — tự nhập</div>
        <div className="text-[12px] text-[var(--mh-text-2)]">Chỉ áp dụng kỳ <b>Tháng 10/2026 (21/9–20/10)</b> — chưa có đăng ký NS MKT theo user. Từ Tháng 11 chỉ chọn từ danh sách.</div>
        <input autoFocus value={v} maxLength={NT_MANUAL_MAX} onChange={(e) => { setV(e.target.value); setErr(''); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }}
          placeholder="Họ tên người phụ trách" data-testid="nt-manual-input"
          className="w-full h-10 px-3 text-[14px] border border-[var(--mh-border-strong)] focus:border-indigo-500 rounded-lg outline-none" />
        {err && <div className="text-[12px] text-[var(--mh-err)]" data-testid="nt-manual-err">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="h-9 px-3.5 rounded-lg border border-[var(--mh-border)] text-[13px]" onClick={onClose}>Huỷ</button>
          <button type="button" disabled={busy} className="h-9 px-3.5 rounded-lg bg-[var(--mh-navy)] text-white text-[13px] font-semibold disabled:opacity-50" onClick={save} data-testid="nt-manual-save">{busy ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
