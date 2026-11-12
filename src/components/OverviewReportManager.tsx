import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query as fsQuery, where as fsWhere } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, TrendingUp, Wallet, Users, Home, Building2, Target, AlertTriangle } from 'lucide-react';
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

function StatTile({ icon, label, value, sub, tone = 'indigo' }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--mh-border)] bg-[var(--mh-surface)] p-3.5 flex flex-col gap-1">
      <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-${tone}-600`}>{icon}{label}</div>
      <div className="text-lg font-black text-[var(--mh-text)] leading-tight">{value}</div>
      {sub && <div className="text-[11px] font-semibold text-[var(--mh-text-3)]">{sub}</div>}
    </div>
  );
}

const Th = ({ children, className = '' }: any) => <th className={`text-left px-3 py-2 text-[11px] font-black uppercase text-[var(--mh-text-2)] ${className}`}>{children}</th>;
const Td = ({ children, className = '' }: any) => <td className={`px-3 py-1.5 text-[var(--mh-text)] ${className}`}>{children}</td>;

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

export function OverviewReportManager({ acceptances, projects, blocks, teams, bans, user }: OverviewReportManagerProps) {
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

  return (
    <div className="space-y-5">
      <Card className="border-none shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-600" /> Báo cáo Tổng quan MKT</CardTitle>
            <CardDescription>Tổng hợp theo tháng: Ngân sách đăng ký · thực chạy · hỗ trợ · lead · căn bán — theo Khối / Dự án / Ban.</CardDescription>
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
          <StatTile icon={<Wallet className="w-3.5 h-3.5" />} label="NS đăng ký" value={fmtVnd(o.totals.nsReg)} tone="indigo" />
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
        <TableWrap>
          <thead><tr className="bg-[var(--mh-surface-2)]"><Th>Khối</Th><Th className="text-right">Đăng ký</Th><Th className="text-right">Thực chạy</Th><Th className="text-right">Tỉ lệ</Th></tr></thead>
          <tbody>
            {o.blocksLowRatio.map((b) => (
              <tr key={b.blockId} className="border-t border-[var(--mh-border)]"><Td className="font-bold">{b.name}</Td><Td className="text-right font-mono">{fmtVnd(b.nsReg)}</Td><Td className="text-right font-mono">{fmtVnd(b.cost)}</Td><Td className="text-right font-mono font-bold text-rose-600">{fmtPct(b.ratio)}</Td></tr>
            ))}
            {o.blocksLowRatio.length === 0 && <tr><Td colSpan={4} className="text-center text-[var(--mh-text-3)] py-4">Không có Khối nào chạy dưới 70%.</Td></tr>}
          </tbody>
        </TableWrap>
      </SectionCard>

      {/* 3. Xếp hạng Khối theo căn bán */}
      <SectionCard title="3. Xếp hạng Khối theo căn bán" desc={`${o.blocksWithSales.length} Khối phát sinh căn bán.`} icon={<Home className="w-4 h-4 text-emerald-600" />}>
        <TableWrap>
          <thead><tr className="bg-[var(--mh-surface-2)]"><Th>#</Th><Th>Khối</Th><Th className="text-right">Chi phí thực tế</Th><Th className="text-right">Số căn bán</Th><Th className="text-right">CP TB / căn</Th></tr></thead>
          <tbody>
            {o.blocksWithSales.map((b, i) => (
              <tr key={b.blockId} className="border-t border-[var(--mh-border)]"><Td className="text-[var(--mh-text-3)]">{i + 1}</Td><Td className="font-bold">{b.name}</Td><Td className="text-right font-mono">{fmtVnd(b.cost)}</Td><Td className="text-right font-mono font-bold">{fmtNum(b.canBan)}</Td><Td className="text-right font-mono font-bold text-emerald-700">{fmtVnd(b.cpPerUnit)}</Td></tr>
            ))}
            {o.blocksWithSales.length === 0 && <tr><Td colSpan={5} className="text-center text-[var(--mh-text-3)] py-4">Chưa Khối nào phát sinh căn bán.</Td></tr>}
          </tbody>
        </TableWrap>
      </SectionCard>

      {/* 4. Khối chưa phát sinh căn bán */}
      <SectionCard title="4. Khối chưa phát sinh căn bán" desc="Có chi phí MKT nhưng chưa có căn bán." icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}>
        <TableWrap>
          <thead><tr className="bg-[var(--mh-surface-2)]"><Th>Khối</Th><Th className="text-right">Chi phí MKT</Th><Th className="text-right">Số lead</Th><Th className="text-right">Giá lead TB</Th></tr></thead>
          <tbody>
            {o.blocksNoSales.map((b) => (
              <tr key={b.blockId} className="border-t border-[var(--mh-border)]"><Td className="font-bold">{b.name}</Td><Td className="text-right font-mono">{fmtVnd(b.cost)}</Td><Td className="text-right font-mono">{fmtNum(b.leads)}</Td><Td className="text-right font-mono font-bold text-amber-700">{fmtVnd(b.cpl)}</Td></tr>
            ))}
            {o.blocksNoSales.length === 0 && <tr><Td colSpan={4} className="text-center text-[var(--mh-text-3)] py-4">Mọi Khối có chi phí đều đã phát sinh căn bán.</Td></tr>}
          </tbody>
        </TableWrap>
      </SectionCard>

      {/* 5. Theo Dự án */}
      <SectionCard title="5. Báo cáo theo Dự án" desc={`${o.projectsWithSales.length} dự án có căn bán · ${o.projectsNoSales.length} dự án chưa có căn bán.`} icon={<Target className="w-4 h-4 text-indigo-600" />}>
        <div className="text-[11px] font-black uppercase text-[var(--mh-text-3)] mb-1">Dự án phát sinh căn bán</div>
        <TableWrap>
          <thead><tr className="bg-[var(--mh-surface-2)]"><Th>Dự án</Th><Th className="text-right">Chi phí MKT</Th><Th className="text-right">Căn bán</Th><Th className="text-right">CP TB / căn</Th></tr></thead>
          <tbody>
            {o.projectsWithSales.map((p) => (
              <tr key={p.projectId} className="border-t border-[var(--mh-border)]"><Td className="font-bold">{p.name}</Td><Td className="text-right font-mono">{fmtVnd(p.cost)}</Td><Td className="text-right font-mono font-bold">{fmtNum(p.canBan)}</Td><Td className="text-right font-mono font-bold text-emerald-700">{fmtVnd(p.cpPerUnit)}</Td></tr>
            ))}
            {o.projectsWithSales.length === 0 && <tr><Td colSpan={4} className="text-center text-[var(--mh-text-3)] py-4">Chưa có.</Td></tr>}
          </tbody>
        </TableWrap>
        <div className="text-[11px] font-black uppercase text-[var(--mh-text-3)] mt-4 mb-1">Dự án chưa phát sinh căn bán</div>
        <TableWrap>
          <thead><tr className="bg-[var(--mh-surface-2)]"><Th>Dự án</Th><Th className="text-right">Chi phí MKT</Th><Th className="text-right">Số lead</Th></tr></thead>
          <tbody>
            {o.projectsNoSales.map((p) => (
              <tr key={p.projectId} className="border-t border-[var(--mh-border)]"><Td className="font-bold">{p.name}</Td><Td className="text-right font-mono">{fmtVnd(p.cost)}</Td><Td className="text-right font-mono">{fmtNum(p.leads)}</Td></tr>
            ))}
            {o.projectsNoSales.length === 0 && <tr><Td colSpan={3} className="text-center text-[var(--mh-text-3)] py-4">Chưa có.</Td></tr>}
          </tbody>
        </TableWrap>
      </SectionCard>

      {/* 6. Theo Ban */}
      <SectionCard title="6. Báo cáo theo Ban KD" desc="Xếp hạng theo chi phí thực tế." icon={<Building2 className="w-4 h-4 text-indigo-600" />}>
        <TableWrap>
          <thead><tr className="bg-[var(--mh-surface-2)]">
            <Th>Ban KD</Th><Th className="text-right">Đăng ký</Th><Th className="text-right">Thực chạy</Th><Th className="text-right">Tỉ lệ</Th>
            <Th className="text-right">Lead</Th><Th className="text-right">CP/lead</Th><Th className="text-right">Căn bán</Th><Th className="text-right">CP/căn</Th>
          </tr></thead>
          <tbody>
            {o.bans.map((b) => (
              <tr key={b.banId} className="border-t border-[var(--mh-border)]">
                <Td className="font-bold">{b.name}</Td>
                <Td className="text-right font-mono">{fmtVnd(b.nsReg)}</Td>
                <Td className="text-right font-mono">{fmtVnd(b.cost)}</Td>
                <Td className="text-right font-mono font-bold">{fmtPct(b.ratio)}</Td>
                <Td className="text-right font-mono">{fmtNum(b.leads)}</Td>
                <Td className="text-right font-mono">{fmtVnd(b.cpl)}</Td>
                <Td className="text-right font-mono font-bold">{fmtNum(b.canBan)}</Td>
                <Td className="text-right font-mono font-bold text-fuchsia-700">{fmtVnd(b.cpPerUnit)}</Td>
              </tr>
            ))}
            {o.bans.length === 0 && <tr><Td colSpan={8} className="text-center text-[var(--mh-text-3)] py-4">Chưa có dữ liệu.</Td></tr>}
          </tbody>
        </TableWrap>
      </SectionCard>
    </div>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-[var(--mh-border)]"><table className="w-full text-sm">{children}</table></div>;
}
