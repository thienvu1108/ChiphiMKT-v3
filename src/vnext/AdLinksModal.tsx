import { displayProjectName } from '../../lib/vnext/projectRef';
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AD_LINKS_MAX, adLinksOf, cleanAdLinks, normalizeAdLink } from '../../lib/vnext/ntAdLinks';

/** Popup «Link QC»: xem / thêm / sửa / xoá link quảng cáo của 1 bản ghi NT. readOnly khi kỳ đã khoá hoặc không có quyền sửa. */
export function AdLinksModal({ item, readOnly, readOnlyReason, onSave, onClose, projects }: {
  item: any; readOnly: boolean; readOnlyReason?: string;
  onSave: (links: string[]) => Promise<void>; onClose: () => void; projects?: any[];
}) {
  const [rows, setRows] = useState<string[]>(() => { const l = adLinksOf(item); return readOnly ? l : [...l, '']; });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (i: number, v: string) => setRows((r) => r.map((x, j) => (j === i ? v : x)));
  const save = async () => {
    const { links, error } = cleanAdLinks(rows);
    if (error) { setErr(error); return; }
    setBusy(true); setErr('');
    try { await onSave(links); onClose(); } catch (e: any) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  };
  const label = [displayProjectName(projects, item?.projectId, item?.projectName || item?.projectCode), item?.implementerName].filter(Boolean).join(' · ');
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto" data-testid="vn-adlinks-modal">
        <DialogHeader>
          <DialogTitle>Link QC</DialogTitle>
          <DialogDescription>{label || 'Link quảng cáo của bản ghi Nghiệm thu'}{readOnly ? ` — chỉ xem${readOnlyReason ? ': ' + readOnlyReason : ''}` : ` — tối đa ${AD_LINKS_MAX} link`}</DialogDescription>
        </DialogHeader>
        {readOnly ? (
          rows.length ? (
            <ol className="space-y-1.5 text-sm list-decimal pl-5">
              {rows.map((l) => <li key={l}><a href={l} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline break-all">{l}</a></li>)}
            </ol>
          ) : <p className="text-sm text-[var(--mh-text-2)]">Chưa có link quảng cáo.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((v, i) => {
              const ok = !v.trim() || !!normalizeAdLink(v);
              const href = normalizeAdLink(v);
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <Input value={v} onChange={(e) => set(i, e.target.value)} placeholder="https://..." inputMode="url" data-testid={`vn-adlinks-input-${i}`}
                    className={`h-9 text-sm ${ok ? '' : 'border-rose-400 focus-visible:ring-rose-300'}`} />
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer" title="Mở tab mới" className="shrink-0 h-9 px-2 inline-flex items-center rounded-md border border-[var(--mh-border)] text-xs text-indigo-600 hover:bg-indigo-50">Mở ↗</a> : null}
                  <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} title="Xoá link" aria-label="Xoá link"
                    className="shrink-0 h-9 w-9 rounded-md border border-[var(--mh-border)] text-rose-500 hover:bg-rose-50">×</button>
                </div>
              );
            })}
            {rows.length < AD_LINKS_MAX && (
              <button type="button" onClick={() => setRows((r) => [...r, ''])} data-testid="vn-adlinks-add" className="text-sm font-semibold text-indigo-600 hover:underline">+ Thêm link</button>
            )}
          </div>
        )}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Đóng</Button>
          {!readOnly && <Button onClick={save} disabled={busy} data-testid="vn-adlinks-save" className="bg-indigo-600 hover:bg-indigo-700 text-white">{busy ? 'Đang lưu…' : 'Lưu'}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
export default AdLinksModal;
