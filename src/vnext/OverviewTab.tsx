import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { type VCtx, useNsLines } from './ctx';
import { Field, Select } from './ui';
import { normalizeMonth } from '../../lib/vnext/ntReport';
import { buildOverview } from '../../lib/vnext/overviewReport';
import { banOfProject } from '../../lib/vnext/supportPct';
import { OverviewReportView, type OverviewLayout } from '../components/OverviewReportView';

export type OverviewScope =
  | { kind: 'block'; blockIds: string[] }
  | { kind: 'ban'; banIds: string[] };

/**
 * Báo cáo Tổng quan theo phạm vi:
 *  - block: dữ liệu các dự án Khối đăng ký + nghiệm thu (lọc theo blockId).
 *  - ban:   dữ liệu các dự án thuộc Ban (projectIds) + các Khối đang chạy dự án đó.
 * Không dùng nsSupport (buildOverview chỉ cần ns_lines/acceptances/can_ban/projects/bans).
 */
export function OverviewTab({ c, scope, title, desc }: { c: VCtx; scope: OverviewScope; title?: string; desc?: string }) {
  const months = useMemo(() => {
    const s = new Set<string>();
    for (const a of c.acceptances || []) { const m = normalizeMonth(a?.month); if (/^[0-9]{4}-[0-9]{2}$/.test(m)) s.add(m); }
    const arr = [...s].sort((a, b) => b.localeCompare(a));
    return arr.length ? arr : [normalizeMonth(new Date().toISOString().slice(0, 7))].filter((m) => /^[0-9]{4}-[0-9]{2}$/.test(m));
  }, [c.acceptances]);

  const [month, setMonth] = useState('');
  useEffect(() => { if (!month && months.length) setMonth(months[0]); }, [months, month]);

  const { lines } = useNsLines(c, month ? [month] : [], 'all');
  const [canBan, setCanBan] = useState<any[]>([]);
  useEffect(() => {
    if (!month) { setCanBan([]); return; }
    const u = onSnapshot(query(collection(c.db, 'can_ban'), where('month', '==', month)),
      (s) => setCanBan(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => setCanBan([]));
    return () => u();
  }, [c.db, month]);

  const teamBlock = useMemo(() => { const m = new Map<string, string>(); for (const t of c.teams || []) m.set(t.id, t.blockId || ''); return m; }, [c.teams]);
  const blockIdsArr = scope.kind === 'block' ? scope.blockIds : [];
  // Ban: tập dự án thuộc Ban (suy từ banKdId/banKdName của dự án).
  const banProjectIds = useMemo(() => {
    if (scope.kind !== 'ban') return new Set<string>();
    const ids = new Set(scope.banIds);
    return new Set((c.projects || []).filter((p: any) => ids.has(banOfProject(p, c.banKds || [])?.id || '')).map((p: any) => p.id));
  }, [scope, c.projects, c.banKds]);
  const blockIdOf = (x: any) => String(x?.blockId || (x?.teamId ? (teamBlock.get(x.teamId) || '') : '') || '');
  const inScope = (x: any, pid: string) => (scope.kind === 'ban' ? banProjectIds.has(pid) : blockIdsArr.includes(blockIdOf(x)));

  const scoped = useMemo(() => {
    const nsLines = (lines || []).filter((l: any) => inScope(l, l.projectId));
    const acceptances = (c.acceptances || []).filter((a: any) => normalizeMonth(a.month) === month && inScope(a, a.projectId));
    const canBanLines = (canBan || []).filter((cb: any) => (scope.kind === 'ban' ? banProjectIds.has(cb.projectId) : blockIdsArr.includes(String(cb.blockId || ''))));
    const blocks = scope.kind === 'block' ? (c.blocks || []).filter((b: any) => blockIdsArr.includes(b.id)) : c.blocks;
    return { nsLines, acceptances, canBanLines, blocks };
  }, [lines, c.acceptances, canBan, month, c.blocks, teamBlock, scope, banProjectIds]);

  const o = useMemo(() => buildOverview({
    period: month, nsLines: scoped.nsLines, nsSupport: {}, acceptances: scoped.acceptances,
    canBanLines: scoped.canBanLines, projects: c.projects, bans: c.banKds, blocks: scoped.blocks, teams: c.teams,
  }), [month, scoped, c.projects, c.banKds, c.teams]);

  const monthPicker = (
    <Field label="Tháng">
      <Select value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: `Tháng ${+m.slice(5)}/${m.slice(0, 4)}` }))} data-testid="vn-overview-month" />
    </Field>
  );

  const layout: Partial<OverviewLayout> = scope.kind === 'block'
    // Khối: mục 2 → Dự án tỉ lệ thấp; bỏ xếp hạng/khối chưa căn bán & theo Ban; thêm báo cáo theo từng dự án.
    ? { lowRatio: 'project', blockRanking: false, blockNoSales: false, byProject: true, byProjectFull: true, byBan: false }
    // Ban: bỏ mục theo Ban KD, giữ các mục còn lại.
    : { byBan: false };

  return <OverviewReportView o={o} title={title} desc={desc} headerRight={monthPicker} layout={layout} />;
}
