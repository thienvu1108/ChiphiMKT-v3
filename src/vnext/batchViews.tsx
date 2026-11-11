/** Batch 24/10: chuông thông báo, tìm kiếm nhanh, trang chủ theo vai trò, khoá theo ngày, nhật ký lỗi, thống kê sử dụng. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, doc, onSnapshot, query, where, orderBy, limit, updateDoc, writeBatch, setDoc, getDocs, addDoc, increment, Timestamp, type Firestore } from 'firebase/firestore';
import { type VCtx, vnCan, isAdm, canViewAll, isKhoiMgr, gdkdTeams, blockName, teamName, projectName, useNsLines, uidOf } from './ctx';
import { Card, Btn, Th, Td, Field, Input, Empty, fmt, vnTime, useToast, Shell, Select } from './ui';
import { SummaryBox, StatusBadge } from './statusUi';
import { useSupport, useKhoiTodo, useMyPayGate } from './SupportViews';
import { kycRequired } from '../../lib/vnext/onboarding';
import { isBanKdLeader, isBanKdDeputy } from '../lib/orgPermissions';
import { usePayMap } from './payStatus';
import { useLocks } from './locks';
import { defaultPeriod } from './PeriodPicker';
import { periodLabel } from '../../lib/vnext/period';
import { adaptNs, summarize, aggregate, ST_META, type URow } from '../../lib/vnext/status';
import { OPEN_LABEL, APPLY_LABEL, normOpen, compileOpenWin, openNext, lockRecToOpen, pastOpenConflicts, fmtVnEnd, type OpenCfg } from '../../lib/vnext/platform';
import { classifyClientError, dedupeOk } from '../lib/clientErrorFilter';
import { LOCK_LABEL, activeLock, lockUntilText, vnLocalToMs, msToVnLocal, scrubMsg, deviceOf, browserOf, errGroupKey, isSpike, vnDay, type LockKind, type LockRange, type RecLock, type Locks, compileLockWin, compilePastWin, pastLockAt, PAST_LABEL, type PastLock, type PastKind, recNext, idxToYm, ymToIdx } from '../../lib/vnext/platform';
import { matchVi } from '../lib/viSearch';
import { FOCUS_KEY } from './notify';

export type GoFn = (path: string, focusId?: string) => void;
type Item = { id: string; type: string; title: string; body?: string; link?: string; createdAt?: string; read?: boolean; derived?: boolean };
const TYPE_ICON: Record<string, string> = { approved: '✅', rejected: '⛔', need_pay: '💳', pending: '🕒', reapproval: '🔁', member: '👤', ban_change: '🏷️', payout: '💰', data_error: '⚠️', error_spike: '🚨' };
const isStaff = (r: string) => ['user', 'gdkd', 'gdda', 'assistant'].includes(r);

// ---------------------------------------------------------------- Thông báo suy ra (luôn đúng theo dữ liệu)
export function useDerivedNotifs(c: VCtx | null, memberPending: number): Item[] {
  const on = !!c?.uid;
  const khoi = !!c && isKhoiMgr(c);
  const todo = useKhoiTodo(c as VCtx, on && khoi);
  const gate = useMyPayGate(c as VCtx, on);
  const adm = !!c && isAdm(c);
  const acct = c?.role === 'accountant';
  const period = c ? defaultPeriod(c.settings) : '';
  const { lines } = useNsLines(c as VCtx, on && (adm || acct) ? [period] : [], 'all');
  const sup = useSupport(c as VCtx, on && acct ? [period] : []);
  const pay = usePayMap(c?.db, on && acct);
  const errs = useRecentErrors(c, on && adm);
  return useMemo(() => {
    if (!c) return [];
    const o: Item[] = [];
    if (gate.rows.length) o.push({ id: 'd:needpay:' + gate.rows.length, type: 'need_pay', title: `${gate.rows.length} khoản NS chờ cập nhật STK nhận tiền`, body: 'Cập nhật thông tin thanh toán để khoản được duyệt / tính là đã duyệt.', link: '#kyc', derived: true });
    if (khoi && todo.pending.n) o.push({ id: `d:pending:${todo.pending.n}:${todo.pending.amount}`, type: 'pending', title: `${todo.pending.n} khoản NS Chờ duyệt · ${fmt(todo.pending.amount)} đ`, link: '/quan-ly-khoi', derived: true });
    if (khoi && todo.reapproval.n) o.push({ id: `d:re:${todo.reapproval.n}:${todo.reapproval.amount}`, type: 'reapproval', title: `${todo.reapproval.n} khoản Cần duyệt lại · ${fmt(todo.reapproval.amount)} đ`, link: '/quan-ly-khoi', derived: true });
    if ((khoi || adm) && memberPending) o.push({ id: 'd:member:' + memberPending, type: 'member', title: `${memberPending} thành viên chờ duyệt`, link: adm ? '/duyet-tai-khoan' : '/quan-ly-khoi', derived: true });
    if (acct) {
      const rows = adaptNs(lines, sup as any, pay, c.projects).filter((r) => r.period === period && r.status === 'approved');
      if (rows.length) o.push({ id: `d:payout:${period}:${rows.length}`, type: 'payout', title: `${rows.length} khoản Đã duyệt chờ chi trả · ${fmt(rows.reduce((a, r) => a + r.amount, 0))} đ`, body: periodLabel(period), link: '/quan-ly-khoi', derived: true });
    }
    if (adm) {
      const bad = lines.filter((l: any) => !l.deleted && l.kind === 'user' && (!l.teamId || !l.blockId)).length;
      if (bad) o.push({ id: `d:data:${bad}`, type: 'data_error', title: `${bad} dòng NS ${periodLabel(period)} thiếu Phòng / Khối`, link: '/ngan-sach-khoi', derived: true });
      if (errs.day) o.push({ id: `d:err:${vnDay()}:${Math.floor(errs.day / 10)}`, type: 'data_error', title: `${errs.day} lỗi phía người dùng trong 24 giờ`, link: '/nhat-ky-loi', derived: true });
      if (c.role === 'super_admin' && errs.spike) o.push({ id: `d:spike:${new Date().toISOString().slice(0, 13)}`, type: 'error_spike', title: `Lỗi tăng đột biến: ${errs.hour} lỗi / 60 phút`, link: '/nhat-ky-loi', derived: true });
    }
    return o;
  }, [c, gate.rows.length, khoi, todo, memberPending, acct, adm, lines, sup, pay, period, errs]);
}
function useRecentErrors(c: VCtx | null, enabled: boolean) {
  const [t, setT] = useState<number[]>([]);
  useEffect(() => {
    if (!c || !enabled) return;
    const since = new Date(Date.now() - 864e5).toISOString();
    return onSnapshot(query(collection(c.db, 'errorLogs'), where('at', '>=', since)), (s) => setT(s.docs.map((d) => Date.parse(String(d.data().at)) || 0)), () => setT([]));
  }, [c?.db, enabled]);
  return useMemo(() => ({ day: t.length, hour: t.filter((x) => Date.now() - x < 3600e3).length, spike: isSpike(t) }), [t]);
}

// ---------------------------------------------------------------- Chuông
export function NotificationBell({ c, memberPending = 0, onGo }: { c: VCtx; memberPending?: number; onGo: GoFn }) {
  const derived = useDerivedNotifs(c, memberPending);
  const [stored, setStored] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const seenKey = `vnNotifSeen:${c.uid}`;
  const [seen, setSeen] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(seenKey) || '[]'); } catch { return []; } });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!c.uid) return;
    return onSnapshot(query(collection(c.db, 'userNotifs'), where('toUid', '==', c.uid)), (s) => setStored(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50)), () => setStored([]));
  }, [c.db, c.uid]);
  useEffect(() => { const h = (e: MouseEvent) => { if (open && ref.current && !ref.current.contains(e.target as any)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  const items = [...derived.map((d) => ({ ...d, read: seen.includes(d.id) })), ...stored];
  const unread = items.filter((i) => !i.read).length;
  // Có thể có 2 chuông (thanh trên máy tính + điện thoại): đồng bộ «đã đọc» giữa các bản.
  useEffect(() => { const h = () => { try { setSeen(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch { /* */ } }; window.addEventListener('vn-notif-seen', h); return () => window.removeEventListener('vn-notif-seen', h); }, [seenKey]);
  const markSeen = (ids: string[]) => { const n = [...new Set([...seen, ...ids])].slice(-200); setSeen(n); try { localStorage.setItem(seenKey, JSON.stringify(n)); } catch { /* */ } window.dispatchEvent(new Event('vn-notif-seen')); };
  const mark = async (i: Item) => {
    if (i.read) return;
    if (i.derived) return markSeen([i.id]);
    await updateDoc(doc(c.db, 'userNotifs', i.id), { read: true, readAt: new Date().toISOString() }).catch(() => {});
  };
  const markAll = async () => {
    markSeen(derived.map((d) => d.id));
    const b = writeBatch(c.db); let n = 0;
    for (const i of stored) if (!i.read) { b.update(doc(c.db, 'userNotifs', i.id), { read: true, readAt: new Date().toISOString() }); n++; }
    if (n) await b.commit().catch(() => {});
  };
  const go = (i: Item) => { mark(i); setOpen(false); if (i.link === '#kyc') window.dispatchEvent(new CustomEvent('vn-open-kyc')); else if (i.link) onGo(i.link, (i as any).refId); };
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className="relative h-9 w-9 grid place-items-center rounded-lg text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]" title="Thông báo" aria-label="Thông báo" data-testid="vn-bell">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span data-testid="vn-bell-count" className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--mh-err)] text-white text-[10px] font-bold grid place-items-center border-2 border-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="fixed md:absolute left-2 right-2 md:left-auto md:right-0 top-14 md:top-11 md:w-[380px] z-[300] bg-[var(--mh-surface)] rounded-xl border border-[var(--mh-border)] shadow-xl overflow-hidden" data-testid="vn-bell-panel">
          <div className="flex items-center px-4 h-11 border-b border-[var(--mh-border)]"><b className="flex-1 text-[14px]">Thông báo</b>{unread > 0 && <button className="text-[12px] text-[var(--mh-navy)] font-semibold" onClick={markAll} data-testid="vn-bell-readall">Đánh dấu đã đọc hết</button>}</div>
          <div className="max-h-[min(60dvh,100%)] overflow-y-auto overscroll-contain">
            {!items.length ? <div className="p-6 text-center text-[13px] text-[var(--mh-text-3)]">Không có thông báo</div> : items.map((i) => (
              <div key={i.id} className={`flex gap-2.5 px-4 py-2.5 border-b border-[#F0F3F7] cursor-pointer hover:bg-[#F8FAFC] ${i.read ? '' : 'bg-[#F3F7FF]'}`} onClick={() => go(i)} data-testid="vn-bell-item" data-read={i.read ? '1' : '0'} data-type={i.type}>
                <div className="text-[16px] leading-5">{TYPE_ICON[i.type] || '•'}</div>
                <div className="flex-1 min-w-0"><div className={`text-[13px] ${i.read ? '' : 'font-semibold'}`}>{i.title}</div>{i.body && <div className="text-[12px] text-[var(--mh-text-2)] line-clamp-2">{i.body}</div>}
                  <div className="text-[11px] text-[var(--mh-text-3)]">{i.derived ? 'Việc cần làm' : vnTime(i.createdAt)}</div></div>
                {!i.read && <button className="text-[11px] text-[var(--mh-navy)] self-start" onClick={(e) => { e.stopPropagation(); mark(i); }} data-testid="vn-bell-mark">Đã đọc</button>}
              </div>))}
          </div>
        </div>)}
    </div>);
}

// ---------------------------------------------------------------- Tìm kiếm nhanh (Ctrl+K)
type Hit = { group: string; label: string; sub?: string; path: string; key?: [string, string] };
export function searchScope(c: VCtx) {
  const all = canViewAll(c);
  const myTeams = new Set<string>(all ? c.teams.map((t) => t.id) : isKhoiMgr(c) ? c.teams.filter((t) => c.myBlockIds.includes(t.blockId)).map((t) => t.id) : c.role === 'gdkd' ? gdkdTeams(c) : [c.teamId].filter(Boolean));
  const users = all ? c.users : (isKhoiMgr(c) || c.role === 'gdkd') ? c.users.filter((u) => myTeams.has(u.teamId)) : [];
  const blocks = all ? c.blocks : c.blocks.filter((b) => c.myBlockIds.includes(b.id) || [...myTeams].some((t) => c.teams.find((x) => x.id === t)?.blockId === b.id));
  return { all, teams: c.teams.filter((t) => myTeams.has(t.id)), users: users.filter((u) => !u.mergedInto && !u.linkedToUid), blocks, bans: c.banKds, projects: c.projects.filter((p) => !p.deleted) };
}
export function searchAll(c: VCtx, q: string): Hit[] {
  if (q.trim().length < 2) return [];
  const s = searchScope(c); const o: Hit[] = [];
  const mgmtPath = s.all ? '/quan-ly-khoi' : isKhoiMgr(c) ? '/quan-ly-khoi' : '/quan-ly-phong-kd';
  for (const u of s.users) if (matchVi(`${u.fullName || ''} ${u.displayName || ''}`, q)) o.push({ group: 'Người', label: u.fullName || u.displayName || '—', sub: teamName(c, u.teamId), path: s.all && isAdm(c) ? '/users' : mgmtPath });
  for (const t of s.teams) if (matchVi(`${t.teamCode || ''} ${t.name || ''}`, q)) o.push({ group: 'Phòng', label: t.teamCode || t.name, sub: `${t.name !== t.teamCode ? t.name + ' · ' : ''}${blockName(c, t.blockId)}`, path: s.all && isAdm(c) ? '/team' : mgmtPath });
  for (const b of s.blocks) if (matchVi(b.name, q)) o.push({ group: 'Khối', label: b.name, path: s.all || isKhoiMgr(c) ? '/quan-ly-khoi' : '/quan-ly-phong-kd' });
  for (const b of s.bans) if (matchVi(b.name, q)) o.push({ group: 'Ban KD', label: b.name, path: s.all || c.myBanKdIds.includes(b.id) ? '/quan-ly-ban-kd' : '/thong-tin-ho-tro' });
  for (const p of s.projects) if (matchVi(`${p.name || ''} ${p.code || ''}`, q)) o.push({ group: 'Dự án', label: p.name, sub: p.banKdName || '', path: '/thong-tin-ho-tro', key: ['vnSupportInfoQ', p.name] });
  return o.slice(0, 60);
}
export function GlobalSearch({ c, open, onClose, onGo }: { c: VCtx; open: boolean; onClose: () => void; onGo: GoFn }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const hits = useMemo(() => searchAll(c, q), [c, q]);
  useEffect(() => { if (open) { setQ(''); setI(0); } }, [open]);
  if (!open) return null;
  const pick = (h: Hit) => { if (h.key) try { sessionStorage.setItem(h.key[0], h.key[1]); } catch { /* */ } onClose(); onGo(h.path); };
  const groups = [...new Set(hits.map((h) => h.group))];
  return createPortal(
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-start justify-center pt-[max(1rem,8vh)] px-2 pb-[env(safe-area-inset-bottom)] overflow-hidden" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[min(85dvh,100%)] bg-[var(--mh-surface)] rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tìm kiếm" data-testid="vn-search">
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Tìm người, mã Phòng, Khối, Ban, dự án…" data-testid="vn-search-input"
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(i + 1, hits.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(i - 1, 0)); } if (e.key === 'Enter' && hits[i]) pick(hits[i]); }}
          className="w-full h-12 px-4 text-[15px] border-b border-[var(--mh-border)] outline-none" />
        <div className="max-h-[min(60dvh,100%)] overflow-y-auto overscroll-contain">
          {q.trim().length < 2 ? <div className="p-5 text-[13px] text-[var(--mh-text-3)]">Gõ ít nhất 2 ký tự (không cần dấu). Chỉ hiện kết quả trong phạm vi bạn được xem.</div>
            : !hits.length ? <div className="p-5 text-[13px] text-[var(--mh-text-3)]" data-testid="vn-search-empty">Không tìm thấy trong phạm vi của bạn.</div>
            : groups.map((g) => <div key={g}><div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase text-[var(--mh-text-3)]">{g}</div>
              {hits.filter((h) => h.group === g).map((h) => { const idx = hits.indexOf(h); return <div key={g + idx} onClick={() => pick(h)} onMouseEnter={() => setI(idx)} data-testid="vn-search-hit" data-group={g}
                className={`px-4 py-2 cursor-pointer ${idx === i ? 'bg-[#EEF3FF]' : ''}`}><div className="text-[13px] font-medium">{h.label}</div>{h.sub && <div className="text-[11px] text-[var(--mh-text-2)]">{h.sub}</div>}</div>; })}</div>)}
        </div>
      </div>
    </div>, document.body);
}

// ---------------------------------------------------------------- Khoá theo ngày
export function LockBanner({ c, kinds = ['nsCreate', 'nsEdit', 'nt'] as LockKind[] }: { c: VCtx; kinds?: LockKind[] }) {
  const locks = useLocks(c.db);
  const [, tick] = useState(0);
  useEffect(() => { const h = setInterval(() => tick((x) => x + 1), 60e3); return () => clearInterval(h); }, []);
  const act = kinds.map((k) => ({ k, a: activeLock(locks, k) })).filter((x) => x.a);
  if (!act.length) return null;
  return <div className="rounded-xl border border-[#D5DCE5] bg-[var(--mh-surface-2)] px-4 py-2.5 text-[13px] text-[#334155] space-y-0.5" data-testid="vn-lock-banner">
    {act.map(({ k, a }) => <div key={k}>🔒 <b>{LOCK_LABEL[k]}</b>: {lockUntilText(a!.until)}{a!.period ? ` · tháng NS ${a!.period.slice(5)}/${a!.period.slice(0, 4)}` : ''}{c.role === 'super_admin' ? ' — bạn là Super Admin nên vẫn tạo/sửa được.' : ''}</div>)}
  </div>;
}
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const mins = (s: string) => { const x = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return x && Number(x[1]) < 24 && Number(x[2]) < 60 ? Number(x[1]) * 60 + Number(x[2]) : -1; };
function RecEditor({ k, d, can, onChange, parse }: { k: LockKind; d: any; can: boolean; onChange: (p: any) => void; parse: (d: any) => RecLock | string }) {
  const r = parse(d); const nx = typeof r === 'string' ? null : recNext({ ...r, on: true });
  const vn = (t: number) => { const x = new Date(t + 7 * 3600e3); const p = (n: number) => String(n).padStart(2, '0'); return `${p(x.getUTCHours())}:${p(x.getUTCMinutes())} ${p(x.getUTCDate())}/${p(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`; };
  return <div className="rounded-lg border border-[var(--mh-border)] p-2.5 space-y-2" data-testid={`vn-lock-rec-${k}`}>
    <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={d.on} disabled={!can} onChange={(e) => onChange({ on: e.target.checked })} data-testid={`vn-lock-rec-on-${k}`} /> Lặp lại hằng tháng</label>
    {d.on && <><div className="flex flex-wrap gap-2 items-end">
      <Field label="Từ ngày"><Input type="number" min={1} max={31} value={d.fromDay} disabled={!can} onChange={(e: any) => onChange({ fromDay: e.target.value })} className="w-[70px]" data-testid={`vn-lock-rec-fd-${k}`} /></Field>
      <Field label="Giờ"><Input type="time" value={d.fromTime} disabled={!can} onChange={(e: any) => onChange({ fromTime: e.target.value })} data-testid={`vn-lock-rec-ft-${k}`} /></Field>
      <Field label="Đến ngày"><Input type="number" min={1} max={31} value={d.toDay} disabled={!can} onChange={(e: any) => onChange({ toDay: e.target.value })} className="w-[70px]" data-testid={`vn-lock-rec-td-${k}`} /></Field>
      <Field label="Giờ"><Input type="time" value={d.toTime} disabled={!can} onChange={(e: any) => onChange({ toTime: e.target.value })} data-testid={`vn-lock-rec-tt-${k}`} /></Field>
      <Field label="Áp cho tháng NS"><Select value={d.offset} onChange={(v: string) => onChange({ offset: v })} disabled={!can} options={[{ value: '', label: 'Mọi tháng NS' }, { value: '0', label: 'Tháng NS = tháng bắt đầu' }, { value: '1', label: 'Tháng NS kế tiếp' }, { value: '-1', label: 'Tháng NS trước' }]} /></Field>
      <Field label="Bỏ qua các tháng (YYYY-MM, cách nhau dấu phẩy)"><Input value={d.exc} disabled={!can} placeholder="VD 2026-12, 2027-02" onChange={(e: any) => onChange({ exc: e.target.value })} className="w-[220px]" data-testid={`vn-lock-rec-exc-${k}`} /></Field>
    </div>
    <div className="text-[12px] text-[var(--mh-text-2)]" data-testid={`vn-lock-rec-next-${k}`}>{typeof r === 'string' ? <span className="text-[#B4231A]">⚠ {r}</span>
      : nx ? <>Lần khoá tới: <b>{vn(nx.start)} → {vn(nx.end)}</b> (giờ VN){r.periodOffset != null ? ` · tháng NS ${idxToYm(nx.startIdx + r.periodOffset)}` : ''}. Ngày lớn hơn số ngày của tháng = ngày cuối tháng; giờ kết thúc ≤ giờ bắt đầu → vắt sang tháng sau.</> : 'Không có lần khoá nào trong 24 tháng tới.'}</div></>}
  </div>;
}
// ---- Kỳ khoá (ngày bắt đầu → ngày kết thúc, giờ VN) ----
const LOCK_MAX = 12;
type PRow = { group: 'ns' | 'nt'; scope: 'both' | 'nsCreate' | 'nsEdit' | 'nt'; period: string; fromD: string; fromT: string; toD: string; toT: string };
const newRow = (group: 'ns' | 'nt'): PRow => ({ group, scope: group === 'nt' ? 'nt' : 'both', period: '', fromD: '', fromT: '00:00', toD: '', toT: '23:59' });
/** «Đến hết hh:mm» → mốc kết thúc = hh:mm + 1 phút (nửa mở). */
function rowOf(group: 'ns' | 'nt', scope: PRow['scope'], r: LockRange): PRow {
  const f = msToVnLocal(r.from), t = msToVnLocal(r.to - 60e3);
  return { group, scope, period: r.period || '', fromD: f.slice(0, 10), fromT: f.slice(11, 16), toD: t.slice(0, 10), toT: t.slice(11, 16) };
}
const rowRange = (r: PRow) => ({ from: vnLocalToMs(`${r.fromD}T${r.fromT || '00:00'}`), to: vnLocalToMs(`${r.toD}T${r.toT || '23:59'}`) + 60e3, period: r.period });
function mergeNsRows(rs: PRow[]): PRow[] {
  const out: PRow[] = [];
  for (const r of rs) {
    const twin = r.group === 'ns' && r.scope !== 'both' && out.find((o) => o.group === 'ns' && o.scope !== 'both' && o.scope !== r.scope && o.period === r.period && o.fromD === r.fromD && o.fromT === r.fromT && o.toD === r.toD && o.toT === r.toT);
    if (twin) twin.scope = 'both'; else out.push({ ...r });
  }
  return out;
}
function rowsFromLocks(l: Locks): PRow[] {
  return [...(l.nt || []).map((r) => rowOf('nt', 'nt', r)), ...mergeNsRows([...(l.nsCreate || []).map((r) => rowOf('ns', 'nsCreate', r)), ...(l.nsEdit || []).map((r) => rowOf('ns', 'nsEdit', r))])];
}
function rowsToRanges(rows: PRow[]): Record<LockKind, LockRange[]> | string {
  const o: Record<LockKind, LockRange[]> = { nsCreate: [], nsEdit: [], nt: [] };
  for (const r of rows) {
    const lab = r.group === 'nt' ? 'Khoá kỳ Nghiệm thu' : 'Khoá kỳ Ngân sách';
    if (r.period && !/^\d{4}-\d{2}$/.test(r.period)) return `${lab}: kỳ phải dạng YYYY-MM`;
    if (!r.fromD || !r.toD) return `${lab}${r.period ? ' ' + r.period : ''}: chọn ngày bắt đầu và ngày kết thúc khoá`;
    const x = rowRange(r);
    if (!Number.isFinite(x.from) || !Number.isFinite(x.to)) return `${lab}: ngày / giờ không hợp lệ`;
    if (x.to <= x.from) return `${lab}${r.period ? ' ' + r.period : ''}: ngày kết thúc phải sau ngày bắt đầu`;
    if (r.group === 'nt') o.nt.push(x);
    else { if (r.scope !== 'nsEdit') o.nsCreate.push(x); if (r.scope !== 'nsCreate') o.nsEdit.push(x); }
  }
  return o;
}
function rowStatus(r: PRow) {
  const x = rowRange(r); const n = Date.now();
  if (!Number.isFinite(x.from) || !Number.isFinite(x.to) || !r.fromD || !r.toD) return { text: 'Chưa đủ ngày', cls: 'bg-[#FFF4E5] text-[#8A5300]' };
  if (n < x.from) return { text: 'Sắp khoá', cls: 'bg-[var(--mh-surface-2)] text-[#334155]' };
  if (n < x.to) return { text: '🔒 Đang khoá', cls: 'bg-[#FDECEC] text-[#B4231A]' };
  return { text: 'Đã mở lại', cls: 'bg-[#E8F5EE] text-[#1F7A4D]' };
}
function rowSummary(r: PRow) {
  if (!r.fromD || !r.toD) return 'Chọn ngày bắt đầu và ngày kết thúc khoá (giờ Việt Nam).';
  const d = (s: string) => s.split('-').reverse().join('/');
  const what = r.group === 'nt' ? 'tạo / sửa Nghiệm thu' : r.scope === 'nsCreate' ? 'đăng ký NS mới' : r.scope === 'nsEdit' ? 'sửa NS' : 'đăng ký mới và sửa NS';
  const per = r.period ? `${r.group === 'nt' ? 'kỳ' : 'tháng NS'} ${r.period.slice(5)}/${r.period.slice(0, 4)}` : 'MỌI kỳ (chưa chọn kỳ)';
  return `Khoá ${what} của ${per} từ ${r.fromT || '00:00'} ${d(r.fromD)} đến hết ${r.toT || '23:59'} ${d(r.toD)} (giờ VN). Sau đó tự mở lại.`;
}

// ---------------------------------------------------------------- Thời gian MỞ (đăng ký mới NS / sửa NS / Nghiệm thu)
type ORange = { from: string; to: string; period: string };   // datetime-local giờ VN
type ODraft = { on: boolean; recOn: boolean; fromDay: string; fromTime: string; toDay: string; toTime: string; apply: string; ranges: ORange[] };
const fmtVn = (t: number) => { const x = new Date(t + 7 * 3600e3); const q = (n: number) => String(n).padStart(2, '0'); return `${q(x.getUTCHours())}:${q(x.getUTCMinutes())} ${q(x.getUTCDate())}/${q(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`; };
const APPLY_DEF: Record<LockKind, string> = { nsCreate: '1', nsEdit: '1', nt: '0' };   // Phong 24/10: ĐK mới & sửa NS = Tháng sau, NT = Tháng này
const oDraftOf = (o?: OpenCfg, k?: LockKind): ODraft => ({ on: !!o?.on, recOn: !!o?.rec.on, fromDay: String(o?.rec.fromDay ?? (k === 'nt' ? 21 : 27)), fromTime: hm(o?.rec.fromMin ?? 0), toDay: String(o?.rec.toDay ?? (k === 'nt' ? 27 : 14)), toTime: hm(o?.rec.toMin ?? 0),
  apply: !o ? (k ? APPLY_DEF[k] : '') : o.rec.apply == null ? '' : String(o.rec.apply), ranges: (o?.ranges || []).map((r) => ({ from: msToVnLocal(r.from), to: msToVnLocal(r.to), period: r.period || '' })) });
function oParse(d: ODraft): OpenCfg | string {
  const fd = Number(d.fromDay), td = Number(d.toDay), fm = mins(d.fromTime), tm = mins(d.toTime);
  if (d.recOn && ![fd, td].every((x) => Number.isInteger(x) && x >= 1 && x <= 31)) return 'ngày phải từ 1 đến 31';
  if (d.recOn && (fm < 0 || tm < 0)) return 'giờ không hợp lệ';
  const ranges: LockRange[] = [];
  for (const r of d.ranges) { const a = vnLocalToMs(r.from), b = vnLocalToMs(r.to); if (!(a < b)) return 'lần mở cụ thể: giờ kết thúc phải sau giờ bắt đầu'; ranges.push({ from: a, to: b, period: r.period }); }
  if (ranges.length > LOCK_MAX) return `tối đa ${LOCK_MAX} lần mở cụ thể`;
  return { on: d.on, rec: { on: d.recOn, fromDay: fd || 1, fromMin: Math.max(fm, 0), toDay: td || 1, toMin: Math.max(tm, 0), apply: d.apply === '' ? null : Number(d.apply), exceptions: [] }, ranges };
}
function OpenEditor({ k, d, can, onChange }: { k: LockKind; d: ODraft; can: boolean; onChange: (p: Partial<ODraft>) => void }) {
  const o = oParse(d); const nx = typeof o === 'string' || !d.on ? null : openNext(o);
  const cur = typeof o === 'string' || !d.on ? false : !activeLock({ open: { [k]: o } } as any, k);
  const updR = (i: number, p: Partial<ORange>) => onChange({ ranges: d.ranges.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  return <div className="rounded-lg border border-[var(--mh-border)] p-2.5 space-y-2" data-testid={`vn-open-${k}`}>
    <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={d.on} disabled={!can} onChange={(e) => onChange({ on: e.target.checked })} data-testid={`vn-open-on-${k}`} /> {OPEN_LABEL[k]}
      {d.on && <span className={`ml-1 text-[11px] px-2 py-0.5 rounded-full ${cur ? 'bg-[#E7F6EC] text-[#1A7F37]' : 'bg-[#FDECEC] text-[#B4231A]'}`}>{cur ? 'Đang MỞ' : 'Đang khoá'}</span>}</label>
    {!d.on ? <div className="text-[12px] text-[var(--mh-text-3)]">Chưa bật — loại này đang theo cài đặt cũ (nếu có). Bấm «Chuyển từ lịch khoá hiện tại» hoặc bật để dùng Thời gian MỞ.</div> : <>
      <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={d.recOn} disabled={!can} onChange={(e) => onChange({ recOn: e.target.checked })} /> Mở lặp lại hằng tháng</label>
      {d.recOn && <div className="flex flex-wrap gap-2 items-end">
        <Field label="Mở từ ngày"><Input type="number" min={1} max={31} value={d.fromDay} disabled={!can} onChange={(e: any) => onChange({ fromDay: e.target.value })} className="w-[70px]" data-testid={`vn-open-fromday-${k}`} /></Field>
        <Field label="Giờ (VN)"><Input type="time" value={d.fromTime} disabled={!can} onChange={(e: any) => onChange({ fromTime: e.target.value })} className="w-[110px]" /></Field>
        <Field label="Đến ngày (khoá lúc)"><Input type="number" min={1} max={31} value={d.toDay} disabled={!can} onChange={(e: any) => onChange({ toDay: e.target.value })} className="w-[70px]" data-testid={`vn-open-today-${k}`} /></Field>
        <Field label="Giờ (VN)"><Input type="time" value={d.toTime} disabled={!can} onChange={(e: any) => onChange({ toTime: e.target.value })} className="w-[110px]" /></Field>
        <Field label="Áp dụng cho"><Select value={d.apply} disabled={!can} onChange={(v: string) => onChange({ apply: v })} options={['-1', '0', '1', ''].map((v) => ({ value: v, label: APPLY_LABEL[v] + (v === '' ? '' : ' (so với tháng bắt đầu mở)') }))} /></Field>
      </div>}
      {d.ranges.map((r, i) => <div key={i} className="flex flex-wrap gap-2 items-end" data-testid={`vn-open-range-${k}`}>
        <Field label="Lần mở cụ thể: từ"><Input type="datetime-local" value={r.from} disabled={!can} onChange={(e: any) => updR(i, { from: e.target.value })} /></Field>
        <Field label="Đến (khoá lúc)"><Input type="datetime-local" value={r.to} disabled={!can} onChange={(e: any) => updR(i, { to: e.target.value })} /></Field>
        <Field label="Kỳ (trống = mọi kỳ)"><Input type="month" value={r.period} disabled={!can} onChange={(e: any) => updR(i, { period: e.target.value })} className="w-[150px]" /></Field>
        {can && <Btn small danger onClick={() => onChange({ ranges: d.ranges.filter((_, j) => j !== i) })}>Xoá</Btn>}
      </div>)}
      {can && d.ranges.length < LOCK_MAX && <Btn small onClick={() => onChange({ ranges: [...d.ranges, { from: '', to: '', period: '' }] })}>+ Thêm lần mở cụ thể</Btn>}
      <div className="text-[12px] text-[var(--mh-text-2)]" data-testid={`vn-open-preview-${k}`}>{typeof o === 'string' ? <span className="text-[#B4231A]">⚠ {o}</span>
        : nx ? <>Lần mở tới: <b>{fmtVn(nx.from)} → {fmtVnEnd(nx.to)}</b> (giờ VN){nx.period ? <> · kỳ {k === 'nt' ? 'NT' : 'NS'} <b>{nx.period}</b></> : ' · mọi kỳ'}</> : 'Không có lần mở nào sắp tới.'}
        {' '}Ngoài thời gian mở: mọi người bị khoá (kể cả Admin / GĐ Khối), trừ Super Admin.</div>
    </>}
  </div>;
}
/** n lần khoá tới của lịch lặp (dùng để chuyển sang kỳ khoá cụ thể). */
function recUpcoming(r: RecLock, n: number): LockRange[] {
  const o: LockRange[] = []; let t = Date.now() - 40 * 864e5;
  for (let g = 0; g < 30 && o.length < n; g++) { const w = recNext(r, t); if (!w) break; if (w.end > Date.now()) o.push({ from: w.start, to: w.end, period: r.periodOffset == null ? '' : idxToYm(w.startIdx + r.periodOffset) }); t = w.start + 1; }
  return o;
}
export function LocksPage({ c }: { c: VCtx }) {
  const locks = useLocks(c.db);
  const can = c.role === 'super_admin';
  const [rows, setRows] = useState<PRow[]>([]);
  const [hist, setHist] = useState<any[]>([]);
  type RecDraft = { on: boolean; fromDay: string; fromTime: string; toDay: string; toTime: string; offset: string; exc: string };
  const recOf = (r?: RecLock): RecDraft => ({ on: !!r?.on, fromDay: String(r?.fromDay ?? 25), fromTime: hm(r?.fromMin ?? 18 * 60), toDay: String(r?.toDay ?? 5), toTime: hm(r?.toMin ?? 8 * 60),
    offset: r?.periodOffset == null ? '' : String(r.periodOffset), exc: (r?.exceptions || []).map(idxToYm).join(', ') });
  const [od, setOd] = useState<Record<LockKind, ODraft>>({ nsCreate: oDraftOf(undefined, 'nsCreate'), nsEdit: oDraftOf(undefined, 'nsEdit'), nt: oDraftOf(undefined, 'nt') });
  useEffect(() => { setOd(Object.fromEntries((['nsCreate', 'nsEdit', 'nt'] as LockKind[]).map((k) => [k, oDraftOf(normOpen(locks.open?.[k]), k)])) as any); }, [locks]);
  const convertToOpen = () => {
    const nx: any = {};
    for (const k of ['nsCreate', 'nsEdit', 'nt'] as LockKind[]) { const rp = recParse(rec[k]); const cv = lockRecToOpen(typeof rp === 'string' ? undefined : rp); nx[k] = { ...oDraftOf(undefined, k), on: cv.rec.on, recOn: cv.rec.on, fromDay: String(cv.rec.fromDay), fromTime: hm(cv.rec.fromMin), toDay: String(cv.rec.toDay), toTime: hm(cv.rec.toMin), apply: APPLY_DEF[k] }; }
    nx.nt = { ...nx.nt, on: true, recOn: true, fromDay: '21', fromTime: '00:00', toDay: '27', toTime: '00:00', apply: '0' };   // Phong 24/10: NT tháng M mở 21/M 00:00 → hết 26/M
    setPast((p) => ({ ...p, nt: { ...p.nt, day: p.nt.on ? '27' : p.nt.day, time: '00:00', offset: '0' } }));
    setOd(nx); toast('Đã chuyển lịch khoá lặp hiện tại sang thời gian MỞ tương đương — kiểm tra rồi bấm «Lưu cài đặt».');
  };
  const [rec, setRec] = useState<Record<LockKind, RecDraft>>({ nsCreate: recOf(), nsEdit: recOf(), nt: recOf() });
  useEffect(() => { setRec(Object.fromEntries((['nsCreate', 'nsEdit', 'nt'] as LockKind[]).map((k) => [k, recOf(locks.recurring?.[k])])) as any); }, [locks]);
  const recParse = (d: RecDraft): RecLock | string => {
    const fd = Number(d.fromDay), td = Number(d.toDay), fm = mins(d.fromTime), tm = mins(d.toTime);
    if (![fd, td].every((x) => Number.isInteger(x) && x >= 1 && x <= 31)) return 'ngày phải từ 1 đến 31';
    if (fm < 0 || tm < 0) return 'giờ không hợp lệ';
    const exc = d.exc.split(/[,;\s]+/).filter(Boolean).map(ymToIdx);
    if (exc.some((x) => !Number.isFinite(x))) return 'tháng ngoại lệ dạng YYYY-MM';
    if (exc.length > 24) return 'tối đa 24 tháng ngoại lệ';
    return { on: d.on, fromDay: fd, fromMin: fm, toDay: td, toMin: tm, periodOffset: d.offset === '' ? null : Number(d.offset), exceptions: exc };
  };
  type PastDraft = { on: boolean; day: string; time: string; offset: string };
  const pastOf = (p?: PastLock): PastDraft => ({ on: !!p?.on, day: String(p?.day ?? 1), time: hm(p?.min ?? 0), offset: String(p?.offset ?? 1) });
  const [past, setPast] = useState<Record<PastKind, PastDraft>>({ ns: pastOf(), nt: pastOf() });
  useEffect(() => { setPast({ ns: pastOf(locks.pastLock?.ns), nt: pastOf(locks.pastLock?.nt) }); }, [locks]);
  const pastParse = (d: PastDraft): PastLock | string => {
    const day = Number(d.day), min = mins(d.time), off = Number(d.offset);
    if (!Number.isInteger(day) || day < 1 || day > 28) return 'ngày khoá từ 1 đến 28';
    if (min < 0) return 'giờ không hợp lệ';
    if (![0, 1, 2, 3].includes(off)) return 'tháng khoá không hợp lệ';
    return { on: d.on, day, min, offset: off };
  };
  const { toast, node } = useToast();
  useEffect(() => { setRows(rowsFromLocks(locks)); }, [locks]);
  useEffect(() => onSnapshot(query(collection(c.db, 'vnLocksHistory'), orderBy('at', 'desc'), limit(50)), (s) => setHist(s.docs.map((d) => d.data())), () => setHist([])), [c.db]);
  const save = async () => {
    const out: any = {}; const desc: string[] = []; const recOut: any = {}; const winOut: any = {};
    const recL = { ...rec }; const split = rowsToRanges(rows); if (typeof split === 'string') return toast(split, 'err');
    for (const k of ['nsCreate', 'nsEdit', 'nt'] as LockKind[]) {
      { const ok = oParse(od[k]); if (typeof ok !== 'string' && ok.on) { split[k] = []; recL[k] = { ...rec[k], on: false }; } }   // 1 nơi cài đặt: loại đã bật MỞ → tắt khoá cũ (UI cũ đã gỡ)
      const rs = split[k].map((r) => ({ from: msToVnLocal(r.from), to: msToVnLocal(r.to), period: r.period || '' }));
      if (rs.length > LOCK_MAX) return toast(`${LOCK_LABEL[k]}: tối đa ${LOCK_MAX} kỳ khoá`, 'err');
      out[k] = split[k].map((r) => ({ from: Timestamp.fromMillis(r.from), to: Timestamp.fromMillis(r.to), period: r.period || '' }));
      const rp = recParse(recL[k]); if (typeof rp === 'string') return toast(`${LOCK_LABEL[k]} (lặp hằng tháng): ${rp}`, 'err');
      recOut[k] = rp;
      const cw = compileLockWin(split[k], rp);
      if (cw.overflow.length) return toast(`${LOCK_LABEL[k]}: tối đa 3 khoảng khoá trong cùng 1 tháng (tràn: ${cw.overflow.join(', ')})`, 'err');
      winOut[k] = Object.fromEntries(Object.entries(cw.win).map(([i, ws]) => [i, ws.map((w) => ({ from: Timestamp.fromMillis(w.from), to: Timestamp.fromMillis(w.to), period: w.period }))]));
      desc.push(`${LOCK_LABEL[k]}: ${rs.length ? rs.map((r) => `${r.period ? 'kỳ ' + r.period + ' ' : ''}${r.from.replace('T', ' ')}→${r.to.replace('T', ' ')}`).join('; ') : 'không có kỳ khoá'}`
        + (rp.on ? ` · lặp hằng tháng ngày ${rp.fromDay} ${rec[k].fromTime} → ngày ${rp.toDay} ${rec[k].toTime}${rp.periodOffset != null ? ` (tháng NS +${rp.periodOffset})` : ''}${rp.exceptions.length ? ` trừ ${rec[k].exc}` : ''}` : ''));
    }
    const openOut: any = {}; const openWinOut: any = {};
    for (const k of ['nsCreate', 'nsEdit', 'nt'] as LockKind[]) {
      const o = oParse(od[k]); if (typeof o === 'string') return toast(`${OPEN_LABEL[k]}: ${o}`, 'err');
      openOut[k] = { on: o.on, rec: o.rec, ranges: o.ranges.map((r) => ({ from: Timestamp.fromMillis(r.from), to: Timestamp.fromMillis(r.to), period: r.period || '' })) };
      if (!o.on) continue;
      const cw = compileOpenWin(o); if (cw.overflow.length) return toast(`${OPEN_LABEL[k]}: tối đa 3 lần mở trong cùng 1 tháng (tràn: ${cw.overflow.join(', ')})`, 'err');
      openWinOut[k] = Object.fromEntries(Object.entries(cw.win).map(([i, ws]) => [i, ws.map((w) => ({ from: Timestamp.fromMillis(w.from), to: Timestamp.fromMillis(w.to), period: w.period }))]));
      desc.push(`${OPEN_LABEL[k]}: ${o.rec.on ? `lặp ngày ${o.rec.fromDay} ${od[k].fromTime} → ngày ${o.rec.toDay} ${od[k].toTime}, áp dụng ${APPLY_LABEL[o.rec.apply == null ? '' : String(o.rec.apply)]}` : 'không lặp'}${o.ranges.length ? ` + ${o.ranges.length} lần mở cụ thể` : ''}`);
    }
    const pastOut: any = {}; const pastWinOut: any = {};
    for (const k of ['ns', 'nt'] as PastKind[]) {
      const pp = pastParse(past[k]); if (typeof pp === 'string') return toast(`Khoá kỳ đã qua · ${PAST_LABEL[k]}: ${pp}`, 'err');
      pastOut[k] = pp;
      pastWinOut[k] = Object.fromEntries(Object.entries(compilePastWin(pp)).map(([i, w]) => [i, { m: w.m, at: Timestamp.fromMillis(w.at) }]));
      desc.push(`Khoá kỳ đã qua · ${PAST_LABEL[k]}: ${pp.on ? `bật — tháng M khoá từ ngày ${pp.day} ${past[k].time} của tháng M+${pp.offset}` : 'tắt'}`);
    }
    try {
      await setDoc(doc(c.db, 'vnLocks', 'current'), { ...out, recurring: recOut, lockWin: winOut, open: openOut, openWin: openWinOut, pastLock: pastOut, pastWin: pastWinOut, updatedAt: new Date().toISOString(), updatedBy: c.uid });
      await addDoc(collection(c.db, 'vnLocksHistory'), { by: c.uid, byName: c.name, at: new Date().toISOString(), change: desc.join(' | ').slice(0, 2000) });
      toast('Đã lưu cài đặt khoá');
    } catch (e: any) { toast(e, 'err', save); }
  };
  const updRow = (i: number, p: Partial<PRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const addRow = (group: 'ns' | 'nt') => setRows([...rows, newRow(group)]);
  const convertRec = () => {
    const add: PRow[] = [];
    for (const k of ['nsCreate', 'nsEdit', 'nt'] as LockKind[]) {
      const rp = recParse(rec[k]); if (typeof rp === 'string' || !rp.on) continue;
      for (const w of recUpcoming(rp, 4)) add.push(rowOf(k === 'nt' ? 'nt' : 'ns', k === 'nt' ? 'nt' : k, { from: w.from, to: w.to, period: w.period }));
    }
    if (!add.length) return toast('Không có lịch lặp nào đang bật', 'err');
    setRows(mergeNsRows([...rows, ...add]));
    setRec(Object.fromEntries((['nsCreate', 'nsEdit', 'nt'] as LockKind[]).map((k) => [k, { ...rec[k], on: false }])) as any);
    toast('Đã chuyển lịch lặp thành các kỳ khoá cụ thể (4 kỳ tới) và tắt lịch lặp — kiểm tra rồi bấm «Lưu cài đặt».');
  };
  const anyRec = (['nsCreate', 'nsEdit', 'nt'] as LockKind[]).some((k) => rec[k].on);
  const periodCard = (group: 'ns' | 'nt') => {
    const list = rows.map((r, i) => ({ r, i })).filter((x) => x.r.group === group);
    return <Card className="p-4 space-y-3" data-testid={`vn-lockrange-${group}`}>
      <div className="flex items-center gap-2"><div className="flex-1"><b className="text-[14px]">{group === 'nt' ? 'Khoá kỳ Nghiệm thu' : 'Khoá kỳ Ngân sách MKT'}</b>
        <div className="text-[12px] text-[var(--mh-text-2)]">{group === 'nt' ? 'Chọn kỳ Nghiệm thu và ngày bắt đầu / ngày kết thúc khoá. Trong khoảng này không ai tạo / sửa được Nghiệm thu của kỳ đó (trừ Super Admin).' : 'Chọn tháng NS và ngày bắt đầu / ngày kết thúc khoá. Chọn khoá đăng ký mới, khoá sửa, hoặc cả hai.'}</div></div>
        {can && list.length < LOCK_MAX && <Btn small onClick={() => addRow(group)} data-testid={`vn-lockrange-add-${group}`}>+ Thêm kỳ khoá</Btn>}</div>
      {!list.length ? <div className="text-[12px] text-[var(--mh-text-3)]">Chưa có kỳ khoá nào{group === 'nt' ? ' cho Nghiệm thu' : ' cho Ngân sách'}.</div> : list.map(({ r, i }) => {
        const st = rowStatus(r);
        return <div key={i} className="rounded-lg border border-[var(--mh-border)] p-2.5 flex flex-wrap gap-2 items-end" data-testid={`vn-lockrange-row-${group}`}>
          <Field label={group === 'nt' ? 'Kỳ Nghiệm thu' : 'Tháng NS'}><Input type="month" value={r.period} disabled={!can} onChange={(e: any) => updRow(i, { period: e.target.value })} className="w-[150px]" data-testid={`vn-lockrange-period-${group}-${i}`} /></Field>
          {group === 'ns' && <Field label="Khoá"><Select value={r.scope} disabled={!can} onChange={(v: string) => updRow(i, { scope: v as PRow['scope'] })} options={[{ value: 'both', label: 'Đăng ký mới + Sửa' }, { value: 'nsCreate', label: 'Chỉ đăng ký mới' }, { value: 'nsEdit', label: 'Chỉ sửa' }]} /></Field>}
          <Field label="Bắt đầu khoá (ngày)"><Input type="date" value={r.fromD} disabled={!can} onChange={(e: any) => updRow(i, { fromD: e.target.value })} data-testid={`vn-lockrange-fromd-${group}-${i}`} /></Field>
          <Field label="Từ giờ"><Input type="time" value={r.fromT} disabled={!can} onChange={(e: any) => updRow(i, { fromT: e.target.value })} className="w-[110px]" /></Field>
          <Field label="Kết thúc khoá (ngày)"><Input type="date" value={r.toD} disabled={!can} onChange={(e: any) => updRow(i, { toD: e.target.value })} data-testid={`vn-lockrange-tod-${group}-${i}`} /></Field>
          <Field label="Đến hết giờ"><Input type="time" value={r.toT} disabled={!can} onChange={(e: any) => updRow(i, { toT: e.target.value })} className="w-[110px]" /></Field>
          <span className={`text-[12px] px-2 py-1 rounded-full ${st.cls}`} data-testid={`vn-lockrange-status-${group}-${i}`}>{st.text}</span>
          {can && <Btn small danger onClick={() => setRows(rows.filter((_, j) => j !== i))}>Xoá</Btn>}
          <div className="basis-full text-[12px] text-[var(--mh-text-2)]">{rowSummary(r)}</div>
        </div>; })}
    </Card>;
  };
  return (
    <Shell title="Khoá theo ngày" sub="Giờ Việt Nam. Trong khoảng khoá MỌI người bị chặn (kể cả Admin / GĐ Khối); chỉ Super Admin tạo / sửa được. Luật Firestore cũng chặn." actions={can ? <Btn primary onClick={save} data-testid="vn-lock-save">Lưu cài đặt</Btn> : undefined}>
      <LockBanner c={c} />
      {!can && <Card className="p-3 text-[13px]">Chỉ Super Admin được sửa cài đặt khoá. Bạn đang xem ở chế độ chỉ đọc.</Card>}
      <Card className="p-4 space-y-3" data-testid="vn-open-card">
        <div className="flex items-center gap-2"><div className="flex-1"><b className="text-[14px]">Thời gian MỞ</b>
          <div className="text-[12px] text-[var(--mh-text-2)]">Chọn khoảng thời gian ĐƯỢC MỞ để đăng ký mới / sửa NS / tạo-sửa Nghiệm thu. Ngoài khoảng mở là khoá. «Áp dụng cho» = kỳ được mở, tính theo tháng bắt đầu mở (VD mở 27/10 · Tháng sau → kỳ 2026-11). Đây là nơi cài đặt duy nhất (đã gộp khung đăng ký NS ở Cài đặt hệ thống và các khoá cũ). Khi lưu, khoá cũ của loại đã bật được tắt.</div></div>
          {can && <Btn small onClick={convertToOpen} data-testid="vn-open-convert">Chuyển từ lịch khoá hiện tại</Btn>}</div>
        {(['nsCreate', 'nsEdit', 'nt'] as LockKind[]).map((k) => <div key={k}><OpenEditor k={k} d={od[k]} can={can} onChange={(p) => setOd({ ...od, [k]: { ...od[k], ...p } })} /></div>)}
      </Card>
      <Card className="p-4 space-y-3" data-testid="vn-past-lock">
        <div><b className="text-[14px]">Khoá kỳ đã qua (vĩnh viễn)</b><div className="text-[12px] text-[var(--mh-text-2)]">Từ thời điểm cài đặt, bản ghi của tháng đã qua bị khoá VĨNH VIỄN (không có ngày mở lại): không ai được sửa / xoá / thêm — kể cả Admin, GĐ Khối, Mod, Kế toán — trừ Super Admin.</div></div>
        {(['ns', 'nt'] as PastKind[]).map((k) => { const d = past[k]; const pp = pastParse(d); const now = Date.now(); const vnD = new Date(now + 7 * 3600e3); const cur = vnD.getUTCFullYear() * 12 + vnD.getUTCMonth() + 1;
          const fmtT = (t: number) => { const x = new Date(t + 7 * 3600e3); const q = (n: number) => String(n).padStart(2, '0'); return `${q(x.getUTCHours())}:${q(x.getUTCMinutes())} ${q(x.getUTCDate())}/${q(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`; };
          const mLab = (i: number) => { const y = Math.floor((i - 1) / 12); return `Tháng ${i - y * 12}/${y}`; };
          return <div key={k} className="rounded-lg border border-[var(--mh-border)] p-2.5 space-y-2" data-testid={`vn-past-${k}`}>
            <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={d.on} disabled={!can} onChange={(e) => setPast({ ...past, [k]: { ...d, on: e.target.checked } })} data-testid={`vn-past-on-${k}`} /> {PAST_LABEL[k]}</label>
            {d.on && <><div className="flex flex-wrap gap-2 items-end">
              <Field label="Bản ghi tháng M khoá từ ngày"><Input type="number" min={1} max={28} value={d.day} disabled={!can} onChange={(e: any) => setPast({ ...past, [k]: { ...d, day: e.target.value } })} className="w-[70px]" data-testid={`vn-past-day-${k}`} /></Field>
              <Field label="Giờ (VN)"><Input type="time" value={d.time} disabled={!can} onChange={(e: any) => setPast({ ...past, [k]: { ...d, time: e.target.value } })} data-testid={`vn-past-time-${k}`} /></Field>
              <Field label="Của tháng"><Select value={d.offset} disabled={!can} onChange={(v: string) => setPast({ ...past, [k]: { ...d, offset: v } })} options={[{ value: '0', label: 'M (chính tháng đó)' }, { value: '1', label: 'M+1 (tháng sau)' }, { value: '2', label: 'M+2' }, { value: '3', label: 'M+3' }]} /></Field>
            </div>
            <div className="text-[12px] text-[var(--mh-text-2)]" data-testid={`vn-past-preview-${k}`}>{typeof pp === 'string' ? <span className="text-[#B4231A]">⚠ {pp}</span> : <>
              Ví dụ: <b>{mLab(cur - 1)}</b> khoá từ <b>{fmtT(pastLockAt(pp, cur - 1))}</b>{pastLockAt(pp, cur - 1) <= now ? ' (đã khoá)' : ''} · <b>{mLab(cur)}</b> khoá từ <b>{fmtT(pastLockAt(pp, cur))}</b> (giờ VN).{(() => { const oc = oParse(k === 'nt' ? od.nt : od.nsEdit); const oc2 = oParse(od.nsCreate); const bad = [...new Set([...(typeof oc === 'string' ? [] : pastOpenConflicts(pp, oc)), ...(k === 'ns' && typeof oc2 !== 'string' ? pastOpenConflicts(pp, oc2) : [])])]; return bad.length ? <div className="text-[#B4231A] font-semibold" data-testid={`vn-past-conflict-${k}`}>⚠ Mốc khoá kỳ đã qua rơi vào giữa thời gian MỞ của chính kỳ đó ({bad.join(', ')}) — phần còn lại của lần mở sẽ không dùng được. {k === 'nt' ? 'Gợi ý: ngày 27, 00:00, tháng M.' : 'Hãy dời mốc khoá ra sau ngày đóng.'}</div> : null; })()}{k === 'ns' ? ' Với NS MKT, «tháng» là kỳ NS (VD Tháng 11 = 21/10–20/11).' : ' Nghiệm thu «Kì 1 / Kì 2 - Tháng 8» tính là Tháng 8/2026.'}</>}</div></>}
          </div>; })}
      </Card>
      <Card><div className="px-4 py-2.5 font-semibold text-[14px] border-b border-[var(--mh-border)]">Lịch sử thay đổi</div>
        {!hist.length ? <Empty>Chưa có thay đổi</Empty> : <div className="divide-y divide-[var(--mh-surface-2)]">{hist.map((h, i) => <div key={i} className="px-4 py-2 text-[12px]"><b>{h.byName}</b> · {vnTime(h.at)}<div className="text-[var(--mh-text-2)] break-words">{h.change}</div></div>)}</div>}
      </Card>
      {node}
    </Shell>);
}

// ---------------------------------------------------------------- Nhật ký lỗi
const errSeen = new Map<string, number>(); let errCount = 0; let errInfo: () => { role: string; screen: string } = () => ({ role: '', screen: '' }); let errDb: Firestore | null = null;
export function logClientError(e: any, kind = 'error') {
  if (!errDb || errCount >= 20) return;
  const msg = scrubMsg(e);
  if (classifyClientError(e, msg, location.origin)) return;
  if (!dedupeOk(errSeen, msg, location.pathname, Date.now())) return;
  errCount++;
  const ua = navigator.userAgent || ''; const i = errInfo();
  addDoc(collection(errDb, 'errorLogs'), { at: new Date().toISOString(), screen: String(i.screen || location.pathname).slice(0, 100), role: String(i.role || '').slice(0, 40), device: deviceOf(ua, window.innerWidth), browser: browserOf(ua), msg, kind, expireAt: Timestamp.fromMillis(Date.now() + 90 * 864e5) }).catch(() => {});
}
export function useClientTelemetry(c: VCtx | null, screen: string) {
  const info = useRef({ role: '', screen: '' });
  info.current = { role: c?.role || '', screen };
  useEffect(() => {
    if (!c?.db) return;
    errDb = c.db; errInfo = () => info.current;
    const onErr = (ev: ErrorEvent) => logClientError(ev.error || ev.message, 'error');
    const onRej = (ev: PromiseRejectionEvent) => logClientError(ev.reason, 'promise');
    window.addEventListener('error', onErr); window.addEventListener('unhandledrejection', onRej);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); };
  }, [c?.db]);
  // Thống kê sử dụng: 1 doc / người / ngày; mỗi màn tối đa 1 lần ghi / phút.
  const last = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!c?.uid || !screen) return;
    const now = Date.now(); if (now - (last.current[screen] || 0) < 60e3) return; last.current[screen] = now;
    const day = vnDay(now); const ua = navigator.userAgent || '';
    setDoc(doc(c.db, 'usageDaily', `${day}_${c.uid}`), { day, uid: c.uid, role: c.role, blockId: c.myBlockIds[0] || c.teams.find((t) => t.id === c.teamId)?.blockId || '', banKdId: c.myBanKdIds[0] || '', device: deviceOf(ua, window.innerWidth), screens: { [screen.replace(/[.~*/[\]]/g, '_').slice(0, 60) || 'home']: increment(1) }, last: new Date(now).toISOString(), expireAt: Timestamp.fromMillis(now + 120 * 864e5) }, { merge: true }).catch(() => {});
  }, [c?.uid, screen]);
}
export function ErrorLogPage({ c }: { c: VCtx }) {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState({ screen: '', role: '', device: '', days: '7' });
  const [purged, setPurged] = useState(0);
  useEffect(() => onSnapshot(query(collection(c.db, 'errorLogs'), orderBy('at', 'desc'), limit(3000)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => setRows([])), [c.db]);
  useEffect(() => { // Tự xoá > 90 ngày (dự phòng nếu chưa bật TTL expireAt trên Firestore).
    (async () => { try { const old = await getDocs(query(collection(c.db, 'errorLogs'), where('at', '<', new Date(Date.now() - 90 * 864e5).toISOString()), limit(400))); if (!old.size) return; const b = writeBatch(c.db); old.docs.forEach((d) => b.delete(d.ref)); await b.commit(); setPurged(old.size); } catch { /* */ } })();
  }, [c.db]);
  const since = Date.now() - Number(f.days) * 864e5;
  const list = rows.filter((r) => Date.parse(r.at) >= since && (!f.screen || r.screen === f.screen) && (!f.role || r.role === f.role) && (!f.device || r.device === f.device));
  const groups = useMemo(() => { const m = new Map<string, any[]>(); for (const r of list) { const k = errGroupKey(r.msg) + '|' + r.screen; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); } return [...m.values()].map((rs) => ({ rs, n: rs.length, last: rs[0].at, roles: [...new Set(rs.map((r) => r.role))], devs: [...new Set(rs.map((r) => `${r.device}/${r.browser}`))] })).sort((a, b) => b.n - a.n); }, [list]);
  const opt = (k: string) => [{ value: '', label: 'Tất cả' }, ...[...new Set(rows.map((r) => r[k]).filter(Boolean))].sort().map((v) => ({ value: v, label: v }))];
  const spike = isSpike(rows.map((r) => Date.parse(r.at)));
  return (
    <Shell title="Nhật ký lỗi" sub="Lỗi phía người dùng (không lưu email / CCCD / STK). Gộp theo lỗi + màn. Tự xoá sau 90 ngày.">
      {spike && <Card className="p-3 text-[13px] border-[#F2ADA7] bg-[#FDE8E6]" data-testid="vn-err-spike">🚨 Lỗi tăng đột biến trong 60 phút qua — Super Admin đã nhận thông báo trên chuông.</Card>}
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Khoảng"><Select value={f.days} onChange={(v: any) => setF({ ...f, days: v?.target ? v.target.value : v })} options={[{ value: '1', label: '24 giờ' }, { value: '7', label: '7 ngày' }, { value: '30', label: '30 ngày' }, { value: '90', label: '90 ngày' }]} /></Field>
        <Field label="Màn"><Select value={f.screen} onChange={(v: any) => setF({ ...f, screen: v?.target ? v.target.value : v })} options={opt('screen')} /></Field>
        <Field label="Vai trò"><Select value={f.role} onChange={(v: any) => setF({ ...f, role: v?.target ? v.target.value : v })} options={opt('role')} /></Field>
        <Field label="Thiết bị"><Select value={f.device} onChange={(v: any) => setF({ ...f, device: v?.target ? v.target.value : v })} options={opt('device')} /></Field>
        <div className="text-[12px] text-[var(--mh-text-2)] pb-2">{list.length} lỗi · {groups.length} nhóm{purged ? ` · đã xoá ${purged} lỗi > 90 ngày` : ''}</div>
      </div>
      <Card>{!groups.length ? <Empty>Không có lỗi trong khoảng này 🎉</Empty> : <div className="overflow-x-auto"><table data-mh-responsive className="w-full" data-testid="vn-err-table"><thead><tr><Th r>Số lần</Th><Th>Lỗi</Th><Th>Màn</Th><Th className="hidden md:table-cell">Vai trò</Th><Th className="hidden md:table-cell">Thiết bị</Th><Th>Gần nhất</Th></tr></thead><tbody>
        {groups.map((g, i) => <tr key={i} data-testid="vn-err-row"><Td r className="font-bold">{g.n}</Td><Td className="text-[12px] max-w-[420px] break-words">{g.rs[0].msg}</Td><Td className="text-[12px]">{g.rs[0].screen}</Td><Td className="hidden md:table-cell text-[12px]">{g.roles.join(', ')}</Td><Td className="hidden md:table-cell text-[12px]">{g.devs.slice(0, 3).join(', ')}</Td><Td className="text-[12px] whitespace-nowrap">{vnTime(g.last)}</Td></tr>)}
      </tbody></table></div>}</Card>
    </Shell>);
}

// ---------------------------------------------------------------- Thống kê sử dụng
const ROLE_VI: Record<string, string> = { super_admin: 'Super Admin', admin: 'Admin', mod: 'Mod', accountant: 'Kế toán', gd_khoi: 'GĐ Khối', tro_ly_khoi: 'Trợ lý Khối', truong_ban_kd: 'Trưởng Ban', gdkd: 'GĐKD', gdda: 'GĐDA', assistant: 'Trợ lý', user: 'Nhân viên' };
export function UsageStatsPage({ c }: { c: VCtx }) {
  const [u, setU] = useState<any[]>([]);
  const period = defaultPeriod(c.settings);
  const { lines } = useNsLines(c, [period], 'all');
  const sup = useSupport(c, [period]);
  const pay = usePayMap(c.db);
  useEffect(() => { const from = vnDay(Date.now() - 30 * 864e5); return onSnapshot(query(collection(c.db, 'usageDaily'), where('day', '>=', from)), (s) => setU(s.docs.map((d) => d.data())), () => setU([])); }, [c.db]);
  const today = vnDay(); const wk = vnDay(Date.now() - 6 * 864e5);
  const dau = u.filter((x) => x.day === today); const wau = u.filter((x) => x.day >= wk);
  const uniq = (a: any[]) => new Set(a.map((x) => x.uid)).size;
  const by = (a: any[], k: string, lab: (v: string) => string) => { const m = new Map<string, Set<string>>(); a.forEach((x) => { const v = x[k] || '—'; if (!m.has(v)) m.set(v, new Set()); m.get(v)!.add(x.uid); }); return [...m.entries()].map(([v, s]) => ({ v: lab(v), n: s.size })).sort((a2, b) => b.n - a2.n); };
  const screens = useMemo(() => { const m = new Map<string, number>(); wau.forEach((x) => Object.entries(x.screens || {}).forEach(([k, n]) => m.set(k, (m.get(k) || 0) + Number(n)))); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10); }, [u]);
  const dev = by(wau, 'device', (v) => ({ desktop: 'Máy tính', mobile: 'Điện thoại', tablet: 'Máy tính bảng' } as any)[v] || v);
  const rows: URow[] = useMemo(() => adaptNs(lines, sup as any, pay, c.projects), [lines, sup, pay]);
  const regDay = useMemo(() => { const m = new Map<string, number>(); lines.forEach((l: any) => { const d = String(l.createdAt || '').slice(0, 10); if (d) m.set(d, (m.get(d) || 0) + 1); }); return [...m.entries()].sort().slice(-14); }, [lines]);
  const avgH = useMemo(() => { const ds = lines.map((l: any) => { const s: any = (sup as any)[l.id]; return s?.status === 'approved' && l.createdAt && s.decidedAt ? (Date.parse(s.decidedAt) - Date.parse(l.createdAt)) / 3600e3 : NaN; }).filter((x) => Number.isFinite(x) && x >= 0); return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null; }, [lines, sup]);
  const pendK = [...aggregate(rows.filter((r) => r.status === 'pending' || r.status === 'reapproval'), 'blockId').entries()].map(([k, s]) => ({ k, n: s.n, a: s.total })).sort((a, b) => b.n - a.n);
  const staff = c.users.filter((x) => !x.mergedInto && !x.linkedToUid && isStaff(String(x.role || 'user')));
  const noStk = pay ? staff.filter((x) => !pay[uidOf(x)]?.has).length : null;
  const T = ({ title, data, tid }: { title: string; data: { v: string; n: any }[]; tid?: string }) => <Card className="p-3" data-testid={tid}><div className="font-semibold text-[13px] mb-1.5">{title}</div>{!data.length ? <div className="text-[12px] text-[var(--mh-text-3)]">Chưa có dữ liệu</div> : data.map((d) => <div key={d.v} className="flex text-[12px] py-0.5 border-b border-[#F0F3F7]"><span className="flex-1 truncate">{d.v}</span><b className="tabular-nums">{d.n}</b></div>)}</Card>;
  return (
    <Shell title="Thống kê sử dụng" sub={`Không dùng GA4 — số liệu nội bộ (usageDaily). DAU = hôm nay (giờ VN), WAU = 7 ngày. NS: ${periodLabel(period)}.`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="vn-usage-kpis">
        {[['DAU', uniq(dau)], ['WAU', uniq(wau)], ['TB đăng ký → duyệt', avgH == null ? '—' : `${avgH.toFixed(1)} giờ`], ['Nhân viên chưa có STK', noStk == null ? '…' : `${noStk} / ${staff.length}`]].map(([l, v]) => <Card key={String(l)} className="p-3"><div className="text-[12px] text-[var(--mh-text-2)]">{l}</div><div className="text-[20px] font-bold">{v}</div></Card>)}
      </div>
      <div className="grid md:grid-cols-3 gap-2">
        <T title="WAU theo vai trò" data={by(wau, 'role', (v) => ROLE_VI[v] || v)} tid="vn-usage-role" />
        <T title="WAU theo Khối" data={by(wau, 'blockId', (v) => blockName(c, v) || v)} />
        <T title="WAU theo Ban" data={by(wau.filter((x) => x.banKdId), 'banKdId', (v) => c.banKds.find((b) => b.id === v)?.name || v)} />
        <T title="Màn dùng nhiều (7 ngày, lượt)" data={screens.map(([k, n]) => ({ v: k, n }))} />
        <T title="Máy tính vs điện thoại (WAU)" data={dev} tid="vn-usage-device" />
        <T title="Đăng ký NS / ngày" data={regDay.map(([d, n]) => ({ v: d.split('-').reverse().join('/'), n }))} />
        <T title="Chờ duyệt + Cần duyệt lại theo Khối" data={pendK.map((x) => ({ v: blockName(c, x.k) || '—', n: `${x.n} · ${fmt(x.a)} đ` }))} />
      </div>
    </Shell>);
}

// ---------------------------------------------------------------- Trang chủ theo vai trò
export function RoleHome({ c, onGo, memberPending = 0 }: { c: VCtx; onGo: GoFn; memberPending?: number }) {
  const period = defaultPeriod(c.settings);
  const khoi = isKhoiMgr(c); const adm = isAdm(c) || c.role === 'mod'; const acct = c.role === 'accountant';
  const banMgr = c.myBanKdIds.length > 0 || c.role === 'truong_ban_kd';
  const wide = khoi || adm || acct || banMgr;
  const { lines } = useNsLines(c, [period], wide ? 'all' : 'mine');
  const { lines: mine } = useNsLines(c, [period], 'mine');
  const sup = useSupport(c, [period], khoi ? { blockIds: c.myBlockIds } : wide ? {} : { mine: true });
  const supMine = useSupport(c, [period], { mine: true });
  const pay = usePayMap(c.db);
  const todo = useKhoiTodo(c, khoi);
  const gate = useMyPayGate(c);
  const [pick, setPick] = useState('');
  const all = useMemo(() => adaptNs(lines, sup as any, pay, c.projects).filter((r) => r.period === period), [lines, sup, pay, period]);
  const myRows = useMemo(() => adaptNs(mine, supMine as any, pay, c.projects).filter((r) => r.period === period && r.ownerUid === c.uid), [mine, supMine, pay, period]);
  const scope = khoi ? all.filter((r) => c.myBlockIds.includes(r.blockId)) : banMgr && !adm && !acct ? all.filter((r) => c.myBanKdIds.includes(r.banKdId)) : all;
  const groupBy = khoi ? 'teamId' : banMgr && !adm && !acct ? 'projectId' : 'blockId';
  const groupName = (k: string) => (!k ? (groupBy === 'teamId' ? 'NS cấp Khối (không thuộc Phòng)' : '—') : groupBy === 'teamId' ? teamName(c, k) : groupBy === 'projectId' ? projectName(c, k) : blockName(c, k)) || '—';
  const agg = [...aggregate(pick ? scope.filter((r) => r.status === pick) : scope, groupBy as any).entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 12);
  const roleTitle = adm ? 'Admin' : acct ? 'Kế toán' : khoi ? (c.role === 'gd_khoi' ? 'GĐ Khối' : 'Trợ lý Khối') : banMgr ? 'Trưởng / Phó Ban' : 'Nhân viên';
  const Act = ({ label, path, n, tid }: { label: string; path: string; n?: any; tid?: string }) => <button type="button" onClick={() => onGo(path)} data-testid={tid} className="text-left rounded-xl border border-[var(--mh-border)] bg-[var(--mh-surface)] px-3 py-2.5 hover:shadow-sm flex flex-col justify-between min-h-[62px]"><div className="text-[12px] text-[var(--mh-text-2)]">{label}</div>{n != null ? <div className="text-[18px] font-bold">{n}</div> : <div className="text-[12px] font-medium text-[var(--mh-text-3)]">Xem chi tiết →</div>}</button>;
  return (
    <Shell title={`Xin chào, ${c.name || ''}`} sub={`Trang chủ ${roleTitle} · ${periodLabel(period)}`}>
      <div data-testid="vn-home" data-role={roleTitle} className="space-y-4">
        <LockBanner c={c} />
        {(() => { const me = { uid: c.uid, email: c.email, role: c.role } as any; const isLeader = (c.banKds || []).some((b: any) => isBanKdLeader(b, me, me)); const isDeputy = (c.banKds || []).some((b: any) => isBanKdDeputy(b, me, me)); return kycRequired(c.role, { profile: c.profile || c.users.find((u: any) => (u.uid || u.id) === c.uid), isBanLeader: isLeader || c.role === 'truong_ban_kd', isBanDeputy: isDeputy }) && gate.rows.length > 0; })() && <Card className="p-3 text-[13px] border-[#CDB2F0] bg-[#F1E8FC]" data-testid="vn-home-needpay">💳 {gate.rows.length} khoản NS của bạn đang <b>Chờ STK</b> ({fmt(gate.amount)} đ). <Btn small primary onClick={() => window.dispatchEvent(new CustomEvent('vn-open-kyc'))}>Cập nhật thông tin thanh toán</Btn></Card>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="vn-home-actions">
          {khoi && <><Act label="Chờ duyệt" n={todo.pending.n} path="/quan-ly-khoi" tid="vn-home-act-pending" /><Act label="Cần duyệt lại" n={todo.reapproval.n} path="/quan-ly-khoi" /><Act label="Thành viên chờ duyệt" n={memberPending} path="/quan-ly-khoi" /></>}
          {banMgr && !adm && <><Act label="Quản lý Ban KD" path="/quan-ly-ban-kd" tid="vn-home-act-ban" /><Act label="Thông tin Hỗ trợ" path="/thong-tin-ho-tro" /></>}
          {acct && <><Act label="Đã duyệt chờ chi trả" n={fmt(scope.filter((r) => r.status === 'approved').reduce((a, r) => a + r.amount, 0))} path="/quan-ly-khoi" tid="vn-home-act-payout" /><Act label="Ngân sách MKT" path="/ngan-sach-khoi" /></>}
          {adm && <><Act label="Duyệt tài khoản" n={memberPending} path="/duyet-tai-khoan" /><Act label="Nhật ký lỗi" path="/nhat-ky-loi" tid="vn-home-act-errors" /><Act label="Thống kê sử dụng" path="/thong-ke-su-dung" /><Act label="Khoá theo ngày" path="/khoa-theo-ngay" /></>}
          {!wide && <><Act label="Đăng ký / sửa NS MKT" path="/quan-ly-phong-kd" tid="vn-home-act-register" /><Act label="Thông tin Hỗ trợ" path="/thong-tin-ho-tro" /></>}
        </div>
        {(!wide || khoi || banMgr) && myRows.length > 0 && <Card className="p-3 space-y-2" data-testid="vn-home-mine"><div className="font-semibold text-[14px]">NS của tôi · {periodLabel(period)}</div>
          <SummaryBox split={{ total: summarize(myRows).total, ...summarize(myRows).by }} testId="vn-home-mine-split" />
          <div className="divide-y divide-[var(--mh-surface-2)]">{myRows.slice(0, 8).map((r) => <div key={r.id} className="flex items-center gap-2 py-1.5 text-[13px]"><span className="flex-1 truncate">{projectName(c, r.projectId)}</span><b className="tabular-nums">{fmt(r.amount)}</b><StatusBadge status={r.status} small /></div>)}</div></Card>}
        {!wide && !myRows.length && <Card className="p-4 text-[13px]">Bạn chưa đăng ký NS MKT {periodLabel(period)}. <Btn small primary onClick={() => onGo('/quan-ly-phong-kd')}>Đăng ký ngay</Btn></Card>}
        {wide && <Card className="p-3 space-y-2" data-testid="vn-home-scope"><div className="font-semibold text-[14px]">{khoi ? 'NS Khối của tôi' : banMgr && !adm && !acct ? 'NS Ban của tôi' : 'NS toàn hệ thống'} · {periodLabel(period)}</div>
          <SummaryBox split={{ total: summarize(scope).total, ...summarize(scope).by }} onPick={(s) => setPick(s)} active={pick} testId="vn-home-split" />
          <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>{groupBy === 'teamId' ? 'Phòng' : groupBy === 'projectId' ? 'Dự án' : 'Khối'}</Th><Th r>Tổng</Th>{(['approved', 'pending', 'reapproval', 'need_pay', 'rejected'] as const).map((k) => <Th key={k} r className="hidden md:table-cell">{ST_META[k].label}</Th>)}</tr></thead><tbody>
            {agg.map(([k, s]) => <tr key={k}><Td className="text-[12px]">{groupName(k)}</Td><Td r className="font-semibold">{fmt(s.total)}</Td>{(['approved', 'pending', 'reapproval', 'need_pay', 'rejected'] as const).map((st) => <Td key={st} r className="hidden md:table-cell text-[12px]">{s.by[st].n ? `${fmt(s.by[st].amount)} (${s.by[st].n})` : '—'}</Td>)}</tr>)}
          </tbody></table></div></Card>}
      </div>
    </Shell>);
}
