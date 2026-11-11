import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Wallet, TrendingUp } from 'lucide-react';

export type EfficiencyChartDatum = {
  name: string;
  budget: number;
  cost: number;
  sales: number;
  revenue: number;
  details: Array<{
    name: string;
    sales: number;
    revenue: number;
    cost: number;
    budget: number;
  }>;
};

export type EfficiencyPieDatum = {
  name: string;
  value: number;
  color: string;
};

type Props = {
  chartData: EfficiencyChartDatum[];
  pieData: EfficiencyPieDatum[];
  efficiencyGroupType: string;
  formatCurrency: (value: number) => string;
  formatYAxis: (value: number) => string;
};

function EfficiencyDetailedTooltip({
  active,
  payload,
  label,
  formatCurrency,
  efficiencyGroupType,
}: any) {
  if (!(active && payload && payload.length)) return null;
  const data = payload[0].payload;
  const roi = data.cost > 0 && data.revenue > 0 ? (data.revenue / data.cost).toFixed(2) : null;
  const isOverBudget = data.cost > data.budget;
  const usagePercent = data.budget > 0 ? (data.cost / data.budget) * 100 : 0;

  return (
    <div className="bg-[var(--mh-surface)] p-5 rounded-[24px] shadow-2xl border border-[var(--mh-border)] min-w-[340px] space-y-4 animate-in fade-in zoom-in duration-200">
      <div className="border-b border-[var(--mh-border)] pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
          <p className="text-xs font-black text-[var(--mh-text)] uppercase tracking-tight">{label}</p>
        </div>
        <Badge
          variant="secondary"
          className="bg-indigo-50 text-indigo-600 border-none text-[8px] font-black uppercase"
        >
          Hiệu quả kỳ này
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1 p-3 bg-[var(--mh-surface-2)]/50 rounded-2xl border border-[var(--mh-border)]/50">
          <p className="text-[9px] font-black text-[var(--mh-text-3)] uppercase tracking-widest flex items-center gap-1">
            <Wallet className="w-2.5 h-2.5" /> Ngân sách
          </p>
          <p className="text-xs font-black text-[var(--mh-text)] font-mono">
            {formatCurrency(data.budget)}
          </p>
        </div>
        <div
          className={`space-y-1 p-3 rounded-2xl border ${
            isOverBudget ? 'bg-red-50 border-red-100' : 'bg-[var(--mh-surface-2)]/50 border-[var(--mh-border)]/50'
          }`}
        >
          <p className="text-[9px] font-black text-[var(--mh-text-3)] uppercase tracking-widest flex items-center gap-1">
            <TrendingUp className="w-2.5 h-2.5" /> Chi phí
          </p>
          <p
            className={`text-xs font-black font-mono ${
              isOverBudget ? 'text-red-600' : 'text-[var(--mh-text)]'
            }`}
          >
            {formatCurrency(data.cost)}
          </p>
          {isOverBudget && (
            <p className="text-[8px] font-bold text-red-500 italic">Vượt {usagePercent.toFixed(0)}%</p>
          )}
        </div>
      </div>

      <div className="p-4 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100 space-y-3">
        <div className="flex items-center justify-between border-b border-indigo-400/30 pb-2">
          <div className="space-y-0.5">
            <p className="text-[8px] font-black text-indigo-200 uppercase tracking-widest">
              Sản lượng bán
            </p>
            <p className="text-lg font-black text-white leading-none">
              {data.sales || 0}{' '}
              <span className="text-[10px] font-bold opacity-80 uppercase">Căn</span>
            </p>
          </div>
          <div className="h-8 w-[1px] bg-indigo-400/30" />
          <div className="space-y-0.5 text-right">
            <p className="text-[8px] font-black text-indigo-200 uppercase tracking-widest">Doanh số</p>
            <p className="text-sm font-black text-white leading-none">
              {formatCurrency(data.revenue || 0)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[var(--mh-surface)]/20 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[8px] font-black text-indigo-100 uppercase tracking-widest opacity-80">
                ROI (Doanh thu/Vốn)
              </p>
              <p className="text-xs font-black text-white uppercase">{roi ? `${roi}x lần` : "—"}</p>
            </div>
          </div>
          <div className="px-3 py-1 bg-[var(--mh-surface)]/20 rounded-lg backdrop-blur-md">
            <p className="text-[9px] font-black text-white">
              {data.cost > 0 ? ((data.revenue / data.cost) * 100).toFixed(0) : 0}% Lợi điểm
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black text-[var(--mh-text-3)] uppercase tracking-widest mb-2 px-1">
          {efficiencyGroupType === 'team'
            ? 'Thành phần (Xếp theo Doanh số)'
            : 'Đội ngũ triển khai (Xếp theo Doanh số)'}
        </p>
        <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
          {(data.details || []).map((d: any, i: number) => (
            <div
              key={i}
              className="flex flex-col p-2.5 rounded-lg border border-[var(--mh-border)] bg-[var(--mh-surface-2)]/30 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--mh-text)] text-[10px] uppercase tracking-tight">
                  {d.name}
                </span>
                {d.sales > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 text-[7px] font-black px-1.5 bg-emerald-50 text-emerald-600 border-none"
                  >
                    {d.sales} căn
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px]">
                <div className="flex justify-between border-r border-[var(--mh-border)] pr-2">
                  <span className="text-[var(--mh-text-3)] font-bold uppercase tracking-tighter">
                    Doanh số:
                  </span>
                  <span className="font-black text-emerald-600 font-mono">
                    {formatCurrency(d.revenue)}
                  </span>
                </div>
                <div className="flex justify-between pl-1">
                  <span className="text-[var(--mh-text-3)] font-bold uppercase tracking-tighter">Chi phí:</span>
                  <span
                    className={`font-mono font-black ${
                      d.budget > 0 && d.cost > d.budget ? 'text-red-600' : 'text-[var(--mh-text-2)]'
                    }`}
                  >
                    {formatCurrency(d.cost)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EfficiencyHomeCharts({
  chartData,
  pieData,
  efficiencyGroupType,
  formatCurrency,
  formatYAxis,
}: Props) {
  const totalCost = chartData.reduce((acc, curr) => acc + curr.cost, 0);
  const totalRevenue = chartData.reduce((acc, curr) => acc + curr.revenue, 0);
  const hasRoiData = totalCost > 0 && totalRevenue > 0;
  const hasAnyData = chartData.length > 0 && (totalCost > 0 || totalRevenue > 0);
  const roiAvg = hasRoiData ? (totalRevenue / totalCost).toFixed(2) : null;
  const pieTotal = pieData.reduce((a, b) => a + b.value, 0) || 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 bg-[var(--mh-surface)] p-8 rounded-[32px] border border-[var(--mh-border)] shadow-xl shadow-slate-100/50 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:scale-110 transition-transform duration-700">
          <TrendingUp className="w-64 h-64 text-indigo-600" />
        </div>
        <div className="flex items-center justify-between mb-8 relative z-10">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-[0.2em]">
              Tương quan Hiệu quả
            </p>
            <h3 className="text-xl font-black text-[var(--mh-text)]">Chi phí vs Doanh số thực tế</h3>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-100 border-2 border-indigo-500" />
              <span className="text-[10px] font-black text-[var(--mh-text-2)] uppercase">Doanh số</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="text-[10px] font-black text-[var(--mh-text-2)] uppercase tracking-tighter">
                Chi phí
              </span>
            </div>
          </div>
        </div>
        <div className="h-[350px] w-full relative z-10 min-h-[280px]">
          {!hasAnyData ? (
            <div className="h-full flex flex-col items-center justify-center rounded-[10px] border border-dashed border-[#CBD5E1] bg-[#FAFBFD] text-center px-6">
              <p className="text-sm font-semibold text-[var(--mh-text)]">Chưa có dữ liệu biểu đồ kỳ này</p>
              <p className="text-xs text-[var(--mh-text-2)] mt-1 max-w-sm">
                Biểu đồ Chi phí vs Doanh số sẽ hiện khi có báo cáo hiệu quả MKT hoặc chi phí nghiệm thu.
              </p>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={280}>
            <ComposedChart data={chartData.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                tickFormatter={formatYAxis}
              />
              <ChartTooltip
                cursor={{ fill: '#f8fafc' }}
                content={
                  <EfficiencyDetailedTooltip
                    formatCurrency={formatCurrency}
                    efficiencyGroupType={efficiencyGroupType}
                  />
                }
              />
              <Bar dataKey="cost" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={32} />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Doanh số"
                stroke="#4f46e5"
                strokeWidth={4}
                dot={{ r: 6, fill: '#4f46e5', strokeWidth: 3, stroke: '#fff' }}
                activeDot={{ r: 8, stroke: '#fff', strokeWidth: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className={`border-none shadow-xl shadow-slate-100 p-8 rounded-[10px] overflow-hidden relative group ${hasRoiData ? 'bg-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)] border border-[var(--mh-border)] text-[var(--mh-text)]'}`}>
          <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-[var(--mh-surface)] opacity-10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
          <div className="relative z-10 space-y-4">
            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${hasRoiData ? 'text-indigo-200' : 'text-[var(--mh-text-2)]'}`}>
              ROI kỳ này
            </p>
            {hasRoiData ? (
              <>
                <div className="flex items-baseline gap-2">
                  <p className="text-5xl font-bold tracking-tighter tabular-nums">{roiAvg}</p>
                  <span className="text-xl font-bold text-indigo-300">x</span>
                </div>
                <div className="pt-2 border-t border-indigo-400/30">
                  <p className="text-[11px] font-medium text-indigo-100 leading-relaxed opacity-90">
                    Cứ 1 đồng chi phí bỏ ra, hệ thống mang về {roiAvg} đồng doanh số.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <p className="text-5xl font-bold tracking-tighter text-[var(--mh-text-3)]">—</p>
                </div>
                <div className="pt-2 border-t border-[var(--mh-border)]">
                  <p className="text-[12px] font-medium text-[var(--mh-text-2)] leading-relaxed">
                    {hasAnyData
                      ? 'Chưa đủ Doanh số và Chi phí nghiệm thu để tính ROI kỳ này.'
                      : 'Chưa có báo cáo hiệu quả kỳ này. ROI sẽ hiển thị khi có Doanh số và Chi phí nghiệm thu.'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-[var(--mh-surface)] p-6 rounded-[32px] border border-[var(--mh-border)] shadow-xl shadow-slate-100/50 space-y-4">
          <p className="text-[11px] font-black text-[var(--mh-text-3)] uppercase tracking-widest px-2">
            Phân bổ Top {efficiencyGroupType === 'team' ? 'Team' : 'Dự án'}
          </p>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[var(--mh-surface)] p-3 rounded-xl shadow-xl border border-[var(--mh-border)] min-w-[150px]">
                          <p className="text-[10px] font-black uppercase text-[var(--mh-text-3)] mb-1">
                            {payload[0].name}
                          </p>
                          <p className="text-sm font-black text-[var(--mh-text)]">
                            {formatCurrency(payload[0].value as number)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {pieData.map((d, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 rounded-xl bg-[var(--mh-surface-2)]/50 border border-[var(--mh-border)]/50"
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-[var(--mh-text-3)] uppercase truncate max-w-[80px]">
                    {d.name}
                  </span>
                  <span className="text-[10px] font-black text-[var(--mh-text)]">
                    {((d.value / pieTotal) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
