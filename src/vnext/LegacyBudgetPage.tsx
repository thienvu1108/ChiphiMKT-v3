import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { type VCtx, canViewAll, isKhoiMgr, gdkdTeams, blockName, teamName, blockOfTeam } from './ctx';
import { Shell, Field, Select, Card, Badge, Th, Td, fmt, Empty, Tabs, Btn, SearchSelect } from './ui';
import { loadXlsx } from '../lib/loadXlsx';
import { excelSupportPctFields } from '../../lib/vnext/supportPct';
import { filterLegacy, legacyBlockOf } from '../../lib/vnext/legacyFilter';
import { projectKeyOf, resolveProject, displayProjectName } from '../../lib/vnext/projectRef';
import { legacyMonthKey, isLegacyPeriod } from '../../lib/vnext/legacyPeriod';

/** NS kỳ cũ (≤ Tháng 10/2026) — luồng đăng ký cũ, CHỈ XEM. Không sửa / xoá / di chuyển dữ liệu. */
export function LegacyBudgetPage({ c }: { c: VCtx }) {
  const [rows, setRows] = useState<{ budgets: any[]; blocks: any[] }>({ budgets: [], blocks: [] });
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('user');
  const [period, setPeriod] = useState('');
  const [fBlock, setFBlock] = useState(''); const [fTeam, setFTeam] = useState(''); const [fProj, setFProj] = useState('');
  useEffect(() => {
    let off = false;
    (async () => {
      const get = async (col: string) => { try { return (await getDocs(collection(c.db, col))).docs.map((d) => ({ id: d.id, ...(d.data() as any) })); } catch (e: any) { setErr(String(e?.code || e?.message || e)); return []; } };
      const [b, k] = await Promise.all([get('budgets'), get('block_budgets')]);
      if (!off) setRows({ budgets: b, blocks: k });
    })();
    return () => { off = true; };
  }, [c.db]);

  const inScope = (r: any, kind: 'user' | 'block') => {
    if (canViewAll(c)) return true;
    const blk = r.blockId || (r.teamId ? blockOfTeam(c, r.teamId) : '');
    if (isKhoiMgr(c)) return c.myBlockIds.includes(blk);
    if (kind === 'block') return false;
    const gt = gdkdTeams(c);
    if (gt.length && gt.includes(r.teamId)) return true;
    return [r.submittedBy, r.createdBy, r.userId].includes(c.uid);
  };
  const withKey = (list: any[], kind: 'user' | 'block') => list.map((r) => ({ ...r, _p: legacyMonthKey(r.month) })).filter((r) => isLegacyPeriod(r._p) && inScope(r, kind));
  const ub = useMemo(() => withKey(rows.budgets, 'user'), [rows, c]);
  const kb = useMemo(() => withKey(rows.blocks, 'block'), [rows, c]);
  const periods = useMemo(() => [...new Set([...ub, ...kb].map((r) => r._p))].sort().reverse(), [ub, kb]);
  // Mặc định Tháng 10/2026 (kỳ cũ cuối); có «Tất cả kỳ».
  useEffect(() => { if (!period && periods.length) setPeriod(periods.includes('2026-10') ? '2026-10' : periods[0]); }, [periods]);
  const label = (p: string) => { const [y, m] = p.split('-'); return `Tháng ${Number(m)}/${y}`; };
  const src = (tab === 'user' ? ub : kb);
  const blockOf = (r: any) => legacyBlockOf(r, (t) => blockOfTeam(c, t));
  const inP = src.filter((r) => period === '*' || r._p === period);
  const blockOpts = [...new Set(inP.map(blockOf).filter(Boolean))].map((b) => ({ value: String(b), label: blockName(c, String(b)) || String(b) })).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  const teamOpts = [...new Map(inP.filter((r) => !fBlock || blockOf(r) === fBlock).filter((r) => r.teamId || r.teamName).map((r) => [r.teamId || r.teamName, r.teamName || teamName(c, r.teamId)])).entries()].map(([v, l]) => ({ value: String(v), label: String(l || v) })).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  const projKey = (r: any) => projectKeyOf(c.projects, r);
  const projOpts = [...new Map(inP.filter((r) => projKey(r)).map((r) => [projKey(r), displayProjectName(c.projects, resolveProject(c.projects, r)?.id || r.projectId, r.projectName || r.projectCode)])).entries()].map(([v, l]) => ({ value: v, label: String(l) })).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  const list: any[] = filterLegacy(src as any[], { period, blockId: fBlock, teamKey: tab === 'user' ? fTeam : '', projectKey: fProj }, (t) => blockOfTeam(c, t), c.projects);
  const exportXlsx = async () => {
    const XLSX = await loadXlsx();
    const data = list.map((r) => {
      const pid = resolveProject(c.projects, r)?.id || r.projectId;
      const proj = c.projects.find((p: any) => p.id === pid);
      return { 'Tháng': label(r._p), 'Khối': blockName(c, blockOf(r)) || r.blockName || '', ...(tab === 'user' ? { 'Phòng': r.teamName || teamName(c, r.teamId), 'Người đăng ký': r.submittedByName || r.implementerName || '' } : {}),
      'Dự án': displayProjectName(c.projects, r.projectId, r.projectName || r.projectCode),
      ...excelSupportPctFields(proj, c.banKds || [], r._p),
      'Số tiền (đ)': Number(r.approvedAmount ?? r.amount) || 0, 'Trạng thái': r.status || '', 'Ghi chú': r.note || '' };
    });
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, tab === 'user' ? 'NS ky cu (user)' : 'NS Khoi ky cu');
    XLSX.writeFile(wb, `NSKyCu_${tab}_${period === '*' ? 'TatCa' : period}.xlsx`);
  };
  const total = list.reduce((s, r) => s + (Number(r.approvedAmount ?? r.amount) || 0), 0);
  return (
    <Shell title="NS kỳ cũ (đến Tháng 10/2026)" sub="Đăng ký theo luồng cũ — giữ nguyên, chỉ xem. Từ Tháng 11/2026 (21/10–20/11) dùng luồng Đăng ký NS MKT mới.">
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Tháng"><Select value={period} onChange={setPeriod} options={[{ value: '*', label: 'Tất cả kỳ' }, ...periods.map((p) => ({ value: p, label: label(p) }))]} aria-label="Kỳ cũ" data-testid="vn-legacy-month" /></Field>
        <Field label="Khối"><SearchSelect value={fBlock} onChange={(v: string) => { setFBlock(v); setFTeam(''); }} options={[{ value: '', label: 'Tất cả' }, ...blockOpts]} data-testid="vn-legacy-block" /></Field>
        {tab === 'user' && <Field label="Phòng"><SearchSelect value={fTeam} onChange={setFTeam} options={[{ value: '', label: 'Tất cả' }, ...teamOpts]} data-testid="vn-legacy-team" /></Field>}
        <Field label="Dự án"><SearchSelect value={fProj} onChange={setFProj} options={[{ value: '', label: 'Tất cả' }, ...projOpts]} data-testid="vn-legacy-project" /></Field>
        <Btn onClick={exportXlsx} disabled={!list.length} data-testid="vn-legacy-export">⬇ Xuất Excel</Btn>
        <Badge c="mute">Chỉ xem</Badge>
      </div>
      <Tabs tabs={[{ id: 'user', label: 'NS đăng ký (user)', badge: ub.filter((r) => period === '*' || r._p === period).length }, { id: 'block', label: 'NS Khối', badge: kb.filter((r) => period === '*' || r._p === period).length, hidden: !(canViewAll(c) || isKhoiMgr(c)) }]} value={tab} onChange={setTab} />
      {err && <Card className="p-3 text-[12.5px] text-[var(--mh-warn)]">Một phần dữ liệu không đọc được với quyền hiện tại ({err}).</Card>}
      {!list.length ? <Empty>Không có dữ liệu kỳ này trong phạm vi của bạn.</Empty> : (
        <Card className="overflow-x-auto" data-testid="vn-legacy-budget">
          <table data-mh-responsive className="w-full"><thead><tr>
            <Th>Tháng</Th>{tab === 'user' ? <><Th>Phòng</Th><Th>Người đăng ký</Th></> : <Th>Khối</Th>}
            <Th>Dự án</Th><Th r>Số tiền</Th><Th>Trạng thái</Th><Th>Ghi chú</Th></tr></thead>
            <tbody>{list.map((r) => <tr key={r.id} data-testid="vn-legacy-row"><Td className="whitespace-nowrap">{label(r._p)}</Td>
              {tab === 'user' ? <><Td>{r.teamName || teamName(c, r.teamId)}</Td><Td>{r.submittedByName || r.implementerName || ''}</Td></> : <Td>{r.blockName || blockName(c, r.blockId)}</Td>}
              <Td>{displayProjectName(c.projects, r.projectId, r.projectName || r.projectCode)}</Td><Td r>{fmt(r.approvedAmount ?? r.amount)}</Td><Td>{r.status || ''}</Td><Td>{r.note || ''}</Td></tr>)}
              <tr><Td className="font-semibold">Tổng</Td><Td />{tab === 'user' && <Td />}<Td /><Td r className="font-semibold">{fmt(total)}</Td><Td /><Td /></tr>
            </tbody></table>
        </Card>)}
    </Shell>
  );
}
