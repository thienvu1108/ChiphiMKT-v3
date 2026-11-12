/** Duyệt NS tầng Ban theo KHỐI — chỉ dự án thuộc Ban (projectId ∈ allowedProjectIds).
 * Cấu trúc: Khối → Dự án (số dòng, tổng tiền, trạng thái) → mở rộng dòng NV.
 * Trưởng Ban: Duyệt/Từ chối cả Khối. Admin/KT: thêm nút từng dòng. */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { decideBanSupportBatch } from './SupportViews';
import { BAN_NS_FILTER_SS, BAN_NS_FOCUS_BLOCK_SS } from './BanPendingGate';
import { BAN_STATUS_LABEL, effectiveBanStatus, banReasonText, type BanEffectiveStatus, type BanStoredStatus } from '../../lib/vnext/banSupport';
import { supportable, type Support } from '../../lib/vnext/support';
import type { NsLine } from '../../lib/vnext/budget';
import { periodLabel, VNEXT_PERIOD_CUTOVER } from '../../lib/vnext/period';
import { type VCtx, projectName, blockName, userName } from './ctx';
import { Card, Btn, fmt, useToast } from './ui';
import { deputyBlocked, approverLog, type BanApproverRole } from '../lib/banApprover';
import { groupByProject, matchesBlock, bulkSummary, projectBulkTargets, needsBulkConfirm, validBanReason } from '../lib/banNsFilters';

type Row = { line: NsLine; s?: Support; ban: BanEffectiveStatus };
type BanFilter = 'todo' | 'approved' | 'rejected' | 'all';

const FILTER_LABEL: Record<BanFilter, string> = {
  todo: 'Chờ Ban duyệt',
  approved: 'Ban đã duyệt',
  rejected: 'Ban từ chối',
  all: 'Tất cả (đã tới Ban)',
};

type ProjectGroup = {
  projectId: string;
  label: string;
  rows: Row[];
  amount: number;
  pending: number;
  approved: number;
  rejected: number;
  /** pending > rejected > approved summary */
  statusLabel: string;
  statusTone: 'pending' | 'rejected' | 'approved';
};

type KhoiGroup = {
  blockId: string;
  label: string;
  rows: Row[];
  projects: ProjectGroup[];
  amount: number;
  pending: number;
  approved: number;
  rejected: number;
};

function projectStatus(p: ProjectGroup): Pick<ProjectGroup, 'statusLabel' | 'statusTone'> {
  if (p.pending > 0) return { statusLabel: `Chờ Ban duyệt (${p.pending})`, statusTone: 'pending' };
  if (p.rejected > 0) return { statusLabel: `Ban từ chối (${p.rejected})`, statusTone: 'rejected' };
  return { statusLabel: `Ban đã duyệt (${p.approved})`, statusTone: 'approved' };
}

export function BanNsApprovePanel({
  c, lines, sup, canApprove, allowLineActions = false, allowedProjectIds,
  filterMonth, filterBlock, filterProject, approverRole,
}: {
  c: VCtx;
  lines: NsLine[];
  sup: Record<string, Support | undefined>;
  canApprove: boolean;
  allowLineActions?: boolean;
  /** Chỉ giữ dòng có projectId thuộc Ban (Set project id). */
  allowedProjectIds?: Set<string>;
  filterMonth?: string;
  filterBlock?: string;
  filterProject?: string;
  /** Vai trò người duyệt (leader/deputy/admin) — ghi banDecidedRole; Phó Ban không ghi đè Trưởng Ban. */
  approverRole?: BanApproverRole;
}) {
  const { toast, node } = useToast();
  const [busy, setBusy] = useState(false);
  const [rej, setRej] = useState<Row[] | null>(null);
  const [reasonMode, setReasonMode] = useState<'rejected' | 'pending'>('rejected');
  const [reason, setReason] = useState('');
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ rows: Row[]; status: BanStoredStatus; title: string; needReason: boolean } | null>(null);
  const [cReason, setCReason] = useState('');
  const [groupMode, setGroupMode] = useState<'project' | 'khoi'>('project');
  const [closedByProject, setClosedByProject] = useState<Set<string>>(new Set());
  const [banFilter, setBanFilter] = useState<BanFilter>(() => {
    try {
      const v = sessionStorage.getItem(BAN_NS_FILTER_SS);
      if (v === 'todo' || v === 'approved' || v === 'rejected' || v === 'all') {
        sessionStorage.removeItem(BAN_NS_FILTER_SS);
        return v;
      }
    } catch { /* ignore */ }
    return 'approved';
  });

  useEffect(() => {
    try {
      const focus = sessionStorage.getItem(BAN_NS_FOCUS_BLOCK_SS);
      if (focus) {
        sessionStorage.removeItem(BAN_NS_FOCUS_BLOCK_SS);
        setOpenBlocks(new Set([focus])); setGroupMode('khoi');
        setBanFilter('todo');
      }
    } catch { /* ignore */ }
  }, []);

  const allRows: Row[] = useMemo(() => {
    return lines
      .filter((l) => supportable(l) && l.period >= VNEXT_PERIOD_CUTOVER)
      .filter((l) => !allowedProjectIds || allowedProjectIds.has(l.projectId))
      .filter((l) => !filterMonth || filterMonth === 'all' || l.period === filterMonth)
      .filter((l) => matchesBlock(l as any, filterBlock, (id) => { const b: any = c.blocks.find((x) => x.id === id); return b?.code || b?.blockCode; }))
      .filter((l) => !filterProject || filterProject === 'all' || l.projectId === filterProject)
      .map((line) => ({ line, s: sup[line.id], ban: effectiveBanStatus(line, sup[line.id]) }))
      .filter((r) => r.ban === 'pending' || r.ban === 'approved' || r.ban === 'rejected')
      .sort((a, b) => blockName(c, a.line.blockId).localeCompare(blockName(c, b.line.blockId), 'vi')
        || projectName(c, a.line.projectId).localeCompare(projectName(c, b.line.projectId), 'vi')
        || String(a.line.ownerName || '').localeCompare(String(b.line.ownerName || ''), 'vi'));
  }, [lines, sup, allowedProjectIds, filterMonth, filterBlock, filterProject, c.blocks, c.projects]);

  const counts = useMemo(() => {
    const o = { todo: 0, approved: 0, rejected: 0, all: allRows.length };
    for (const r of allRows) {
      if (r.ban === 'pending') o.todo++;
      else if (r.ban === 'approved') o.approved++;
      else if (r.ban === 'rejected') o.rejected++;
    }
    return o;
  }, [allRows]);

  const rows = useMemo(() => {
    if (banFilter === 'all') return allRows;
    if (banFilter === 'todo') return allRows.filter((r) => r.ban === 'pending');
    return allRows.filter((r) => r.ban === banFilter);
  }, [allRows, banFilter]);

  const groups: KhoiGroup[] = useMemo(() => {
    const m = new Map<string, KhoiGroup>();
    for (const r of rows) {
      const blockId = r.line.blockId || '_none';
      let g = m.get(blockId);
      if (!g) {
        g = {
          blockId,
          label: blockId === '_none' ? '(Chưa gắn Khối)' : blockName(c, blockId),
          rows: [],
          projects: [],
          amount: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        };
        m.set(blockId, g);
      }
      g.rows.push(r);
      g.amount += Number(r.line.amount) || 0;
      if (r.ban === 'pending') g.pending++;
      else if (r.ban === 'approved') g.approved++;
      else if (r.ban === 'rejected') g.rejected++;
    }
    for (const g of m.values()) {
      const pm = new Map<string, ProjectGroup>();
      for (const r of g.rows) {
        const projectId = r.line.projectId || '_none';
        let p = pm.get(projectId);
        if (!p) {
          p = {
            projectId,
            label: projectId === '_none' ? '(Chưa gắn dự án)' : projectName(c, projectId),
            rows: [],
            amount: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
            statusLabel: '',
            statusTone: 'approved',
          };
          pm.set(projectId, p);
        }
        p.rows.push(r);
        p.amount += Number(r.line.amount) || 0;
        if (r.ban === 'pending') p.pending++;
        else if (r.ban === 'approved') p.approved++;
        else if (r.ban === 'rejected') p.rejected++;
      }
      g.projects = Array.from(pm.values()).map((p) => ({ ...p, ...projectStatus(p) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [rows, c.blocks, c.projects]);

  const byProject = useMemo(() => groupByProject<Row>(rows, {
    projectId: (r) => r.line.projectId,
    amount: (r) => r.line.amount,
    projectName: (id) => projectName(c, id),
    blockName: (r) => (r.line.blockId ? blockName(c, r.line.blockId) : '(Chưa gắn Khối)'),
  }), [rows, c.blocks, c.projects]);

  const run = async (list0: Row[], banStatus: BanStoredStatus, why = '') => {
    const list = list0.filter((r) => !deputyBlocked(approverRole, r.s as any));
    if (!list.length || !canApprove) { if (list0.length) toast('Trưởng Ban đã quyết định các bản này — Phó Ban không ghi đè', 'err'); return; }
    setBusy(true);
    try {
      const res = await decideBanSupportBatch(
        c,
        list.map((r) => ({ line: r.line, prev: r.s as any })),
        banStatus,
        why,
        approverRole,
      ).then((x) => x || { written: list.length, skipped: 0 });
      toast(`Đã ${BAN_STATUS_LABEL[banStatus].toLowerCase()} ${res.written} bản (${new Set(list.map((r) => r.line.blockId)).size} Khối)${res.skipped ? ` · bỏ qua ${res.skipped} bản Trưởng Ban đã quyết định` : ''}`);
      setRej(null); setReason(''); setReasonMode('rejected');
    } catch (e: any) {
      toast('Lỗi: ' + (e?.code || e?.message || String(e)), 'err');
    } finally {
      setBusy(false);
    }
  };

  const sumOf = (list: Row[]) => bulkSummary(list, { blockId: (r) => r.line.blockId, amount: (r) => r.line.amount });
  /** Bulk: popup xác nhận nếu >1 bản/Khối; lý do bắt buộc khi từ chối / đặt lại. */
  const ask = (list: Row[], status: BanStoredStatus, title: string) => {
    if (!list.length || !canApprove) return;
    const needReason = status !== 'approved';
    if (!needsBulkConfirm(sumOf(list))) {
      if (needReason) { setReason(''); setReasonMode(status as any); setRej(list); } else run(list, status);
      return;
    }
    setCReason(''); setConfirm({ rows: list, status, title, needReason });
  };

  const toggleBlock = (blockId: string) => {
    setOpenBlocks((prev) => {
      const n = new Set(prev);
      n.has(blockId) ? n.delete(blockId) : n.add(blockId);
      return n;
    });
  };
  const toggleProject = (key: string) => {
    setOpenProjects((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  if (!allRows.length) return null;

  const lineActions = (r: Row) => {
    if (!canApprove || !allowLineActions) return null;
    if (deputyBlocked(approverRole, r.s as any)) return <span className="text-[11px] text-[var(--mh-text-3)]" data-testid="vn-ban-leader-locked">Trưởng Ban đã quyết định</span>;
    if (r.ban === 'pending') {
      return <>
        <Btn small primary disabled={busy} onClick={() => run([r], 'approved')} data-testid="vn-ban-approve">Duyệt</Btn>{' '}
        <Btn small danger disabled={busy} onClick={() => { setReason(''); setReasonMode('rejected'); setRej([r]); }} data-testid="vn-ban-reject">Từ chối</Btn>
      </>;
    }
    if (r.ban === 'approved') {
      return <>
        <Btn small danger disabled={busy} onClick={() => { setReason(''); setReasonMode('rejected'); setRej([r]); }} data-testid="vn-ban-reject">Từ chối</Btn>{' '}
        <Btn small disabled={busy} onClick={() => { setReason(''); setReasonMode('pending'); setRej([r]); }} data-testid="vn-ban-reset">Đặt lại</Btn>
      </>;
    }
    return <>
      <Btn small primary disabled={busy} onClick={() => run([r], 'approved')} data-testid="vn-ban-reapprove">Duyệt lại</Btn>{' '}
      <Btn small disabled={busy} onClick={() => { setReason(''); setReasonMode('pending'); setRej([r]); }} data-testid="vn-ban-reset">Đặt lại</Btn>
    </>;
  };

  const khoiActions = (g0: { rows: Row[] }) => {
    if (!canApprove) return null;
    const g = { rows: g0.rows.filter((r) => !deputyBlocked(approverRole, r.s as any)) };
    const pending = g.rows.filter((r) => r.ban === 'pending');
    const approved = g.rows.filter((r) => r.ban === 'approved');
    const rejected = g.rows.filter((r) => r.ban === 'rejected');
    return (
      <div className="flex flex-wrap gap-1.5" data-testid="vn-ban-khoi-actions">
        {pending.length > 0 && (
          <Btn small primary disabled={busy} onClick={() => ask(pending, 'approved', 'Duyệt cả Khối')} data-testid="vn-ban-khoi-approve">
            Duyệt cả Khối ({pending.length})
          </Btn>
        )}
        {(pending.length + approved.length) > 0 && (
          <Btn small danger disabled={busy} onClick={() => ask([...pending, ...approved], 'rejected', 'Từ chối cả Khối')} data-testid="vn-ban-khoi-reject">
            Từ chối cả Khối
          </Btn>
        )}
        {rejected.length > 0 && (
          <Btn small primary disabled={busy} onClick={() => ask(rejected, 'approved', 'Duyệt lại Khối')} data-testid="vn-ban-khoi-reapprove">
            Duyệt lại Khối ({rejected.length})
          </Btn>
        )}
        {(approved.length + rejected.length) > 0 && (
          <Btn small disabled={busy} onClick={() => ask([...approved, ...rejected], 'pending', 'Đặt lại chờ duyệt')} data-testid="vn-ban-khoi-reset">
            Đặt lại chờ duyệt
          </Btn>
        )}
      </div>
    );
  };

  const toneClass = (tone: ProjectGroup['statusTone']) =>
    tone === 'rejected' ? 'text-[var(--mh-err,var(--mh-err))]' : tone === 'pending' ? 'text-[var(--mh-pending,#7C3AED)]' : 'text-[var(--mh-ok,var(--mh-ok))]';

  return (
    <Card className="border-[var(--mh-navy-200,#B8CDEF)] bg-[var(--mh-navy-50,var(--mh-navy-50))]/60" data-testid="vn-ban-approve-panel">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-[var(--mh-navy-100,var(--mh-navy-100))]">
        <div className="font-semibold text-[14px] flex-1 text-[var(--mh-navy,var(--mh-navy))]">Duyệt ngân sách Ban · chỉ dự án của Ban</div>
        {counts.todo > 0 && (
          <button
            type="button"
            onClick={() => setBanFilter('todo')}
            className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-[var(--mh-navy,var(--mh-navy))] text-white hover:bg-[var(--mh-navy-hover,var(--mh-navy-hover))]"
            data-testid="vn-ban-todo-kpi"
          >
            Chờ Ban duyệt: {counts.todo}
          </button>
        )}
        {!canApprove && <span className="text-[12px] text-[var(--mh-pending,#7C3AED)]">Chỉ xem</span>}
        {approverRole === 'deputy' && <span className="text-[12px] text-[var(--mh-pending,#7C3AED)]" data-testid="vn-ban-deputy-note">Phó Ban duyệt được · quyết định của Trưởng Ban được ưu tiên</span>}
      </div>
      <div className="px-3 py-2 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap border-b border-[var(--mh-navy-100,var(--mh-navy-100))]" data-testid="vn-ban-filter">
        {(['todo', 'approved', 'rejected', 'all'] as BanFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`text-[12px] px-2.5 py-1 min-h-11 md:min-h-0 rounded-full font-semibold border cursor-pointer ${banFilter === f ? 'bg-[var(--mh-navy,var(--mh-navy))] text-white border-[var(--mh-navy,var(--mh-navy))]' : 'bg-[var(--mh-surface,#fff)] text-[var(--mh-navy,var(--mh-navy))] border-[var(--mh-navy-200,#B8CDEF)]'}`}
            onClick={() => setBanFilter(f)}
            data-testid={`vn-ban-filter-${f}`}
          >
            {FILTER_LABEL[f]} ({counts[f]})
          </button>
        ))}
      </div>

      <div className="px-3 py-2 flex flex-wrap items-center gap-1.5 border-b border-[var(--mh-navy-100,var(--mh-navy-100))]" data-testid="vn-ban-group-mode">
        <span className="text-[12px] text-[var(--mh-text-2)] mr-1">Sắp xếp:</span>
        {(['project', 'khoi'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setGroupMode(m)} data-testid={`vn-ban-group-${m}`}
            className={`text-[12px] px-2.5 py-1 min-h-11 md:min-h-0 rounded-full font-semibold border ${groupMode === m ? 'bg-[var(--mh-navy)] text-white border-[var(--mh-navy)]' : 'bg-[var(--mh-surface)] text-[var(--mh-navy)] border-[var(--mh-navy-200,#B8CDEF)]'}`}>
            {m === 'project' ? 'Theo dự án' : 'Theo Khối'}
          </button>
        ))}
      </div>

      {groupMode === 'project' ? (
      <div className="divide-y divide-[var(--mh-border)]" data-testid="vn-ban-project-view">
        {!byProject.length ? (
          <div className="p-4 text-[13px] text-[var(--mh-text-3)] italic">Không có bản ghi phù hợp bộ lọc.</div>
        ) : byProject.map((p) => {
          const open = !closedByProject.has(p.projectId);
          const pendingAmt = p.rows.filter((r) => r.ban === 'pending').reduce((s2, r) => s2 + (Number(r.line.amount) || 0), 0);
          const khoiSubs: string[] = Array.from(new Set(p.rows.map((r) => String(r.line.blockId || "_none"))));
          return (
            <div key={p.projectId} className="bg-[var(--mh-surface)]" data-testid="vn-ban-pgroup" data-project={p.projectId}>
              <button type="button" className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-[var(--mh-surface-2)]"
                onClick={() => setClosedByProject((prev) => { const n = new Set(prev); n.has(p.projectId) ? n.delete(p.projectId) : n.add(p.projectId); return n; })}
                data-testid="vn-ban-pgroup-toggle">
                <span className="font-bold text-[13px] text-[var(--mh-text)] flex-1 min-w-[160px]">
                  <span className="inline-block w-4 text-[var(--mh-navy)]">{open ? '▾' : '▸'}</span>{p.label}
                </span>
                <span className="text-[12px] text-[var(--mh-text-2)]">{p.blocks.length} Khối · {p.rows.length} bản</span>
                <span className="text-[12px] font-bold tabular-nums text-[var(--mh-text)]" data-testid="vn-ban-pgroup-subtotal">Tổng: {fmt(p.subtotal)} đ</span>
                {pendingAmt > 0 && <span className="text-[12px] font-bold tabular-nums text-[var(--mh-pending,#7C3AED)]">Cần duyệt: {fmt(pendingAmt)} đ</span>}
              </button>
              {(() => {
                const tg = projectBulkTargets<Row>(p.rows, canApprove, (r) => !deputyBlocked(approverRole, r.s as any));
                if (!tg.length) return null;
                return (
                  <div className="px-4 pb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" data-testid="vn-ban-project-bulk">
                    <Btn small primary disabled={busy} className="min-h-11 md:min-h-0 justify-center" onClick={() => ask(tg, 'approved', `Duyệt cả dự án · ${p.label}`)} data-testid="vn-ban-project-approve">Duyệt cả dự án ({tg.length})</Btn>
                    <Btn small danger disabled={busy} className="min-h-11 md:min-h-0 justify-center" onClick={() => ask(tg, 'rejected', `Từ chối cả dự án · ${p.label}`)} data-testid="vn-ban-project-reject">Từ chối cả dự án</Btn>
                  </div>
                );
              })()}
              {open && (
                <div className="bg-[var(--mh-surface-2)]/60 md:px-0" data-testid="vn-ban-pgroup-khoi-list">
                  {khoiSubs.map((bid) => {
                    const sub = p.rows.filter((r) => (r.line.blockId || '_none') === bid);
                    const subKey = `P::${p.projectId}::${bid}`;
                    const subOpen = openProjects.has(subKey);
                    const subAmount = sub.reduce((s2, r) => s2 + (Number(r.line.amount) || 0), 0);
                    const subPending = sub.filter((r) => r.ban === 'pending').length;
                    return (
                      <div key={bid} className="border-t border-[var(--mh-border)]" data-testid="vn-ban-pgroup-khoi" data-block={bid}>
                        <div className="px-4 py-2.5 pl-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <button type="button" className="text-left flex-1 min-w-0 flex flex-wrap items-center gap-2" onClick={() => toggleProject(subKey)} data-testid="vn-ban-pgroup-khoi-toggle">
                            <span className="text-[var(--mh-text-2)] w-3">{subOpen ? '▾' : '▸'}</span>
                            <span className="font-semibold text-[13px] text-[var(--mh-text)] min-w-[140px]">{bid === '_none' ? '(Chưa gắn Khối)' : blockName(c, bid)}</span>
                            <span className="text-[12px] text-[var(--mh-text-2)]">{sub.length} dòng · {fmt(subAmount)} đ{subPending ? ` · chờ ${subPending}` : ''}</span>
                          </button>
                          {khoiActions({ rows: sub })}
                        </div>
                        {subOpen && (
                          <div className="overflow-x-auto bg-[var(--mh-surface-2)]/80">
                            <table data-mh-responsive className="w-full text-[13px]">
                              <thead><tr className="text-left text-[11px] text-[var(--mh-text-2)]">
                                <th className="p-2 pl-10">Người ĐK</th><th className="p-2">Kỳ</th>
                                <th className="p-2 text-right">Số tiền cần duyệt (đ)</th><th className="p-2">Trạng thái Ban</th>
                                {canApprove && allowLineActions && <th className="p-2" />}
                              </tr></thead>
                              <tbody>
                                {sub.map((r) => (
                                  <tr key={r.line.id} className="border-t border-[var(--mh-border)]" data-testid="vn-ban-approve-row" data-line={r.line.id} data-ban={r.ban}>
                                    <td data-label="Người ĐK" className="p-2 pl-10 font-medium">{r.line.ownerName || userName(c, r.line.ownerUid)}{r.line.kind === 'khoi' ? <span className="ml-1 text-[10px] text-[var(--mh-text-2)]">NS Khối</span> : null}</td>
                                    <td data-label="Kỳ" className="p-2 whitespace-nowrap">{periodLabel(r.line.period)}</td>
                                    <td data-label="Số tiền cần duyệt" className="p-2 text-right tabular-nums font-bold text-[var(--mh-text)]">{fmt(r.line.amount)}</td>
                                    <td data-label="Trạng thái Ban" className="p-2 whitespace-nowrap">
                                      <span className={`text-[11px] font-semibold ${r.ban === 'rejected' ? 'text-[var(--mh-err)]' : r.ban === 'approved' ? 'text-[var(--mh-ok)]' : 'text-[var(--mh-pending,#7C3AED)]'}`}>{BAN_STATUS_LABEL[r.ban]}</span>
                                      {(r.ban === 'rejected' || r.ban === 'pending') && banReasonText(r.s) ? <div className="text-[11px] max-w-[200px] text-[var(--mh-text-2)]">{banReasonText(r.s)}</div> : null}
                                      {(r.s as any)?.banDecidedRole === 'leader' && approverRole === 'deputy' ? <div className="text-[10px] text-[var(--mh-text-3)]">Trưởng Ban đã quyết định</div> : null}
                                      <ApproverLog hist={(r.s as any)?.history} />
                                    </td>
                                    {canApprove && allowLineActions && <td data-label="Thao tác" className="p-2 whitespace-nowrap">{lineActions(r)}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      ) : (
      <div className="divide-y divide-[var(--mh-navy-100,var(--mh-navy-100))]" data-testid="vn-ban-khoi-list">
        {!groups.length ? (
          <div className="p-4 text-[13px] text-[var(--mh-text-3)] italic">Không có bản ghi phù hợp bộ lọc.</div>
        ) : groups.map((g) => {
          const open = openBlocks.has(g.blockId);
          return (
            <div key={g.blockId} className="bg-[var(--mh-surface)]/60" data-testid="vn-ban-khoi-group" data-block={g.blockId}>
              <div className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <button type="button" className="text-left flex-1 min-w-0" onClick={() => toggleBlock(g.blockId)} data-testid="vn-ban-khoi-toggle">
                  <div className="font-bold text-[13px] text-[var(--mh-text)]">
                    <span className="inline-block w-4 text-[var(--mh-navy,var(--mh-navy))]">{open ? '▾' : '▸'}</span>
                    {g.label}
                  </div>
                  <div className="text-[12px] text-[var(--mh-text-2)] mt-0.5 pl-4">
                    {g.projects.length} dự án · {g.rows.length} dòng · {fmt(g.amount)} đ
                    {g.pending ? ` · chờ ${g.pending}` : ''}
                    {g.rejected ? ` · từ chối ${g.rejected}` : ''}
                    {g.approved ? ` · đã duyệt ${g.approved}` : ''}
                  </div>
                </button>
                {khoiActions(g)}
              </div>
              {open && (
                <div className="border-t border-[var(--mh-navy-50,var(--mh-navy-50))] bg-[var(--mh-surface)]" data-testid="vn-ban-project-list">
                  {g.projects.map((p) => {
                    const pkey = `${g.blockId}|${p.projectId}`;
                    const pOpen = openProjects.has(pkey);
                    return (
                      <div key={pkey} className="border-t border-[var(--mh-border)]" data-testid="vn-ban-project-group" data-project={p.projectId}>
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2.5 pl-8 hover:bg-[var(--mh-surface-2)] flex flex-wrap items-center gap-2"
                          onClick={() => toggleProject(pkey)}
                          data-testid="vn-ban-project-toggle"
                        >
                          <span className="text-[var(--mh-text-2)] w-3">{pOpen ? '▾' : '▸'}</span>
                          <span className="font-semibold text-[13px] text-[var(--mh-text)] flex-1 min-w-[140px]">{p.label}</span>
                          <span className="text-[12px] text-[var(--mh-text-2)]">{p.rows.length} dòng · {fmt(p.amount)} đ</span>
                          <span className={`text-[11px] font-bold ${toneClass(p.statusTone)}`}>{p.statusLabel}</span>
                        </button>
                        {pOpen && (
                          <div className="overflow-x-auto bg-[var(--mh-surface-2)]/80">
                            <table data-mh-responsive className="w-full text-[13px]">
                              <thead><tr className="text-left text-[11px] text-[var(--mh-text-2)]">
                                <th className="p-2 pl-12">Họ tên</th><th className="p-2">Kỳ</th>
                                <th className="p-2 text-right">NS (đ)</th><th className="p-2">Trạng thái Ban</th>
                                {canApprove && allowLineActions && <th className="p-2" />}
                              </tr></thead>
                              <tbody>
                                {p.rows.map((r) => (
                                  <tr key={r.line.id} className="border-t border-[var(--mh-border)]" data-testid="vn-ban-approve-row" data-line={r.line.id} data-ban={r.ban}>
                                    <td className="p-2 pl-12 font-medium">{r.line.ownerName || userName(c, r.line.ownerUid)}{r.line.kind === 'khoi' ? <span className="ml-1 text-[10px] text-[var(--mh-text-2)]">NS Khối</span> : null}</td>
                                    <td className="p-2 whitespace-nowrap">{periodLabel(r.line.period)}</td>
                                    <td className="p-2 text-right tabular-nums font-semibold">{fmt(r.line.amount)}</td>
                                    <td className="p-2 whitespace-nowrap">
                                      <span className={`text-[11px] font-semibold ${r.ban === 'rejected' ? 'text-[var(--mh-err)]' : r.ban === 'approved' ? 'text-[#0F7B4A]' : 'text-[var(--mh-warn)]'}`}>{BAN_STATUS_LABEL[r.ban]}</span>
                                      {(r.ban === 'rejected' || r.ban === 'pending') && banReasonText(r.s) ? <div className={`text-[11px] max-w-[200px] ${r.ban === 'rejected' ? 'text-[var(--mh-err,var(--mh-err))]' : 'text-[var(--mh-pending,#7C3AED)]'}`}>{banReasonText(r.s)}</div> : null}
                                      <ApproverLog hist={(r.s as any)?.history} />
                                    </td>
                                    {canApprove && allowLineActions && <td className="p-2 whitespace-nowrap">{lineActions(r)}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {rej && (
        <div className="p-4 border-t border-[var(--mh-navy-100,var(--mh-navy-100))] space-y-2" data-testid={reasonMode === 'rejected' ? 'vn-ban-reject-modal' : 'vn-ban-reset-modal'}>
          <div className="text-[13px] font-semibold">
            {reasonMode === 'rejected' ? 'Từ chối Ban' : 'Đặt lại chờ Ban duyệt'} · {rej.length} bản — lý do bắt buộc (GĐK/Trợ lý Khối sẽ nhận thông báo)
          </div>
          <textarea className="w-full border rounded-lg p-2 text-[13px]" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (≥ 3 ký tự)" data-testid="vn-ban-reject-reason" />
          <div className="flex gap-2">
            <Btn small danger={reasonMode === 'rejected'} disabled={busy || reason.trim().length < 3} onClick={() => run(rej, reasonMode, reason.trim())} data-testid="vn-ban-reason-confirm">
              {reasonMode === 'rejected' ? 'Xác nhận từ chối' : 'Xác nhận đặt lại'}
            </Btn>
            <Btn small disabled={busy} onClick={() => { setRej(null); setReasonMode('rejected'); }}>Huỷ</Btn>
          </div>
        </div>
      )}
      {confirm && createPortal(
        <>
          <div className="fixed inset-0 z-[1290] bg-black/50" onClick={() => !busy && setConfirm(null)} />
          <div role="dialog" aria-modal="true" aria-label={confirm.title} data-testid="vn-ban-bulk-confirm"
            className="fixed z-[1300] inset-x-0 bottom-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] max-h-[85dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-[var(--mh-surface,#fff)] text-[var(--mh-text)] border border-[var(--mh-border)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="text-[15px] font-bold mb-2">{confirm.title}</div>
            {(() => { const sm = sumOf(confirm.rows); return (
              <div className="grid grid-cols-3 gap-2 mb-3 text-center" data-testid="vn-ban-bulk-summary">
                <div className="rounded-xl bg-[var(--mh-surface-2)] p-2"><div className="text-[18px] font-black">{sm.khoi}</div><div className="text-[11px] text-[var(--mh-text-2)]">Khối</div></div>
                <div className="rounded-xl bg-[var(--mh-surface-2)] p-2"><div className="text-[18px] font-black">{sm.records}</div><div className="text-[11px] text-[var(--mh-text-2)]">bản</div></div>
                <div className="rounded-xl bg-[var(--mh-surface-2)] p-2"><div className="text-[15px] font-black tabular-nums">{fmt(sm.total)}</div><div className="text-[11px] text-[var(--mh-text-2)]">đồng</div></div>
              </div>); })()}
            <div className="text-[13px] text-[var(--mh-text-2)] mb-2">
              {confirm.status === 'approved' ? 'Xác nhận duyệt toàn bộ các bản trên?' : confirm.status === 'rejected' ? 'Từ chối toàn bộ các bản trên — lý do bắt buộc, GĐK/Trợ lý Khối sẽ nhận thông báo cho từng bản.' : 'Đặt lại chờ Ban duyệt — lý do bắt buộc.'}
            </div>
            {confirm.needReason && (
              <textarea className="w-full rounded-lg p-2 text-[13px] border border-[var(--mh-border)] bg-[var(--mh-surface-2)] text-[var(--mh-text)]" rows={3} value={cReason}
                onChange={(e) => setCReason(e.target.value)} placeholder="Lý do (≥ 3 ký tự)" data-testid="vn-ban-bulk-reason" />
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Btn className="min-h-11 justify-center" disabled={busy} onClick={() => setConfirm(null)} data-testid="vn-ban-bulk-cancel">Huỷ</Btn>
              <Btn className="min-h-11 justify-center" primary={confirm.status === 'approved'} danger={confirm.status === 'rejected'}
                disabled={busy || (confirm.needReason && !validBanReason(cReason))}
                onClick={async () => { const c0 = confirm; await run(c0.rows, c0.status, c0.needReason ? cReason.trim() : ''); setConfirm(null); }}
                data-testid="vn-ban-bulk-ok">
                {confirm.status === 'approved' ? 'Xác nhận duyệt' : confirm.status === 'rejected' ? 'Xác nhận từ chối' : 'Xác nhận đặt lại'}
              </Btn>
            </div>
          </div>
        </>,
        document.body,
      )}
      {node}
    </Card>
  );
}

export function BanStatusChip({ line, s }: { line: NsLine; s?: Support }) {
  const ban = effectiveBanStatus(line, s);
  if (ban === 'na' || ban === 'approved') return null;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${ban === 'rejected' ? 'mh-badge-err bg-[var(--mh-err-soft)] text-[var(--mh-err)]' : 'mh-badge-pending bg-[var(--mh-pending-soft)] text-[var(--mh-pending)]'}`} data-testid="vn-ban-chip">{ban === 'pending' ? 'Chờ Ban' : 'Ban từ chối'}</span>;
}

/** Nhật ký người duyệt của 1 bản ghi (ai · vai trò · hành động · lý do · thời gian). */
function ApproverLog({ hist }: { hist?: any[] }) {
  const rows = approverLog(hist);
  if (!rows.length) return null;
  return (
    <details className="mt-1 text-[11px]" data-testid="vn-ban-approver-log">
      <summary className="cursor-pointer text-[var(--mh-navy)] font-semibold min-h-11 md:min-h-0 flex items-center">Lịch sử duyệt ({rows.length})</summary>
      <ul className="mt-1 space-y-1 max-w-[320px]">
        {rows.map((h, i) => (
          <li key={i} className="rounded-lg bg-[var(--mh-surface-2)] px-2 py-1 text-[var(--mh-text)]">
            <b>{h.who}</b> <span className="text-[var(--mh-text-2)]">({h.role})</span> · {h.action}
            {h.reason ? <> · <i className="text-[var(--mh-text-2)]">{h.reason}</i></> : null}
            <div className="text-[10px] text-[var(--mh-text-3)]">{h.at ? new Date(h.at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}
