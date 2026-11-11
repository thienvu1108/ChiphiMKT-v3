import React, { useEffect, useState } from 'react';
import type { AmountLine } from '../../lib/amountLines';
import { sumLines } from '../../lib/amountLines';

const fmt = (n: number) => (Number(n) || 0).toLocaleString('vi-VN');

/** Popup nhập nhiều số tiền + ghi chú; tự cộng tổng. Dùng cho ô công thức NT và Tiền trên Hóa đơn. */
export function AmountLinesEditor({
  open, title, initial, onClose, onSave, readOnly,
}: {
  open: boolean; title: string; initial: AmountLine[]; onClose: () => void;
  onSave?: (lines: AmountLine[]) => void; readOnly?: boolean;
}) {
  const [lines, setLines] = useState<AmountLine[]>([{ amount: 0, note: '' }]);
  const wasOpen = React.useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setLines(initial?.length ? initial.map((x) => ({ amount: Number(x.amount) || 0, note: String(x.note || '') })) : [{ amount: 0, note: '' }]);
    }
    wasOpen.current = open;
  }, [open, initial]);
  if (!open) return null;
  const total = sumLines(lines);
  const set = (i: number, patch: Partial<AmountLine>) => setLines((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const add = () => setLines((xs) => [...xs, { amount: 0, note: '' }]);
  const rm = (i: number) => setLines((xs) => (xs.length <= 1 ? [{ amount: 0, note: '' }] : xs.filter((_, k) => k !== i)));
  return (
    <div className="fixed inset-0 z-[1400] bg-black/40 flex items-end md:items-center justify-center p-0 md:p-6" data-testid="vn-amount-lines" onClick={onClose}>
      <div className="bg-[var(--mh-surface)] w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[min(92dvh,100%)] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="h-14 shrink-0 px-4 flex items-center border-b border-[var(--mh-border)] gap-2">
          <div className="font-semibold text-[14px] flex-1 truncate">{title}</div>
          <button type="button" className="h-8 w-8 grid place-items-center rounded-lg hover:bg-[var(--mh-surface-2)]" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2 flex-1">
          {lines.map((ln, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.2fr_auto] gap-2 items-start" data-testid="vn-amount-line">
              <div>
                <div className="text-[10px] text-[var(--mh-text-3)] mb-0.5">Số tiền</div>
                <input type="text" inputMode="numeric" disabled={readOnly}
                  className="w-full h-9 px-2 rounded-lg border border-[var(--mh-border)] text-[13px] font-mono tabular-nums bg-[var(--mh-surface)] disabled:opacity-70"
                  value={ln.amount ? fmt(ln.amount) : ''}
                  onChange={(e) => set(i, { amount: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0 })}
                  placeholder="0" />
              </div>
              <div>
                <div className="text-[10px] text-[var(--mh-text-3)] mb-0.5">Ghi chú</div>
                <input type="text" disabled={readOnly}
                  className="w-full h-9 px-2 rounded-lg border border-[var(--mh-border)] text-[13px] bg-[var(--mh-surface)] disabled:opacity-70"
                  value={ln.note} onChange={(e) => set(i, { note: e.target.value })} placeholder="VD: HĐ tháng 10" maxLength={120} />
              </div>
              {!readOnly && <button type="button" className="mt-5 h-9 px-2 text-[12px] text-[var(--mh-err)] border border-[var(--mh-border)] rounded-lg" onClick={() => rm(i)} aria-label="Xoá dòng">Xoá</button>}
            </div>
          ))}
          {!readOnly && <button type="button" className="text-[12px] font-semibold text-[var(--mh-navy)]" onClick={add} data-testid="vn-amount-add">+ Thêm dòng</button>}
        </div>
        <div className="shrink-0 border-t border-[var(--mh-border)] p-3 flex items-center gap-2">
          <div className="flex-1 text-[13px]">Tổng: <b className="font-mono tabular-nums" data-testid="vn-amount-total">{fmt(total)} đ</b></div>
          <button type="button" className="h-9 px-3 rounded-lg border border-[var(--mh-border)] text-[13px]" onClick={onClose}>{readOnly ? 'Đóng' : 'Huỷ'}</button>
          {!readOnly && onSave && <button type="button" className="h-9 px-3 rounded-lg bg-[var(--mh-navy)] text-white text-[13px] font-semibold" data-testid="vn-amount-save"
            onClick={() => onSave(lines.filter((x) => Number(x.amount) || (x.note || '').trim()))}>Lưu</button>}
        </div>
      </div>
    </div>
  );
}

/** Ô hiển thị tổng; bấm mở chi tiết / sửa. */
export function AmountCellButton({ total, hasDetail, onClick, className, testId }: {
  total: number; hasDetail?: boolean; onClick: () => void; className?: string; testId?: string;
}) {
  return (
    <button type="button" onClick={onClick} data-testid={testId || 'vn-amount-cell'}
      className={`w-full text-right font-mono text-[11px] tabular-nums px-1 py-0.5 rounded hover:ring-1 hover:ring-[var(--mh-navy)] ${hasDetail ? 'underline decoration-dotted' : ''} ${className || ''}`}
      title={hasDetail ? 'Xem / sửa chi tiết từng khoản' : 'Nhập chi tiết'}>
      {total ? fmt(total) : '—'}
    </button>
  );
}
