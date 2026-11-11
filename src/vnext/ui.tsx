import { createPortal } from 'react-dom';
import { friendlyError } from '../../lib/vnext/platform';
import React from 'react';
import { matchVi, normVi, sortOptionsVi } from '../lib/viSearch';

export const C = { navy: 'var(--mh-navy)', orange: 'var(--mh-accent)', ink: 'var(--mh-text)', mute: 'var(--mh-text-2)', line: 'var(--mh-border)', bg: 'var(--mh-bg)', ok: 'var(--mh-ok)', err: 'var(--mh-err)', warn: 'var(--mh-warn)', pending: '#7C3AED', draft: '#64748B' };

export const fmt = (v: any) => (Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString('vi-VN') : '0');
export const fmtM = (v: any) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
  return fmt(n);
};
export const parseMoney = (s: string) => Number(String(s || '').replace(/[^\d-]/g, '')) || 0;
export const vnTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function Card({ children, className = '', ...rest }: any) {
  return <div className={`mh-card bg-[var(--mh-surface,#fff)] border border-[var(--mh-border,var(--mh-border))] rounded-xl ${className}`} {...rest}>{children}</div>;
}
export function Btn({ children, primary, danger, small, className = '', ...rest }: any) {
  const base = small ? 'h-8 min-h-8 px-2.5 text-[12px] md:min-h-8' : 'h-11 min-h-11 md:h-9 md:min-h-9 px-3.5 text-[13px]';
  const tone = primary ? 'bg-[var(--mh-navy,var(--mh-navy))] text-white hover:bg-[var(--mh-navy-hover,var(--mh-navy-hover))]' : danger ? 'bg-[var(--mh-surface,#fff)] border border-red-200 text-[var(--mh-err,var(--mh-err))] hover:bg-[var(--mh-err-soft,#FCEBEA)]' : 'bg-[var(--mh-surface,#fff)] border border-[var(--mh-border,var(--mh-border))] text-[var(--mh-text,var(--mh-text))] hover:bg-[var(--mh-surface-2,var(--mh-surface-2))]';
  return <button type="button" className={`${base} rounded-lg font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ${tone} ${className}`} {...rest}>{children}</button>;
}
export function Badge({ c = 'mute', children, title }: any) {
  const m: any = {
    ok: 'mh-badge-ok bg-[var(--mh-ok-soft,#E7F5EF)] text-[var(--mh-ok,var(--mh-ok))]',
    warn: 'mh-badge-warn bg-[var(--mh-warn-soft,#FEF3E2)] text-[var(--mh-warn,var(--mh-warn))]',
    err: 'mh-badge-err bg-[var(--mh-err-soft,#FCEBEA)] text-[var(--mh-err,var(--mh-err))]',
    info: 'bg-[var(--mh-navy-50,var(--mh-navy-50))] text-[var(--mh-navy,var(--mh-navy))]',
    mute: 'mh-badge-draft bg-[var(--mh-draft-soft,#F1F5F9)] text-[var(--mh-draft,#64748B)]',
    pending: 'mh-badge-pending bg-[var(--mh-pending-soft,#F3E8FF)] text-[var(--mh-pending,#7C3AED)]',
    draft: 'mh-badge-draft bg-[var(--mh-draft-soft,#F1F5F9)] text-[var(--mh-draft,#64748B)]',
    new: 'bg-[var(--mh-accent,var(--mh-accent))] text-white',
  };
  return <span title={title} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap border border-transparent ${m[c] || m.mute}`}>{children}</span>;
}
export const Th = ({ children, r, className = '' }: any) => <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--mh-text-2,var(--mh-text-2))] bg-[var(--mh-surface-2,var(--mh-bg))] border-b border-[var(--mh-border,var(--mh-border))] ${r ? 'text-right' : 'text-left'} ${className}`}>{children}</th>;
export const Td = ({ children, r, label, className = '', ...rest }: any) => <td data-label={label || undefined} className={`px-3 py-2 text-[13px] border-b border-[var(--mh-border)] ${r ? 'text-right tabular-nums' : ''} ${className}`} {...rest}>{children}</td>;

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; badge?: any; hidden?: boolean }[]; value: string; onChange: (id: string) => void }) {
  const list = tabs.filter((t) => !t.hidden);
  const cols = list.length <= 2 ? 2 : 3;
  return (
    <div
      role="tablist"
      className={cols === 2
        ? 'grid grid-cols-2 gap-1.5 p-1.5 md:flex md:gap-1 md:p-0 md:border-b md:border-[var(--mh-border,var(--mh-border))] rounded-xl md:rounded-none bg-[var(--mh-surface-2,var(--mh-surface-2))] md:bg-transparent'
        : 'grid grid-cols-3 gap-1.5 p-1.5 md:flex md:gap-1 md:p-0 md:border-b md:border-[var(--mh-border,var(--mh-border))] rounded-xl md:rounded-none bg-[var(--mh-surface-2,var(--mh-surface-2))] md:bg-transparent'}
    >
      {list.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}
          className={`min-h-11 md:min-h-0 md:h-auto px-2.5 md:px-3.5 py-2 md:py-2.5 text-[12px] md:text-[13px] rounded-lg md:rounded-none md:-mb-px md:border-b-2 flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation text-center ${
            t.id === value
              ? 'bg-[var(--mh-navy,var(--mh-navy))] text-white font-semibold md:bg-transparent md:text-[var(--mh-navy,var(--mh-navy))] md:border-[var(--mh-navy,var(--mh-navy))]'
              : 'bg-[var(--mh-surface,#fff)] text-[var(--mh-text-2,var(--mh-text-2))] border border-[var(--mh-border,var(--mh-border))] md:border-0 md:border-b-2 md:border-transparent hover:text-[var(--mh-text,var(--mh-text))]'
          }`}>
          <span className="truncate">{t.label}</span>
          {t.badge != null && t.badge !== '' && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${t.id === value ? 'bg-[var(--mh-surface)]/25 text-white md:bg-[var(--mh-surface-2)] md:text-[var(--mh-text-2)]' : 'bg-[var(--mh-draft-soft,#F1F5F9)] text-[var(--mh-text-2,var(--mh-text-2))]'}`}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}


/** Mobile filter launcher → bottom sheet (desktop: inline children). */
export function FilterSheet({ label = 'Bộ lọc', children, activeCount = 0 }: { label?: string; children: React.ReactNode; activeCount?: number }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div className="hidden md:contents">{children}</div>
      <div className="md:hidden">
        <Btn type="button" onClick={() => setOpen(true)} data-testid="vn-filter-sheet-open" className="min-h-11 w-full justify-center">
          {label}{activeCount > 0 ? ` (${activeCount})` : ''}
        </Btn>
      </div>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[1190] bg-black/40" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label={label} data-testid="vn-filter-sheet"
            className="fixed inset-x-0 bottom-0 z-[1200] max-h-[min(75dvh,100%)] overflow-y-auto overscroll-contain rounded-t-2xl bg-[var(--mh-surface,#fff)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--mh-border-strong,#C9D4E5)]" />
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-[15px] font-bold">{label}</div>
              <Btn small onClick={() => setOpen(false)} data-testid="vn-filter-sheet-close">Đóng</Btn>
            </div>
            <div className="grid grid-cols-1 gap-3">{children}</div>
            <Btn primary className="mt-4 w-full min-h-11 justify-center" onClick={() => setOpen(false)}>Áp dụng</Btn>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** Sticky bottom CTA bar for forms on mobile (above bottom nav). */
export function StickyFormBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:static sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 -mx-1 mt-3 border-t border-[var(--mh-border,var(--mh-border))] bg-[var(--mh-surface,#fff)]/95 px-2 py-2 backdrop-blur md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">{children}</div>
    </div>
  );
}
export function Field({ label, children, className = '' }: any) {
  return <label className={`block ${className}`}><div className="text-[11px] text-[var(--mh-text-2)] mb-1">{label}</div>{children}</label>;
}
export function Select({ value, onChange, options, className = '', ...rest }: any) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-11 md:h-9 px-2.5 rounded-lg border border-[var(--mh-border,var(--mh-border))] bg-[var(--mh-surface,#fff)] text-[13px] min-w-0 ${className}`} {...rest}>
      {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Combobox dùng chung: sắp A-Z tiếng Việt + tìm không dấu ('vinh' khớp 'Vĩnh'); mobile = bottom sheet.
 *  Giữ một <select> ẩn (sr-only) cùng data-testid để form/kiểm thử cũ vẫn chạy. */
export function SearchSelect({ value, onChange, options, className = '', disabled, sort = true, placeholder = '— Chọn —', searchPlaceholder = 'Gõ để tìm (không cần dấu)…', ...rest }: any) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  // Perf: sort + normalize only while open (pickers render per table row; options is often a new array each render).
  const opts = React.useMemo(() => (!open ? options || [] : (sort ? sortOptionsVi(options || []) : options || []).map((o: any) => ({ ...o, _n: normVi(`${o.label} ${o.value}`) }))), [open, options, sort]);
  const dq = React.useDeferredValue(q);
  const [hi, setHi] = React.useState(0);
  const wrap = React.useRef<HTMLDivElement>(null);
  const inp = React.useRef<HTMLInputElement>(null);
  const [mobile, setMobile] = React.useState(false);
  const list = React.useMemo(() => { if (!open) return []; const ws = normVi(dq).split(' ').filter(Boolean); return ws.length ? opts.filter((o: any) => ws.every((w) => o._n.includes(w))) : opts; }, [open, opts, dq]);
  const cur = opts.find((o: any) => String(o.value) === String(value ?? ''));
  React.useEffect(() => {
    if (!open) { setQ(''); return; }
    setMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    setHi(Math.max(0, list.findIndex((o: any) => String(o.value) === String(value ?? ''))));
    const t = setTimeout(() => inp.current?.focus(), 30);
    const out = (e: any) => { if (wrap.current && !wrap.current.contains(e.target) && !(e.target as HTMLElement)?.closest?.('[data-vn-ss-sheet]')) setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('touchstart', out);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', out); document.removeEventListener('touchstart', out); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const pick = (o: any) => { if (o?.disabled) return; onChange(o.value); setOpen(false); };
  const onKey = (e: any) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (list[hi]) pick(list[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const panel = (
    <div data-vn-ss-sheet className={mobile ? 'fixed inset-x-0 bottom-0 z-[1200] bg-[var(--mh-surface)] rounded-t-2xl shadow-2xl p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[min(75dvh,100%)] flex flex-col' : 'absolute left-0 top-full mt-1 z-[1150] w-full min-w-[240px] bg-[var(--mh-surface)] border border-[var(--mh-border)] rounded-lg shadow-xl p-2 flex flex-col max-h-80'} role="dialog" aria-label="Chọn">
      {mobile && <div className="flex items-center justify-between mb-2"><span className="text-[14px] font-semibold">{rest['aria-label'] || 'Chọn'}</span><button type="button" className="text-[13px] text-[var(--mh-navy)] px-2 py-1" onClick={() => setOpen(false)}>Đóng</button></div>}
      <input ref={inp} data-testid="vn-ss-search" value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey} placeholder={searchPlaceholder} className={`${mobile ? 'h-11 text-[15px]' : 'h-9 text-[13px]'} px-2.5 rounded-lg border border-[var(--mh-border)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--mh-navy)]/30`} />
      <ul role="listbox" className="mt-1 overflow-y-auto flex-1">
        {list.length === 0 && <li className="px-2.5 py-2 text-[13px] text-[var(--mh-text-2)]">Không tìm thấy</li>}
        {list.slice(0, 300).map((o: any, i: number) => (
          <li key={String(o.value)} role="option" aria-selected={String(o.value) === String(value ?? '')} aria-disabled={o.disabled ? true : undefined} data-value={o.value}
            onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setHi(i)}
            className={`px-2.5 ${mobile ? 'py-3 text-[15px]' : 'py-1.5 text-[13px]'} rounded-md ${o.disabled ? 'cursor-not-allowed text-[#A0AEC0]' : 'cursor-pointer'} ${i === hi && !o.disabled ? 'bg-[var(--mh-navy-50)]' : ''} ${String(o.value) === String(value ?? '') ? 'font-semibold text-[var(--mh-navy)]' : ''}`}>{o.label}</li>
        ))}
      </ul>
    </div>
  );
  return (
    <div ref={wrap} className={`relative min-w-0 ${className}`}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} tabIndex={-1} aria-hidden className="absolute inset-0 w-px h-px opacity-0 pointer-events-none" {...rest}>
        {opts.map((o: any) => <option key={String(o.value)} value={o.value} disabled={!!o.disabled}>{o.label}</option>)}
      </select>
      <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} data-testid={rest['data-testid'] ? `${rest['data-testid']}-combo` : 'vn-ss'} onClick={() => setOpen((v) => !v)}
        className="h-11 md:h-9 w-full px-2.5 rounded-lg border border-[var(--mh-border,var(--mh-border))] bg-[var(--mh-surface,#fff)] text-[13px] text-left flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
        <span className={`truncate flex-1 ${cur ? '' : 'text-[var(--mh-text-2)]'}`}>{cur ? cur.label : placeholder}</span>
        <span className="text-[var(--mh-text-2)] text-[10px]">▼</span>
      </button>
      {open && (mobile ? createPortal(<><div className="fixed inset-0 bg-black/30 z-[1190]" onClick={() => setOpen(false)} />{panel}</>, document.body) : panel)}
    </div>
  );
}
export function Input({ className = '', ...rest }: any) {
  return <input className={`h-9 px-2.5 rounded-lg border border-[var(--mh-border)] bg-[var(--mh-surface)] text-[13px] w-full min-w-0 focus:outline-none focus:ring-2 focus:ring-[var(--mh-navy)]/30 ${className}`} {...rest} />;
}
export function MoneyInput({ value, onChange, className = '', ...rest }: any) {
  return <Input inputMode="numeric" className={`text-right tabular-nums ${className}`} value={value ? fmt(value) : ''} onChange={(e: any) => onChange(parseMoney(e.target.value))} placeholder="0" {...rest} />;
}

export function Shell({ title, sub, actions, children, banner }: any) {
  return (
    <div className="space-y-4 font-['Be_Vietnam_Pro',sans-serif] text-[var(--mh-text)]">
      {banner}
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">{title}</h1>
          {sub && <div className="text-[13px] text-[var(--mh-text-2)] mt-0.5">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * Full-screen overlay portaled to document.body so overflow/transform ancestors
 * (tables with overflow-x-auto, sticky cells, etc.) cannot clip it under the fixed bottom nav.
 */
export function Overlay({
  children,
  className = '',
  onBackdrop,
  testId,
  lockScroll = true,
  zClass = 'z-[1200]',
}: {
  children: React.ReactNode;
  className?: string;
  onBackdrop?: () => void;
  testId?: string;
  lockScroll?: boolean;
  zClass?: string;
}) {
  React.useEffect(() => {
    if (!lockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lockScroll]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className={`fixed inset-0 ${zClass} ${className}`}
      onClick={onBackdrop}
      data-testid={testId}
      role="presentation"
    >
      {children}
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: any) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Mobile: portal + bottom sheet (100vw, ≤ 92dvh), internal scroll, sticky footer with safe-area — above bottom-nav.
  return (
    <Overlay
      className="bg-black/40 flex items-end md:items-center justify-center p-0 md:p-6 overflow-hidden"
      onBackdrop={onClose}
      testId="vn-modal-backdrop"
      zClass="z-[1200]"
    >
      <div
        className={`bg-[var(--mh-surface)] w-full max-w-[100vw] left-0 right-0 ${wide ? 'md:max-w-3xl' : 'md:max-w-lg'} rounded-t-2xl md:rounded-2xl max-h-[min(92dvh,100%)] flex flex-col min-w-0 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="vn-modal"
      >
        <div className="h-14 shrink-0 px-5 flex items-center border-b border-[var(--mh-border)]">
          <div className="flex-1 min-w-0 truncate font-semibold">{title}</div>
          <button type="button" onClick={onClose} className="text-[var(--mh-text-2)] text-xl shrink-0" aria-label="Đóng">×</button>
        </div>
        <div className="p-5 overflow-y-auto overflow-x-auto flex-1 min-h-0 overscroll-contain">{children}</div>
        {footer && (
          <div
            className="shrink-0 bg-[var(--mh-surface)] rounded-b-none md:rounded-b-2xl px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[var(--mh-border)] flex flex-wrap justify-end gap-2"
            data-testid="vn-modal-footer"
          >
            {footer}
          </div>
        )}
      </div>
    </Overlay>
  );
}

export function Kpi({ label, value, hint, tone }: any) {
  return (
    <Card className="p-3.5">
      <div className="text-[12px] text-[var(--mh-text-2)]">{label}</div>
      <div className={`text-lg md:text-xl font-bold mt-1 ${tone === 'err' ? 'text-[var(--mh-err)]' : tone === 'ok' ? 'text-[var(--mh-ok)]' : ''}`}>{value}</div>
      {hint && <div className="text-[11px] text-[var(--mh-text-3)] mt-0.5">{hint}</div>}
    </Card>
  );
}

export function Empty({ children }: any) {
  return <div className="text-center text-[13px] text-[var(--mh-text-3)] py-10">{children}</div>;
}

export function Pct({ pct, over }: { pct: number | null; over?: boolean }) {
  if (pct == null) return <span className="text-[var(--mh-text-3)]">—</span>;
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded bg-[var(--mh-surface-2)] overflow-hidden hidden sm:block"><div className={`h-full ${over ? 'bg-[var(--mh-err)]' : pct >= 80 ? 'bg-amber-500' : 'bg-[var(--mh-ok)]'}`} style={{ width: `${w}%` }} /></div>
      <span className={`tabular-nums ${over ? 'text-[var(--mh-err)] font-semibold' : ''}`}>{pct.toLocaleString('vi-VN')}%</span>
    </div>
  );
}

/** Toast; lỗi (c='err') tự đổi mã kỹ thuật (permission-denied, unavailable…) sang câu tiếng Việt + bước tiếp; lỗi mạng có nút «Thử lại» nếu truyền retry. */
export function toFriendly(t: any): { text: string; retry: boolean } {
  if (t && typeof t === 'object') { const f = friendlyError(t); return { text: `${f.title} ${f.next}`, retry: f.retry }; }
  const s = String(t || '');
  const m = s.match(/(permission-denied|unavailable|unauthenticated|not-found|already-exists|resource-exhausted|deadline-exceeded|invalid-argument|failed-precondition|Failed to fetch|network[^\s]*|Missing or insufficient permissions)/i);
  if (!m) return { text: s, retry: false };
  const f = friendlyError({ code: m[1], message: m[1] });
  const ctx = s.slice(0, s.indexOf(m[1])).replace(/[\s:—-]+$/, '').replace(/^Lỗi$/i, '');
  return { text: `${ctx ? ctx + ' — ' : ''}${f.title} ${f.next}`, retry: f.retry };
}
export function useToast() {
  const [msg, setMsg] = React.useState<{ t: string; c: string; retry?: () => void } | null>(null);
  React.useEffect(() => { if (!msg) return; const h = setTimeout(() => setMsg(null), msg.c === 'err' ? 7000 : 3500); return () => clearTimeout(h); }, [msg]);
  const node = msg ? createPortal(<div role="status" data-testid="vn-toast" className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[1100] max-w-[92vw] px-4 py-2.5 rounded-lg text-[13px] text-white shadow-lg flex items-center gap-3 ${msg.c === 'err' ? 'bg-[var(--mh-err)]' : 'bg-[var(--mh-text)]'}`}><span>{msg.t}</span>{msg.retry && <button type="button" data-testid="vn-toast-retry" className="shrink-0 rounded-md bg-[var(--mh-surface)]/20 px-2 py-1 font-semibold" onClick={() => { const r = msg.retry; setMsg(null); r?.(); }}>Thử lại</button>}</div>, document.body) : null;
  return {
    toast: (t: any, c = 'ok', retry?: () => void) => {
      if (c !== 'err') return setMsg({ t: String(t), c });
      const f = toFriendly(t); setMsg({ t: f.text, c, retry: f.retry ? retry : undefined });
    }, node,
  };
}
