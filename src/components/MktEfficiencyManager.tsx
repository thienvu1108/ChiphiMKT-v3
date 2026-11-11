import React, { useState, useMemo, useRef, useEffect } from 'react';
import { resolveProject } from '../../lib/vnext/projectRef';
import { loadXlsx } from '../lib/loadXlsx';
import { 
  Target, TrendingUp, Users, Calendar, Search, Filter, 
  ChevronDown, ChevronUp, AlertCircle, HelpCircle, 
  Percent, ArrowUpRight, DollarSign, ListFilter, Edit2, 
  Building2, ArrowUpDown, Download, Check, ChevronsUpDown, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DraggableTableContainer } from './DraggableTableContainer';
import { toast } from 'sonner';

interface MktEfficiencyManagerProps {
  budgets: any[];
  costs: any[];
  projects: any[];
  teams: any[];
  onOpenMktReportDialog: (cost: any) => void;
  isAdmin: boolean;
  isMod: boolean;
  isAccountant: boolean;
  isGDDA: boolean;
  user: any;
  userProfile: any;
  hasPermission?: (permKey: string) => boolean;
}

export function MktEfficiencyManager({
  budgets,
  costs,
  projects,
  teams,
  onOpenMktReportDialog,
  isAdmin,
  isMod,
  isAccountant,
  isGDDA,
  user,
  userProfile,
  hasPermission
}: MktEfficiencyManagerProps) {
  // Permission checks
  const canExport = useMemo(() => {
    return hasPermission ? hasPermission('mkt_efficiency.export') : true;
  }, [hasPermission]);

  const canFilter = useMemo(() => {
    return hasPermission ? hasPermission('mkt_efficiency.filter') : true;
  }, [hasPermission]);

  // Filter states
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Dropdown search states & refs
  const projectRef = useRef<HTMLDivElement>(null);
  const teamRef = useRef<HTMLDivElement>(null);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (projectRef.current && !projectRef.current.contains(event.target as Node)) {
        setIsProjectDropdownOpen(false);
        setProjectSearch('');
      }
      if (teamRef.current && !teamRef.current.contains(event.target as Node)) {
        setIsTeamDropdownOpen(false);
        setTeamSearch('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    const s = projectSearch.toLowerCase();
    return projects.filter(p => p.name?.toLowerCase().includes(s));
  }, [projects, projectSearch]);

  const filteredTeamsList = useMemo(() => {
    if (!teamSearch) return teams;
    const s = teamSearch.toLowerCase();
    return teams.filter(t => t.name?.toLowerCase().includes(s));
  }, [teams, teamSearch]);
  
  // Sort state
  const [sortBy, setSortBy] = useState<'month' | 'budget' | 'actual' | 'leads' | 'roi'>('month');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Expanded budgets tracker
  const [expandedBudgets, setExpandedBudgets] = useState<Record<string, boolean>>({});

  const toggleExpand = (budgetId: string) => {
    setExpandedBudgets(prev => ({
      ...prev,
      [budgetId]: !prev[budgetId]
    }));
  };

  // Get unique months list from budgets for the dropdown filter
  const uniqueMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    budgets.forEach(b => {
      if (b.month) monthsSet.add(b.month);
    });
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [budgets]);

  // Aggregate marketing costs matching budgets
  const budgetLogsMapped = useMemo(() => {
    // Build real id-to-name lookup maps from parents
    const projMap: Record<string, string> = {};
    projects.forEach(p => {
      if (p.id) projMap[p.id] = p.name;
    });

    const tMap: Record<string, string> = {};
    teams.forEach(t => {
      if (t.id) tMap[t.id] = t.name;
    });

    return budgets.map(budget => {
      // Find costs that belong to this budget
      const relatedCosts = costs.filter(c => c.budgetId === budget.id);
      
      // Calculate MKT-specific metrics from these costs
      let totalMktActual = 0;
      let totalLeads = 0;
      let contactedLeads = 0;
      let unconvertedLeads = 0;
      let convertedLeads = 0;
      let conversionRevenue = 0;
      let countWithMktReport = 0;

      relatedCosts.forEach(c => {
        if (c.mktReport) {
          totalMktActual += (c.amount || 0);
          totalLeads += (c.mktReport.totalLeads || 0);
          contactedLeads += (c.mktReport.contactedLeads || 0);
          unconvertedLeads += (c.mktReport.unconvertedLeads || 0);
          convertedLeads += (c.mktReport.convertedLeads || 0);
          conversionRevenue += (c.mktReport.conversionRevenue || 0);
          countWithMktReport++;
        }
      });

      // Override raw id or outdated teamName with parent mapped name
      const matchedProject = resolveProject(projects, budget);
      const resolvedProjectName = matchedProject ? matchedProject.name : (projMap[budget.projectId] || budget.projectName || 'N/A');

      const matchedTeam = teams.find((t: any) =>
        (t.id && (t.id === budget.teamId || t.id === budget.teamName)) ||
        (t.name && (t.name === budget.teamId || t.name === budget.teamName))
      );
      const resolvedTeamName = matchedTeam ? matchedTeam.name : (tMap[budget.teamId] || budget.teamName || 'N/A');

      return {
        ...budget,
        projectName: resolvedProjectName,
        teamName: resolvedTeamName,
        relatedCosts,
        totalMktActual,
        totalLeads,
        contactedLeads,
        unconvertedLeads,
        convertedLeads,
        conversionRevenue,
        countWithMktReport,
        // Helper calculation ratios (safe division)
        conversionRate: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0,
        cpl: totalLeads > 0 ? totalMktActual / totalLeads : 0,
        cac: convertedLeads > 0 ? totalMktActual / convertedLeads : 0,
        roi: totalMktActual > 0 ? (conversionRevenue / totalMktActual) * 100 : 0
      };
    });
  }, [budgets, costs, projects, teams]);

  // Filter budgets based on user selections
  const filteredBudgetLogs = useMemo(() => {
    return budgetLogsMapped.filter(blog => {
      if (selectedProjectId !== 'all' && blog.projectId !== selectedProjectId) return false;
      if (selectedTeamId !== 'all' && blog.teamId !== selectedTeamId) return false;
      if (selectedMonth !== 'all' && blog.month !== selectedMonth) return false;
      
      if (searchTerm) {
        const queryStr = searchTerm.toLowerCase();
        const matchesProject = blog.projectName?.toLowerCase().includes(queryStr);
        const matchesTeam = blog.teamName?.toLowerCase().includes(queryStr);
        const matchesImplementer = blog.implementerName?.toLowerCase().includes(queryStr);
        return matchesProject || matchesTeam || matchesImplementer;
      }
      return true;
    });
  }, [budgetLogsMapped, selectedProjectId, selectedTeamId, selectedMonth, searchTerm]);

  // Sort budgets
  const sortedBudgetLogs = useMemo(() => {
    return [...filteredBudgetLogs].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortBy === 'month') {
        valA = a.month || '';
        valB = b.month || '';
      } else if (sortBy === 'budget') {
        valA = a.amount || 0;
        valB = b.amount || 0;
      } else if (sortBy === 'actual') {
        valA = a.totalMktActual || 0;
        valB = b.totalMktActual || 0;
      } else if (sortBy === 'leads') {
        valA = a.totalLeads || 0;
        valB = b.totalLeads || 0;
      } else if (sortBy === 'roi') {
        valA = a.roi || 0;
        valB = b.roi || 0;
      }

      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
    });
  }, [filteredBudgetLogs, sortBy, sortOrder]);

  // Overall statistics counters for current filters
  const overallStats = useMemo(() => {
    let totalBudget = 0;
    let totalMktActual = 0;
    let totalLeads = 0;
    let totalContacted = 0;
    let totalUnconverted = 0;
    let totalConverted = 0;
    let totalRevenue = 0;

    sortedBudgetLogs.forEach(blog => {
      totalBudget += (blog.amount || 0);
      totalMktActual += (blog.totalMktActual || 0);
      totalLeads += (blog.totalLeads || 0);
      totalContacted += (blog.contactedLeads || 0);
      totalUnconverted += (blog.unconvertedLeads || 0);
      totalConverted += (blog.convertedLeads || 0);
      totalRevenue += (blog.conversionRevenue || 0);
    });

    return {
      totalBudget,
      totalMktActual,
      totalLeads,
      totalContacted,
      totalUnconverted,
      totalConverted,
      totalRevenue,
      conversionRate: totalLeads > 0 ? (totalConverted / totalLeads) * 100 : 0,
      cpl: totalLeads > 0 ? totalMktActual / totalLeads : 0,
      cac: totalConverted > 0 ? totalMktActual / totalConverted : 0,
      roi: totalMktActual > 0 ? (totalRevenue / totalMktActual) * 100 : 0,
      budgetBurnRate: totalBudget > 0 ? (totalMktActual / totalBudget) * 100 : 0
    };
  }, [sortedBudgetLogs]);

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleExportExcel = async () => {
    if (sortedBudgetLogs.length === 0) {
      toast.error('Không có dữ liệu để xuất');
      return;
    }

    // 1. Map overview budget/marketing data
    const overviewData = sortedBudgetLogs.map((blog, idx) => {
      return {
        'STT': idx + 1,
        'Kỳ': blog.month || 'N/A',
        'Dự án': blog.projectName || 'N/A',
        'Phòng / Team': blog.teamName || 'N/A',
        'Người đề xuất': blog.implementerName || 'N/A',
        'Ngân sách Đăng ký (đ)': blog.amount || 0,
        'Thực chi Marketing (đ)': blog.totalMktActual || 0,
        'Tỉ lệ sử dụng (%)': blog.amount > 0 ? Number(((blog.totalMktActual / blog.amount) * 100).toFixed(1)) : 0,
        'Tổng Leads nhận': blog.totalLeads || 0,
        'MKT Leads đã liên hệ': blog.contactedLeads || 0,
        'MKT Leads đã chuyển đổi': blog.convertedLeads || 0,
        'Tỉ lệ chuyển đổi (%)': Number(blog.conversionRate.toFixed(1)),
        'CPL trung bình (đ)': Math.round(blog.cpl),
        'CAC trung bình (đ)': Math.round(blog.cac),
        'Doanh thu dự kiến (đ)': blog.conversionRevenue || 0,
        'Chỉ số ROI (%)': Number(blog.roi.toFixed(1))
      };
    });

    // 2. Map detailed campaigns data
    const drilldownData: any[] = [];
    let dIdx = 1;
    sortedBudgetLogs.forEach(blog => {
      if (blog.relatedCosts && blog.relatedCosts.length > 0) {
        blog.relatedCosts.forEach((c: any) => {
          drilldownData.push({
            'STT': dIdx++,
            'Kỳ hoạch toán': blog.month || 'N/A',
            'Dự án': blog.projectName || 'N/A',
            'Phòng / Team': blog.teamName || 'N/A',
            'Chứng từ / Chiến dịch': c.description || 'N/A',
            'Kênh truyền thông': c.channel || 'Khác',
            'Số tiền chi ra (đ)': c.amount || 0,
            'Từ ngày': c.mktReport?.startDate || '-',
            'Đến ngày': c.mktReport?.endDate || '-',
            'Tổng Leads': c.mktReport?.totalLeads !== undefined ? c.mktReport.totalLeads : 0,
            'Đã liên hệ': c.mktReport?.contactedLeads !== undefined ? c.mktReport.contactedLeads : 0,
            'Đã chuyển đổi': c.mktReport?.convertedLeads !== undefined ? c.mktReport.convertedLeads : 0,
            'Doanh thu dự đoán (đ)': c.mktReport?.conversionRevenue || 0,
            'Lý do chưa chuyển đổi tốt / Ghi chú': c.mktReport?.unconvertedReason || '-'
          });
        });
      }
    });

    const XLSX = await loadXlsx();
    const workbook = XLSX.utils.book_new();

    // Add Overview Sheet
    const wsOverview = XLSX.utils.json_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(workbook, wsOverview, "Tổng hợp Hiệu quả MKT");

    // Add Detailed Sheet (only if there are details)
    if (drilldownData.length > 0) {
      const wsDetail = XLSX.utils.json_to_sheet(drilldownData);
      XLSX.utils.book_append_sheet(workbook, wsDetail, "Chi tiết Chiến dịch");
    }

    // Set nice column widths for Overview
    wsOverview['!cols'] = [
      { wch: 6 },   // STT
      { wch: 10 },  // Kỳ
      { wch: 25 },  // Dự án
      { wch: 20 },  // Phòng / Team
      { wch: 20 },  // Người đề xuất
      { wch: 22 },  // Ngân sách Đăng ký (đ)
      { wch: 22 },  // Thực chi Marketing (đ)
      { wch: 18 },  // Tỉ lệ sử dụng (%)
      { wch: 16 },  // Tổng Leads nhận
      { wch: 20 },  // MKT Leads đã liên hệ
      { wch: 22 },  // MKT Leads đã chuyển đổi
      { wch: 18 },  // Tỉ lệ chuyển đổi (%)
      { wch: 20 },  // CPL trung bình (đ)
      { wch: 20 },  // CAC trung bình (đ)
      { wch: 22 },  // Doanh thu dự kiến (đ)
      { wch: 16 }   // Chỉ số ROI (%)
    ];

    const d = new Date();
    const dateStr = `${d.getFullYear()}${(d.getMonth()+1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}_${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}`;
    XLSX.writeFile(workbook, `Bao_cao_Hieu_qua_MKT_${dateStr}.xlsx`);
    toast.success('Đã xuất file báo cáo Excel hiệu quả Marketing thành công!');
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* Premium Header Display */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#334155] rounded-[2rem] p-6 sm:p-10 text-white border border-slate-800 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-550/10 via-transparent to-transparent opacity-80 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 py-0.5 px-3 rounded-full text-[10px] uppercase font-bold tracking-widest font-mono">
                MAYHOMES MARKETING
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase flex items-center gap-3">
              <Target className="w-8 h-8 text-emerald-550 animate-pulse shrink-0" />
              Quản lý Hiệu quả MKT
            </h1>
            <p className="text-[var(--mh-text-3)] font-medium text-xs sm:text-sm max-w-2xl leading-relaxed">
              Theo dõi, giám sát chi phí quảng cáo và tính toán hiệu quả truyền thông ( leads, conversion, doanh số dự kiến, CPL, CAC ) dựa trên kế hoạch đăng ký ngân sách MKT của các đội ngũ kinh doanh theo từng dự án.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards Bento Box Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        
        {/* KPI 1: Budget and Spends */}
        <Card className="rounded-3xl border border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)] overflow-hidden group">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                <DollarSign className="w-4 h-4" />
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-emerald-100 bg-emerald-50/40 text-emerald-600 font-bold">
                {overallStats.budgetBurnRate.toFixed(1)}% Sử dụng
              </Badge>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[var(--mh-text-3)] uppercase tracking-widest leading-none mb-1">Tổng Chi phí MKT</p>
              <h3 className="text-base sm:text-xl font-black text-rose-600 font-mono tracking-tight tabular-nums">
                {overallStats.totalMktActual.toLocaleString()} đ
              </h3>
              <p className="text-[9px] text-[var(--mh-text-2)] font-medium mt-1">
                Nggân sách đk: <span className="font-bold">{overallStats.totalBudget.toLocaleString()} đ</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Lead Acquisition */}
        <Card className="rounded-3xl border border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)] overflow-hidden group">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                <Users className="w-4 h-4" />
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-blue-100 bg-blue-50/40 text-blue-600 font-bold">
                CPL: {Math.round(overallStats.cpl).toLocaleString()} đ
              </Badge>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[var(--mh-text-3)] uppercase tracking-widest leading-none mb-1">Tổng Lead Nhận Được</p>
              <h3 className="text-base sm:text-xl font-black text-blue-605 font-mono tracking-tight tabular-nums">
                {overallStats.totalLeads.toLocaleString()} Leads
              </h3>
              <p className="text-[9px] text-[var(--mh-text-2)] font-medium mt-1">
                Số đã liên hệ: <span className="font-bold text-blue-700">{overallStats.totalContacted.toLocaleString()}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Conversion Success */}
        <Card className="rounded-3xl border border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)] overflow-hidden group">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                <Percent className="w-4 h-4" />
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-indigo-100 bg-indigo-50/40 text-indigo-600 font-bold">
                CAC: {Math.round(overallStats.cac).toLocaleString()} đ
              </Badge>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[var(--mh-text-3)] uppercase tracking-widest leading-none mb-1">Số Lead Chuyển Đổi</p>
              <h3 className="text-base sm:text-xl font-black text-indigo-600 font-mono tracking-tight tabular-nums">
                {overallStats.totalConverted.toLocaleString()} Chốt ({overallStats.conversionRate.toFixed(1)}%)
              </h3>
              <p className="text-[9px] text-[var(--mh-text-2)] font-medium mt-1">
                Số chưa chốt: <span className="font-bold text-[var(--mh-text)]">{overallStats.totalUnconverted.toLocaleString()}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Financial Yield */}
        <Card className="rounded-3xl border border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)] overflow-hidden group">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-4 h-4" />
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-amber-100 bg-amber-50/40 text-amber-600 font-bold">
                ROI: {overallStats.roi.toFixed(1)}%
              </Badge>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[var(--mh-text-3)] uppercase tracking-widest leading-none mb-1">Doanh Số Dự Kiến</p>
              <h3 className="text-base sm:text-xl font-black text-emerald-600 font-mono tracking-tight tabular-nums">
                {overallStats.totalRevenue.toLocaleString()} đ
              </h3>
              <p className="text-[9px] text-[var(--mh-text-2)] font-medium mt-1">
                Tỉ lệ doanh số/chi phí: <span className="font-bold text-emerald-700">+{Math.round(overallStats.totalRevenue / 1000000)}M đ</span>
              </p>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Control Filter Panel Card */}
      <Card className="rounded-3xl border border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)] overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--mh-border)] flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-indigo-500" />
              <h4 className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wider">Bộ lọc & Công cụ tìm kiếm nhanh</h4>
            </div>
            {!canFilter && (
              <Badge className="bg-rose-50 text-rose-650 border border-[var(--mh-border)] font-bold px-2.5 py-0.5 text-[9px] uppercase rounded-full tracking-wider">
                🔒 Vô hiệu hóa Bộ lọc (Chưa cấp quyền)
              </Badge>
            )}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Filter 1: Project with inline search */}
            <div className="space-y-1.5 relative" ref={projectRef}>
              <Label className="text-[9px] font-black text-[var(--mh-text-3)] uppercase tracking-wider block">Dự án</Label>
              
              <button
                type="button"
                onClick={() => canFilter && setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                disabled={!canFilter}
                className={`flex h-10 w-full items-center justify-between rounded-xl border border-[var(--mh-border)] bg-[var(--mh-surface-2)]/50 px-3 py-2 text-xs font-bold shadow-sm transition-all text-left ${
                  !canFilter ? 'cursor-not-allowed opacity-50' : 'hover:bg-[var(--mh-surface-2)] active:scale-[0.99] border-[var(--mh-border)]/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'
                }`}
              >
                <span className="truncate">
                  {selectedProjectId === 'all' 
                    ? 'Tất cả dự án' 
                    : (projects.find(p => p.id === selectedProjectId)?.name || 'Dự án đã chọn')}
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--mh-text-3)]" />
              </button>

              {isProjectDropdownOpen && (
                <div className="absolute left-0 z-50 mt-1 max-h-60 w-full overflow-hidden rounded-xl border border-[var(--mh-border)] bg-[var(--mh-surface)] shadow-lg animate-in fade-in duration-100">
                  <div className="flex items-center border-b border-[var(--mh-border)] px-3 py-2 bg-[var(--mh-surface-2)]/20">
                    <Search className="h-3.5 w-3.5 shrink-0 text-[var(--mh-text-3)] mr-2" />
                    <input
                      type="text"
                      className="w-full bg-transparent text-xs outline-none border-none placeholder-slate-400 font-medium py-0.5 text-[var(--mh-text)]"
                      placeholder="Tìm kiếm dự án..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      autoFocus
                    />
                    {projectSearch && (
                      <button 
                        type="button" 
                        onClick={() => setProjectSearch('')} 
                        className="text-[var(--mh-text-3)] hover:text-[var(--mh-text-2)] ml-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-44 overflow-y-auto p-1 py-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId('all');
                        setIsProjectDropdownOpen(false);
                        setProjectSearch('');
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold ${
                        selectedProjectId === 'all' 
                          ? 'bg-indigo-50 text-indigo-600 font-extrabold' 
                          : 'text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)]'
                      }`}
                    >
                      <span className="truncate">Tất cả dự án</span>
                      {selectedProjectId === 'all' && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                    </button>
                    
                    {filteredProjects.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-[var(--mh-text-3)] italic">
                        Không tìm thấy dự án nào
                      </div>
                    ) : (
                      filteredProjects.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(p.id);
                            setIsProjectDropdownOpen(false);
                            setProjectSearch('');
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold ${
                            selectedProjectId === p.id 
                              ? 'bg-indigo-50 text-indigo-600 font-extrabold' 
                              : 'text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)]'
                          }`}
                        >
                          <span className="truncate text-left">{p.name}</span>
                          {selectedProjectId === p.id && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
 
            {/* Filter 2: Team with inline search */}
            <div className="space-y-1.5 relative" ref={teamRef}>
              <Label className="text-[9px] font-black text-[var(--mh-text-3)] uppercase tracking-wider block">Phòng kinh doanh / Team</Label>
              
              <button
                type="button"
                onClick={() => canFilter && setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                disabled={!canFilter}
                className={`flex h-10 w-full items-center justify-between rounded-xl border border-[var(--mh-border)] bg-[var(--mh-surface-2)]/50 px-3 py-2 text-xs font-bold shadow-sm transition-all text-left ${
                  !canFilter ? 'cursor-not-allowed opacity-50' : 'hover:bg-[var(--mh-surface-2)] active:scale-[0.99] border-[var(--mh-border)]/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'
                }`}
              >
                <span className="truncate">
                  {selectedTeamId === 'all' 
                    ? 'Tất cả các phòng' 
                    : (teams.find(t => t.id === selectedTeamId)?.name || 'Team đã chọn')}
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-[var(--mh-text-3)]" />
              </button>

              {isTeamDropdownOpen && (
                <div className="absolute left-0 z-50 mt-1 max-h-60 w-full overflow-hidden rounded-xl border border-[var(--mh-border)] bg-[var(--mh-surface)] shadow-lg animate-in fade-in duration-100">
                  <div className="flex items-center border-b border-[var(--mh-border)] px-3 py-2 bg-[var(--mh-surface-2)]/20">
                    <Search className="h-3.5 w-3.5 shrink-0 text-[var(--mh-text-3)] mr-2" />
                    <input
                      type="text"
                      className="w-full bg-transparent text-xs outline-none border-none placeholder-slate-400 font-medium py-0.5 text-[var(--mh-text)]"
                      placeholder="Tìm kiếm team..."
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                      autoFocus
                    />
                    {teamSearch && (
                      <button 
                        type="button" 
                        onClick={() => setTeamSearch('')} 
                        className="text-[var(--mh-text-3)] hover:text-[var(--mh-text-2)] ml-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-44 overflow-y-auto p-1 py-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTeamId('all');
                        setIsTeamDropdownOpen(false);
                        setTeamSearch('');
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold ${
                        selectedTeamId === 'all' 
                          ? 'bg-indigo-50 text-indigo-600 font-extrabold' 
                          : 'text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)]'
                      }`}
                    >
                      <span className="truncate">Tất cả các phòng</span>
                      {selectedTeamId === 'all' && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                    </button>
                    
                    {filteredTeamsList.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-[var(--mh-text-3)] italic">
                        Không tìm thấy team nào
                      </div>
                    ) : (
                      filteredTeamsList.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTeamId(t.id);
                            setIsTeamDropdownOpen(false);
                            setTeamSearch('');
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold ${
                            selectedTeamId === t.id 
                              ? 'bg-indigo-50 text-indigo-600 font-extrabold' 
                              : 'text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)]'
                          }`}
                        >
                          <span className="truncate text-left">{t.name}</span>
                          {selectedTeamId === t.id && <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
 
            {/* Filter 3: Month */}
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black text-[var(--mh-text-3)] uppercase tracking-wider block">Tháng chi phí</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled={!canFilter}>
                <SelectTrigger className="h-10 text-xs font-bold rounded-xl border-[var(--mh-border)] bg-[var(--mh-surface-2)]/50 hover:bg-[var(--mh-surface-2)]">
                  <SelectValue placeholder="Tất cả các tháng" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] rounded-xl">
                  <SelectItem value="all">Tất cả các tháng</SelectItem>
                  {uniqueMonths.map(m => (
                    <SelectItem key={m} value={m}>Tháng {m.split('-')[1]}/{m.split('-')[0]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
 
            {/* Filter 4: Text search */}
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black text-[var(--mh-text-3)] uppercase tracking-wider block">Tìm kiếm</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-[var(--mh-text-3)]" />
                <Input
                  type="text"
                  placeholder={canFilter ? "Nhập tên dự án, team, người đăng ký..." : "Bộ lọc đã bị khóa"}
                  className="h-10 pl-9 text-xs rounded-xl border-[var(--mh-border)] bg-[var(--mh-surface-2)]/50"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  disabled={!canFilter}
                />
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Main Budget Group Record list */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black uppercase text-[var(--mh-text)] tracking-tight flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-500" />
              Kế hoạch Ngân sách & Tiến độ báo cáo MKT ({sortedBudgetLogs.length})
            </h3>
            <p className="text-[10px] text-[var(--mh-text-3)] font-medium">Bản ghi ngân sách đăng ký quảng cáo và kết quả thực tế tương ứng của từng đội</p>
          </div>
          
          {/* Header sorting controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-bold text-[var(--mh-text-3)] uppercase tracking-wider">Sắp xếp:</span>
            <button 
              onClick={() => handleSort('month')} 
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border flex items-center gap-1 transition-all ${sortBy === 'month' ? 'bg-[var(--mh-navy)] border-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)] border-[var(--mh-border)] text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]'}`}
            >
              Tháng {sortBy === 'month' && <ArrowUpDown className="w-2.5 h-2.5" />}
            </button>
            <button 
              onClick={() => handleSort('budget')} 
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border flex items-center gap-1 transition-all ${sortBy === 'budget' ? 'bg-[var(--mh-navy)] border-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)] border-[var(--mh-border)] text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]'}`}
            >
              Ngân sách {sortBy === 'budget' && <ArrowUpDown className="w-2.5 h-2.5" />}
            </button>
            <button 
              onClick={() => handleSort('actual')} 
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border flex items-center gap-1 transition-all ${sortBy === 'actual' ? 'bg-[var(--mh-navy)] border-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)] border-[var(--mh-border)] text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]'}`}
            >
              Thực tế {sortBy === 'actual' && <ArrowUpDown className="w-2.5 h-2.5" />}
            </button>
            <button 
              onClick={() => handleSort('leads')} 
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border flex items-center gap-1 transition-all ${sortBy === 'leads' ? 'bg-[var(--mh-navy)] border-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)] border-[var(--mh-border)] text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]'}`}
            >
              Leads {sortBy === 'leads' && <ArrowUpDown className="w-2.5 h-2.5" />}
            </button>
            <button 
              onClick={() => handleSort('roi')} 
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border flex items-center gap-1 transition-all ${sortBy === 'roi' ? 'bg-[var(--mh-navy)] border-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)] border-[var(--mh-border)] text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]'}`}
            >
              ROI % {sortBy === 'roi' && <ArrowUpDown className="w-2.5 h-2.5" />}
            </button>

            {!canExport ? (
              <Button 
                disabled={true}
                className="bg-[var(--mh-surface-2)] text-[var(--mh-text-3)] border border-[var(--mh-border)] cursor-not-allowed font-medium px-3 py-1.5 text-[10px] h-auto rounded-lg flex items-center gap-1.5 shadow-none"
              >
                <Download className="w-3.5 h-3.5" />
                <span>🔒 Khóa Xuất Excel</span>
              </Button>
            ) : (
              <Button 
                onClick={handleExportExcel} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-1.5 text-[10px] h-auto rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Xuất Excel</span>
              </Button>
            )}
          </div>
        </div>

        {/* List of budgets with inner marketing summary */}
        {sortedBudgetLogs.length === 0 ? (
          <div className="bg-[var(--mh-surface)] rounded-3xl border border-[var(--mh-border)] p-12 text-center text-[var(--mh-text-3)] text-xs italic font-semibold max-w-full">
            Không tìm thấy bản ghi ngân sách đăng ký quảng cáo nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="space-y-4">
            {sortedBudgetLogs.map(blog => {
              const isExpanded = !!expandedBudgets[blog.id];
              const burnRatio = blog.amount > 0 ? (blog.totalMktActual / blog.amount) * 105 : 0;
              
              return (
                <div key={blog.id} className="bg-[var(--mh-surface)] rounded-3xl border border-[var(--mh-border)] shadow-sm overflow-hidden transition-all duration-300 hover:border-[var(--mh-border)]">
                  
                  {/* Budget primary Header card bar */}
                  <div 
                    onClick={() => toggleExpand(blog.id)} 
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-[var(--mh-surface-2)]/50 select-none transition-colors"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="p-2 rounded-2xl bg-[var(--mh-surface-2)] text-[var(--mh-text-2)] font-mono text-[10px] font-extrabold w-11 h-11 flex flex-col items-center justify-center shrink-0">
                        <span className="leading-none text-[var(--mh-text-3)]">T.</span>
                        <span className="text-xs leading-none text-[var(--mh-text)]">{blog.month?.split('-')[1]}</span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-black text-[var(--mh-navy)] text-sm uppercase leading-tight">{blog.projectName}</h4>
                          <span className="text-[var(--mh-text-3)] text-xs font-light">/</span>
                          <span className="text-xs font-bold text-[var(--mh-text)] bg-[var(--mh-surface-2)] rounded-md px-1.5 py-0.5">{blog.teamName}</span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--mh-text-3)] font-medium">
                          <span>Người đề xuất: <span className="font-bold text-[var(--mh-text-2)]">{blog.implementerName || 'N/A'}</span></span>
                          <span className="text-[var(--mh-text-3)]">•</span>
                          <span>Tháng tài khóa: <span className="font-extrabold text-indigo-600">{blog.month}</span></span>
                        </div>
                      </div>
                    </div>

                    {/* Numeric and target indicators */}
                    <div className="flex flex-wrap md:flex-nowrap items-center gap-4 sm:gap-6 ml-14 md:ml-0">
                      
                      {/* Budget values */}
                      <div className="text-right">
                        <div className="text-[9px] font-bold text-[var(--mh-text-3)] uppercase tracking-wider">Ngân sách ĐK</div>
                        <div className="font-mono text-xs sm:text-sm font-black text-[var(--mh-text)] tabular-nums">
                          {blog.amount?.toLocaleString()} đ
                        </div>
                      </div>

                      {/* Actual Spends */}
                      <div className="text-right">
                        <div className="text-[9px] font-bold text-[var(--mh-text-3)] uppercase tracking-wider">Thực chi MKT</div>
                        <div className="font-mono text-xs sm:text-sm font-black text-rose-600 tabular-nums">
                          {blog.totalMktActual?.toLocaleString()} đ
                        </div>
                        {blog.amount > 0 && (
                          <div className={`text-[8.5px] font-extrabold ${blog.totalMktActual > blog.amount ? 'text-red-650' : 'text-emerald-600'}`}>
                            {((blog.totalMktActual / blog.amount) * 100).toFixed(1)}% Sử dụng
                          </div>
                        )}
                      </div>

                      {/* Leads stats preview */}
                      <div className="px-3 py-1.5 rounded-xl bg-[var(--mh-surface-2)] border border-[var(--mh-border)] flex items-center gap-2.5 text-center min-w-[90px]">
                        <div>
                          <div className="text-[8px] font-semibold text-[var(--mh-text-3)] uppercase tracking-wider leading-none mb-0.5">MKT Leads</div>
                          <div className="text-xs font-black text-blue-600 font-mono tracking-tight tabular-nums">
                            {blog.convertedLeads || 0}/{blog.totalLeads || 0}
                          </div>
                          <div className="text-[7px] text-[var(--mh-text-2)] font-bold tracking-tighter">
                            {blog.conversionRate.toFixed(0)}% Chuyển đổi
                          </div>
                        </div>
                      </div>

                      {/* Estimated yield revenue estimate */}
                      <div className="text-right min-w-[80px]">
                        <div className="text-[8.5px] font-black text-emerald-600 flex items-center gap-0.5 justify-end">
                          <ArrowUpRight className="w-3 h-3 animate-pulse" /> Doanh thu dự kiến
                        </div>
                        <div className="font-mono text-xs sm:text-sm font-extrabold text-emerald-600 tabular-nums">
                          {blog.conversionRevenue > 0 ? `${blog.conversionRevenue.toLocaleString()}đ` : '-'}
                        </div>
                        <div className="text-[7.5px] font-bold text-[var(--mh-text-3)]">
                          ROI: {blog.roi.toFixed(0)}%
                        </div>
                      </div>

                      {/* Expand action */}
                      <div className="text-[var(--mh-text-3)]">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 bg-[var(--mh-surface-2)] rounded-full p-0.5" />
                        ) : (
                          <ChevronDown className="w-5 h-5 hover:bg-[var(--mh-surface-2)] hover:text-[var(--mh-text)] rounded-full p-0.5 transition-all" />
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Collapsible Panel for details */}
                  {isExpanded && (
                    <div className="border-t border-[var(--mh-border)] bg-[var(--mh-surface-2)]/50 p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--mh-border)] pb-3">
                        <div className="space-y-0.5">
                          <h5 className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wider">Chi chiết các khoản chi phí thực tế ({blog.relatedCosts.length})</h5>
                          <p className="text-[9px] text-[var(--mh-text-3)]">Danh sách chứng từ chi chi tiết được đội ngũ kinh doanh nhập và báo cáo hiệu quả</p>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 text-[9px] font-bold text-[var(--mh-text-2)]">
                          <span className="bg-[var(--mh-surface)] border rounded-lg px-2 py-1">CPL trung bình: <strong className="text-blue-600 font-mono">{Math.round(blog.cpl).toLocaleString()}đ</strong></span>
                          <span className="bg-[var(--mh-surface)] border rounded-lg px-2 py-1">CAC trung bình: <strong className="text-indigo-600 font-mono">{Math.round(blog.cac).toLocaleString()}đ</strong></span>
                        </div>
                      </div>

                      {blog.relatedCosts.length === 0 ? (
                        <div className="text-center py-6 text-[11px] text-[var(--mh-text-3)] italic">
                          Chưa ghi nhận khoản chi cụ thể nào liên kết với ngân sách này.
                        </div>
                      ) : (
                        <DraggableTableContainer className="rounded-2xl border border-[var(--mh-border)] bg-[var(--mh-surface)]">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[var(--mh-surface-2)]/80 border-b border-[var(--mh-border)] text-[9.5px] font-black text-[var(--mh-text-2)] uppercase tracking-wider">
                                <th className="p-3 pl-4">Nội dung chi phí & ID</th>
                                <th className="p-3 text-right">Chi phí Chi ra</th>
                                <th className="p-3 text-center">Thời gian Báo cáo MKT</th>
                                <th className="p-3 text-center">Tổng Lead nhận</th>
                                <th className="p-3 text-center">Đã liên hệ</th>
                                <th className="p-3 text-center">Đã chuyển đổi</th>
                                <th className="p-3 text-right">Doanh thu dự kiến</th>
                                <th className="p-3 text-center">Chi tiết lý do</th>
                                <th className="p-3 pr-4 text-center">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {blog.relatedCosts.map((c: any) => (
                                <tr key={c.id} className="hover:bg-[var(--mh-surface-2)]/40 transition-colors">
                                  
                                  {/* Description */}
                                  <td className="p-3 pl-4">
                                    <div className="font-extrabold text-[var(--mh-text)] text-[11px] leading-snug">{c.description}</div>
                                    <div className="text-[7.5px] text-[var(--mh-text-3)] font-mono mt-0.5 flex items-center gap-1.5">
                                      <span>ID: {c.id}</span>
                                      <span>•</span>
                                      <span>Kênh: <span className="font-bold text-[var(--mh-text-2)] uppercase">{c.channel || 'Khác'}</span></span>
                                    </div>
                                  </td>
                                  
                                  {/* Amount */}
                                  <td className="p-3 text-right font-mono font-black text-rose-600 tabular-nums">
                                    {c.amount?.toLocaleString()}đ
                                  </td>

                                  {/* Report range */}
                                  <td className="p-3 text-center font-mono text-[10px] text-[var(--mh-text-2)] tabular-nums">
                                    {c.mktReport?.startDate || c.mktReport?.endDate ? (
                                      <div className="inline-flex items-center gap-1 bg-[var(--mh-surface-2)]/50 rounded px-1.5 py-0.5 text-[9px] font-bold border">
                                        {c.mktReport.startDate ? c.mktReport.startDate.split('-').reverse().join('/') : '?'} - {c.mktReport.endDate ? c.mktReport.endDate.split('-').reverse().join('/') : '?'}
                                      </div>
                                    ) : (
                                      <span className="text-[var(--mh-text-3)] font-semibold">-</span>
                                    )}
                                  </td>

                                  {/* Total leads */}
                                  <td className="p-3 text-center font-mono font-bold text-blue-700 tabular-nums">
                                    {c.mktReport?.totalLeads !== undefined ? c.mktReport.totalLeads.toLocaleString() : '-'}
                                  </td>

                                  {/* Contacted leads */}
                                  <td className="p-3 text-center font-mono text-[var(--mh-text)] tabular-nums">
                                    {c.mktReport?.contactedLeads !== undefined ? c.mktReport.contactedLeads.toLocaleString() : '-'}
                                  </td>

                                  {/* Converted Leads */}
                                  <td className="p-3 text-center">
                                    {c.mktReport?.convertedLeads !== undefined ? (
                                      <div className="flex flex-col items-center">
                                        <span className="font-mono font-black text-emerald-600 tabular-nums">
                                          {c.mktReport.convertedLeads}
                                        </span>
                                        {c.mktReport.totalLeads > 0 && (
                                          <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-1 rounded-sm">
                                            {((c.mktReport.convertedLeads / c.mktReport.totalLeads) * 100).toFixed(0)}%
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[var(--mh-text-3)] font-semibold">-</span>
                                    )}
                                  </td>

                                  {/* Predicted Revenue */}
                                  <td className="p-3 text-right font-mono font-black text-emerald-600 tabular-nums">
                                    {c.mktReport?.conversionRevenue ? (
                                      <span>{c.mktReport.conversionRevenue.toLocaleString()}đ</span>
                                    ) : (
                                      <span className="text-[var(--mh-text-3)] font-normal">-</span>
                                    )}
                                  </td>

                                  {/* Unconverted Reason */}
                                  <td className="p-3 text-[var(--mh-text-2)] text-[10px] max-w-[150px] truncate" title={c.mktReport?.unconvertedReason}>
                                    {c.mktReport?.unconvertedReason || '-'}
                                  </td>

                                  {/* Quick Actions */}
                                  <td className="p-3 pr-4 text-center">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-7 w-7 text-[var(--mh-text-3)] hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                      onClick={() => onOpenMktReportDialog(c)}
                                      title="Cập nhật báo cáo Hiệu quả MKT"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </td>

                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </DraggableTableContainer>
                      )}

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
