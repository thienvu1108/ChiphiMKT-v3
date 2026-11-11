import React, { useEffect, useMemo, useState } from 'react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { weeklyEditAccess, editMeta } from '../lib/weeklyEdit';
import { Card, Btn, Badge, Th, Td, Field, Select, MoneyInput, Input, Kpi, Empty, Pct, Modal, fmt, fmtM, vnTime, useToast , SearchSelect } from './ui';
import { vnCan } from './ctx';
import { type VCtx, projectName, teamName, blockName, userName, uidOf, blockOfTeam, useWeekly, isAdm, canViewAll } from './ctx';
import { userNsByProject, type NsLine } from '../../lib/vnext/budget';
import { WEEKLY_COLLECTION, weeklyId, formProjects, prevCum, itemMetrics, validateItem, freezeOnSubmit, rollup, byProject, scopeKhoiReports, NON_REPORTING_ROLES, khoiRegistrants, projectRows, sumProjectRowKpis, type ProjectRow, type WeeklyItem, type WeeklyReport, type BlockNode } from '../../lib/vnext/weekly';
import { dotsOf, currentDot, periodLabel, dotReportWindow, openReportDot } from '../../lib/vnext/period';
import { loadXlsx } from '../lib/loadXlsx';
import { exportBaseName, blockCodeOf, teamCodeOf } from '../../lib/vnext/exportName';
import { normalizeRoleKey } from '../lib/rolePermissions';
import { payOf, isNsReportableLine, reportableNsAmount, type PayMap, type Support } from '../../lib/vnext/support';
import { weeklyPendingBadge } from '../../lib/vnext/banSupport';
import { useSupport } from './SupportViews';
import { usePayMap } from './payStatus';

/** Báo cáo tuần: mọi NS chưa bị từ chối (GĐK/Ban). Trạng thái trên dòng không đổi. */
export function reportableNsInclude(line: NsLine, sup: Record<string, Partial<Support> | undefined>, pay: PayMap) {
  return isNsReportableLine(line, sup[line.id], payOf(pay, line.ownerUid));
}

function DotChips({ period, dot, onChange, submitted }: { period: string; dot: number; onChange: (n: number) => void; submitted?: Set<number> }) {
  const cur = currentDot(period);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {dotsOf(period).map((d) => {
        const on = d.n === dot;
        const win = dotReportWindow(period, d.n);
        const badge = win.isOpen
          ? <span className={`text-[9px] px-1.5 py-0.5 rounded ${on ? 'bg-[var(--mh-surface)]/20' : 'bg-[var(--mh-ok)] text-white'}`}>ĐANG MỞ</span>
          : d.n === cur
            ? <span className={`text-[9px] px-1.5 py-0.5 rounded ${on ? 'bg-[var(--mh-surface)]/20' : 'bg-[var(--mh-accent)] text-white'}`}>HIỆN TẠI</span>
            : win.state === 'closed'
              ? <span className={`text-[9px] px-1.5 py-0.5 rounded ${on ? 'bg-[var(--mh-surface)]/20' : 'bg-[var(--mh-text-3)] text-white'}`}>ĐÃ ĐÓNG</span>
              : null;
        return (
          <button key={d.n} onClick={() => onChange(d.n)} className={`text-left rounded-xl border px-3 py-2 ${on ? 'bg-[var(--mh-navy)] border-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)] border-[var(--mh-border)]'}`} data-testid={`vn-weekly-dot-${d.n}`}>
            <div className="text-[13px] font-semibold flex items-center gap-1.5 flex-wrap">Đợt {d.n}{badge}{submitted?.has(d.n) && <span className={on ? '' : 'text-[var(--mh-ok)]'}>✓</span>}</div>
            <div className={`text-[11px] ${on ? 'text-white/80' : 'text-[var(--mh-text-2)]'}`}>{d.label}</div>
            <div className={`text-[10px] mt-0.5 ${on ? 'text-white/70' : 'text-[var(--mh-text-3)]'}`}>Nộp: {win.openLabel}</div>
          </button>
        );
      })}
    </div>
  );
}

/** Form Báo cáo tuần của user — dự án lấy tự động từ NS đã đăng ký. */
/** blockId: GĐ Khối nộp cho Khối mình (không thuộc Phòng). */
export function WeeklyForm({ c, period, lines, blockId }: { c: VCtx; period: string; lines: NsLine[]; blockId?: string }) {
  const { toast, node } = useToast();
  const { reports } = useWeekly(c, period, 'mine');
  const sup = useSupport(c, [period], { mine: true });
  const pay = usePayMap(c.db);
  const cd = currentDot(period);
  const openDot = openReportDot(period);
  const [dot, setDot] = useState(() => openDot || (cd >= 1 && cd <= 4 ? cd : cd > 4 ? 4 : 1));
  const ns = useMemo(() => userNsByProject(lines, period, c.uid, {
    includeLine: (l) => reportableNsInclude(l, sup, pay),
    amountOf: (l) => reportableNsAmount(l, sup[l.id]),
  }), [lines, period, c.uid, sup, pay]);
  const badgeByPid = useMemo(() => {
    const m = new Map<string, 'khoi' | 'ban'>();
    for (const l of lines) {
      if (l.period !== period || l.ownerUid !== c.uid || !reportableNsInclude(l, sup, pay)) continue;
      const b = weeklyPendingBadge(l, sup[l.id]);
      if (!b) continue;
      if (b === 'khoi' || !m.has(l.projectId)) m.set(l.projectId, b);
    }
    return m;
  }, [lines, period, c.uid, sup, pay]);
  const badgeNode = (pid: string) => {
    const b = badgeByPid.get(pid);
    if (b === 'khoi') return <span data-testid="vn-weekly-badge-khoi"><Badge c="pending">Chờ Khối duyệt</Badge></span>;
    if (b === 'ban') return <span data-testid="vn-weekly-badge-ban"><Badge c="pending">Chờ Ban duyệt</Badge></span>;
    return null;
  };
  const projs = useMemo(() => formProjects(ns, reports), [ns, reports]);
  const cur = reports.find((r) => r.dot === dot);
  const submittedSet = new Set<number>(reports.filter((r) => r.submittedAt).map((r) => r.dot));
  const [items, setItems] = useState<Record<string, WeeklyItem>>({});
  useEffect(() => {
    const m: Record<string, WeeklyItem> = {};
    for (const p of projs) {
      const ex = cur?.items?.find((i) => i.projectId === p.projectId);
      m[p.projectId] = ex ? { ...ex } : { projectId: p.projectId, cumCost: prevCum(reports, dot, p.projectId), leads: 0, interested: 0, closedUnits: 0, difficulty: '' };
    }
    setItems(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dot, cur?.updatedAt, projs.length, reports.length]);

  const win = dotReportWindow(period, dot);
  // Super Admin / Admin có quyền sửa báo cáo → bỏ qua cửa sổ (khớp rules admin_edit).
  const canBypass = c.role === 'super_admin' || (isAdm(c) && vnCan(c, 'vn.reports.admin_edit'));
  const access = weeklyEditAccess({ windowState: win.state, submitted: !!cur?.submittedAt, isOwner: true, canAdminEdit: canBypass, isSuperAdmin: c.role === 'super_admin', deleted: !!(cur as any)?.deleted });
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [dot, period]);
  const canEdit = access.canWrite && (!access.needsEditToggle || editing);
  const cancelEdit = () => {
    setEditing(false);
    const m: Record<string, WeeklyItem> = {};
    for (const p of projs) { const ex = cur?.items?.find((i) => i.projectId === p.projectId); m[p.projectId] = ex ? { ...ex } : { projectId: p.projectId, cumCost: prevCum(reports, dot, p.projectId), leads: 0, interested: 0, closedUnits: 0, difficulty: '' }; }
    setItems(m);
  };
  const set = (pid: string, k: keyof WeeklyItem, v: any) => {
    if (!canEdit) return;
    setItems((s) => ({ ...s, [pid]: { ...s[pid], [k]: v } }));
  };

  const save = async () => {
    if (!canEdit) return toast(win.state === 'upcoming' ? 'Chưa đến ngày nộp đợt này' : 'Đợt này đã đóng cửa sổ nộp', 'err');
    const list = projs.map((p) => items[p.projectId]).filter(Boolean);
    for (const it of list) {
      const err = validateItem(it, prevCum(reports, dot, it.projectId));
      if (err) return toast(`${projectName(c, it.projectId)}: ${err}`, 'err');
    }
    const frozen = freezeOnSubmit(list, ns);
    const now = new Date().toISOString();
    const rep: WeeklyReport = { period, dot, uid: c.uid, userName: c.name, teamId: blockId ? (c.teamId || '') : c.teamId, blockId: blockId || blockOfTeam(c, c.teamId), items: frozen, submittedAt: cur?.submittedAt || now, updatedAt: now };
    try {
      await setDoc(doc(c.db, WEEKLY_COLLECTION, weeklyId(period, dot, c.uid)), { ...rep, ...editMeta({ prevHistory: (cur as any)?.history, uid: c.uid, name: c.name, now, isEdit: !!cur, viaAdmin: access.viaAdmin, prevItems: cur?.items }) });
      setEditing(false);
      const over = frozen.filter((i) => Number(i.cumCost) > Number(ns.get(i.projectId) || 0));
      toast(over.length ? `Đã lưu. ⚠ ${over.length} dự án vượt NS` : cur ? 'Đã lưu thay đổi báo cáo' : 'Đã nộp báo cáo');
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };

  return (
    <div className="space-y-3">
      <DotChips period={period} dot={dot} onChange={setDot} submitted={submittedSet} />
      <div className="text-[12px] text-[var(--mh-text-2)] flex flex-wrap gap-x-4 gap-y-1 items-center" data-testid="vn-weekly-window-status">
        <span>Đợt {dot} · {dotsOf(period)[dot - 1].label}</span>
        {cur?.submittedAt ? <Badge c="ok">Đã nộp {vnTime(cur.submittedAt)}</Badge> : <Badge c={win.state === 'closed' ? 'err' : 'warn'}>Chưa nộp</Badge>}
        {win.isOpen ? <Badge c="ok">Cửa sổ nộp: {win.openLabel}</Badge>
          : win.state === 'upcoming' ? <Badge c="mute">Chưa đến ngày nộp ({win.openLabel})</Badge>
            : <Badge c="err">Đã đóng · hết hạn nộp {win.openLabel}</Badge>}
        {canBypass && !win.isOpen && <Badge c="warn">Super/Admin được sửa ngoài cửa sổ</Badge>}
        {cur?.updatedAt && <span>Lần lưu gần nhất: <b>{vnTime(cur.updatedAt)}</b></span>}
        {(cur as any)?.editedAt && <span data-testid="vn-weekly-edited">Đã sửa: <b>{vnTime((cur as any).editedAt)}</b>{(cur as any).editedByName ? ` · ${(cur as any).editedByName}` : ''}</span>}
      </div>
      {!projs.length ? (
        <Card className="p-5 text-[13px] text-[var(--mh-text-2)]">Bạn chưa có Ngân sách MKT nào (trừ khoản bị từ chối) cho dự án trong {periodLabel(period)}. Khoản Chờ duyệt Khối / Chờ Ban / Cần duyệt lại vẫn báo cáo được; chỉ khoản GĐK hoặc Ban từ chối không hiện ở đây.</Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden md:block overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Dự án</Th><Th r>NS</Th><Th r>Chi phí luỹ kế kỳ (đ)</Th><Th r>Chi đợt này</Th><Th r>Còn lại</Th><Th r>% dùng</Th><Th r>Lead</Th><Th r>Khách QT</Th><Th r>Số căn chốt</Th><Th>Khó khăn</Th></tr></thead><tbody>
              {projs.map((p) => {
                const it = items[p.projectId]; if (!it) return null;
                const m = itemMetrics(it, { liveNs: p.ns, prevCum: prevCum(reports, dot, p.projectId), submitted: !!cur?.submittedAt && cur.items.some((x) => x.projectId === p.projectId) });
                return (
                  <tr key={p.projectId} className={m.over ? 'bg-red-50/40' : ''}>
                    <Td><div className="font-medium">{projectName(c, p.projectId)}</div><div className="flex flex-wrap gap-1 mt-0.5">{badgeNode(p.projectId)}{p.noBudget && <Badge c="mute">Không còn ngân sách</Badge>}{m.over && !p.noBudget && <Badge c="err">⚠ Vượt NS</Badge>}</div></Td>
                    <Td r>{fmt(m.ns)}</Td>
                    <Td r><MoneyInput value={it.cumCost} onChange={(v: number) => set(p.projectId, 'cumCost', v)} className="w-36 min-w-[9rem] ml-auto" disabled={!canEdit} /></Td>
                    <Td r>{fmt(m.dotCost)}</Td>
                    <Td r className={m.remaining < 0 ? 'text-[var(--mh-err)] font-semibold' : ''}>{fmt(m.remaining)}</Td>
                    <Td r><Pct pct={m.pct} over={m.over} /></Td>
                    <Td r><Input type="number" min={0} value={it.leads} onChange={(e: any) => set(p.projectId, 'leads', Number(e.target.value))} disabled={!canEdit} className="w-20 text-right ml-auto" /></Td>
                    <Td r><Input type="number" min={0} value={it.interested} onChange={(e: any) => set(p.projectId, 'interested', Number(e.target.value))} disabled={!canEdit} className="w-20 text-right ml-auto" /></Td>
                    <Td r><Input type="number" min={0} step={1} inputMode="numeric" value={it.closedUnits ?? 0} onChange={(e: any) => set(p.projectId, 'closedUnits', Number(String(e.target.value).replace(/\D/g, '')) || 0)} disabled={!canEdit} className="w-20 text-right ml-auto" data-testid="vn-weekly-closed" /></Td>
                    <Td><Input value={it.difficulty || ''} onChange={(e: any) => set(p.projectId, 'difficulty', e.target.value)} disabled={!canEdit} placeholder="Khó khăn đang gặp" className="min-w-[180px]" /></Td>
                  </tr>
                );
              })}
            </tbody></table></div>
            <div className="md:hidden divide-y divide-[var(--mh-border)]">
              {projs.map((p) => {
                const it = items[p.projectId]; if (!it) return null;
                const m = itemMetrics(it, { liveNs: p.ns, prevCum: prevCum(reports, dot, p.projectId), submitted: !!cur?.submittedAt });
                return (
                  <div key={p.projectId} className="p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap"><div className="font-semibold text-[14px] flex-1">{projectName(c, p.projectId)}</div>{badgeNode(p.projectId)}{p.noBudget && <Badge c="mute">Không còn ngân sách</Badge>}{m.over && !p.noBudget && <Badge c="err">⚠ Vượt NS</Badge>}</div>
                    <div className="grid grid-cols-3 gap-2 text-[12px]"><div>NS<div className="font-semibold">{fmtM(m.ns)}</div></div><div>Còn lại<div className={`font-semibold ${m.remaining < 0 ? 'text-[var(--mh-err)]' : ''}`}>{fmtM(m.remaining)}</div></div><div>% dùng<div className="font-semibold">{m.pct == null ? '—' : m.pct + '%'}</div></div></div>
                    <Field label="Chi phí luỹ kế kỳ (đ)"><MoneyInput value={it.cumCost} onChange={(v: number) => set(p.projectId, 'cumCost', v)} disabled={!canEdit} /></Field>
                    <div className="text-[11px] text-[var(--mh-text-3)]">Chi riêng đợt này: {fmt(m.dotCost)} đ</div>
                    <div className="grid grid-cols-2 gap-2"><Field label="Số lead"><Input type="number" min={0} value={it.leads} onChange={(e: any) => set(p.projectId, 'leads', Number(e.target.value))} disabled={!canEdit} /></Field><Field label="Khách quan tâm"><Input type="number" min={0} value={it.interested} onChange={(e: any) => set(p.projectId, 'interested', Number(e.target.value))} disabled={!canEdit} /></Field></div>
                    <Field label="Số căn chốt"><Input type="number" min={0} step={1} inputMode="numeric" value={it.closedUnits ?? 0} onChange={(e: any) => set(p.projectId, 'closedUnits', Number(String(e.target.value).replace(/\D/g, '')) || 0)} disabled={!canEdit} data-testid="vn-weekly-closed-m" /></Field>
                    <Field label="Khó khăn"><Input value={it.difficulty || ''} onChange={(e: any) => set(p.projectId, 'difficulty', e.target.value)} disabled={!canEdit} /></Field>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2.5 text-[11px] text-[var(--mh-text-3)] border-t border-[var(--mh-border)]">Chi phí nhập là số <b>luỹ kế cả kỳ</b>. Vượt NS vẫn lưu được (có cảnh báo). NS / % dùng / còn lại theo bản đăng ký (dòng Cần duyệt lại dùng số đã duyệt gần nhất). Hiện cả dự án đang <b>Chờ Khối</b> / <b>Chờ Ban</b>; chỉ ẩn khoản bị từ chối.</div>
          </Card>
          <div className="flex flex-wrap justify-end gap-2" data-testid="vn-weekly-actions">
            {access.needsEditToggle && !editing ? (
              <Btn primary className="min-h-11 md:min-h-0" onClick={() => setEditing(true)} data-testid="vn-weekly-edit">✎ Sửa báo cáo Đợt {dot}</Btn>
            ) : (
              <>
                {access.needsEditToggle && <Btn className="min-h-11 md:min-h-0" onClick={cancelEdit} data-testid="vn-weekly-edit-cancel">Huỷ sửa</Btn>}
                <Btn primary className="min-h-11 md:min-h-0" onClick={save} disabled={!canEdit} data-testid="vn-weekly-submit">{cur ? 'Lưu thay đổi' : 'Nộp báo cáo'} Đợt {dot}</Btn>
              </>
            )}
          </div>
          {access.needsEditToggle && !editing && <div className="text-right text-[12px] text-[var(--mh-text-2)]">{access.viaAdmin ? 'Đợt đã đóng — Admin vẫn sửa được.' : `Được sửa đến hết cửa sổ nộp (${win.openLabel}).`}</div>}
          {!canEdit && win.state === 'upcoming' && <div className="text-right text-[12px] text-[var(--mh-text-3)]">Chưa đến ngày nộp đợt này ({win.openLabel})</div>}
          {!canEdit && win.state === 'closed' && <div className="text-right text-[12px] text-[var(--mh-err)]">Đợt đã đóng — trạng thái «Chưa nộp» nếu chưa nộp trong cửa sổ {win.openLabel}</div>}
        </>
      )}
      {node}
    </div>
  );
}

// ------------------------------------------------------------------ Rollup view (Phòng / Khối / Ban / Quản lý Báo cáo)
export type RollScope = { teamIds?: string[]; blockIds?: string[]; projectIds?: string[] };

export function useRollup(c: VCtx, period: string, dot: number, lines: NsLine[], scope: RollScope, filters: { blockId?: string; teamId?: string; projectId?: string }) {
  const { reports: allReports } = useWeekly(c, period, 'all', scope.blockIds);
  const sup = useSupport(c, [period], scope.blockIds ? { blockIds: scope.blockIds } : scope.teamIds ? {} : {});
  const pay = usePayMap(c.db);
  const includeLine = useMemo(() => (l: NsLine) => reportableNsInclude(l, sup, pay), [sup, pay]);
  const reportableLines = useMemo(() => lines.filter((l) => l.period === period && includeLine(l)), [lines, period, includeLine]);
  return useMemo(() => {
    const users0 = c.users
      .filter((u) => u.teamId && (!scope.teamIds || scope.teamIds.includes(u.teamId)))
      // Báo cáo Khối: bỏ hồ sơ trùng đã gộp / liên kết và vai trò không nộp báo cáo tuần
      .filter((u) => !scope.blockIds || (!u.linkedToUid && !u.mergedInto && !NON_REPORTING_ROLES.includes(normalizeRoleKey(u.role))))
      .map((u) => ({ uid: uidOf(u), name: u.fullName || u.displayName || u.email || uidOf(u), teamId: u.teamId, blockId: blockOfTeam(c, u.teamId) || 'unassigned' }))
      .filter((u) => (!filters.blockId || u.blockId === filters.blockId) && (!filters.teamId || u.teamId === filters.teamId));
    // GĐ Khối đã Đăng ký MKT (NS reportable) → cũng phải nộp Báo cáo tuần (không áp dụng cho Báo cáo Phòng).
    const seen = new Set(users0.map((u) => u.uid));
    const khoiUsers = scope.teamIds ? [] : khoiRegistrants(reportableLines, period, scope.blockIds)
      .filter((u) => !seen.has(u.uid))
      .map((u) => { const x = c.users.find((y) => uidOf(y) === u.uid); return { ...u, name: x?.fullName || x?.displayName || u.name }; })
      .filter((u) => (!filters.blockId || u.blockId === filters.blockId) && (!filters.teamId || u.teamId === filters.teamId));
    const { users, reports } = scopeKhoiReports([...users0, ...khoiUsers], allReports, scope.blockIds);
    const nsByUser = new Map<string, Map<string, number>>();
    for (const u of users) nsByUser.set(u.uid, userNsByProject(reportableLines, period, u.uid, { amountOf: (l) => reportableNsAmount(l, (sup as any)[l.id]) }));
    let res = rollup({ period, dot, users, reports, nsByUser, projectId: filters.projectId });
    if (scope.projectIds) {
      // Ban KD: chỉ dự án của Ban
      const keep = new Set(scope.projectIds);
      const sub = rollup({ period, dot, users, reports: reports.map((r) => ({ ...r, items: r.items.filter((i) => keep.has(i.projectId)) })), nsByUser: new Map([...nsByUser].map(([k, m]) => [k, new Map([...m].filter(([p]) => keep.has(p)))])), projectId: filters.projectId });
      res = sub;
    }
    return { ...res, reports };
  }, [c, period, dot, reportableLines, scope, filters.blockId, filters.teamId, filters.projectId, allReports, sup]);
}

export async function exportRollupXlsx(c: VCtx, period: string, dot: number, rows: ProjectRow[], fileName: string) {
  const XLSX = await loadXlsx();
  const out = rows.map((r) => ({ Kỳ: periodLabel(period), Đợt: dot, Khối: blockName(c, r.blockId), Phòng: teamName(c, r.teamId), User: r.userName, 'Dự án': projectName(c, r.projectId), 'Trạng thái': r.status === 'submitted' ? 'Đã nộp' : 'Chưa nộp', NS: r.ns, 'Chi phí luỹ kế': r.cum, 'Chi đợt này': r.dotCost, '% dùng': r.pct ?? '', Lead: r.leads, 'Khách QT': r.interested, 'Số căn chốt': r.closedUnits, 'Giá TB/lead': r.cpl ?? '', 'Vượt NS': r.over ? 'Có' : '', 'Không còn NS': r.noBudget ? 'Có' : '', 'Khó khăn': r.difficulty || '' }));
  const ws = XLSX.utils.json_to_sheet(out);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bao cao tuan');
  XLSX.writeFile(wb, fileName);
}

export type StatusFilter = 'all' | 'submitted' | 'missing';
const STATUS_OPTS = [{ value: 'all', label: 'Tất cả' }, { value: 'submitted', label: 'Đã nộp' }, { value: 'missing', label: 'Chưa nộp' }];

/** Bảng phẳng User × Dự án, sắp Khối → Phòng → User → Dự án (desktop: bảng; mobile: thẻ). */
function ProjectRowsTable({ c, rows, levels, onEdit }: { c: VCtx; rows: ProjectRow[]; levels: ('block' | 'team' | 'user')[]; onEdit?: (uid: string, name: string) => void }) {
  if (!rows.length) return <Empty>Không có dữ liệu cho bộ lọc này</Empty>;
  const showB = levels.includes('block'), showT = levels.includes('team');
  const st0 = (r: ProjectRow) => r.status === 'submitted' ? <Badge c="ok">Đã nộp</Badge> : <Badge c="err">Chưa nộp</Badge>;
  const st = (r: ProjectRow) => <>{st0(r)}{onEdit && r.status === 'submitted' && <> <Btn small className="min-h-11 md:min-h-0" onClick={() => onEdit(r.uid, r.userName)} data-testid="vn-weekly-admin-edit-p">✎ Sửa</Btn></>}</>;
  return (
    <>
      <div className="hidden md:block overflow-x-auto" data-testid="vn-report-project-table"><table className="w-full min-w-[980px]"><thead><tr>{showB && <Th>Khối</Th>}{showT && <Th>Phòng</Th>}<Th>User</Th><Th>Dự án</Th><Th>Trạng thái</Th><Th r>NS</Th><Th r>Chi phí luỹ kế</Th><Th r>Chi đợt này</Th><Th r>% dùng</Th><Th r>Lead</Th><Th r>Khách QT</Th><Th r>Số căn chốt</Th><Th r>Giá TB/lead</Th><Th r>Vượt NS</Th></tr></thead><tbody>
        {rows.map((r, i) => {
          const prev = rows[i - 1];
          const newB = !prev || prev.blockId !== r.blockId, newT = newB || prev.teamId !== r.teamId, newU = newT || prev.uid !== r.uid;
          return (
            <tr key={r.key} className={`${r.over ? 'bg-red-50/50' : ''} ${newU && i ? 'border-t border-[var(--mh-border)]' : ''}`}>
              {showB && <Td className="font-semibold whitespace-nowrap">{newB ? blockName(c, r.blockId) : ''}</Td>}
              {showT && <Td className="whitespace-nowrap">{newT ? teamName(c, r.teamId) : ''}</Td>}
              <Td className="whitespace-nowrap">{newU ? r.userName : ''}</Td>
              <Td className="font-medium">{projectName(c, r.projectId)}{r.noBudget && <> <Badge c="mute">Không còn ngân sách</Badge></>}{r.difficulty && <div className="text-[11px] italic text-[var(--mh-text-2)]">“{r.difficulty}”</div>}</Td>
              <Td className="whitespace-nowrap">{st(r)}</Td>
              <Td r>{fmt(r.ns)}</Td><Td r>{r.status === 'submitted' ? fmt(r.cum) : '—'}</Td><Td r>{r.status === 'submitted' ? fmt(r.dotCost) : '—'}</Td><Td r><Pct pct={r.pct} over={r.over} /></Td><Td r>{fmt(r.leads)}</Td><Td r>{fmt(r.interested)}</Td><Td r>{fmt(r.closedUnits)}</Td><Td r>{r.cpl ? fmt(r.cpl) : '—'}</Td><Td r>{r.over ? <Badge c="err">Vượt</Badge> : ''}</Td>
            </tr>
          );
        })}
      </tbody></table></div>
      <div className="md:hidden divide-y divide-[var(--mh-border)]" data-testid="vn-report-project-cards">
        {rows.map((r) => (
          <div key={r.key} className={`px-3 py-2.5 text-[13px] ${r.over ? 'bg-red-50/50' : ''}`}>
            <div className="flex items-start gap-2"><div className="flex-1 font-semibold">{projectName(c, r.projectId)}</div>{st(r)}</div>
            <div className="text-[11px] text-[var(--mh-text-2)]">{[showB && blockName(c, r.blockId), showT && teamName(c, r.teamId), r.userName].filter(Boolean).join(' · ')}</div>
            <div className="grid grid-cols-3 gap-1 mt-1 text-[12px]"><div>NS <b>{fmtM(r.ns)}</b></div><div>Luỹ kế <b>{r.status === 'submitted' ? fmtM(r.cum) : '—'}</b></div><div>Lead <b>{fmt(r.leads)}</b></div></div>
            {r.noBudget && <Badge c="mute">Không còn ngân sách</Badge>}{r.over && <Badge c="err">Vượt NS</Badge>}
          </div>
        ))}
      </div>
    </>
  );
}

export function RollupView({ c, period, lines, scope, title, levels = ['block', 'team', 'user'], showFilters = true, allowExport = true }: { c: VCtx; period: string; lines: NsLine[]; scope: RollScope; title: string; levels?: ('block' | 'team' | 'user')[]; showFilters?: boolean; allowExport?: boolean }) {
  const cd = currentDot(period);
  const [dot, setDot] = useState(cd >= 1 && cd <= 4 ? cd : cd > 4 ? 4 : 1);
  const [blockId, setBlockId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<StatusFilter>('all');
  const [view, setView] = useState<'project' | 'user'>('project');
  const onlyMissing = status === 'missing';
  const data = useRollup(c, period, dot, lines, scope, { blockId, teamId, projectId });
  const canAdminEdit = isAdm(c) && vnCan(c, 'vn.reports.admin_edit');
  const [adm, setAdm] = useState<{ rep: any; name: string } | null>(null);
  const repOf = (uid: string) => (data.reports as any[]).find((r) => r.uid === uid && r.dot === dot);
  const blockOpts = useMemo(() => {
    const ids = new Set<string>(c.teams.map((t) => blockOfTeam(c, t.id)).filter(Boolean));
    return [...ids].filter((b) => !scope.blockIds || scope.blockIds.includes(b));
  }, [c, scope.blockIds]);
  const teamOpts = c.teams.filter((t) => (!scope.teamIds || scope.teamIds.includes(t.id)) && (!blockId || blockOfTeam(c, t.id) === blockId) && (!scope.blockIds || scope.blockIds.includes(blockOfTeam(c, t.id))));
  const projOpts = byProject(data.blocks);
  const tot = data.total;
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const flatTeams = data.blocks.flatMap((b) => b.teams.map((t) => ({ b, t })));
  const allRows = useMemo(() => projectRows(data.blocks, { block: (id) => blockName(c, id), team: (id) => teamName(c, id), project: (id) => projectName(c, id) }), [c, data.blocks]);
  const rows = status === 'all' ? allRows : allRows.filter((r) => r.status === status);
  // KPI theo cùng tập dòng với bảng (Khối/Phòng/Dự án + Trạng thái). Tránh 80/14 khi lọc dự án.
  const rowKpi = useMemo(() => sumProjectRowKpis(rows), [rows]);
  const userKpi = useMemo(() => {
    let submitted = 0, expected = 0, ns = 0, cum = 0, dotCost = 0, leads = 0, interested = 0, closedUnits = 0, over = 0;
    for (const b of data.blocks) for (const t of b.teams) {
      const us = t.users.filter((u) => status === 'all' || (status === 'missing' ? !u.submitted : u.submitted));
      for (const u of us) {
        expected++;
        if (u.submitted) submitted++;
        ns += u.ns; cum += u.cum; dotCost += u.dotCost; leads += u.leads; interested += u.interested; closedUnits += u.closedUnits; over += u.over;
      }
    }
    return { submitted, expected, ns, cum, dotCost, leads, interested, closedUnits, over };
  }, [data.blocks, status]);
  const kpi = view === 'project' ? rowKpi : userKpi;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        {showFilters && levels.includes('block') && blockOpts.length > 1 && <Field label="Khối"><SearchSelect value={blockId} onChange={(v: string) => { setBlockId(v); setTeamId(''); }} options={[{ value: '', label: 'Tất cả Khối' }, ...blockOpts.map((b) => ({ value: b, label: blockName(c, b) }))]} /></Field>}
        {showFilters && levels.includes('team') && teamOpts.length > 1 && <Field label="Phòng"><SearchSelect value={teamId} onChange={setTeamId} options={[{ value: '', label: 'Tất cả Phòng' }, ...teamOpts.map((t) => ({ value: t.id, label: t.name }))]} /></Field>}
        {showFilters && <Field label="Dự án"><SearchSelect value={projectId} onChange={setProjectId} options={[{ value: '', label: 'Tất cả dự án' }, ...c.projects.filter((p) => !scope.projectIds || scope.projectIds.includes(p.id)).map((p) => ({ value: p.id, label: p.name }))]} /></Field>}
        <Field label="Trạng thái"><Select value={status} onChange={(v: string) => setStatus(v as StatusFilter)} options={STATUS_OPTS} data-testid="vn-report-status-filter" /></Field>
        <div className="h-9 inline-flex rounded-lg border border-[var(--mh-border)] overflow-hidden text-[13px]">{([['project', 'Theo dự án'], ['user', 'Theo người']] as const).map(([v, l]) => <button key={v} onClick={() => setView(v)} className={`px-3 ${view === v ? 'bg-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)]'}`}>{l}</button>)}</div>
        <div className="flex-1" />
        {allowExport && <Btn onClick={() => exportRollupXlsx(c, period, dot, rows, `${exportBaseName({ blockCode: (blockId ? [blockId] : data.blocks.map((b) => b.blockId).filter((b) => b && b !== 'unassigned')).map((b) => blockCodeOf(c.blocks.find((x) => x.id === b)) || b), month: period, teamCode: teamId ? teamCodeOf(c.teams.find((t) => t.id === teamId)) : '', projectName: projectId ? projectName(c, projectId) : '' })} - Đợt ${dot}.xlsx`)}>⬇ Xuất Excel</Btn>}
      </div>
      <DotChips period={period} dot={dot} onChange={setDot} />
      {canAdminEdit && dotReportWindow(period, dot).state === 'closed' && <div className="text-[12px]" data-testid="vn-weekly-admin-closed"><Badge c="warn">Đợt {dot} đã đóng — Admin vẫn sửa được (bấm «✎ Sửa» ở dòng đã nộp)</Badge></div>}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3" data-testid="vn-report-kpis">
        <Kpi label="Đã nộp" value={`${kpi.submitted}/${kpi.expected}`} tone={kpi.submitted < kpi.expected ? 'err' : 'ok'} />
        <Kpi label="NS" value={fmtM(kpi.ns)} />
        <Kpi label="Chi phí luỹ kế" value={fmtM(kpi.cum)} hint={kpi.ns ? `${Math.round((kpi.cum / kpi.ns) * 100)}% NS` : undefined} />
        <Kpi label={`Chi riêng Đợt ${dot}`} value={fmtM(kpi.dotCost)} />
        <Kpi label="Lead / Khách QT" value={`${fmt(kpi.leads)} / ${fmt(kpi.interested)}`} hint={kpi.leads ? `Giá TB/lead ${fmt(kpi.cum / kpi.leads)} đ` : undefined} />
        <Kpi label="Số căn chốt" value={fmt(kpi.closedUnits)} />
        <Kpi label="Dự án vượt NS" value={kpi.over} tone={kpi.over ? 'err' : undefined} />
      </div>
      <Card>
        <div className="px-4 py-3 font-semibold text-[14px] border-b border-[var(--mh-border)] flex flex-wrap gap-2 items-center"><span className="flex-1">{title}{view === 'project' && ' · theo Dự án'}</span>{view === 'project' && <span className="text-[12px] font-normal text-[var(--mh-text-2)]">{rows.length} dòng · {rowKpi.submitted}/{rowKpi.expected} dự án đã nộp</span>}</div>
        {view === 'project' ? <ProjectRowsTable c={c} rows={rows} levels={levels} onEdit={canAdminEdit ? (uid, name) => { const r = repOf(uid); if (r) setAdm({ rep: r, name }); } : undefined} /> : !flatTeams.length ? <Empty>Không có dữ liệu cho bộ lọc này</Empty> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px]"><thead><tr><Th>{levels.includes('block') ? 'Khối / Phòng / User' : levels.includes('team') ? 'Phòng / User' : 'User'}</Th><Th>Nộp</Th><Th r>NS</Th><Th r>Chi phí luỹ kế</Th><Th r>Chi đợt này</Th><Th r>% dùng</Th><Th r>Lead</Th><Th r>Khách QT</Th><Th r>Số căn chốt</Th><Th r>Giá TB/lead</Th><Th r>Vượt NS</Th></tr></thead><tbody>
            {data.blocks.map((b) => {
              const bk = 'b' + b.blockId;
              const bOpen = !levels.includes('block') || open[bk] !== false;
              return (
                <React.Fragment key={b.blockId}>
                  {levels.includes('block') && <AggRow label={<button onClick={() => setOpen((o) => ({ ...o, [bk]: !bOpen }))} className="font-bold">{bOpen ? '▾' : '▸'} {blockName(c, b.blockId)}</button>} a={b} sub={`${b.submitted}/${b.expected}`} cls="bg-[var(--mh-navy-50)]" />}
                  {bOpen && b.teams.map((t) => {
                    const tk = 't' + t.teamId;
                    const tOpen = !levels.includes('team') || !!open[tk] || onlyMissing;
                    const us = t.users.filter((u) => status === 'all' || (status === 'missing' ? !u.submitted : u.submitted));
                    if (status !== 'all' && !us.length) return null;
                    return (
                      <React.Fragment key={t.teamId}>
                        {levels.includes('team') && <AggRow label={<button onClick={() => toggle(tk)} className={`font-semibold ${levels.includes('block') ? 'pl-4' : ''}`}>{tOpen ? '▾' : '▸'} {teamName(c, t.teamId)}</button>} a={t} sub={`${t.submitted}/${t.expected}`} cls="bg-[#FAFBFD]" />}
                        {tOpen && us.map((u) => (
                          <React.Fragment key={u.uid}>
                            <tr className={u.over ? 'bg-red-50/50' : ''}>
                              <Td className={levels.includes('team') ? 'pl-10' : ''}><button onClick={() => toggle('u' + u.uid)}>{u.projects.length ? (open['u' + u.uid] ? '▾ ' : '▸ ') : ''}{u.name}</button></Td>
                              <Td className="whitespace-nowrap">{u.submitted ? <Badge c="ok">Đã nộp</Badge> : <Badge c="err">Chưa nộp</Badge>}{canAdminEdit && u.submitted && repOf(u.uid) && <> <Btn small onClick={() => setAdm({ rep: repOf(u.uid), name: u.name })} data-testid="vn-weekly-admin-edit">Sửa/Xoá</Btn></>}</Td>
                              <Td r>{fmt(u.ns)}</Td><Td r>{fmt(u.cum)}</Td><Td r>{fmt(u.dotCost)}</Td><Td r><Pct pct={u.ns ? Math.round((u.cum / u.ns) * 1000) / 10 : null} over={u.cum > u.ns && u.ns > 0} /></Td><Td r>{fmt(u.leads)}</Td><Td r>{fmt(u.interested)}</Td><Td r>{fmt(u.closedUnits)}</Td><Td r>{u.leads ? fmt(u.cum / u.leads) : '—'}</Td><Td r>{u.over ? <Badge c="err">{u.over}</Badge> : ''}</Td>
                            </tr>
                            {open['u' + u.uid] && u.projects.map((p) => (
                              <tr key={p.projectId} className="text-[12px]"><Td className="pl-16 text-[var(--mh-text-2)]">{projectName(c, p.projectId)}{p.noBudget && <> <Badge c="mute">Không còn ngân sách</Badge></>}{p.difficulty && <div className="text-[11px] italic">“{p.difficulty}”</div>}</Td><Td /><Td r>{fmt(p.ns)}</Td><Td r>{fmt(p.cum)}</Td><Td r>{fmt(p.dotCost)}</Td><Td r><Pct pct={p.pct} over={p.over} /></Td><Td r>{fmt(p.leads)}</Td><Td r>{fmt(p.interested)}</Td><Td r>{fmt(p.closedUnits || 0)}</Td><Td r>{p.cpl ? fmt(p.cpl) : '—'}</Td><Td r>{p.over ? <Badge c="err">Vượt</Badge> : ''}</Td></tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
            <AggRow label={<b>TỔNG</b>} a={tot} sub={`${tot.submitted}/${tot.expected}`} cls="bg-[var(--mh-bg)] font-semibold" />
          </tbody></table></div>
        )}
      </Card>
      <Card>
        <div className="px-4 py-3 font-semibold text-[14px] border-b border-[var(--mh-border)]">Tổng hợp theo Dự án · Đợt {dot}</div>
        {!projOpts.length ? <Empty>Chưa có báo cáo</Empty> : (
          <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Dự án</Th><Th r>Người báo cáo</Th><Th r>NS</Th><Th r>Chi phí luỹ kế</Th><Th r>Chi đợt này</Th><Th r>% dùng</Th><Th r>Lead</Th><Th r>Khách QT</Th><Th r>Số căn chốt</Th><Th r>Giá TB/lead</Th></tr></thead><tbody>
            {projOpts.map((p) => <tr key={p.projectId} className={p.cum > p.ns && p.ns > 0 ? 'bg-red-50/50' : ''}><Td className="font-medium">{projectName(c, p.projectId)}</Td><Td r>{p.reporters}</Td><Td r>{fmt(p.ns)}</Td><Td r>{fmt(p.cum)}</Td><Td r>{fmt(p.dotCost)}</Td><Td r><Pct pct={p.ns ? Math.round((p.cum / p.ns) * 1000) / 10 : null} over={p.cum > p.ns && p.ns > 0} /></Td><Td r>{fmt(p.leads)}</Td><Td r>{fmt(p.interested)}</Td><Td r>{fmt(p.closedUnits)}</Td><Td r>{p.leads ? fmt(p.cum / p.leads) : '—'}</Td></tr>)}
          </tbody></table></div>
        )}
      </Card>
      {adm && <AdminReportModal c={c} rep={adm.rep} name={adm.name} onClose={() => setAdm(null)} />}
    </div>
  );
}

/** Admin sửa / xoá mềm Báo cáo tuần của 1 người (lưu lịch sử: ai, lúc nào, giá trị cũ). */
function AdminReportModal({ c, rep, name, onClose }: { c: VCtx; rep: any; name: string; onClose: () => void }) {
  const { toast, node } = useToast();
  const [items, setItems] = useState<WeeklyItem[]>(() => (rep.items || []).map((i: any) => ({ ...i })));
  const [reason, setReason] = useState('');
  const ref = doc(c.db, WEEKLY_COLLECTION, rep.id || weeklyId(rep.period, rep.dot, rep.uid));
  const hist = (action: string) => [...(rep.history || []), { at: new Date().toISOString(), byUid: c.uid, byName: c.name, action, reason: reason.trim(), prevItems: rep.items || [] }].slice(-100);
  const set = (k: number, f: keyof WeeklyItem, v: any) => setItems((xs) => xs.map((x, i) => (i === k ? { ...x, [f]: v } : x)));
  const save = async () => {
    const now = new Date().toISOString();
    try { await updateDoc(ref, { items, editedBy: c.uid, editedByName: c.name, editedAt: now, updatedAt: now, history: hist('admin_edit') }); toast('Đã sửa báo cáo'); onClose(); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const del = async () => {
    if (!window.confirm(`Xoá Báo cáo tuần Đợt ${rep.dot} của ${name}? Báo cáo sẽ không tính vào số đã nộp (vẫn lưu lại để khôi phục).`)) return;
    const now = new Date().toISOString();
    try { await updateDoc(ref, { deleted: true, deletedBy: c.uid, deletedByName: c.name, deletedAt: now, updatedAt: now, history: hist('admin_delete') }); toast('Đã xoá báo cáo'); onClose(); }
    catch (e: any) { toast('Không xoá được: ' + (e?.code || e?.message), 'err'); }
  };
  return (
    <Modal open onClose={onClose} wide title={`Admin · Báo cáo tuần Đợt ${rep.dot} · ${name}`} footer={<><Btn danger onClick={del} data-testid="vn-weekly-admin-del">Xoá báo cáo</Btn><div className="flex-1" /><Btn onClick={onClose}>Huỷ</Btn><Btn primary onClick={save}>Lưu sửa</Btn></>}>
      <div className="space-y-3">
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr><Th>Dự án</Th><Th r>Chi phí luỹ kế (đ)</Th><Th r>Lead</Th><Th r>Khách QT</Th><Th r>Số căn chốt</Th><Th>Khó khăn</Th></tr></thead><tbody>
          {items.map((it, k) => <tr key={it.projectId + k}>
            <Td className="font-medium">{projectName(c, it.projectId)}</Td>
            <Td r><MoneyInput value={Number(it.cumCost || 0)} onChange={(v: number) => set(k, 'cumCost', v)} className="w-[130px] ml-auto" /></Td>
            <Td r><Input value={String(it.leads ?? 0)} onChange={(e: any) => set(k, 'leads', Number(e.target.value.replace(/\D/g, '')) || 0)} className="w-[70px] ml-auto text-right" inputMode="numeric" /></Td>
            <Td r><Input value={String(it.interested ?? 0)} onChange={(e: any) => set(k, 'interested', Number(e.target.value.replace(/\D/g, '')) || 0)} className="w-[70px] ml-auto text-right" inputMode="numeric" /></Td>
            <Td r><Input value={String(it.closedUnits ?? 0)} onChange={(e: any) => set(k, 'closedUnits', Number(e.target.value.replace(/\D/g, '')) || 0)} className="w-[70px] ml-auto text-right" inputMode="numeric" /></Td>
            <Td><Input value={it.difficulty || ''} onChange={(e: any) => set(k, 'difficulty', e.target.value)} /></Td>
          </tr>)}
        </tbody></table></div>
        <Field label="Lý do (tuỳ chọn, lưu vào lịch sử)"><Input value={reason} onChange={(e: any) => setReason(e.target.value)} /></Field>
        {(rep.history || []).some((h: any) => String(h.action).startsWith('admin_')) && <div className="text-[12px] text-[var(--mh-text-2)]">Lịch sử Admin: {(rep.history || []).filter((h: any) => String(h.action).startsWith('admin_')).map((h: any) => `${vnTime(h.at)} ${h.byName} ${h.action === 'admin_delete' ? 'xoá' : 'sửa'}${h.reason ? ` (${h.reason})` : ''}`).join(' · ')}</div>}
      </div>
      {node}
    </Modal>
  );
}

function AggRow({ label, a, sub, cls }: any) {
  return <tr className={`${cls} ${a.over ? 'text-[var(--mh-text)]' : ''}`}><Td>{label}</Td><Td><span className="text-[12px]">{sub}</span></Td><Td r>{fmt(a.ns)}</Td><Td r>{fmt(a.cum)}</Td><Td r>{fmt(a.dotCost)}</Td><Td r><Pct pct={a.ns ? Math.round((a.cum / a.ns) * 1000) / 10 : null} over={a.cum > a.ns && a.ns > 0} /></Td><Td r>{fmt(a.leads)}</Td><Td r>{fmt(a.interested)}</Td><Td r>{fmt(a.closedUnits)}</Td><Td r>{a.leads ? fmt(a.cum / a.leads) : '—'}</Td><Td r>{a.over ? <Badge c="err">⚠ {a.over}</Badge> : ''}</Td></tr>;
}
