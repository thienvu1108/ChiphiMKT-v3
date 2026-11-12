import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query as fsQuery, where as fsWhere } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, TrendingUp, Wallet, Users, Home, Building2, Target, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { normalizeMonth } from '../../lib/vnext/ntReport';
import { buildOverview } from '../../lib/vnext/overviewReport';

interface OverviewReportManagerProps {
  acceptances: any[];
  projects: any[];
  blocks: any[];
  teams: any[];
  bans: any[];
  user?: any;
}

const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('vi-VN') + ' đ');
const fmtNum = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('vi-VN'));
const fmtPct = (r: number | null | undefined) => (r == null ? '—' : `${Math.round(r * 1000) / 10}%`.replace('.', ','));
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function StatTile({ icon, label, value, sub, tone = 'indigo' }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--mh-border)] bg-[var(--mh-surface)] p-3.5 flex flex-col gap-1">
      <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-${tone}-600`}>{icon}{label}</div>
      <div className="text-lg font-black text-[var(--mh-text)] leading-tight">{value}</div>
      {sub && <div className="text-[11px] font-semibold text-[var(--mh-text-3)]">{sub}</div>}
    </div>
  );
}

function SectionCard({ title, desc, icon, children }: { title: string; desc?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type SortDir = 'asc' | 'desc';
type Col<T> = {
  key: string;
  label: string;
  align?: 'right';
  /** Giá trị dùng để sắp xếp; không có → cột không sắp xếp được. */
  val?: (r: T) => number | string | null;
  render: (r: T, i: number) => React.ReactNode;
  cell?: string;
  /** Nội dung ô ở hàng Tổng; không có → ô trống. */
  total?: (rows: T[]) => React.ReactNode;
};

/** Bảng có sắp xếp theo tiêu đề cột (click) + hàng Tổng. */
function SortableTable<T>({ rows, cols, rowKey, empty }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T, i: number) => string; empty: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (!col || !col.val) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = col.val!(a), vb = col.val!(b);
      let cmp: number;
      if (va == null && vb == null) cmp = 0;
      else if (va == null) cmp = -1;
      else if (vb == null) cmp = 1;
      else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), 'vi', { sensitivity: 'base' });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort, cols]);

  const onSort = (c: Col<T>) => {
    if (!c.val) return;
    setSort((s) => (s && s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }));
  };
  const arrow = (c: Col<T>) => {
    if (!c.val) return null;
    if (sort?.key !== c.key) return <ChevronsUpDown className="w-3 h-3 text-[var(--mh-text-3)] opacity-50" />;
    return sort.dir === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />;
  };
  const hasTotal = cols.some((c) => c.total);

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--mh-border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--mh-surface-2)]">
            {cols.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort(c)}
                className={`px-3 py-2 text-[11px] font-black uppercase text-[var(--mh-text-2)] ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.val ? 'cursor-pointer select-none hover:text-indigo-600' : ''}`}
              >
                <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>{c.label}{arrow(c)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-t border-[var(--mh-border)]">
              {cols.map((c) => (
                <td key={c.key} className={`px-3 py-1.5 text-[var(--mh-text)] ${c.align === 'right' ? 'text-right' : ''} ${c.cell || ''}`}>{c.render(r, i)}</td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-[var(--mh-text-3)]">{empty}</td></tr>}
        </tbody>
        {hasTotal && sorted.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-[var(--mh-border-strong)] bg-[var(--mh-surface-2)] font-black">
              {cols.map((c) => (
                <td key={c.key} className={`px-3 py-2 text-[var(--mh-text)] ${c.align === 'right' ? 'text-right' : ''} ${c.cell || ''}`}>{c.total ? c.total(rows) : ''}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function OverviewReportManager({ acceptances, projects, blocks, teams, bans }: OverviewReportManagerProps) {
  const months = useMemo(() => {
    const s = new Set<string>();
    for (const a of acceptances || []) { const m = normalizeMonth(a?.month); if (/^[0-9]{4}-[0-9]{2}$/.test(m)) s.add(m); }
    const arr = [...s].sort((a, b) => b.localeCompare(a));
    return arr.length ? arr : [normalizeMonth(new Date().toISOString().slice(0, 7))].filter((m) => /^[0-9]{4}-[0-9]{2}$/.test(m));
  }, [acceptances]);

  const [month, setMonth] = useState('');
  const [nsLines, setNsLines] = useState<any[]>([]);
  const [nsSupport, setNsSupport] = useState<Record<string, any>>({});
  const [canBanLines, setCanBanLines] = useState<any[]>([]);

  useEffect(() => { if (!month && months.length) setMonth(months[0]); }, [months, month]);

  useEffect(() => {
    if (!month) return;
    const uL = onSnapshot(fsQuery(collection(db, 'ns_lines'), fsWhere('period', '==', month)),
      (s) => setNsLines(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => setNsLines([]));
    const uS = onSnapshot(fsQuery(collection(db, 'nsSupport'), fsWhere('period', '==', month)),
      (s) => { const o: Record<string, any> = {}; s.docs.forEach((d) => { o[d.id] = { id: d.id, ...(d.data() as any) }; }); setNsSupport(o); }, () => setNsSupport({}));
    const uC = onSnapshot(fsQuery(collection(db, 'can_ban'), fsWhere('month', '==', month)),
      (s) => setCanBanLines(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => setCanBanLines([]));
    return () => { uL(); uS(); uC(); };
  }, [month]);

  const o = useMemo(() => buildOverview({ period: month, nsLines, nsSupport, acceptances, canBanLines, projects, bans, blocks, teams }),
    [month, nsLines, nsSupport, acceptances, canBanLines, projects, bans, blocks, teams]);

  type BRow = typeof o.blocks[number];
  type PRow = typeof o.projects[number];
  type NRow = typeof o.bans[number];

  const rightMono = 'text-right font-mono';

  return (
    <div className="space-y-5">
      <Card className="border-none shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-600" /> Báo cáo Tổng quan MKT</CardTitle>
            <CardDescription>Tổng hợp theo tháng: Ngân sách đăng ký · thực chạy · hỗ trợ · lead · căn bán — theo Khối / Dự án / Ban. Bấm tiêu đề cột để sắp xếp.</CardDescription>
          </div>
          <div className="min-w-[160px]">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-9 font-bold"><SelectValue placeholder="Chọn tháng" /></SelectTrigger>
              <SelectContent className="max-h-72">{months.map((m) => <SelectItem key={m} value={m}>Tháng {+m.slice(5)}/{m.slice(0, 4)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* 1. Tổng quan */}
      <SectionCard title="1. Tổng quan" icon={<Target className="w-4 h-4 text-indigo-600" />}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatTile icon={<Wallet className="w-3.5 h-3.5" />} label="NS đăng ký" value={fmtVnd(o.totals.nsReg)} sub="Tổng NS MKT Khối" tone="indigo" />
          <StatTile icon={<TrendingUp className="w-3.5 h-3.5" />} label="NS thực chạy" value={fmtVnd(o.totals.cost)} sub="Theo Nghiệm thu MKT" tone="rose" />
          <StatTile icon={<Wallet className="w-3.5 h-3.5" />} label="NS dự kiến hỗ trợ" value={fmtVnd(o.totals.support)} sub="Thực chạy × tỉ lệ hỗ trợ/dự án" tone="emerald" />
          <StatTile icon={<Users className="w-3.5 h-3.5" />} label="Tổng lead" value={fmtNum(o.totals.leads)} sub={`CP/lead: ${fmtVnd(o.totals.cpl)}`} tone="sky" />
          <StatTile icon={<Home className="w-3.5 h-3.5" />} label="Số căn bán" value={fmtNum(o.totals.canBan)} tone="amber" />
          <StatTile icon={<Home className="w-3.5 h-3.5" />} label="CP MKT / căn" value={fmtVnd(o.totals.cpPerUnit)} sub="Thực chạy / số căn bán" tone="fuchsia" />
        </div>
      </SectionCard>

      {/* 2. Theo Khối */}
      <SectionCard title="2. Báo cáo theo Khối" desc="Chạy trong Ngân sách = thực chạy ở 70%–150% so với Ngân sách đăng ký." icon={<Building2 className="w-4 h-4 text-indigo-600" />}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatTile icon={<Target className="w-3.5 h-3.5" />} label="Khối chạy trong NS" value={fmtNum(o.blocksInBudget)} sub="70%–150% NS đăng ký" tone="emerald" />
          <StatTile icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Khối chạy ngoài NS" value={fmtNum(o.blocksOutBudget)} sub="< 70% hoặc > 150%" tone="rose" />
        </div>
        <div className="text-[11px] font-black uppercase text-[var(--mh-text-3)] mb-1">Khối có tỉ lệ chạy thấp (&lt; 70%)</div>
        <SortableTable<BRow>
          rows={o.blocksLowRatio} rowKey={(b) => b.blockId} empty="Không có Khối nào chạy dưới 70%."
          cols={[
            { key: 'name', label: 'Khối', val: (b) => b.name, render: (b) => <span className="font-bold">{b.name}</span>, total: () => 'Tổng' },
            { key: 'nsReg', label: 'Đăng ký', align: 'right', cell: rightMono, val: (b) => b.nsReg, render: (b) => fmtVnd(b.nsReg), total: (rs) => fmtVnd(sum(rs, (b) => b.nsReg)) },
            { key: 'cost', label: 'Thực chạy', align: 'right', cell: rightMono, val: (b) => b.cost, render: (b) => fmtVnd(b.cost), total: (rs) => fmtVnd(sum(rs, (b) => b.cost)) },
            { key: 'ratio', label: 'Tỉ lệ', align: 'right', cell: rightMono + ' font-bold text-rose-600', val: (b) => b.ratio, render: (b) => fmtPct(b.ratio), total: (rs) => fmtPct(div(sum(rs, (b) => b.cost), sum(rs, (b) => b.nsReg))) },
          ]}
        />
      </SectionCard>

      {/* 3. Xếp hạng Khối theo căn bán */}
      <SectionCard title="3. Xếp hạng Khối theo căn bán" desc={`${o.blocksWithSales.length} Khối phát sinh căn bán.`} icon={<Home className="w-4 h-4 text-emerald-600" />}>
        <SortableTable<BRow>
          rows={o.blocksWithSales} rowKey={(b) => b.blockId} empty="Chưa Khối nào phát sinh căn bán."
          cols={[
            { key: 'rank', label: '#', render: (_b, i) => <span className="text-[var(--mh-text-3)] font-mono">{i + 1}</span> },
            { key: 'name', label: 'Khối', val: (b) => b.name, render: (b) => <span className="font-bold">{b.name}</span>, total: () => 'Tổng' },
            { key: 'cost', label: 'Chi phí thực tế', align: 'right', cell: rightMono, val: (b) => b.cost, render: (b) => fmtVnd(b.cost), total: (rs) => fmtVnd(sum(rs, (b) => b.cost)) },
            { key: 'canBan', label: 'Số căn bán', align: 'right', cell: rightMono + ' font-bold', val: (b) => b.canBan, render: (b) => fmtNum(b.canBan), total: (rs) => fmtNum(sum(rs, (b) => b.canBan)) },
            { key: 'cpPerUnit', label: 'CP TB / căn', align: 'right', cell: rightMono + ' font-bold text-emerald-700', val: (b) => b.cpPerUnit, render: (b) => fmtVnd(b.cpPerUnit), total: (rs) => fmtVnd(div(sum(rs, (b) => b.cost), sum(rs, (b) => b.canBan))) },
          ]}
        />
      </SectionCard>

      {/* 4. Khối chưa phát sinh căn bán */}
      <SectionCard title="4. Khối chưa phát sinh căn bán" desc="Có chi phí MKT nhưng chưa có căn bán." icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}>
        <SortableTable<BRow>
          rows={o.blocksNoSales} rowKey={(b) => b.blockId} empty="Mọi Khối có chi phí đều đã phát sinh căn bán."
          cols={[
            { key: 'name', label: 'Khối', val: (b) => b.name, render: (b) => <span className="font-bold">{b.name}</span>, total: () => 'Tổng' },
            { key: 'cost', label: 'Chi phí MKT', align: 'right', cell: rightMono, val: (b) => b.cost, render: (b) => fmtVnd(b.cost), total: (rs) => fmtVnd(sum(rs, (b) => b.cost)) },
            { key: 'leads', label: 'Số lead', align: 'right', cell: rightMono, val: (b) => b.leads, render: (b) => fmtNum(b.leads), total: (rs) => fmtNum(sum(rs, (b) => b.leads)) },
            { key: 'cpl', label: 'Giá lead TB', align: 'right', cell: rightMono + ' font-bold text-amber-700', val: (b) => b.cpl, render: (b) => fmtVnd(b.cpl), total: (rs) => fmtVnd(div(sum(rs, (b) => b.cost), sum(rs, (b) => b.leads))) },
          ]}
        />
      </SectionCard>

      {/* 5. Theo Dự án */}
      <SectionCard title="5. Báo cáo theo Dự án" desc={`${o.projectsWithSales.length} dự án có căn bán · ${o.projectsNoSales.length} dự án chưa có căn bán.`} icon={<Target className="w-4 h-4 text-indigo-600" />}>
        <div className="text-[11px] font-black uppercase text-[var(--mh-text-3)] mb-1">Dự án phát sinh căn bán</div>
        <SortableTable<PRow>
          rows={o.projectsWithSales} rowKey={(p) => p.projectId} empty="Chưa có."
          cols={[
            { key: 'name', label: 'Dự án', val: (p) => p.name, render: (p) => <span className="font-bold">{p.name}</span>, total: () => 'Tổng' },
            { key: 'cost', label: 'Chi phí MKT', align: 'right', cell: rightMono, val: (p) => p.cost, render: (p) => fmtVnd(p.cost), total: (rs) => fmtVnd(sum(rs, (p) => p.cost)) },
            { key: 'canBan', label: 'Căn bán', align: 'right', cell: rightMono + ' font-bold', val: (p) => p.canBan, render: (p) => fmtNum(p.canBan), total: (rs) => fmtNum(sum(rs, (p) => p.canBan)) },
            { key: 'cpPerUnit', label: 'CP TB / căn', align: 'right', cell: rightMono + ' font-bold text-emerald-700', val: (p) => p.cpPerUnit, render: (p) => fmtVnd(p.cpPerUnit), total: (rs) => fmtVnd(div(sum(rs, (p) => p.cost), sum(rs, (p) => p.canBan))) },
          ]}
        />
        <div className="text-[11px] font-black uppercase text-[var(--mh-text-3)] mt-4 mb-1">Dự án chưa phát sinh căn bán</div>
        <SortableTable<PRow>
          rows={o.projectsNoSales} rowKey={(p) => p.projectId} empty="Chưa có."
          cols={[
            { key: 'name', label: 'Dự án', val: (p) => p.name, render: (p) => <span className="font-bold">{p.name}</span>, total: () => 'Tổng' },
            { key: 'cost', label: 'Chi phí MKT', align: 'right', cell: rightMono, val: (p) => p.cost, render: (p) => fmtVnd(p.cost), total: (rs) => fmtVnd(sum(rs, (p) => p.cost)) },
            { key: 'leads', label: 'Số lead', align: 'right', cell: rightMono, val: (p) => p.leads, render: (p) => fmtNum(p.leads), total: (rs) => fmtNum(sum(rs, (p) => p.leads)) },
          ]}
        />
      </SectionCard>

      {/* 6. Theo Ban */}
      <SectionCard title="6. Báo cáo theo Ban KD" desc="Xếp hạng theo chi phí thực tế." icon={<Building2 className="w-4 h-4 text-indigo-600" />}>
        <SortableTable<NRow>
          rows={o.bans} rowKey={(b) => b.banId} empty="Chưa có dữ liệu."
          cols={[
            { key: 'name', label: 'Ban KD', val: (b) => b.name, render: (b) => <span className="font-bold">{b.name}</span>, total: () => 'Tổng' },
            { key: 'nsReg', label: 'Đăng ký', align: 'right', cell: rightMono, val: (b) => b.nsReg, render: (b) => fmtVnd(b.nsReg), total: (rs) => fmtVnd(sum(rs, (b) => b.nsReg)) },
            { key: 'cost', label: 'Thực chạy', align: 'right', cell: rightMono, val: (b) => b.cost, render: (b) => fmtVnd(b.cost), total: (rs) => fmtVnd(sum(rs, (b) => b.cost)) },
            { key: 'ratio', label: 'Tỉ lệ', align: 'right', cell: rightMono + ' font-bold', val: (b) => b.ratio, render: (b) => fmtPct(b.ratio), total: (rs) => fmtPct(div(sum(rs, (b) => b.cost), sum(rs, (b) => b.nsReg))) },
            { key: 'leads', label: 'Lead', align: 'right', cell: rightMono, val: (b) => b.leads, render: (b) => fmtNum(b.leads), total: (rs) => fmtNum(sum(rs, (b) => b.leads)) },
            { key: 'cpl', label: 'CP/lead', align: 'right', cell: rightMono, val: (b) => b.cpl, render: (b) => fmtVnd(b.cpl), total: (rs) => fmtVnd(div(sum(rs, (b) => b.cost), sum(rs, (b) => b.leads))) },
            { key: 'canBan', label: 'Căn bán', align: 'right', cell: rightMono + ' font-bold', val: (b) => b.canBan, render: (b) => fmtNum(b.canBan), total: (rs) => fmtNum(sum(rs, (b) => b.canBan)) },
            { key: 'cpPerUnit', label: 'CP/căn', align: 'right', cell: rightMono + ' font-bold text-fuchsia-700', val: (b) => b.cpPerUnit, render: (b) => fmtVnd(b.cpPerUnit), total: (rs) => fmtVnd(div(sum(rs, (b) => b.cost), sum(rs, (b) => b.canBan))) },
          ]}
        />
      </SectionCard>
    </div>
  );
}
