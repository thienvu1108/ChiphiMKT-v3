/**
 * Báo cáo Tổng quan MKT theo từng tháng. Tổng hợp:
 *  - NS đăng ký: ns_lines (reportable, theo kỳ)
 *  - NS thực chạy: acceptances đã nghiệm thu — recordCostBeforeVat
 *  - NS dự kiến hỗ trợ: thực chạy × tỉ lệ hỗ trợ theo Dự án (supportPct, as-of kỳ)
 *  - Lead: caNhanNopTien trên bản ghi NT; CP/lead = chi phí / lead
 *  - Căn bán: can_ban (Tháng × Khối × Dự án)
 *  - CP MKT / căn = thực chạy / số căn bán
 * Gộp theo Khối, Dự án, Ban KD.
 */
import { isAccepted, normalizeMonth, recordCostBeforeVat } from './ntReport';
import { type Support } from './support';
import { baseSupportPctAtPeriod, banOfProject } from './supportPct';
import { canBanOf, type CanBanLine } from './canBan';
import { blockTeamIds, summarizeBlock, type NsLine } from './budget';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const PERIOD_RE = /^[0-9]{4}-[0-9]{2}$/;

/** Ngưỡng "chạy trong Ngân sách đăng ký": thực chạy ở 70%–150% so với NS đăng ký. */
export const IN_BUDGET_LOW = 0.7;
export const IN_BUDGET_HIGH = 1.5;

export type Agg = { nsReg: number; cost: number; support: number; leads: number; canBan: number };
const emptyAgg = (): Agg => ({ nsReg: 0, cost: 0, support: 0, leads: 0, canBan: 0 });

export type OverviewInput = {
  period: string;
  nsLines?: any[] | null;
  nsSupport?: Record<string, Partial<Support> | undefined>;
  acceptances?: any[] | null;
  canBanLines?: CanBanLine[] | null;
  projects?: any[] | null;
  bans?: any[] | null;
  blocks?: any[] | null;
  teams?: any[] | null;
};

export type BlockRow = { blockId: string; name: string } & Agg & { ratio: number | null; cpl: number | null; cpPerUnit: number | null };
export type ProjectRow = { projectId: string; name: string } & Agg & { ratio: number | null; cpl: number | null; cpPerUnit: number | null };
export type BanRow = { banId: string; name: string } & Agg & { ratio: number | null; cpl: number | null; cpPerUnit: number | null };

export type Overview = {
  period: string;
  totals: Agg & { cpl: number | null; cpPerUnit: number | null };
  blocks: BlockRow[];
  projects: ProjectRow[];
  bans: BanRow[];
  // Mục 2 — theo Khối (chỉ Khối có NS đăng ký)
  blocksInBudget: number;
  blocksOutBudget: number;
  blocksLowRatio: BlockRow[];
  // Mục 3 — Khối phát sinh căn bán
  blocksWithSales: BlockRow[];
  // Mục 4 — Khối chưa phát sinh căn bán (có chi phí)
  blocksNoSales: BlockRow[];
  // Mục 5 — Dự án
  projectsWithSales: ProjectRow[];
  projectsNoSales: ProjectRow[];
};

const ratioOf = (a: Agg) => (a.nsReg > 0 ? a.cost / a.nsReg : null);
const cplOf = (a: Agg) => (a.leads > 0 ? Math.round(a.cost / a.leads) : null);
const cpuOf = (a: Agg) => (a.canBan > 0 ? Math.round(a.cost / a.canBan) : null);
const withDerived = <T extends Agg>(r: T) => ({ ...r, ratio: ratioOf(r), cpl: cplOf(r), cpPerUnit: cpuOf(r) });

export function buildOverview(input: OverviewInput): Overview {
  const period = normalizeMonth(input.period);
  const projects = input.projects || [];
  const bans = input.bans || [];
  const blocks = input.blocks || [];
  const teams = input.teams || [];

  const projById = new Map<string, any>();
  for (const p of projects) projById.set(p.id || p.projectId, p);
  const blockName = (id: string) => (blocks.find((b: any) => b.id === id || b.blockCode === id)?.name) || (blocks.find((b: any) => b.id === id)?.blockCode) || id || '—';
  const banName = (id: string) => (bans.find((b: any) => b.id === id)?.name) || id || '—';
  const projName = (id: string) => { const p = projById.get(id); return p?.name || p?.projectName || id || '—'; };
  const blockOfTeam = (teamId: string) => (teams.find((t: any) => t.id === teamId)?.blockId) || '';
  const blockIdOf = (x: any) => String(x?.blockId || (x?.teamId ? blockOfTeam(x.teamId) : '') || '');
  const banIdOfProject = (pid: string) => { const b = banOfProject(projById.get(pid), bans); return b?.id || ''; };
  const supportPctOfProject = (pid: string) => { const e = baseSupportPctAtPeriod(projById.get(pid), bans as any, period); return e ? e.pct : 0; };

  const byBlock = new Map<string, Agg>();
  const byProject = new Map<string, Agg>();
  const byBan = new Map<string, Agg>();
  const totals = emptyAgg();
  const bump = (map: Map<string, Agg>, key: string, f: keyof Agg, v: number) => {
    if (!key) return; const a = map.get(key) || emptyAgg(); a[f] += v; map.set(key, a);
  };
  const add = (f: keyof Agg, v: number, blockId: string, projectId: string, banId: string) => {
    if (!v) return;
    totals[f] += v;
    bump(byBlock, blockId, f, v);
    bump(byProject, projectId, f, v);
    bump(byBan, banId, f, v);
  };

  // NS đăng ký = tổng Ngân sách MKT của Khối theo từng dự án (khớp màn "Ngân sách MKT Khối"):
  // mỗi Khối gộp dòng user+gdkd của các Phòng thuộc Khối + dòng gdk/khoi của Khối (summarizeBlock).
  const nsLinesArr = (input.nsLines || []) as NsLine[];
  for (const b of blocks) {
    const blockId = String(b.id || '');
    if (!blockId) continue;
    const currentTeamIds = teams.filter((t: any) => t.blockId === blockId).map((t: any) => String(t.id));
    const teamIds = blockTeamIds(nsLinesArr, period, blockId, currentTeamIds);
    const sb = summarizeBlock(nsLinesArr, period, blockId, teamIds);
    for (const row of sb.rows) {
      const amt = num(row.total);
      if (!(amt > 0)) continue;
      const pid = String(row.projectId || '');
      add('nsReg', amt, blockId, pid, banIdOfProject(pid));
    }
  }

  // NS thực chạy (NT) + lead + hỗ trợ dự kiến
  for (const r of input.acceptances || []) {
    if (!r || normalizeMonth(r.month) !== period || !isAccepted(r)) continue;
    const cost = recordCostBeforeVat(r);
    const pid = String(r.projectId || '');
    const blockId = blockIdOf(r);
    const banId = banIdOfProject(pid);
    if (cost) {
      add('cost', cost, blockId, pid, banId);
      add('support', Math.round(cost * supportPctOfProject(pid) / 100), blockId, pid, banId);
    }
    const leads = num(r.caNhanNopTien);
    if (leads) add('leads', leads, blockId, pid, banId);
  }

  // Căn bán
  for (const c of input.canBanLines || []) {
    if (!c || c.month !== period || !PERIOD_RE.test(c.month || '')) continue;
    const q = num(c.soLuong);
    if (!(q > 0)) continue;
    add('canBan', q, String(c.blockId || ''), String(c.projectId || ''), banIdOfProject(String(c.projectId || '')));
  }

  const blockRows: BlockRow[] = [...byBlock.entries()].map(([blockId, a]) => ({ blockId, name: blockName(blockId), ...withDerived(a) }));
  const projectRows: ProjectRow[] = [...byProject.entries()].map(([projectId, a]) => ({ projectId, name: projName(projectId), ...withDerived(a) }));
  const banRows: BanRow[] = [...byBan.entries()].map(([banId, a]) => ({ banId, name: banName(banId), ...withDerived(a) }));

  // Mục 2 — theo Khối (chỉ Khối có NS đăng ký)
  const withBudget = blockRows.filter((b) => b.nsReg > 0 && b.ratio != null);
  const blocksInBudget = withBudget.filter((b) => (b.ratio as number) >= IN_BUDGET_LOW && (b.ratio as number) <= IN_BUDGET_HIGH).length;
  const blocksOutBudget = withBudget.length - blocksInBudget;
  const blocksLowRatio = withBudget.filter((b) => (b.ratio as number) < IN_BUDGET_LOW).sort((a, b) => (a.ratio as number) - (b.ratio as number));

  // Mục 3 — Khối phát sinh căn bán (xếp theo CP TB/căn tăng dần, rồi căn bán giảm)
  const blocksWithSales = blockRows.filter((b) => b.canBan > 0)
    .sort((a, b) => (a.cpPerUnit ?? Infinity) - (b.cpPerUnit ?? Infinity) || b.canBan - a.canBan);
  // Mục 4 — Khối chưa phát sinh căn bán nhưng có chi phí
  const blocksNoSales = blockRows.filter((b) => b.canBan === 0 && b.cost > 0).sort((a, b) => b.cost - a.cost);

  // Mục 5 — Dự án
  const projectsWithSales = projectRows.filter((p) => p.canBan > 0).sort((a, b) => (a.cpPerUnit ?? Infinity) - (b.cpPerUnit ?? Infinity) || b.canBan - a.canBan);
  const projectsNoSales = projectRows.filter((p) => p.canBan === 0 && p.cost > 0).sort((a, b) => b.cost - a.cost);

  return {
    period,
    totals: { ...totals, cpl: cplOf(totals), cpPerUnit: cpuOf(totals) },
    blocks: blockRows.sort((a, b) => b.cost - a.cost),
    projects: projectRows.sort((a, b) => b.cost - a.cost),
    bans: banRows.sort((a, b) => b.cost - a.cost),
    blocksInBudget,
    blocksOutBudget,
    blocksLowRatio,
    blocksWithSales,
    blocksNoSales,
    projectsWithSales,
    projectsNoSales,
  };
}

export { canBanOf };
