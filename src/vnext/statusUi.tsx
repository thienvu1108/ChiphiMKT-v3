import React from 'react';
import { ST_META, ST5_ORDER, type St5 } from '../../lib/vnext/status';

const fmtVnd = (n: number) => (Number(n) || 0).toLocaleString('vi-VN');
/** Badge trạng thái DUY NHẤT (màu theo ST_META). */
export function StatusBadge({ status, title, small, label }: { status: St5 | 'locked' | 'deleted'; title?: string; small?: boolean; label?: string }) {
  const m = ST_META[status] || ST_META.pending;
  return <span data-testid="vn-support-status" data-st={status} title={title}
    className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${small ? 'px-1.5 py-0 text-[10.5px]' : 'px-2 py-0.5 text-[11.5px]'}`}
    style={{ color: m.fg, background: m.bg, borderColor: m.border }}>{label || m.label}</span>;
}
type Split = { total: number } & Partial<Record<St5, { n: number; amount: number }>>;
/** Ô tổng DÙNG CHUNG mọi màn: Tổng + 5 trạng thái (số khoản + tiền); bấm để lọc. */
export function SummaryBox({ split, onPick, active, testId }: { split: Split; onPick?: (s: St5 | '') => void; active?: string; testId?: string }) {
  const n = ST5_ORDER.reduce((a, k) => a + (split[k]?.n || 0), 0);
  const cell = (key: St5 | '', label: string, cnt: number, amount: number, m?: { fg: string; bg: string; border: string }) => (
    <button type="button" key={key || 'all'} onClick={() => onPick?.(active === key ? '' : key)} disabled={!onPick}
      className={`text-left rounded-xl border px-3 py-2 min-w-0 ${onPick ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'} ${active === key && key ? 'ring-2 ring-offset-1' : ''}`}
      style={{ background: m?.bg || '#fff', borderColor: m?.border || 'var(--mh-border)', color: m?.fg || 'var(--mh-text)' }} data-testid={`vn-sum-${key || 'total'}`} data-n={cnt} data-amount={amount}>
      <div className="text-[11px] font-semibold truncate opacity-90">{label} ({cnt})</div>
      <div className="text-[13.5px] sm:text-[15px] lg:text-[16px] font-bold tabular-nums leading-tight [overflow-wrap:anywhere]">{fmtVnd(amount)} <span className="text-[11px] font-normal">đ</span></div>
    </button>);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-testid={testId || 'vn-status-split'} data-total={split.total}
      {...Object.fromEntries(ST5_ORDER.map((k) => [`data-${k.replace('_', '')}`, split[k]?.amount || 0]))}>
      {cell('', 'Tổng đăng ký', n, split.total)}
      {ST5_ORDER.map((k) => cell(k, ST_META[k].label, split[k]?.n || 0, split[k]?.amount || 0, ST_META[k]))}
    </div>);
}

/** Bảng / Thẻ: nhớ theo người dùng (localStorage), mặc định Thẻ trên điện thoại, Bảng trên máy tính. */
export function useViewMode(key: string, uid: string): ['table' | 'card', (m: 'table' | 'card') => void] {
  const k = `vnView:${uid}:${key}`;
  const def = () => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'card' : 'table');
  const [m, setM] = React.useState<'table' | 'card'>(() => { try { const v = localStorage.getItem(k); if (v === 'table' || v === 'card') return v; } catch { /* */ } return def(); });
  const [mobile, setMobile] = React.useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  React.useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  // Mobile always cards — no horizontal table scroll; desktop respects user toggle.
  const effective: 'table' | 'card' = mobile ? 'card' : m;
  return [effective, (v) => { setM(v); try { localStorage.setItem(k, v); } catch { /* */ } }];
}
export function ViewToggle({ mode, onChange }: { mode: 'table' | 'card'; onChange: (m: 'table' | 'card') => void }) {
  const b = (v: 'table' | 'card', l: string) => <button type="button" onClick={() => onChange(v)} data-testid={`vn-view-${v}`} aria-pressed={mode === v}
    className={`px-2.5 h-7 min-h-7 text-[12px] font-semibold cursor-pointer ${mode === v ? 'bg-[var(--mh-navy,var(--mh-navy))] text-white' : 'bg-[var(--mh-surface,#fff)] text-[var(--mh-text-2,var(--mh-text-2))]'}`}>{l}</button>;
  // Hide on mobile — cards are forced there.
  return <div className="hidden md:inline-flex rounded-lg border border-[var(--mh-border,var(--mh-border))] overflow-hidden" data-testid="vn-view-toggle" data-mode={mode}>{b('table', '☰ Bảng')}{b('card', '▦ Thẻ')}</div>;
}
