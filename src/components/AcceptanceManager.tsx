import { lockBlock, pastBlock, useLocks } from '../vnext/locks';
import { activeLock } from '../../lib/vnext/platform';
import { lazyRetry } from '../lib/chunkReload';
import { ntImplementerRequired, recordNeedsImplementer, NT_REQUIRED_MSG } from '../../lib/vnext/ntCutoff';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { loadXlsx } from '../lib/loadXlsx';
const AdLinksModal = lazyRetry(() => import('../vnext/AdLinksModal'));
const NtInvoiceModal = lazyRetry(() => import('../vnext/InvoiceViews').then((m) => ({ default: m.NtInvoiceModal })));
const NtUploadModal = lazyRetry(() => import('../vnext/NtReportPage').then((m) => ({ default: m.NtUploadModal })));
import { 
  Plus, 
  Trash2, 
  Download, X, 
  Upload, 
  Search, 
  ShieldCheck, 
  FileSpreadsheet, 
  Calculator,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoveHorizontal,
  Smartphone,
  CreditCard,
  Newspaper,
  User,
  CheckCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp, 
  writeBatch,
  getDoc as getDocFs,
  onSnapshot,
  query as fsQuery,
  where as fsWhere
} from 'firebase/firestore';
import { toast } from 'sonner';
import { assignImplementer, assignManualImplementer, ntAttributionOps, ntDuplicateOf, ntManualOps, ntDeleteOps, ntKeyOf, releaseOrphanNtKey } from '../vnext/ntAssign';
import { NT_MANUAL_FEATURE, ntManualAllowed, isManualImplementer, implementerLabel, manualAttributionPatch } from '../../lib/vnext/ntManual';
import { vnCan } from '../vnext/ctx';
import { ManualAssigneeDialog } from './acceptance/ManualAssigneeDialog';
import { normalizeMonth } from '../../lib/vnext/ntReport';
import { ntKey as ntKeyStr } from '../../lib/vnext/onboarding';
import { prevMonth, isSupplement, suppIn, suppMonths, ntDeniedMsg, suppStatus, suppBadge, suppCounts, suppDecisionPatch, ntCountsInTotals, SUPP_STATUS_LABEL, suppMissingFiles, suppMissingBadge } from '../../lib/vnext/ntSupplement';
import { format } from 'date-fns';

import { AcceptanceTableHeader } from './acceptance/AcceptanceTableHeader';
import { AcceptanceDraftRow } from './acceptance/AcceptanceDraftRow';
import { AcceptanceRow } from './acceptance/AcceptanceRow';
import { AcceptanceFooter } from './acceptance/AcceptanceFooter';
import { AcceptanceDialogs } from './acceptance/AcceptanceDialogs';
import { AcceptanceSearchableSelect } from './acceptance/AcceptanceSearchableSelect';
import { 
  parseCurrencyFormula, 
  getRowComputed, 
  getSortValue, 
  buildCostBreakdownsOfRecord,
  resolveBlockForTeam,
  formatAcceptanceMonth,
  storeAcceptanceMonth,
  acceptanceMonthLabel,
  isAcceptanceMonthMatch,
  resolveAcceptanceProject,
  matchesProjectFilter,
  preVatOf,
  ntTotals,
} from './acceptance/acceptanceUtils';
import { exportFileName, blockCodeOf, teamCodeOf } from '../../lib/vnext/exportName';
import { getPeriodOf } from '../../lib/vnext/period';
import { acceptanceChoicesFor, ntUsesBudgetProjects, projectAllowedForAcceptance } from '../../lib/vnext/ntBudgetProjects';

import { showNtImageUpload, showNtInvoiceUpload } from '../lib/ntUploadGate';
export const AcceptanceManager = React.memo(({ 
  isAdmin, isSuperAdmin, isMod, isAccountant, user, userProfile,
  isGDKhoi, isTroLyKhoi, isAssistant, myBlock, currentActiveBlock,
  canCreate: propCanCreate, canEdit: propCanEdit, canDelete: propCanDelete,
  teams = [], allUsers = [], projects = [], regions = [], acceptances: acceptancesRaw = [], teamMap = {}, projectMap = {}, 
  formatCurrency, getMarketingMonth, handleFirestoreError, formatCurrencyInput,
  uniqueTeams = [], blocks = [],
  ntCtx = null, canUploadImages = false, ntRequiredFrom = null, canApproveSupplement: propCanApproveSupp
}: any) => {
  // Duyệt «Nghiệm thu bổ sung»: mặc định Admin / Super Admin (khớp luật Firestore isAdmin()).
  // Quyết định 24/10: CHỈ Super Admin duyệt / từ chối / đặt lại bản bổ sung (kể cả sau khoá ngày 27).
  const canApproveSupp = Boolean(isSuperAdmin && propCanApproveSupp !== false);
  const vnLocksNow = useLocks(db);
  /** Ô «Bổ sung cho T{M-1}» chỉ hiện khi kỳ NT của tháng M đang MỞ. */
  const suppOpenFor = (m: any) => { const mm = normalizeMonth(m); return !!mm && !activeLock(vnLocksNow, 'nt', mm); };
  const [suppView, setSuppView] = useState(false);
  /** Kỳ NT đang MỞ (không phải Super Admin): ưu tiên tháng hiện tại (giờ VN) — vd 25/10 → kỳ 2026-10. */
  const openNtKy = useMemo(() => {
    const d = new Date(Date.now() + 7 * 3600e3); const idx = d.getUTCFullYear() * 12 + d.getUTCMonth();
    const ym = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    for (const k of [0, -1, 1, -2]) { const m = ym(idx + k); if (!lockBlock('x', 'nt', m, vnLocksNow)) return m; }
    return '';
  }, [vnLocksNow]);
  const [suppStatusFilter, setSuppStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [suppHistFor, setSuppHistFor] = useState<string | null>(null);
  const [suppBusy, setSuppBusy] = useState<string | null>(null);
  // v-next: Admin/Mod tải ảnh Nghiệm thu ngay trên từng dòng của bảng chính.
  const [ntUploadFor, setNtUploadFor] = useState<any>(null);
  const openNtUpload = useCallback((item: any) => setNtUploadFor(item), []);
  const showNtUpload = showNtImageUpload(ntCtx, canUploadImages);
  const [ntInvoiceFor, setNtInvoiceFor] = useState<any>(null);
  const [adLinksFor, setAdLinksFor] = useState<any>(null);
  const showNtInvoice = showNtInvoiceUpload(ntCtx);

  // Detect whether current user is GĐK (Giám đốc Khối) or Trợ lý Khối
  const isGDKorAssistant = Boolean(
    isGDKhoi || 
    isTroLyKhoi || 
    (isAssistant && (myBlock || userProfile?.assignedBlock)) ||
    (!isAdmin && !isSuperAdmin && !isMod && (myBlock || userProfile?.assignedBlock || userProfile?.role === 'gd_khoi' || userProfile?.role === 'tro_ly_khoi'))
  );

  // Active target block (if scoped to a block)
  const activeTargetBlock = currentActiveBlock || myBlock || (userProfile?.assignedBlock ? blocks.find((b: any) => b.id === userProfile.assignedBlock || b.blockCode === userProfile.assignedBlock) : null);

  // Requirement:
  // - "Trong mục Nghiệm thu MKT , chỉ Admin và Mod có quyền Tạo mới, và chỉnh sửa bản ghi trong phần nghiệm thu MKT"
  // - "GĐK và trợ lý chỉ có quyền xem các bản ghi Nghiệm thu MKT của các phòng kinh doanh trực thuộc khối mình . ( Không có quyền tạo mới và chỉnh sửa )"
  const canCreate = Boolean(
    propCanCreate !== undefined 
      ? propCanCreate 
      : ((isAdmin || isSuperAdmin || isMod) && !isGDKorAssistant)
  );

  const canEdit = Boolean(
    propCanEdit !== undefined 
      ? propCanEdit 
      : ((isAdmin || isSuperAdmin || isMod) && !isGDKorAssistant)
  );

  // «Khác – tự nhập» Người phụ trách: chỉ Tháng 10/2026, người sửa được + quyền vn.nt_records.manual_assignee (Phân quyền).
  const canManualAssignee = canEdit && (!ntCtx || vnCan(ntCtx, NT_MANUAL_FEATURE));

  const canDelete = Boolean(
    propCanDelete !== undefined 
      ? propCanDelete 
      : ((isAdmin || isSuperAdmin || isMod) && !isGDKorAssistant)
  );


  const [acceptanceSearch, setAcceptanceSearch] = useState('');
  const [debouncedAcceptanceSearch, setDebouncedAcceptanceSearch] = useState('');
  const [acceptanceMonthFilter, setAcceptanceMonthFilter] = useState('all');
  const [acceptanceProjectFilter, setAcceptanceProjectFilter] = useState('all');
  const [acceptanceTeamFilter, setAcceptanceTeamFilter] = useState('all');
  const [acceptanceBlockFilter, setAcceptanceBlockFilter] = useState('all');
  const [acceptanceRegionFilter, setAcceptanceRegionFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<any>({ key: null, direction: null });

  // Multi-select state
  const [selectedAcceptanceIds, setSelectedAcceptanceIds] = useState<string[]>([]);

  // Helper to determine current month format (Rule: only Month 8 is split into 2 kì; all other months are MM.YYYY e.g. 09.2026)
  const getCurrentDefaultMonth = useCallback(() => {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    if (curMonth === 8) {
      return now.getDate() > 15 ? 'Kì 2 - Tháng 8' : 'Kì 1 - Tháng 8';
    }
    const curM = String(curMonth).padStart(2, '0');
    const curY = now.getFullYear();
    return `${curM}.${curY}`;
  }, []);

  // Helper to create a fresh draft row
  const createNewDraftRow = (month?: string) => {
    const curDefault = getCurrentDefaultMonth();
    const targetMonth = (month && month !== 'all') 
      ? formatAcceptanceMonth(month) 
      : (acceptanceMonthFilter !== 'all' ? formatAcceptanceMonth(acceptanceMonthFilter) : curDefault);

    return {
      id: `draft-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      month: targetMonth,
      teamId: '',
      teamCode: '',
      teamName: '',
      gdkdName: '',
      implementerName: '',
      projectId: '',
      projectName: '',
      projectCode: '',
      digitalFb: '',
      digitalZalo: '',
      digitalTiktok: '',
      digitalKhac: '',
      visaFb: '',
      visaZalo: '',
      visaTiktok: '',
      visaDangTin: '',
      dangTinCtyChuaVat: '',
      caNhanFb: '',
      caNhanDangTin: '',
      caNhanZalo: '',
      caNhanGoogle: '',
      caNhanTiktok: '',
      caNhanNativeAds: '',
      caNhanUCall: '',
      hoaDonTien: '',
      hoaDonLines: [],
      caNhanNapTienQuaCty: '',
      caNhanNopTien: '',
      status: 'Đã nghiệm thu',
      notes: ''
    };
  };

  // Draft rows for inline addition - only initialized if user has canCreate permission
  const [draftRows, setDraftRows] = useState<any[]>(() => {
    return canCreate ? [createNewDraftRow()] : [];
  });

  // Always keep at least 1 draft row ready in the table IF user can create
  useEffect(() => {
    if (!canCreate) {
      if (draftRows.length > 0) setDraftRows([]);
      return;
    }
    if (draftRows.length === 0) {
      setDraftRows([createNewDraftRow(acceptanceMonthFilter)]);
    }
  }, [canCreate, draftRows.length, acceptanceMonthFilter]);

  // Editing row state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingRowState, setEditingRowState] = useState<any | null>(null);
  const nsPeriods = useMemo(() => {
    const s = new Set<string>();
    const add = (m: unknown) => { const p = normalizeMonth(m); if (/^\d{4}-\d{2}$/.test(p) && p >= '2026-11') s.add(p); };
    draftRows.forEach((d) => add(d.month));
    add(editingRowState?.month);
    add(acceptanceMonthFilter);
    if (!s.size) add(getPeriodOf());
    return [...s].slice(0, 10);
  }, [draftRows, editingRowState?.month, acceptanceMonthFilter]);
  const [nsLines, setNsLines] = useState<any[]>([]);
  const [nsSupport, setNsSupport] = useState<Record<string, any>>({});
  const [nsReady, setNsReady] = useState(false);
  const nsKey = nsPeriods.join(',');
  useEffect(() => {
    if (!(canCreate || canEdit) || !nsPeriods.length) { setNsLines([]); setNsSupport({}); setNsReady(true); return; }
    setNsReady(false);
    let linesReady = false;
    let supReady = false;
    const done = () => { if (linesReady && supReady) setNsReady(true); };
    const qLines = fsQuery(collection(db, 'ns_lines'), fsWhere('period', 'in', nsPeriods.slice(0, 10)));
    const qSup = fsQuery(collection(db, 'nsSupport'), fsWhere('period', 'in', nsPeriods.slice(0, 10)));
    const u1 = onSnapshot(qLines, (s) => {
      setNsLines(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      linesReady = true; done();
    }, () => { setNsLines([]); linesReady = true; done(); });
    const u2 = onSnapshot(qSup, (s) => {
      const o: Record<string, any> = {};
      s.docs.forEach((d) => { o[d.id] = { id: d.id, ...d.data() }; });
      setNsSupport(o);
      supReady = true; done();
    }, () => { setNsSupport({}); supReady = true; done(); });
    return () => { u1(); u2(); };
  }, [canCreate, canEdit, nsKey]);
  const unregisteredProjectReason = useCallback((row: any) => {
    if (!ntUsesBudgetProjects(row?.month)) return '';
    if (!nsReady) return 'Đang tải đăng ký ngân sách của kỳ này.';
    const choices = acceptanceChoicesFor(row, nsLines, nsSupport, allUsers);
    if (!projectAllowedForAcceptance(choices, row?.projectId)) return 'Dự án không nằm trong đăng ký NS của người phụ trách tại Phòng và kỳ này.';
    return '';
  }, [ntCtx, nsReady, nsLines, nsSupport, allUsers]);
  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'table'>('cards');
  // Design system: mobile always cards (no horizontal NT table).
  React.useEffect(() => {
    const fn = () => { if (window.innerWidth < 768) setMobileViewMode('cards'); };
    fn(); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn);
  }, []); // mh-force-acc-cards

  const [mobileSheetItem, setMobileSheetItem] = useState<any | null>(null);
  const [sheetManualOpen, setSheetManualOpen] = useState(false);

  // Dialog states
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [activeCalculatorField, setActiveCalculatorField] = useState<string | null>(null);
  const [calculatorFieldNameVN, setCalculatorFieldNameVN] = useState('');
  const [calculatorInput, setCalculatorInput] = useState('');
  const [calculatorUpdateFn, setCalculatorUpdateFn] = useState<((val: string) => void) | null>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDeleteId, setItemToDeleteId] = useState<string | null>(null);

  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyTargetRecord, setHistoryTargetRecord] = useState<any>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedAcceptanceSearch(acceptanceSearch);
    }, 200);
    return () => clearTimeout(handler);
  }, [acceptanceSearch]);

  // Dữ liệu lưu month='YYYY-MM' (+kyPart); giao diện dùng nhãn quen thuộc (09.2026 / Kì 1 - Tháng 8).
  const acceptances = useMemo(() => (acceptancesRaw || []).map((a: any) => ({ ...a, month: acceptanceMonthLabel(a) })), [acceptancesRaw]);
  const acceptancesRef = useRef(acceptances);
  acceptancesRef.current = acceptances;

  // 🚀 Fast O(1) Lookups for Teams, Projects & Blocks to eliminate N^2 render/filter lag
  const teamLookup = useMemo(() => {
    const byId = new Map<string, any>();
    const byCode = new Map<string, any>();
    const byName = new Map<string, any>();

    (teams || []).forEach((t: any) => {
      if (t.id) byId.set(String(t.id), t);
      if (t.teamCode) byCode.set(String(t.teamCode).toLowerCase(), t);
      if (t.name) byName.set(String(t.name).toLowerCase(), t);
    });

    const findTeam = (ref: string) => {
      if (!ref) return null;
      const str = String(ref);
      const lower = str.toLowerCase();
      return byId.get(str) || byCode.get(lower) || byName.get(lower) || null;
    };

    return { findTeam, byId, byCode, byName };
  }, [teams]);

  const projectLookup = useMemo(() => {
    const byId = new Map<string, any>();
    const byCode = new Map<string, any>();
    const byName = new Map<string, any>();

    (projects || []).forEach((p: any) => {
      if (p.id) byId.set(String(p.id), p);
            if (p.name) byName.set(String(p.name).toLowerCase(), p);
    });

    const findProject = (ref: string) => {
      if (!ref) return null;
      const str = String(ref);
      const lower = str.toLowerCase();
      return byId.get(str) || byName.get(lower) || null;
    };

    return { findProject, byId, byCode, byName };
  }, [projects]);

  // Unique months list for dropdown selector & filters
  // Rule: Only Month 8 has 2 periods: "Kì 1 - Tháng 8" & "Kì 2 - Tháng 8".
  // All other months are displayed normally as MM.YYYY (e.g. 09.2026).
  // Sắp xếp các tháng theo thứ tự thời gian giảm dần, ưu tiên hiển thị kỳ tháng gần nhất (hiện tại) lên đầu.
  const uniqueMonths = useMemo(() => {
    const set = new Set<string>();
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;

    // 1. Current month / period (kỳ gần nhất hiện tại, e.g. 10.2026 hoặc Kì 2 - Tháng 8)
    const curStr = curM === 8 
      ? (now.getDate() > 15 ? 'Kì 2 - Tháng 8' : 'Kì 1 - Tháng 8') 
      : `${String(curM).padStart(2, '0')}.${curY}`;
    set.add(curStr);

    // 2. Next month (để tạo bản ghi trước nếu cần)
    const nextD = new Date(curY, curM, 1);
    const nextM = nextD.getMonth() + 1;
    const nextY = nextD.getFullYear();
    if (nextM === 8) {
      set.add('Kì 1 - Tháng 8');
      set.add('Kì 2 - Tháng 8');
    } else {
      set.add(`${String(nextM).padStart(2, '0')}.${nextY}`);
    }

    // 3. Month 8 specific periods (nếu trong năm hiện tại hoặc đã qua tháng 8)
    set.add('Kì 2 - Tháng 8');
    set.add('Kì 1 - Tháng 8');

    // 4. Past months for current year in order (từ tháng hiện tại trở về tháng 1)
    for (let m = 12; m >= 1; m--) {
      if (m === 8) {
        set.add('Kì 2 - Tháng 8');
        set.add('Kì 1 - Tháng 8');
      } else {
        set.add(`${String(m).padStart(2, '0')}.${curY}`);
      }
    }

    // 5. Existing months in Firestore acceptances (formatted with formatAcceptanceMonth)
    (acceptances || []).forEach((a: any) => { 
      if (a.month && typeof a.month === 'string' && a.month.trim()) {
        const formatted = formatAcceptanceMonth(a.month.trim());
        if (formatted) set.add(formatted);
      }
    });

    // Helper to calculate exact chronological score for any month/period
    const getMonthChronologicalScore = (str: string): number => {
      if (!str) return 0;
      const s = str.trim().toLowerCase();

      // Month 8 periods
      if (/k[iìyỳ]\s*2\s*[-–]\s*th[aá]ng\s*8/i.test(s)) {
        const ym = s.match(/\d{4}/);
        const y = ym ? parseInt(ym[0], 10) : curY;
        return y * 1000 + 8 * 10 + 2;
      }
      if (/k[iìyỳ]\s*1\s*[-–]\s*th[aá]ng\s*8/i.test(s)) {
        const ym = s.match(/\d{4}/);
        const y = ym ? parseInt(ym[0], 10) : curY;
        return y * 1000 + 8 * 10 + 1;
      }

      // Format MM.YYYY or MM/YYYY or MM-YYYY
      const dotMatch = s.match(/^(\d{1,2})[-./](\d{4})$/);
      if (dotMatch) {
        const m = parseInt(dotMatch[1], 10);
        const y = parseInt(dotMatch[2], 10);
        return y * 1000 + m * 10 + 2;
      }

      // Format YYYY-MM or YYYY.MM
      const ymMatch = s.match(/^(\d{4})[-./](\d{1,2})$/);
      if (ymMatch) {
        const y = parseInt(ymMatch[1], 10);
        const m = parseInt(ymMatch[2], 10);
        return y * 1000 + m * 10 + 2;
      }

      // Format "Tháng MM.YYYY"
      const tmMatch = s.match(/th[aá]ng\s*(\d{1,2})(?:[-./ ](\d{4}))?/i);
      if (tmMatch) {
        const m = parseInt(tmMatch[1], 10);
        const y = tmMatch[2] ? parseInt(tmMatch[2], 10) : curY;
        return y * 1000 + m * 10 + 2;
      }

      return 0;
    };

    // Sắp xếp các tháng theo thứ tự thời gian giảm dần, ưu tiên kỳ gần nhất (curStr) lên đầu
    return Array.from(set).sort((a, b) => {
      if (a === curStr && b !== curStr) return -1;
      if (b === curStr && a !== curStr) return 1;

      const scoreA = getMonthChronologicalScore(a);
      const scoreB = getMonthChronologicalScore(b);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return b.localeCompare(a);
    });
  }, [acceptances]);

  // Base searchable items for dropdown selectors
  const baseTeamItems = useMemo(() => {
    let availableTeams = teams || [];
    if (isGDKorAssistant && activeTargetBlock) {
      const blockFiltered = availableTeams.filter((t: any) => {
        if (t.blockId && (t.blockId === activeTargetBlock.id || t.blockId === activeTargetBlock.blockCode)) return true;
        if (t.blockCode && (t.blockCode === activeTargetBlock.id || t.blockCode === activeTargetBlock.blockCode)) return true;
        return false;
      });
      if (blockFiltered.length > 0) {
        availableTeams = blockFiltered;
      }
    }
    return availableTeams.map((t: any) => {
      const code = t.teamCode || '';
      const name = t.name || '';
      const label = code ? `${code} - ${name}` : name;
      return {
        value: t.id,
        label,
        code,
        subLabel: t.blockCode ? `Khối: ${t.blockCode}` : (t.blockName ? `Khối: ${t.blockName}` : ''),
        searchString: `${code} ${name} ${t.blockCode || ''} ${t.blockName || ''} ${t.id}`.toLowerCase(),
        rawItem: t
      };
    });
  }, [teams, isGDKorAssistant, activeTargetBlock]);

  const baseProjectItems = useMemo(() => {
    return (projects || []).map((p: any) => {
      const code = p.projectCode || '';
      const name = p.name || '';
      const label = code ? `[${code}] ${name}` : name;
      return {
        value: p.id,
        label,
        code,
        subLabel: p.region ? `Khu vực: ${p.region}` : (p.type ? `Loại: ${p.type}` : ''),
        searchString: `${code} ${name} ${p.region || ''} ${p.type || ''} ${p.id}`.toLowerCase(),
        rawItem: p
      };
    });
  }, [projects]);

  const teamIdSet = useMemo(() => new Set((teams || []).map((t: any) => t.id)), [teams]);
  const projectIdSet = useMemo(() => new Set((projects || []).map((p: any) => p.id)), [projects]);

  // Searchable items for team filter
  const filterTeamItems = useMemo(() => {
    const allOpt = { value: 'all', label: 'Tất cả Team', searchString: 'tất cả team all' };
    return [allOpt, ...baseTeamItems];
  }, [baseTeamItems]);

  // Searchable items for project filter
  const filterProjectItems = useMemo(() => {
    const allOpt = { value: 'all', label: 'Tất cả Dự án', searchString: 'tất cả dự án all' };
    return [allOpt, ...baseProjectItems];
  }, [baseProjectItems]);

  // Filtered acceptances (Optimized with O(1) lookups)
  const filteredAcceptances = useMemo(() => {
    const query = debouncedAcceptanceSearch ? debouncedAcceptanceSearch.toLowerCase().trim() : '';
    const selectedTeam = acceptanceTeamFilter !== 'all' ? teamLookup.byId.get(acceptanceTeamFilter) : null;

    // Pre-calculate block teams for GĐK and Trợ lý ONCE outside the loop!
    let blockTeamIds: Set<string> | null = null;
    let blockTeamCodes: Set<string> | null = null;
    let blockTeamNames: Set<string> | null = null;

    if (isGDKorAssistant && activeTargetBlock) {
      const blockTeamsList = (teams || []).filter((t: any) => {
        if (t.blockId && (t.blockId === activeTargetBlock.id || t.blockId === activeTargetBlock.blockCode)) return true;
        if (t.blockCode && (t.blockCode === activeTargetBlock.id || t.blockCode === activeTargetBlock.blockCode)) return true;
        return false;
      });
      const sourceBlockTeams = blockTeamsList.length > 0 ? blockTeamsList : (teams || []);
      blockTeamIds = new Set(sourceBlockTeams.map((t: any) => t.id));
      blockTeamCodes = new Set(sourceBlockTeams.map((t: any) => (t.teamCode || '').toUpperCase().trim()));
      blockTeamNames = new Set(sourceBlockTeams.map((t: any) => (t.name || '').toLowerCase().trim()));
    }

    return (acceptances || []).filter((a: any) => {
      // Màn «Nghiệm thu bổ sung»: chỉ bản bổ sung (+ lọc trạng thái).
      if (suppView) {
        if (!isSupplement(a)) return false;
        if (suppStatusFilter !== 'all' && suppStatus(a) !== suppStatusFilter) return false;
      } else if (isSupplement(a) && !ntCountsInTotals(a)) {
        // Bảng chính: bản bổ sung chờ duyệt / từ chối / yêu cầu sửa chỉ hiện ở mục «Nghiệm thu bổ sung».
        return false;
      }
      // Month match
      if (acceptanceMonthFilter !== 'all') {
        const m = String((suppView ? suppIn(a) : a.month) || '').trim();
        const f = acceptanceMonthFilter.trim();
        if (m !== f && !isAcceptanceMonthMatch(m, f)) {
          return false;
        }
      }

      // Fast team resolve
      const tm = teamLookup.findTeam(a.teamId) || teamLookup.findTeam(a.teamCode) || teamLookup.findTeam(a.teamName);

      // Enforce block-level scoping for GĐK and Trợ lý
      if (isGDKorAssistant && activeTargetBlock && blockTeamIds && blockTeamCodes && blockTeamNames) {
        const aTeamCode = (a.teamCode || '').toUpperCase().trim();
        const aTeamName = (a.teamName || '').toLowerCase().trim();
        const blkInfo = resolveBlockForTeam(tm || a, blocks, teams, teamLookup.findTeam);

        const belongsToBlock = 
          (blkInfo.blockId && (blkInfo.blockId === activeTargetBlock.id || blkInfo.blockId === activeTargetBlock.blockCode)) ||
          (blkInfo.blockCode && (blkInfo.blockCode === activeTargetBlock.id || blkInfo.blockCode === activeTargetBlock.blockCode)) ||
          (blkInfo.block?.id === activeTargetBlock.id) ||
          (a.blockId && (a.blockId === activeTargetBlock.id || a.blockId === activeTargetBlock.blockCode)) ||
          (a.blockCode && (a.blockCode === activeTargetBlock.id || a.blockCode === activeTargetBlock.blockCode)) ||
          (a.teamId && blockTeamIds.has(a.teamId)) ||
          (aTeamCode && blockTeamCodes.has(aTeamCode)) ||
          (aTeamName && blockTeamNames.has(aTeamName)) ||
          (tm && (
            tm.blockId === activeTargetBlock.id || 
            tm.blockCode === activeTargetBlock.blockCode ||
            blockTeamIds.has(tm.id)
          ));

        if (!belongsToBlock) return false;
      }

      // Block match
      if (acceptanceBlockFilter !== 'all') {
        const blkInfo = resolveBlockForTeam(tm || a, blocks, teams, teamLookup.findTeam);
        const matchesBlock = 
          blkInfo.blockId === acceptanceBlockFilter ||
          blkInfo.blockCode === acceptanceBlockFilter ||
          blkInfo.block?.id === acceptanceBlockFilter ||
          a.blockId === acceptanceBlockFilter || 
          a.blockCode === acceptanceBlockFilter ||
          tm?.blockId === acceptanceBlockFilter ||
          tm?.blockCode === acceptanceBlockFilter;
        if (!matchesBlock) return false;
      }

      // Team match
      if (acceptanceTeamFilter !== 'all') {
        const matchesTeam = a.teamId === acceptanceTeamFilter || 
          a.teamCode === acceptanceTeamFilter || 
          a.teamName === acceptanceTeamFilter ||
          (selectedTeam && (
            a.teamId === selectedTeam.id ||
            a.teamCode === selectedTeam.teamCode ||
            a.teamName === selectedTeam.name ||
            tm?.id === selectedTeam.id
          ));
        if (!matchesTeam) return false;
      }

      // Project match
      if (acceptanceProjectFilter !== 'all') {
        if (!matchesProjectFilter(a, acceptanceProjectFilter, projects)) return false;
      }

      // Search term
      if (query) {
        const blkInfo = resolveBlockForTeam(tm || a, blocks, teams, teamLookup.findTeam);
        const matchesSearch = (a.projectName || '').toLowerCase().includes(query) ||
          (a.teamName || '').toLowerCase().includes(query) ||
          (a.teamCode || '').toLowerCase().includes(query) ||
          (a.gdkdName || '').toLowerCase().includes(query) ||
          (a.implementerName || '').toLowerCase().includes(query) ||
          (a.month || '').toLowerCase().includes(query) ||
          (a.notes || '').toLowerCase().includes(query) ||
          (blkInfo.blockName || '').toLowerCase().includes(query) ||
          (blkInfo.blockCode || '').toLowerCase().includes(query) ||
          (tm?.name || '').toLowerCase().includes(query) ||
          (tm?.teamCode || '').toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      return true;
    }).sort((a: any, b: any) => {
      if (!sortConfig.key) return 0;
      const valA = getSortValue(a, sortConfig.key, teams, blocks);
      const valB = getSortValue(b, sortConfig.key, teams, blocks);
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }
      return sortConfig.direction === 'asc' 
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [suppView, suppStatusFilter, acceptances, acceptanceMonthFilter, acceptanceBlockFilter, acceptanceTeamFilter, acceptanceProjectFilter, debouncedAcceptanceSearch, sortConfig, teams, blocks, teamLookup, projectLookup, isGDKorAssistant, activeTargetBlock]);

  const displayedRecords = filteredAcceptances;

  // 📄 Pagination state for ultra-fast rendering of large records sets
  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [acceptanceMonthFilter, acceptanceBlockFilter, acceptanceTeamFilter, acceptanceProjectFilter, debouncedAcceptanceSearch]);

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredAcceptances.length / (pageSize as number)));

  const paginatedRecords = useMemo(() => {
    if (pageSize === 'all') return filteredAcceptances;
    const start = (currentPage - 1) * (pageSize as number);
    return filteredAcceptances.slice(start, start + (pageSize as number));
  }, [filteredAcceptances, currentPage, pageSize]);

  // Sorting handler
  const handleSort = useCallback((key: string) => {
    setSortConfig((prev: any) => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return { key: null, direction: null };
      }
      return { key, direction: 'asc' };
    });
  }, []);

  // Add empty draft row
  const handleAddDraftRow = () => {
    if (!canCreate) {
      toast.error('Chỉ Quản trị viên (Admin) và Điều phối (Mod) mới có quyền tạo mới bản ghi Nghiệm thu MKT!');
      return;
    }
    setDraftRows((prev) => [createNewDraftRow(acceptanceMonthFilter), ...prev]);
  };

  const handleUpdateDraftField = (index: number, field: string, value: any) => {
    setDraftRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleUpdateDraftFields = (index: number, fields: Record<string, any>) => {
    setDraftRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...fields };
      return copy;
    });
  };

  const handleRemoveDraft = (id: string) => {
    setDraftRows((prev) => {
      const remaining = prev.filter((d) => d.id !== id);
      return remaining.length > 0 ? remaining : (canCreate ? [createNewDraftRow(acceptanceMonthFilter)] : []);
    });
  };

  // Save Draft to Firestore
  const handleSaveDraft = useCallback(async (draftRow: any) => {
    if (!canCreate) {
      toast.error('Chỉ Quản trị viên (Admin) và Điều phối (Mod) mới có quyền tạo mới bản ghi Nghiệm thu MKT!');
      return;
    }
    if (!draftRow.teamId && !draftRow.teamCode && !draftRow.teamName) {
      toast.error('Vui lòng chọn Team cho dòng nghiệm thu!');
      return;
    }
    if (!draftRow.projectId && !draftRow.projectName && !draftRow.projectCode) {
      toast.error('Vui lòng chọn Dự án cho dòng nghiệm thu!');
      return;
    }
    const scopeErr = unregisteredProjectReason(draftRow);
    if (scopeErr) { toast.error(scopeErr); return; }

    const comp = getRowComputed(draftRow);
    const tm = (teamLookup.findTeam 
      ? (teamLookup.findTeam(draftRow.teamId) || teamLookup.findTeam(draftRow.teamCode) || teamLookup.findTeam(draftRow.teamName))
      : null) || (teams || []).find((t: any) => 
        t.id === draftRow.teamId || 
        t.teamCode === draftRow.teamCode || 
        t.name === draftRow.teamName ||
        t.id === draftRow.teamCode
      );
    const pr = resolveAcceptanceProject(draftRow, projects);

    try {
      const resolvedTeamName = tm?.name || (draftRow.teamName && !draftRow.teamName.startsWith('draft-') ? draftRow.teamName : tm?.teamCode || '');
      const resolvedTeamCode = tm?.teamCode || (draftRow.teamCode && !draftRow.teamCode.startsWith('draft-') ? draftRow.teamCode : tm?.name || '');
      const resolvedProjectName = pr?.name || (draftRow.projectName && !draftRow.projectName.startsWith('draft-') ? draftRow.projectName : pr?.projectCode || '');
      const resolvedProjectCode = pr?.projectCode || (draftRow.projectCode && !draftRow.projectCode.startsWith('draft-') ? draftRow.projectCode : '');
      const resolvedBlock = resolveBlockForTeam(tm || draftRow, blocks, teams, teamLookup.findTeam);

      const payload: any = {
        ...storeAcceptanceMonth(formatAcceptanceMonth(draftRow.month) || getCurrentDefaultMonth()),
        teamId: tm?.id || draftRow.teamId || '',
        teamName: resolvedTeamName,
        teamCode: resolvedTeamCode,
        blockId: resolvedBlock.blockId || tm?.blockId || draftRow.blockId || '',
        blockCode: resolvedBlock.blockCode || tm?.blockCode || draftRow.blockCode || '',
        blockName: resolvedBlock.blockName || tm?.blockName || draftRow.blockName || '',
        gdkdName: draftRow.gdkdName || tm?.name || '',
        implementerName: draftRow.implementerName || '',
        implementerUid: draftRow.implementerManual ? '' : (draftRow.implementerUid || ''),
        ntMonth: draftRow.implementerUid && !draftRow.implementerManual ? (normalizeMonth(draftRow.month) || '') : '',
        ntTeamId: tm?.id || draftRow.teamId || '',
        ntBlockId: resolvedBlock.blockId || tm?.blockId || '',
        projectId: pr?.id || draftRow.projectId || '',
        projectName: resolvedProjectName,
        projectCode: resolvedProjectCode,

        // Group 1: DIGITAL CHẠY (Chưa VAT)
        digitalFb: comp.dFb,
        digitalZalo: comp.dZalo,
        digitalTiktok: comp.dTiktok,
        digitalKhac: comp.dKhac,
        digitalTotalChuaVat: comp.dTotalChuaVat,
        digitalTotalSauVat: comp.dTotalSauVat, // Cột K

        // Group 2: THẺ VISA CÔNG TY (Chưa VAT)
        visaFb: comp.vFb,
        visaZalo: comp.vZalo,
        visaTiktok: comp.vTiktok,
        visaDangTin: comp.vDangTin,
        visaTotalChuaVat: comp.vTotalChuaVat,
        visaTotalSauVat: comp.vTotalSauVat, // Cột Q

        // Group 3: ĐĂNG TIN CÔNG TY
        dangTinCtyChuaVat: comp.dtCtyChuaVat,
        dangTinCtySauVat: comp.dtCtySauVat, // Cột S (8%)

        // Group 4: CÁ NHÂN CHẠY NGOÀI
        caNhanFb: comp.cnFb,
        caNhanDangTin: comp.cnDangTin,
        caNhanZalo: comp.cnZalo,
        caNhanGoogle: comp.cnGoogle,
        caNhanTiktok: comp.cnTiktok,
        caNhanNativeAds: comp.cnNativeAds,
        caNhanUCall: comp.cnUCall,
        caNhanTotal: comp.cnTotal, // Cột Y

        // Cột: Cá Nhân nạp tiền qua công ty
        caNhanNapTienQuaCty: comp.cnNapTienCty,

        // Group 5: TỔNG (Cột Z = K + Q + S + Y + Cá nhân nạp tiền qua công ty)
        grandTotal: comp.grandTotal,
        totalCost: comp.grandTotal,
        afterAcceptanceCost: comp.grandTotal,
        hoaDonTien: comp.hoaDonTien,
        hoaDonNo: comp.hoaDonNo,

        // Group 6
        caNhanNopTien: comp.cnNopTien,
        status: draftRow.status || 'Đã nghiệm thu',
        notes: draftRow.notes || '',

        // Legacy compatibility
        fbDigitalChuaVat: comp.dFb,
        facebookCost: comp.dTotalSauVat,
        digitalCost: comp.dTotalSauVat,
        fbVisaCostChuaVat: comp.vFb,
        visaCost: comp.vTotalSauVat,
        dangTinCongTyChuaVat: comp.dtCtyChuaVat,
        postingCost: comp.dtCtySauVat,
        caNhanCost: comp.cnFb,
        otherCost: comp.cnTotal,
        dangTinCaNhanCost: comp.cnDangTin,
        zaloCost: comp.cnZalo,
        googleCost: comp.cnGoogle,
        tiktokCost: comp.cnTiktok,

        costBreakdowns: buildCostBreakdownsOfRecord(draftRow),
        hoaDonLines: (() => {
          const items = buildCostBreakdownsOfRecord(draftRow).hoaDonTien?.items || [];
          if (items.length) return items.map((it: any) => ({ amount: it.amount, note: it.label === 'Khoản chi' ? '' : it.label }));
          return comp.hoaDonTien ? [{ amount: comp.hoaDonTien, note: '' }] : [];
        })(),
        createdAt: serverTimestamp(),
        createdBy: user?.email || '',
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || '',
        editHistory: [
          {
            action: 'CREATE',
            editorName: user?.displayName || user?.email || 'Người dùng',
            timestamp: new Date().toISOString(),
            changes: { 'Thêm mới': { old: '', new: 'Tạo bản ghi nghiệm thu' } }
          }
        ]
      };

      let suppSel = draftRow.supplement === true ? prevMonth(normalizeMonth(payload.month)) : (typeof draftRow.supplement === 'string' ? draftRow.supplement : '');
      {
        const r0 = isSuperAdmin ? 'super_admin' : 'x';
        const lkOf = () => lockBlock(r0, 'nt', String(payload.month || '')) || pastBlock(r0, 'nt', (payload as any).ntMonth);
        let lk = lkOf();
        const nm = normalizeMonth(payload.month);
        if (lk && !isSuperAdmin && openNtKy && !suppSel && suppMonths(openNtKy).includes(nm)) {
          // Kỳ cũ đã khoá → đề nghị gửi thành Nghiệm thu bổ sung trong kỳ đang mở.
          if (!window.confirm(`Kỳ tháng ${+nm.slice(5)}/${nm.slice(0, 4)} đã khoá Nghiệm thu.\nGửi bản ghi này thành «Nghiệm thu bổ sung» trong kỳ tháng ${+openNtKy.slice(5)} để Super Admin duyệt? Khi được duyệt, bản ghi được ghi vào kỳ tháng ${+nm.slice(5)}.`)) return;
          suppSel = nm; payload.month = openNtKy; payload.kyPart = null;
          if (payload.ntMonth) payload.ntMonth = openNtKy;
          lk = lkOf();
        }
        if (lk) { toast.error(lk); return; }
      }
      if (suppSel && suppOpenFor(payload.month)) {
        // Nghiệm thu bổ sung: lưu ở kỳ đang mở (month = supplementIn = M), cho kỳ cũ suppSel, chờ Super Admin duyệt.
        const M = normalizeMonth(payload.month);
        if (!suppMonths(M).includes(suppSel)) { toast.error('Kỳ bổ sung phải là kỳ trước kỳ đang lưu (tối đa 12 kỳ)'); return; }
        const at = new Date().toISOString();
        Object.assign(payload, { supplementFor: suppSel, supplementIn: M, supplementStatus: 'pending', supplementHistory: [{ from: '', to: 'pending', by: user?.email || user?.uid || '', at, note: 'Tạo bản bổ sung' }] });
      }
      if (draftRow.implementerManual) {
        if (!canManualAssignee || !ntManualAllowed(payload.month)) { toast.error('Chỉ kỳ Tháng 10/2026 được tự nhập Người phụ trách'); return; }
        Object.assign(payload, manualAttributionPatch(payload.month, payload.implementerName, { uid: user?.uid, email: user?.email }));
      }
      if (ntImplementerRequired(ntRequiredFrom)) {
        if (!payload.implementerUid && !payload.implementerManual) { toast.error(NT_REQUIRED_MSG); return; }
        (payload as any).ntRequired = true;
      }
      if (payload.implementerUid) {
        const dup = ntDuplicateOf(acceptancesRef.current || acceptances, '', { uid: payload.implementerUid, month: payload.ntMonth, projectId: payload.projectId, supp: !!payload.supplementFor });
        if (dup) { toast.error(`Trùng người phụ trách + dự án + tháng`); return; }
        const ref = doc(collection(db, 'acceptances'));
        await releaseOrphanNtKey(db, ref.id, { uid: payload.implementerUid, month: payload.ntMonth, projectId: payload.projectId, supp: !!payload.supplementFor });
        const b = writeBatch(db);
        const attr = ntAttributionOps(db, b, ref.id, {}, { uid: payload.implementerUid, name: payload.implementerName, teamId: payload.ntTeamId, blockId: payload.ntBlockId, month: payload.ntMonth, projectId: payload.projectId, supp: !!payload.supplementFor }, { uid: user?.uid, email: user?.email });
        b.set(ref, { ...payload, ...attr, createdAt: serverTimestamp(), createdBy: user?.email || '' });
        await b.commit();
      } else {
        await addDoc(collection(db, 'acceptances'), payload);
      }
      toast.success('Đã lưu bản ghi nghiệm thu thành công!');
      
      // Remove the saved draft and ensure a fresh empty draft row is always available
      setDraftRows((prev) => {
        const remaining = prev.filter((d) => d.id !== draftRow.id);
        return remaining.length > 0 ? remaining : [createNewDraftRow(acceptanceMonthFilter)];
      });
    } catch (err) {
      console.error('Error saving draft:', err);
      toast.error(ntDeniedMsg(err, normalizeMonth(draftRow?.month)) || 'Lỗi khi lưu bản ghi nghiệm thu');
    }
  }, [user, teamLookup, projectLookup, teams, projects, acceptanceMonthFilter, unregisteredProjectReason]);

  // Start Edit
  const handleStartEdit = useCallback((item: any) => {
    if (!canEdit) {
      toast.error('Chỉ Quản trị viên (Admin) và Điều phối (Mod) mới có quyền chỉnh sửa bản ghi Nghiệm thu MKT!');
      return;
    }
    setEditingRowId(item.id);
  }, [canEdit]);

  const handleCancelEdit = useCallback(() => {
    setEditingRowId(null);
  }, []);

  // Save Edit (Takes local row state directly from child component)
  const handleSaveEdit = useCallback(async (id: string, updatedState: any) => {
    if (!canEdit) {
      toast.error('Chỉ Quản trị viên (Admin) và Điều phối (Mod) mới có quyền chỉnh sửa bản ghi Nghiệm thu MKT!');
      return;
    }
    if (!id || !updatedState) return;
    const scopeErr = unregisteredProjectReason(updatedState);
    if (scopeErr) { toast.error(scopeErr); return; }
    const comp = getRowComputed(updatedState);
    const tm = (teamLookup.findTeam 
      ? (teamLookup.findTeam(updatedState.teamId) || teamLookup.findTeam(updatedState.teamCode) || teamLookup.findTeam(updatedState.teamName))
      : null) || (teams || []).find((t: any) => 
          t.id === updatedState.teamId || 
          (updatedState.teamCode && t.teamCode === updatedState.teamCode) || 
          (updatedState.teamName && t.name === updatedState.teamName) ||
          t.id === updatedState.teamCode
        );

    const pr = resolveAcceptanceProject(updatedState, projects);

    try {
      const oldItem = acceptancesRef.current.find((a: any) => a.id === id);
      const oldHistory = Array.isArray(oldItem?.editHistory) ? oldItem.editHistory : [];

      const changesObj: any = {};
      if (oldItem?.month !== updatedState.month) changesObj['Tháng'] = { old: oldItem?.month, new: updatedState.month };
      if (oldItem?.totalCost !== comp.grandTotal) changesObj['Tổng chi phí'] = { old: oldItem?.totalCost, new: comp.grandTotal };

      const newHistoryEntry = {
        action: 'UPDATE',
        editorName: user?.displayName || user?.email || 'Người dùng',
        timestamp: new Date().toISOString(),
        changes: changesObj
      };

      const resolvedTeamName = tm?.name || (updatedState.teamName && !updatedState.teamName.startsWith('draft-') ? updatedState.teamName : oldItem?.teamName || tm?.teamCode || '');
      const resolvedTeamCode = tm?.teamCode || (updatedState.teamCode && !updatedState.teamCode.startsWith('draft-') ? updatedState.teamCode : oldItem?.teamCode || tm?.name || '');
      const resolvedProjectName = pr?.name || (updatedState.projectName && !updatedState.projectName.startsWith('draft-') ? updatedState.projectName : oldItem?.projectName || pr?.projectCode || '');
      const resolvedProjectCode = pr?.projectCode || (updatedState.projectCode && !updatedState.projectCode.startsWith('draft-') ? updatedState.projectCode : oldItem?.projectCode || '');
      const resolvedBlock = resolveBlockForTeam(tm || updatedState, blocks, teams, teamLookup.findTeam);

      const payload: any = {
        ...storeAcceptanceMonth(updatedState.month || oldItem?.month || getCurrentDefaultMonth()),
        teamId: tm?.id || updatedState.teamId || oldItem?.teamId || '',
        teamName: resolvedTeamName,
        teamCode: resolvedTeamCode,
        blockId: resolvedBlock.blockId || tm?.blockId || updatedState.blockId || oldItem?.blockId || '',
        blockCode: resolvedBlock.blockCode || tm?.blockCode || updatedState.blockCode || oldItem?.blockCode || '',
        blockName: resolvedBlock.blockName || tm?.blockName || updatedState.blockName || oldItem?.blockName || '',
        gdkdName: updatedState.gdkdName || tm?.name || oldItem?.gdkdName || '',
        implementerName: updatedState.implementerName || oldItem?.implementerName || '',
        implementerUid: updatedState.implementerManual ? '' : (updatedState.implementerUid || oldItem?.implementerUid || ''),
        ntMonth: updatedState.implementerManual ? (oldItem?.ntMonth || '') : (updatedState.implementerUid || oldItem?.implementerUid) ? (normalizeMonth(updatedState.month) || normalizeMonth(oldItem?.month) || '') : (oldItem?.ntMonth || ''),
        ntTeamId: tm?.id || updatedState.teamId || oldItem?.teamId || '',
        ntBlockId: resolvedBlock.blockId || tm?.blockId || updatedState.blockId || oldItem?.blockId || '',
        projectId: pr?.id || updatedState.projectId || oldItem?.projectId || '',
        projectName: resolvedProjectName,
        projectCode: resolvedProjectCode,

        // Group 1
        digitalFb: comp.dFb,
        digitalZalo: comp.dZalo,
        digitalTiktok: comp.dTiktok,
        digitalKhac: comp.dKhac,
        digitalTotalChuaVat: comp.dTotalChuaVat,
        digitalTotalSauVat: comp.dTotalSauVat, // Cột K

        // Group 2
        visaFb: comp.vFb,
        visaZalo: comp.vZalo,
        visaTiktok: comp.vTiktok,
        visaDangTin: comp.vDangTin,
        visaTotalChuaVat: comp.vTotalChuaVat,
        visaTotalSauVat: comp.vTotalSauVat, // Cột Q

        // Group 3
        dangTinCtyChuaVat: comp.dtCtyChuaVat,
        dangTinCtySauVat: comp.dtCtySauVat, // Cột S

        // Group 4
        caNhanFb: comp.cnFb,
        caNhanDangTin: comp.cnDangTin,
        caNhanZalo: comp.cnZalo,
        caNhanGoogle: comp.cnGoogle,
        caNhanTiktok: comp.cnTiktok,
        caNhanNativeAds: comp.cnNativeAds,
        caNhanUCall: comp.cnUCall,
        caNhanTotal: comp.cnTotal, // Cột Y

        // Cột: Cá Nhân nạp tiền qua công ty
        caNhanNapTienQuaCty: comp.cnNapTienCty,

        // Group 5: Cột Z
        grandTotal: comp.grandTotal,
        totalCost: comp.grandTotal,
        afterAcceptanceCost: comp.grandTotal,
        hoaDonTien: comp.hoaDonTien,
        hoaDonNo: comp.hoaDonNo,

        // Group 6
        caNhanNopTien: comp.cnNopTien,
        status: updatedState.status || 'Đã nghiệm thu',
        notes: updatedState.notes || '',

        // Legacy compatibility
        fbDigitalChuaVat: comp.dFb,
        facebookCost: comp.dTotalSauVat,
        digitalCost: comp.dTotalSauVat,
        fbVisaCostChuaVat: comp.vFb,
        visaCost: comp.vTotalSauVat,
        dangTinCongTyChuaVat: comp.dtCtyChuaVat,
        postingCost: comp.dtCtySauVat,
        caNhanCost: comp.cnFb,
        otherCost: comp.cnTotal,
        dangTinCaNhanCost: comp.cnDangTin,
        zaloCost: comp.cnZalo,
        googleCost: comp.cnGoogle,
        tiktokCost: comp.cnTiktok,

        costBreakdowns: buildCostBreakdownsOfRecord(updatedState),
        hoaDonLines: (() => {
          const items = buildCostBreakdownsOfRecord(updatedState).hoaDonTien?.items || [];
          if (items.length) return items.map((it: any) => ({ amount: it.amount, note: it.label === 'Khoản chi' ? '' : it.label }));
          return comp.hoaDonTien ? [{ amount: comp.hoaDonTien, note: '' }] : [];
        })(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || '',
        editHistory: [...oldHistory, newHistoryEntry]
      };

      { const r0 = isSuperAdmin ? 'super_admin' : 'x'; const lk = lockBlock(r0, 'nt', String(oldItem?.month || payload.month || '')) || pastBlock(r0, 'nt', oldItem?.ntMonth) || pastBlock(r0, 'nt', payload.month) || pastBlock(r0, 'nt', (payload as any).ntMonth);
        if (lk) {
          const om = normalizeMonth(oldItem?.month);
          if (!isSuperAdmin && oldItem && !isSupplement(oldItem) && openNtKy && suppMonths(openNtKy).includes(om)) {
            // Không sửa bản kỳ đã khoá — đề nghị tạo bản «Nghiệm thu bổ sung» MỚI (bản gốc giữ nguyên).
            prefillSuppFromLocked(updatedState, om);
            return;
          }
          toast.error(lk); return;
        } }
      if (isSupplement(oldItem)) {
        // Bản bổ sung: không đổi kỳ (supplementFor gắn với tháng của kỳ); sửa sau khi đã quyết định -> về Chờ duyệt.
        if (normalizeMonth(payload.month) !== normalizeMonth(oldItem.month)) { toast.error('Bản Nghiệm thu bổ sung không đổi được kỳ — xoá và tạo lại nếu cần'); return; }
        if (suppStatus(oldItem) !== 'pending') Object.assign(payload, suppDecisionPatch(oldItem, 'pending', { uid: user?.uid, email: user?.email }, 'Sửa sau khi đã duyệt/từ chối'));
      }
      const nextUid = payload.implementerUid || '';
      if (updatedState.implementerManual) {
        // Tên tự nhập (Tháng 10/2026): giải phóng khoá ntKeys cũ nếu bản ghi đang gán uid.
        if (!ntManualAllowed(payload.month)) { toast.error('Chỉ kỳ Tháng 10/2026 được tự nhập Người phụ trách — chọn từ danh sách'); return; }
        const changed = !isManualImplementer(oldItem) || oldItem?.implementerName !== payload.implementerName || normalizeMonth(oldItem?.month) !== normalizeMonth(payload.month);
        if (changed && !canManualAssignee) { toast.error('Không có quyền tự nhập Người phụ trách'); return; }
        const b = writeBatch(db);
        const attr = ntManualOps(db, b, oldItem, payload.month, payload.implementerName, { uid: user?.uid, email: user?.email });
        if (oldItem?.ntRequired === true) (payload as any).ntRequired = true;
        b.update(doc(db, 'acceptances', id), { ...payload, ...(changed ? attr : { implementerUid: '', implementerManual: true, ntMonth: attr.ntMonth, implementerName: attr.implementerName }) });
        await b.commit();
        toast.success('Đã cập nhật bản ghi nghiệm thu!');
        setEditingRowId(null);
        return;
      }
      if (!nextUid && recordNeedsImplementer(oldItem)) { toast.error(NT_REQUIRED_MSG); return; }
      if (nextUid) {
        const dup = ntDuplicateOf(acceptancesRef.current || acceptances, id, { uid: nextUid, month: payload.ntMonth, projectId: payload.projectId, supp: isSupplement(oldItem) });
        if (dup) { toast.error(`Trùng người phụ trách + dự án + tháng (#${String(dup.id).slice(-6).toUpperCase()})`); return; }
        if (ntKeyOf(oldItem) !== ntKeyOf({ implementerUid: nextUid, ntMonth: payload.ntMonth, projectId: payload.projectId, supplementFor: oldItem?.supplementFor })) await releaseOrphanNtKey(db, id, { uid: nextUid, month: payload.ntMonth, projectId: payload.projectId, supp: isSupplement(oldItem) });
        const b = writeBatch(db);
        const attr = ntAttributionOps(db, b, id, oldItem, { uid: nextUid, name: payload.implementerName, teamId: payload.ntTeamId, blockId: payload.ntBlockId, month: payload.ntMonth, projectId: payload.projectId, supp: isSupplement(oldItem) }, { uid: user?.uid, email: user?.email });
        b.update(doc(db, 'acceptances', id), { ...payload, ...attr });
        await b.commit();
      } else {
        await updateDoc(doc(db, 'acceptances', id), payload);
      }
      toast.success('Đã cập nhật bản ghi nghiệm thu!');
      setEditingRowId(null);
    } catch (err) {
      console.error('Error updating acceptance:', err);
      toast.error(ntDeniedMsg(err, normalizeMonth(updatedState?.month)) || 'Lỗi khi cập nhật bản ghi');
    }
  }, [canEdit, canCreate, user, teamLookup, projectLookup, teams, projects, blocks, openNtKy, isSuperAdmin, unregisteredProjectReason]);

  /** Bản kỳ đã khoá không sửa được: tạo dòng nháp «Nghiệm thu bổ sung» MỚI (điền sẵn từ bản này, Phòng/Dự án/Người phụ trách vẫn đổi được). */
  const prefillSuppFromLocked = (src: any, om: string) => {
    const ky = `${+om.slice(5)}/${om.slice(0, 4)}`;
    if (!canCreate || !openNtKy) { toast.error(`Kỳ tháng ${ky} đã khoá Nghiệm thu — không sửa được. Liên hệ Super Admin.`); return; }
    if (!window.confirm(`Kỳ tháng ${ky} đã khoá Nghiệm thu — không sửa được bản ghi này.\n\nTạo bản «Nghiệm thu bổ sung» MỚI cho kỳ T${+om.slice(5)} (điền sẵn số liệu vừa nhập)? Bản gốc giữ nguyên; bản mới cần Super Admin duyệt riêng, duyệt thì được ghi vào kỳ T${+om.slice(5)}.`)) return;
    const base = createNewDraftRow(openNtKy);
    const row: any = { ...base };
    for (const k of Object.keys(base)) if (k !== 'id' && k !== 'month' && src?.[k] !== undefined && src?.[k] !== null) row[k] = src[k];
    row.supplement = om;
    setDraftRows((prev) => [row, ...prev]);
    setEditingRowId(null);
    toast.info(`Đã tạo dòng nháp «Bổ sung cho Kỳ T${+om.slice(5)}» ở đầu bảng — kiểm tra rồi bấm Lưu để gửi Super Admin duyệt.`);
  };


  const handleAssignImplementer = useCallback(async (item: any, uid: string, name: string) => {
    if (!canEdit) return toast.error('Không có quyền gán người phụ trách');
    if (!uid && recordNeedsImplementer(item)) return toast.error(NT_REQUIRED_MSG);
    if (!item?.teamId && !item?.teamCode) return toast.error('Chọn Phòng KD trước khi gán người phụ trách');
    const month = normalizeMonth(item.month) || normalizeMonth(item.ntMonth);
    if (!month || !/^[0-9]{4}-[0-9]{2}$/.test(month)) return toast.error('Tháng bản ghi không hợp lệ');
    if (!item.projectId) return toast.error('Bản ghi chưa có Dự án');
    const scopeErr = unregisteredProjectReason({ ...item, implementerUid: uid, implementerManual: false });
    if (scopeErr) return toast.error(scopeErr);
    const tm = teamLookup.findTeam?.(item.teamId) || teams.find((t: any) => t.id === item.teamId);
    const blockId = item.blockId || tm?.blockId || '';
    try {
      await assignImplementer(db, acceptancesRef.current || acceptances, item, { uid, name, teamId: item.teamId || tm?.id || '', blockId, month, projectId: item.projectId }, { uid: user?.uid, email: user?.email });
      toast.success(`Đã gán ${name}`);
    } catch (e: any) {
      if (e?.code === 'dup') toast.error(`Trùng: ${name} đã có bản ghi dự án này trong tháng (#${String(e.dup?.id || '').slice(-6).toUpperCase()})`);
      else { console.error(e); toast.error('Không gán được: ' + (e?.code || e?.message || e)); }
    }
  }, [canEdit, user, teams, teamLookup, acceptances, unregisteredProjectReason]);

  const handleAssignManual = useCallback(async (item: any, name: string) => {
    if (!canManualAssignee) throw new Error('Không có quyền tự nhập Người phụ trách');
    if (!ntManualAllowed(item?.month)) throw new Error('Chỉ kỳ Tháng 10/2026 được tự nhập Người phụ trách');
    if (!item?.teamId && !item?.teamCode) throw new Error('Chọn Phòng KD trước');
    try {
      await assignManualImplementer(db, item, name, { uid: user?.uid, email: user?.email });
      toast.success(`Đã ghi Người phụ trách (tự nhập): ${name}`);
    } catch (e: any) { console.error(e); throw new Error('Không lưu được: ' + (e?.code || e?.message || e)); }
  }, [canManualAssignee, user]);

  const handleAssignTeam = useCallback(async (item: any, teamId: string) => {
    if (!canEdit) return;
    const tm = teamLookup.findTeam?.(teamId) || teams.find((t: any) => t.id === teamId);
    if (!tm) return toast.error('Không tìm thấy Phòng');
    try {
      const resolved = resolveBlockForTeam(tm, blocks, teams, teamLookup.findTeam);
      await updateDoc(doc(db, 'acceptances', item.id), {
        teamId: tm.id, teamName: tm.name || '', teamCode: tm.teamCode || '',
        blockId: resolved.blockId || tm.blockId || '', blockCode: resolved.blockCode || tm.blockCode || '', blockName: resolved.blockName || tm.blockName || '',
        // gỡ người phụ trách cũ nếu đổi Phòng (sẽ gán lại)
        implementerUid: '', implementerName: item.teamId && item.teamId !== tm.id ? '' : (item.implementerName || ''),
        ntTeamId: tm.id, ntBlockId: resolved.blockId || tm.blockId || '',
        ...(ntUsesBudgetProjects(item.month) && item.teamId !== tm.id ? { projectId: '', projectName: '', projectCode: '' } : {}),
      });
      toast.success('Đã chọn Phòng — tiếp tục chọn Người phụ trách');
    } catch (e: any) { toast.error('Không cập nhật Phòng: ' + (e?.message || e)); }
  }, [canEdit, teams, blocks, teamLookup]);

  const handleSelectRow = useCallback((id: string, checked: boolean) => {
    setSelectedAcceptanceIds(prev => 
      checked ? [...prev, id] : prev.filter(x => x !== id)
    );
  }, []);

  const handleOpenDeleteModal = useCallback((id: string) => {
    if (!canDelete) {
      toast.error('Chỉ Quản trị viên (Admin) và Điều phối (Mod) mới có quyền xóa bản ghi Nghiệm thu MKT!');
      return;
    }
    { const it = (acceptancesRef.current || []).find((a: any) => a.id === id); const pb = pastBlock(isSuperAdmin ? 'super_admin' : 'x', 'nt', it?.month); if (pb) { toast.error(pb); return; } }
    setItemToDeleteId(id);
    setIsDeleteDialogOpen(true);
  }, [canDelete, isSuperAdmin]);

  const handleOpenHistoryModal = useCallback((acc: any) => {
    setHistoryTargetRecord(acc);
    setIsHistoryDialogOpen(true);
  }, []);

  // Delete single
  const handleConfirmDelete = async () => {
    if (!canDelete) {
      toast.error('Chỉ Quản trị viên (Admin) và Điều phối (Mod) mới có quyền xóa bản ghi Nghiệm thu MKT!');
      return;
    }
    if (!itemToDeleteId) return;
    try {
      { const it = (acceptancesRef.current || acceptances || []).find((x: any) => x.id === itemToDeleteId) || { id: itemToDeleteId }; const b = writeBatch(db); ntDeleteOps(db, b, it); await b.commit(); }
      toast.success('Đã xóa bản ghi nghiệm thu');
      setIsDeleteDialogOpen(false);
      setItemToDeleteId(null);
    } catch (err) {
      console.error('Error deleting acceptance:', err);
      toast.error(ntDeniedMsg(err) || 'Lỗi khi xóa bản ghi');
    }
  };

  // Bulk delete
  const handleConfirmBulkDelete = async () => {
    if (!canDelete) {
      toast.error('Chỉ Quản trị viên (Admin) và Điều phối (Mod) mới có quyền xóa bản ghi Nghiệm thu MKT!');
      return;
    }
    if (selectedAcceptanceIds.length === 0) return;
    { const lockedIds = selectedAcceptanceIds.filter((id) => { const it = (acceptancesRef.current || []).find((a: any) => a.id === id); return pastBlock(isSuperAdmin ? 'super_admin' : 'x', 'nt', it?.month) || pastBlock(isSuperAdmin ? 'super_admin' : 'x', 'nt', it?.ntMonth); });
      if (lockedIds.length) { toast.error(`${lockedIds.length} bản ghi thuộc kỳ Nghiệm thu đã khoá — chỉ Super Admin được xoá. Bỏ chọn các bản ghi này rồi thử lại.`); return; } }
    const toastId = toast.loading(`Đang xóa ${selectedAcceptanceIds.length} bản ghi...`);
    try {
      const batch = writeBatch(db);
      selectedAcceptanceIds.forEach((id) => {
        ntDeleteOps(db, batch, (acceptancesRef.current || acceptances || []).find((x: any) => x.id === id) || { id });
      });
      await batch.commit();
      toast.dismiss(toastId);
      toast.success(`Đã xóa ${selectedAcceptanceIds.length} bản ghi thành công!`);
      setSelectedAcceptanceIds([]);
      setIsBulkDeleteDialogOpen(false);
    } catch (err) {
      toast.dismiss(toastId);
      console.error('Error bulk deleting:', err);
      toast.error('Lỗi khi xóa đồng loạt bản ghi');
    }
  };

  // Open Calculator
  const handleOpenCalculator = useCallback((
    fieldKey: string,
    fieldVNName: string,
    currentVal: string,
    onUpdate: (val: string) => void
  ) => {
    setActiveCalculatorField(fieldKey);
    setCalculatorFieldNameVN(fieldVNName);
    setCalculatorInput(currentVal || '');
    setCalculatorUpdateFn(() => onUpdate);
    setIsCalculatorOpen(true);
  }, []);

  // Multi-value breakdown tooltip helper
  const renderBreakdownTooltip = useCallback((amount: number, breakdown: any, label: string) => {
    const formattedAmount = formatCurrency(amount).replace(' đ', '');
    const items = breakdown?.items || [];
    if (items.length <= 1) {
      return <span>{formattedAmount}</span>;
    }
    return (
      <span className="relative group/tooltip inline-flex items-center justify-end gap-1 cursor-help">
        <span className="font-semibold text-indigo-700 underline decoration-indigo-400 decoration-dashed underline-offset-2 hover:text-indigo-900 transition-colors">
          {formattedAmount}
        </span>
        <Calculator className="w-3 h-3 text-indigo-500 hover:text-indigo-700 shrink-0" />
        <span className="absolute right-0 bottom-full mb-2 hidden group-hover/tooltip:block bg-slate-900 border border-slate-800 text-slate-100 p-3 rounded-xl shadow-2xl text-[10px] min-w-[220px] text-right z-[999] pointer-events-none font-sans font-medium scale-95 origin-bottom-right transition-all leading-relaxed whitespace-nowrap">
          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-400 border-b border-slate-800 pb-1 mb-1 text-center font-sans flex items-center justify-center gap-1.5">
            <Calculator className="w-3 h-3 text-indigo-400" />
            <span>CHI TIẾT ({label})</span>
          </span>
          <span className="block space-y-1 max-h-36 overflow-y-auto pr-1">
            {items.map((sub: any, sidx: number) => (
              <span key={sidx} className="flex justify-between gap-4 text-[10px] items-center py-0.5">
                <span className="text-[var(--mh-text-3)] truncate max-w-[130px] text-left">• {sub.label}</span>
                <span className="font-mono font-bold text-slate-100">{formatCurrency(sub.amount).replace(' đ', '')}</span>
              </span>
            ))}
          </span>
          <span className="border-t border-slate-800 pt-1 mt-1 flex justify-between gap-4 font-mono font-bold text-indigo-400">
            <span className="text-[9px] uppercase font-sans text-[var(--mh-text-3)]">Tổng cộng:</span>
            <span>{formatCurrency(amount).replace(' đ', '')}</span>
          </span>
        </span>
      </span>
    );
  }, [formatCurrency]);

  // Đếm bản bổ sung theo tháng nguồn (không theo bộ lọc trạng thái).
  const suppCountMap: Record<string, { pending: number; approved: number; rejected: number; total: number }> = useMemo(() => suppCounts(acceptances || []) as any, [acceptances]);
  const suppPendingTotal = useMemo(() => Object.values(suppCountMap).reduce((n, c) => n + c.pending, 0), [suppCountMap]);
  // Cách 2: ảnh + hoá đơn của bản bổ sung (để chặn Duyệt khi thiếu). Chỉ nghe khi mở mục bổ sung, Admin/Mod.
  const [suppFiles, setSuppFiles] = useState<Record<string, { img: string[]; inv: string[] }>>({});
  const suppIdsKey = useMemo(() => (acceptances || []).filter((a: any) => isSupplement(a) && suppStatus(a) !== 'approved').map((a: any) => a.id).sort().join(','), [acceptances]);
  useEffect(() => {
    if (!suppView || !(isSuperAdmin || isAdmin || isMod) || !suppIdsKey) { setSuppFiles({}); return; }
    const ids = suppIdsKey.split(',');
    const acc: Record<string, Record<string, Record<string, true>>> = { img: {}, inv: {} };
    const push = () => {
      const out: Record<string, { img: string[]; inv: string[] }> = {};
      for (const id of ids) out[id] = { img: Object.keys(acc.img[id] || {}), inv: Object.keys(acc.inv[id] || {}) };
      setSuppFiles(out);
    };
    const unsubs: Array<() => void> = [];
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      for (const [kind, coll] of [['img', 'acceptanceImages'], ['inv', 'acceptanceInvoices']] as const) {
        unsubs.push(onSnapshot(fsQuery(collection(db, coll), fsWhere('acceptanceId', 'in', chunk)), (snap) => {
          for (const id of chunk) delete acc[kind][id];
          snap.forEach((d) => { const aid = String(d.data()?.acceptanceId || ''); (acc[kind][aid] ||= {})[d.id] = true; });
          push();
        }, () => { /* không đọc được → coi như thiếu */ }));
      }
    }
    return () => unsubs.forEach((u) => u());
  }, [suppView, suppIdsKey, isSuperAdmin, isAdmin, isMod]);
  const suppFileCount = (id: string) => ({ img: suppFiles[id]?.img.length || 0, inv: suppFiles[id]?.inv.length || 0 });
  const handleSuppDecision = async (a: any, status: 'pending' | 'approved' | 'rejected') => {
    if (!canApproveSupp) { toast.error('Chỉ Super Admin duyệt Nghiệm thu bổ sung'); return; }
    let proof: { img: string; inv: string } | null = null;
    if (status === 'approved' && suppStatus(a) !== 'approved') {
      const f = suppFiles[a.id] || { img: [], inv: [] };
      const miss = suppMissingFiles(f.img.length, f.inv.length);
      if (miss) { toast.error(miss); return; }
      proof = { img: f.img[0], inv: f.inv[0] };
    }
    let note = '';
    if (status === 'rejected') {
      const r = window.prompt('Lý do từ chối bản bổ sung:', '');
      if (r === null) return;
      note = r.trim();
    }
    setSuppBusy(a.id);
    try {
      const patch: any = suppDecisionPatch(a, status, { uid: user?.uid, email: user?.email }, note);
      if (proof) patch.supplementProof = proof;
      const b = writeBatch(db);
      if (a.supplementIn) {
        // Bản mới: Duyệt → ghi vào kỳ gốc (supplementFor); Từ chối / Đặt lại → về kỳ nộp (supplementIn).
        const target = status === 'approved' ? a.supplementFor : a.supplementIn;
        if (normalizeMonth(a.month) !== target) {
          patch.month = target;
          if (a.ntMonth) patch.ntMonth = target;
          if (a.implementerUid && a.projectId && a.ntMonth) {
            const oldK = ntKeyOf(a); const newK = ntKeyStr(target, a.implementerUid, a.projectId) + '_bs';
            const [oks, nks] = await Promise.all([getDocFs(doc(db, 'ntKeys', oldK)), getDocFs(doc(db, 'ntKeys', newK))]);
            if (nks.exists() && nks.data()?.acceptanceId !== a.id) throw new Error(`Kỳ T${+target.slice(5)} đã có bản bổ sung cùng Người phụ trách + dự án (#${String(nks.data()?.acceptanceId || '').slice(-6).toUpperCase()})`);
            const newRef = doc(db, 'ntKeys', newK);
            if (oks.exists() && oks.data()?.acceptanceId === a.id) b.delete(doc(db, 'ntKeys', oldK));
            if (!nks.exists()) b.set(newRef, { acceptanceId: a.id, month: target, uid: a.implementerUid, projectId: a.projectId, createdAt: new Date().toISOString() });
          }
        }
      }
      b.update(doc(db, 'acceptances', a.id), patch);
      await b.commit();
      toast.success(status === 'approved' ? 'Đã duyệt bản bổ sung' : status === 'rejected' ? 'Đã từ chối bản bổ sung' : 'Đã đặt lại Chờ duyệt');
    } catch (e: any) {
      toast.error('Không lưu được: ' + (e?.message || e));
    } finally { setSuppBusy(null); }
  };

  // Excel Export with exact screenshot columns
  const handleExportExcel = async () => {
    if (displayedRecords.length === 0) {
      toast.error('Không có dữ liệu để xuất Excel');
      return;
    }

    // Xuất thường: chỉ bản được tính (bổ sung chưa duyệt bị loại). Màn «Nghiệm thu bổ sung»: xuất đủ kèm trạng thái.
    const exportRecs = suppView ? displayedRecords : displayedRecords.filter(ntCountsInTotals);
    const data = exportRecs.map((a: any) => {
      const comp = getRowComputed(a);
      const blkInfo = resolveBlockForTeam(a, blocks, teams, teamLookup.findTeam);
      return {
        'THÁNG': a.month || '',
        'BỔ SUNG': isSupplement(a) ? `${suppBadge(a)} (${SUPP_STATUS_LABEL[suppStatus(a) as 'pending']})` : '',
        'KHỐI': blkInfo.blockName || a.blockName || '',
        'MÃ TEAM': a.teamCode || '',
        'GĐKD': a.gdkdName || '',
        'NGƯỜI PHỤ TRÁCH': implementerLabel(a) || '',
        'DỰ ÁN': a.projectName || '',
        'DIGITAL - FB (Chưa VAT)': comp.dFb,
        'DIGITAL - ZALO (Chưa VAT)': comp.dZalo,
        'DIGITAL - TIKTOK (Chưa VAT)': comp.dTiktok,
        'DIGITAL - KHÁC (Chưa VAT)': comp.dKhac,
        'DIGITAL - TỔNG (Chưa VAT)': comp.dTotalChuaVat,
        'DIGITAL CHẠY (SAU VAT)': comp.dTotalSauVat,
        'VISA - FB (Chưa VAT)': comp.vFb,
        'VISA - ZALO (Chưa VAT)': comp.vZalo,
        'VISA - TIKTOK (Chưa VAT)': comp.vTiktok,
        'VISA - ĐĂNG TIN (Chưa VAT)': comp.vDangTin,
        'VISA - TỔNG (Chưa VAT)': comp.vTotalChuaVat,
        'THẺ VISA CÔNG TY (SAU VAT)': comp.vTotalSauVat,
        'ĐĂNG TIN CÔNG TY (Chưa VAT)': comp.dtCtyChuaVat,
        'ĐĂNG TIN CÔNG TY (SAU VAT 8%)': comp.dtCtySauVat,
        'CÁ NHÂN - FB': comp.cnFb,
        'CÁ NHÂN - ĐĂNG TIN': comp.cnDangTin,
        'CÁ NHÂN - ZALO': comp.cnZalo,
        'CÁ NHÂN - GOOGLE': comp.cnGoogle,
        'CÁ NHÂN - TIKTOK': comp.cnTiktok,
        'CÁ NHÂN - NATIVE ADS': comp.cnNativeAds,
        'CÁ NHÂN - UCALL': comp.cnUCall,
        'TIỀN TRÊN HÓA ĐƠN': comp.hoaDonTien,
        'TIỀN HÓA ĐƠN NỢ': comp.hoaDonNo,
        'CÁ NHÂN - TỔNG': comp.cnTotal,
        'CÁ NHÂN NẠP TIỀN QUA CÔNG TY': comp.cnNapTienCty,
        'TỔNG CHƯA VAT': preVatOf(comp),
        'VAT': comp.grandTotal - preVatOf(comp),
        'TỔNG CỘNG': comp.grandTotal,
        'SỐ LEAD': comp.cnNopTien,
        'TRẠNG THÁI': a.status || 'Đã nghiệm thu',
        'GHI CHÚ': a.notes || ''
      };
    });

    {
      // Dòng TỔNG cuối file: cộng mọi cột số → khớp dòng TỔNG CỘNG trên màn hình.
      const sum: any = { 'THÁNG': `TỔNG (${exportRecs.length} bản ghi)` };
      for (const row of data) for (const [k, v] of Object.entries(row)) if (typeof v === 'number') sum[k] = (sum[k] || 0) + v;
      data.push(sum);
    }
    const XLSX = await loadXlsx();
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Nghiệm thu MKT');
    {
      const codes = acceptanceBlockFilter !== 'all'
        ? [blockCodeOf(blocks.find((b: any) => b.id === acceptanceBlockFilter || b.blockCode === acceptanceBlockFilter)) || acceptanceBlockFilter]
        : [...new Set(exportRecs.map((a: any) => resolveBlockForTeam(a, blocks, teams, teamLookup.findTeam).blockCode || a.blockCode).filter(Boolean))];
      const months = [...new Set(exportRecs.map((a: any) => formatAcceptanceMonth(a.month)).filter(Boolean))];
      const tm = acceptanceTeamFilter !== 'all' ? (teamLookup.byId.get(acceptanceTeamFilter) || teams.find((t: any) => t.id === acceptanceTeamFilter)) : null;
      const pj = acceptanceProjectFilter !== 'all' ? (projectLookup.findProject?.(acceptanceProjectFilter) || projects.find((p: any) => p.id === acceptanceProjectFilter)) : null;
      XLSX.writeFile(workbook, exportFileName({ blockCode: codes, month: acceptanceMonthFilter !== 'all' ? formatAcceptanceMonth(acceptanceMonthFilter) : months.length === 1 ? String(months[0]) : 'all', teamCode: tm ? teamCodeOf(tm) : '', projectName: pj ? (pj.name || '') : '' }, 'xlsx'));
    }
    toast.success('Đã xuất file Excel thành công');
  };

  // 🔄 Automatic / Manual synchronization of blocks based on teams
  const [isSyncingBlocks, setIsSyncingBlocks] = useState<boolean>(false);

  const handleSyncBlocks = async () => {
    if (!canEdit || !db) return;
    try {
      setIsSyncingBlocks(true);
      let updatedCount = 0;
      let batch = writeBatch(db);
      let batchOps = 0;

      for (const item of acceptances) {
        if (pastBlock(isSuperAdmin ? 'super_admin' : 'x', 'nt', item.month) || pastBlock(isSuperAdmin ? 'super_admin' : 'x', 'nt', (item as any).ntMonth)) continue; // kỳ đã khoá
        const resolved = resolveBlockForTeam(item, blocks, teams, teamLookup.findTeam);
        const curBlockName = item.blockName || '';
        const curBlockCode = item.blockCode || '';
        const curBlockId = item.blockId || '';

        const targetBlockName = resolved.blockName || '';
        const targetBlockCode = resolved.blockCode || '';
        const targetBlockId = resolved.blockId || '';

        if (
          (targetBlockName && targetBlockName !== curBlockName) ||
          (targetBlockCode && targetBlockCode !== curBlockCode) ||
          (targetBlockId && targetBlockId !== curBlockId)
        ) {
          const docRef = doc(db, 'acceptances', item.id);
          batch.update(docRef, {
            blockId: targetBlockId,
            blockCode: targetBlockCode,
            blockName: targetBlockName,
            updatedAt: serverTimestamp()
          });
          updatedCount++;
          batchOps++;

          if (batchOps >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            batchOps = 0;
          }
        }
      }

      if (batchOps > 0) {
        await batch.commit();
      }

      if (updatedCount > 0) {
        toast.success(`Đã tự động đồng bộ thông tin Khối cho ${updatedCount} bản ghi nghiệm thu!`);
      } else {
        toast.info('Tất cả bản ghi nghiệm thu đã đồng bộ đúng thông tin Khối theo phòng kinh doanh.');
      }
    } catch (err: any) {
      console.error('Error syncing blocks:', err);
      toast.error(`Đồng bộ thất bại: ${err?.message || 'Có lỗi xảy ra'}`);
    } finally {
      setIsSyncingBlocks(false);
    }
  };

  // Excel Import

  // Mouse drag horizontal scrolling for table & navigation helpers
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingTable, setIsDraggingTable] = useState(false);

  // Scroll navigation helpers
  const handleScrollBy = (amount: number) => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  const handleScrollToColumnGroup = (group: 'info' | 'digital' | 'visa' | 'posting' | 'personal' | 'total' | 'status') => {
    if (!tableContainerRef.current) return;
    const positions: Record<string, number> = {
      info: 0,
      total: 700, // TỔNG sits right after DỰ ÁN
      digital: 850,
      visa: 1390,
      posting: 1930,
      personal: 2180,
      status: 2550
    };
    tableContainerRef.current.scrollTo({ left: positions[group] ?? 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const slider = tableContainerRef.current;
    if (!slider) return;

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasMoved = false;
    let lastClientX = 0;
    let lastTime = 0;
    let velocityX = 0; // px/ms
    let inertiaRaf: number | null = null;

    // Prevent default HTML5 drag-and-drop ghosting
    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Only drag on primary mouse button (left click)
      if (e.button !== 0) return;

      if (inertiaRaf) {
        cancelAnimationFrame(inertiaRaf);
        inertiaRaf = null;
      }

      const target = e.target as HTMLElement;
      // Don't drag if clicking inside editable text inputs, dropdown selects, textarea, or button controls
      if (target.closest('input:not([type="checkbox"]), select, textarea, button, a, [role="button"], .no-drag, [data-no-drag]')) {
        return;
      }

      isDown = true;
      hasMoved = false;
      startX = e.clientX;
      lastClientX = e.clientX;
      lastTime = performance.now();
      velocityX = 0;
      startScrollLeft = slider.scrollLeft;

      // Prevent native text selection highlight from interfering with drag
      e.preventDefault();

      slider.classList.add('cursor-grabbing');
      slider.classList.remove('cursor-grab');
      document.body.style.userSelect = 'none';
      setIsDraggingTable(true);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const currentX = e.clientX;
      const dx = currentX - startX;

      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        const instantVelocity = (lastClientX - currentX) / dt;
        velocityX = 0.7 * instantVelocity + 0.3 * velocityX;
        lastClientX = currentX;
        lastTime = now;
      }

      if (Math.abs(dx) > 3) {
        hasMoved = true;
        e.preventDefault();
      }

      slider.scrollLeft = startScrollLeft - dx;
    };

    const handleMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      setIsDraggingTable(false);
      slider.classList.remove('cursor-grabbing');
      slider.classList.add('cursor-grab');
      document.body.style.userSelect = '';

      // Smooth kinetic momentum scroll on release if dragged with speed
      if (hasMoved && Math.abs(velocityX) > 0.12) {
        let currentVelocity = velocityX * 16;
        const friction = 0.93;

        const glide = () => {
          if (Math.abs(currentVelocity) < 0.3) {
            inertiaRaf = null;
            return;
          }
          slider.scrollLeft += currentVelocity;
          currentVelocity *= friction;
          inertiaRaf = requestAnimationFrame(glide);
        };
        inertiaRaf = requestAnimationFrame(glide);
      }
    };

    // Prevent accidental click actions when user finishes a drag gesture
    const handleClickCapture = (e: MouseEvent) => {
      if (hasMoved) {
        e.stopPropagation();
        e.preventDefault();
        hasMoved = false;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        slider.scrollLeft += e.deltaY * 1.2;
      }
    };

    slider.addEventListener('dragstart', handleDragStart);
    slider.addEventListener('mousedown', handleMouseDown);
    slider.addEventListener('click', handleClickCapture, true);
    slider.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (inertiaRaf) {
        cancelAnimationFrame(inertiaRaf);
      }
      slider.removeEventListener('dragstart', handleDragStart);
      slider.removeEventListener('mousedown', handleMouseDown);
      slider.removeEventListener('click', handleClickCapture, true);
      slider.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* 🌟 Header & Action Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--mh-surface)] p-4 rounded-3xl border border-[var(--mh-border)] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white p-2.5 rounded-2xl shadow-md shadow-indigo-100">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-black text-[var(--mh-text)] uppercase tracking-tight flex items-center gap-2">
              <span>Báo cáo Nghiệm thu Marketing</span>
              <Badge className="bg-indigo-50 text-indigo-700 border-none font-extrabold text-[10px] px-2 py-0.5">
                Chuẩn công thức VAT & Kỳ
              </Badge>
            </h1>
            <p className="text-xs text-[var(--mh-text-2)] font-medium">
              Chỉ riêng Tháng 8 chia 2 kỳ (Kì 1 - Kì 2) | Các tháng khác hiển thị chuẩn MM.YYYY (VD: 09.2026) | VAT 10% & 8% | Tổng cột K+Q+S+Y
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <Button
              onClick={handleAddDraftRow}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs h-9 px-3.5 rounded-2xl shadow-md shadow-indigo-100 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Thêm dòng
            </Button>
          )}

          <Button
            variant="outline"
            data-testid="nt-supp-view"
            onClick={() => { setSuppView((v) => !v); setCurrentPage(1); }}
            className={`font-black text-xs h-9 px-3 rounded-2xl flex items-center gap-1.5 ${suppView ? 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700' : 'border-orange-300 text-orange-700 hover:bg-orange-50'}`}
          >
            Nghiệm thu bổ sung
            {suppPendingTotal > 0 && <span className={`rounded-full px-1.5 text-[10px] ${suppView ? 'bg-[var(--mh-surface)] text-orange-700' : 'bg-orange-600 text-white'}`}>{suppPendingTotal}</span>}
          </Button>

          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="border-[var(--mh-border)] text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)] font-black text-xs h-9 px-3 rounded-2xl flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Xuất Excel
          </Button>
        </div>
      </div>

      {suppView && (
        <Card className="border border-orange-200 shadow-sm bg-orange-50/40 rounded-3xl" data-testid="nt-supp-panel">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-black text-orange-800">Nghiệm thu bổ sung</div>
                <div className="text-[11px] text-[var(--mh-text-2)]">Bản ghi bổ sung MỚI cho các kỳ đã khoá, gửi trong kỳ này (bản gốc không bị sửa). Super Admin <b>Duyệt</b> thì bản được ghi và tính vào kỳ gốc — vẫn liệt kê ở đây để theo dõi nhưng không tính vào tổng kỳ này; chưa duyệt / từ chối thì không tính.{canApproveSupp ? '' : ' (Chỉ Super Admin duyệt.)'}</div>
              </div>
              <div className="flex gap-1">
                {(['pending', 'approved', 'rejected', 'all'] as const).map((k) => (
                  <button key={k} onClick={() => { setSuppStatusFilter(k); setCurrentPage(1); }} className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${suppStatusFilter === k ? 'bg-orange-600 text-white border-orange-600' : 'bg-[var(--mh-surface)] text-[var(--mh-text)] border-[var(--mh-border)]'}`}>
                    {k === 'all' ? 'Tất cả' : SUPP_STATUS_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(suppCountMap).sort((a, b) => b[0].localeCompare(a[0])).map(([m, c]) => (
                <div key={m} className="bg-[var(--mh-surface)] border border-orange-200 rounded-2xl px-3 py-2 text-[11px]">
                  <div className="font-black text-orange-800">Bổ sung T{+m.split('-')[1]}/{m.split('-')[0]} · {c.total} bản</div>
                  <div className="text-[var(--mh-text-2)]"><span className="text-amber-600 font-bold">{c.pending} chờ</span> · <span className="text-emerald-700 font-bold">{c.approved} duyệt</span> · <span className="text-red-600 font-bold">{c.rejected} từ chối</span></div>
                </div>
              ))}
              {Object.keys(suppCountMap).length === 0 && <div className="text-[11px] text-[var(--mh-text-2)]">Chưa có bản bổ sung nào.</div>}
            </div>
            {displayedRecords.length > 0 && (
              <div className="overflow-x-auto bg-[var(--mh-surface)] rounded-2xl border border-[var(--mh-border)]">
                <table className="w-full text-[11px]">
                  <thead className="bg-[var(--mh-surface-2)] text-[var(--mh-text-2)] uppercase text-[10px]"><tr>
                    <th className="p-2 text-left">Bổ sung</th><th className="p-2 text-left">Lưu ở kỳ</th><th className="p-2 text-left">Phòng</th><th className="p-2 text-left">Dự án</th><th className="p-2 text-left">Người phụ trách</th><th className="p-2 text-right">Tổng</th><th className="p-2 text-left">Trạng thái</th><th className="p-2"></th>
                  </tr></thead>
                  <tbody>
                    {displayedRecords.map((a: any) => {
                      const st = suppStatus(a) as 'pending';
                      const fc = suppFileCount(a.id);
                      const missMsg = (st as string) !== 'approved' ? suppMissingFiles(fc.img, fc.inv) : '';
                      const missBadge = (st as string) !== 'approved' ? suppMissingBadge(fc.img, fc.inv) : '';
                      const hist = Array.isArray(a.supplementHistory) ? a.supplementHistory : [];
                      return (
                        <React.Fragment key={a.id}>
                          <tr className="border-t border-[var(--mh-border)]" data-testid="nt-supp-row">
                            <td className="p-2"><Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 font-black text-[10px]">{suppBadge(a)}</Badge>
                              {st === ('approved' as any) && a.supplementIn ? <div className="text-[10px] text-emerald-700">Đã ghi vào kỳ T{+String(a.supplementFor).slice(5)}</div> : null}</td>
                            <td className="p-2 font-bold">{suppIn(a)}</td>
                            <td className="p-2">{a.teamName || a.teamCode}</td>
                            <td className="p-2">{a.projectName}</td>
                            <td className="p-2">{implementerLabel(a)}</td>
                            <td className="p-2 text-right font-bold tabular-nums">{formatCurrency(Number(a.totalCost ?? a.grandTotal ?? 0))}</td>
                            <td className="p-2"><span className={`font-bold ${st === 'pending' ? 'text-amber-600' : (st as string) === 'approved' ? 'text-emerald-700' : 'text-red-600'}`}>{SUPP_STATUS_LABEL[st]}</span>{a.supplementNote ? <div className="text-[10px] text-[var(--mh-text-2)]">{a.supplementNote}</div> : null}
                              {(st as string) !== 'approved' && (missBadge
                                ? <div data-testid="nt-supp-missing" title={missMsg} className="mt-0.5 inline-block rounded-full bg-red-50 border border-red-300 px-1.5 text-[10px] font-bold text-red-700">⚠ {missBadge}</div>
                                : <div data-testid="nt-supp-files-ok" className="mt-0.5 text-[10px] font-bold text-emerald-700">✓ {fc.img} ảnh · {fc.inv} HĐ</div>)}
                              {canApproveSupp && missMsg ? <div className="text-[10px] text-red-600">{missMsg}</div> : null}</td>
                            <td className="p-2 whitespace-nowrap text-right space-x-1">
                              {canApproveSupp && st !== ('approved' as any) && <button data-testid="nt-supp-approve" disabled={suppBusy === a.id || !!missMsg} title={missMsg || 'Duyệt bản bổ sung'} onClick={() => handleSuppDecision(a, 'approved')} className={`px-2 py-1 rounded-lg text-white font-bold ${missMsg ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600'}`}>Duyệt</button>}
                              {canApproveSupp && st !== ('rejected' as any) && <button disabled={suppBusy === a.id} onClick={() => handleSuppDecision(a, 'rejected')} className="px-2 py-1 rounded-lg bg-red-600 text-white font-bold">Từ chối</button>}
                              {canApproveSupp && st !== 'pending' && <button disabled={suppBusy === a.id} onClick={() => handleSuppDecision(a, 'pending')} className="px-2 py-1 rounded-lg border border-[var(--mh-border-strong)] font-bold">Đặt lại</button>}
                              {showNtUpload && (st as string) !== 'approved' && <button data-testid="nt-supp-upload-img" onClick={() => setNtUploadFor(a)} className="px-2 py-1 rounded-lg bg-[var(--mh-navy)] text-white font-bold">⬆ Ảnh ({fc.img})</button>}
                              {showNtInvoice && (st as string) !== 'approved' && <button data-testid="nt-supp-upload-inv" onClick={() => setNtInvoiceFor(a)} className="px-2 py-1 rounded-lg bg-[#0E7C66] text-white font-bold">🧾 HĐ ({fc.inv})</button>}
                              <button onClick={() => setSuppHistFor(suppHistFor === a.id ? null : a.id)} className="px-2 py-1 rounded-lg border border-[var(--mh-border-strong)] font-bold">Lịch sử ({hist.length})</button>
                            </td>
                          </tr>
                          {suppHistFor === a.id && (
                            <tr><td colSpan={8} className="p-2 bg-[var(--mh-surface-2)]">
                              {hist.slice().reverse().map((h: any, i: number) => (
                                <div key={i} className="text-[10px] text-[var(--mh-text-2)]">{String(h.at || '').replace('T', ' ').slice(0, 16)} · {h.by} · {h.from ? SUPP_STATUS_LABEL[h.from as 'pending'] + ' → ' : ''}{SUPP_STATUS_LABEL[h.to as 'pending'] || h.to}{h.note ? ` — ${h.note}` : ''}</div>
                              ))}
                            </td></tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 🔍 Filters Card */}
      <Card className="border-none shadow-sm bg-[var(--mh-surface)] rounded-3xl overflow-visible">
        <CardHeader className="p-4 pb-2 border-b border-[var(--mh-border)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {/* Search */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-wider ml-1">Tìm kiếm</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                <Input
                  placeholder="Tìm dự án, team, GĐKD..."
                  value={acceptanceSearch}
                  onChange={(e) => setAcceptanceSearch(e.target.value)}
                  className="pl-8 h-8 text-xs font-bold bg-[var(--mh-surface-2)] border-[var(--mh-border)] rounded-xl"
                />
              </div>
            </div>

            {/* Filter Month */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-wider ml-1">Kỳ / Tháng</Label>
              <Select value={acceptanceMonthFilter} onValueChange={setAcceptanceMonthFilter}>
                <SelectTrigger className="h-8 bg-[var(--mh-surface-2)] border-[var(--mh-border)] rounded-xl text-xs font-bold">
                  <SelectValue placeholder="Tất cả tháng" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="all">Tất cả kỳ / tháng</SelectItem>
                  {uniqueMonths.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter Block */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-wider ml-1">Khối</Label>
              <Select value={acceptanceBlockFilter} onValueChange={setAcceptanceBlockFilter}>
                <SelectTrigger className="h-8 bg-[var(--mh-surface-2)] border-[var(--mh-border)] rounded-xl text-xs font-bold">
                  <SelectValue placeholder="Tất cả các khối" />
                </SelectTrigger>
                <SelectContent searchable className="max-h-56">
                  <SelectItem value="all">Tất cả các khối</SelectItem>
                  {(blocks || []).map((b: any) => (
                    <SelectItem key={b.id || b.blockCode} value={b.id || b.blockCode}>
                      {b.name || b.blockCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter Team */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-wider ml-1">Team</Label>
              <AcceptanceSearchableSelect
                value={acceptanceTeamFilter}
                onValueChange={setAcceptanceTeamFilter}
                items={filterTeamItems}
                placeholder="Tất cả Team"
                searchPlaceholder="Tìm kiếm Team, mã Team..."
                triggerClassName="h-8 bg-[var(--mh-surface-2)] border-[var(--mh-border)] rounded-xl text-xs font-bold"
                contentClassName="max-h-72 w-[280px] sm:w-[320px]"
              />
            </div>

            {/* Filter Project */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-wider ml-1">Dự án</Label>
              <AcceptanceSearchableSelect
                value={acceptanceProjectFilter}
                onValueChange={setAcceptanceProjectFilter}
                items={filterProjectItems}
                placeholder="Tất cả Dự án"
                searchPlaceholder="Tìm kiếm dự án, mã dự án..."
                triggerClassName="h-8 bg-[var(--mh-surface-2)] border-[var(--mh-border)] rounded-xl text-xs font-bold"
                contentClassName="max-h-72 w-[280px] sm:w-[320px]"
              />
            </div>
          </div>

          {/* Bulk Selection Notification Bar */}
          {canDelete && selectedAcceptanceIds.length > 0 && (
            <div className="mt-3 bg-rose-50 border border-rose-100 py-2 px-4 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-rose-900 font-extrabold text-xs">
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Đã chọn {selectedAcceptanceIds.length} dòng nghiệm thu</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedAcceptanceIds([])}
                  className="h-7 rounded-xl font-bold text-[10px] bg-[var(--mh-surface)] border-rose-200 text-rose-700"
                >
                  Bỏ chọn
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsBulkDeleteDialogOpen(true)}
                  className="h-7 rounded-xl font-bold text-[10px] bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Xóa {selectedAcceptanceIds.length} dòng đã chọn
                </Button>
              </div>
            </div>
          )}
        </CardHeader>

        {/* 🧭 Horizontal Navigation & Column Jump Toolbar */}
        <div className="bg-[var(--mh-surface-2)] border-b border-[var(--mh-border)] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black text-[var(--mh-text-2)] uppercase tracking-wider flex items-center gap-1 mr-1">
              <MoveHorizontal className="w-3.5 h-3.5 text-indigo-600" /> Nhảy tới cột:
            </span>

            <button
              type="button"
              onClick={() => handleScrollToColumnGroup('info')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[var(--mh-surface)] text-[var(--mh-text)] hover:bg-indigo-50 hover:text-indigo-700 border border-[var(--mh-border)] shadow-2xs transition-colors flex items-center gap-1"
            >
              📌 Team / Dự án
            </button>

            <button
              type="button"
              onClick={() => handleScrollToColumnGroup('digital')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200 shadow-2xs transition-colors flex items-center gap-1"
            >
              <Smartphone className="w-3 h-3 text-sky-600" /> Digital (Cột F-K)
            </button>

            <button
              type="button"
              onClick={() => handleScrollToColumnGroup('visa')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 shadow-2xs transition-colors flex items-center gap-1"
            >
              <CreditCard className="w-3 h-3 text-emerald-600" /> Visa Cty (Cột L-Q)
            </button>

            <button
              type="button"
              onClick={() => handleScrollToColumnGroup('posting')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200 shadow-2xs transition-colors flex items-center gap-1"
            >
              <Newspaper className="w-3 h-3 text-indigo-600" /> Đăng tin Cty (Cột R-S)
            </button>

            <button
              type="button"
              onClick={() => handleScrollToColumnGroup('personal')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 shadow-2xs transition-colors flex items-center gap-1"
            >
              <User className="w-3 h-3 text-amber-600" /> Cá nhân
            </button>

            <button
              type="button"
              onClick={() => handleScrollToColumnGroup('total')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200 shadow-2xs transition-colors flex items-center gap-1"
            >
              💰 TỔNG
            </button>

            <button
              type="button"
              onClick={() => handleScrollToColumnGroup('status')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-50 text-cyan-800 hover:bg-cyan-100 border border-cyan-200 shadow-2xs transition-colors flex items-center gap-1"
            >
              <CheckCheck className="w-3 h-3 text-cyan-600" /> Nộp tiền / Trạng thái
            </button>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] font-medium text-[var(--mh-text-3)] hidden lg:inline mr-1">
              🖐 Nhấn giữ chuột & kéo sang ngang
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleScrollBy(-350)}
              className="h-7 px-2 text-[11px] font-bold bg-[var(--mh-surface)] text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)] rounded-lg border-[var(--mh-border)]"
              title="Cuộn sang trái 350px"
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Trái
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleScrollBy(350)}
              className="h-7 px-2 text-[11px] font-bold bg-[var(--mh-surface)] text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)] rounded-lg border-[var(--mh-border)]"
              title="Cuộn sang phải 350px"
            >
              Phải <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>
        </div>

        {/* 📱 Mobile card list + bottom sheet (P0 redesign) */}
        <div className="md:hidden border-t border-[var(--mh-border)]" data-mh-acc-mobile>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#F8FAFC] border-b border-[var(--mh-border)]">
            <span className="text-xs font-semibold text-[var(--mh-text-2)]">
              {paginatedRecords.length}/{displayedRecords.length} bản ghi
            </span>
            <div className="flex p-0.5 bg-[var(--mh-surface)] border border-[var(--mh-border)] rounded-lg">
              <button
                type="button"
                onClick={() => setMobileViewMode('cards')}
                className={`h-7 px-2.5 text-[11px] font-semibold rounded-md ${mobileViewMode === 'cards' ? 'bg-[var(--mh-navy)] text-white' : 'text-[var(--mh-text-2)]'}`}
              >
                Thẻ
              </button>
              <button
                type="button"
                onClick={() => { if (window.innerWidth >= 768) setMobileViewMode('table'); }}
                className={`h-7 px-2.5 text-[11px] font-semibold rounded-md ${mobileViewMode === 'table' ? 'bg-[var(--mh-navy)] text-white' : 'text-[var(--mh-text-2)]'}`}
              >
                Bảng
              </button>
            </div>
          </div>

          {mobileViewMode === 'cards' && (
            <div className="p-3 space-y-2.5 bg-[var(--mh-bg)]">
              {(() => { const t = ntTotals(displayedRecords.filter(ntCountsInTotals)); return (
                <div className="rounded-[10px] border border-[var(--mh-navy)]/30 bg-[var(--mh-navy-50)] p-3.5" data-testid="vn-acc-total-card">
                  <div className="flex items-center justify-between mb-2"><div className="font-bold text-[13.5px] text-[var(--mh-text)]">Tổng {t.count} bản ghi đang lọc</div><div className="text-[11px] text-[var(--mh-text-2)]">theo bộ lọc / tìm kiếm</div></div>
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div><div className="text-[10.5px] text-[var(--mh-text-2)]">Trước VAT</div><div className="font-semibold tabular-nums">{formatCurrency(t.preVat)}</div></div>
                    <div><div className="text-[10.5px] text-[var(--mh-text-2)]">VAT</div><div className="font-semibold tabular-nums">{formatCurrency(t.vat)}</div></div>
                    <div><div className="text-[10.5px] text-[var(--mh-text-2)]">Tổng NT</div><div className="font-bold tabular-nums text-[var(--mh-navy)]">{formatCurrency(t.total)}</div></div>
                    <div><div className="text-[10.5px] text-[var(--mh-text-2)]">Lead</div><div className="font-semibold tabular-nums">{t.leads.toLocaleString('vi-VN')}</div></div>
                  </div>
                </div>
              ); })()}
              {paginatedRecords.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-[#CBD5E1] bg-[var(--mh-surface)] p-6 text-center text-sm text-[var(--mh-text-2)]">
                  Không có bản ghi nghiệm thu khớp bộ lọc.
                </div>
              ) : (
                paginatedRecords.map((item: any) => {
                  const total = Number(item.totalCost ?? item.grandTotal ?? 0);
                  const status = item.status || '—';
                  const isDone = String(status).toLowerCase().includes('nghiệm thu') || String(status).toLowerCase().includes('done');
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setMobileSheetItem(item);
                        if (canEdit) {
                          setEditingRowId(item.id);
                          setEditingRowState({ ...item });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setMobileSheetItem(item);
                          if (canEdit) {
                            setEditingRowId(item.id);
                            setEditingRowState({ ...item });
                          }
                        }
                      }}
                      className="w-full text-left rounded-[10px] border border-[var(--mh-border)] bg-[var(--mh-surface)] p-3.5 shadow-sm active:scale-[0.99] transition"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[13.5px] text-[var(--mh-text)] truncate">
                            {item.projectName || projectMap[item.projectId] || 'Chưa có dự án'}
                          </div>
                          <div className="text-[12px] text-[var(--mh-text-2)] truncate mt-0.5">
                            {item.teamName || teamMap[item.teamId] || '—'}
                            {item.teamCode ? ` · ${item.teamCode}` : ''}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${isDone ? 'bg-[#E7F5EF] text-[var(--mh-ok)]' : 'bg-[var(--mh-surface-2)] text-[var(--mh-text-2)]'}`}>
                          {status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[12px]">
                        <div>
                          <div className="text-[10.5px] text-[var(--mh-text-3)]">Tháng</div>
                          <div className="font-semibold tabular-nums text-[var(--mh-text)]">{item.month || '—'}</div>
                          {isSupplement(item) && <div className="text-[10px] font-black text-orange-700" data-testid="nt-supp-badge-m">{suppBadge(item)} · {SUPP_STATUS_LABEL[suppStatus(item) as 'pending']}</div>}
                        </div>
                        <div>
                          <div className="text-[10.5px] text-[var(--mh-text-3)]">Tổng NT</div>
                          <div className="font-bold tabular-nums text-[var(--mh-navy)]">{formatCurrency(total)}</div>
                        </div>
                        <div>
                          <div className="text-[10.5px] text-[var(--mh-text-3)]">Lead</div>
                          <div className="font-semibold tabular-nums">{item.caNhanNopTien ?? item.leads ?? '—'}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-[12px] text-[var(--mh-text-2)] truncate" data-testid="vn-acc-card-implementer">
                        Người phụ trách: <span className="font-semibold text-[var(--mh-text)]">{implementerLabel(item) || 'Chưa gán'}</span>
                      </div>
                      {showNtUpload && (
                        <button
                          type="button"
                          data-testid="vn-acc-upload-card"
                          onClick={(e) => { e.stopPropagation(); setNtUploadFor(item); }}
                          className="mt-2.5 inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--mh-navy)] px-3 text-[12px] font-semibold text-white"
                        >
                          ⬆ Tải ảnh
                        </button>
                      )}
                      {showNtInvoice && (
                        <button type="button" data-testid="vn-acc-invoice-card"
                          onClick={(e) => { e.stopPropagation(); setNtInvoiceFor(item); }}
                          className="mt-2.5 ml-2 inline-flex h-8 items-center gap-1 rounded-lg bg-[#0E7C66] px-3 text-[12px] font-semibold text-white">
                          🧾 Tải Hóa Đơn
                        </button>
                      )}
                      <button type="button" data-testid="vn-acc-adlinks-card"
                        onClick={(e) => { e.stopPropagation(); setAdLinksFor(item); }}
                        className="mt-2.5 ml-2 inline-flex h-8 items-center gap-1 rounded-lg bg-[#6D28D9] px-3 text-[12px] font-semibold text-white">
                        🔗 Link QC{Array.isArray(item.adLinks) && item.adLinks.length ? ` (${item.adLinks.length})` : ''}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* 📊 Main Data Table */}
        <CardContent className={`p-0 relative ${mobileViewMode === 'cards' ? 'hidden md:block' : ''}`}>
          <div className="py-2 px-4 bg-[var(--mh-surface-2)] border-b border-[var(--mh-border)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--mh-text)]">Hiển thị mỗi trang:</span>
              <Select 
                value={String(pageSize)} 
                onValueChange={(val) => {
                  setPageSize(val === 'all' ? 'all' : Number(val));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-7 text-xs w-[110px] bg-[var(--mh-surface)] border-[var(--mh-border)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25" className="text-xs">25 dòng</SelectItem>
                  <SelectItem value="50" className="text-xs">50 dòng</SelectItem>
                  <SelectItem value="100" className="text-xs">100 dòng</SelectItem>
                  <SelectItem value="200" className="text-xs">200 dòng</SelectItem>
                  <SelectItem value="all" className="text-xs">Tất cả ({displayedRecords.length})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[var(--mh-text-2)]">
                Tổng cộng: <strong className="text-[var(--mh-text)]">{displayedRecords.length}</strong> bản ghi
                {pageSize !== 'all' && totalPages > 1 && (
                  <> (Trang <strong className="text-indigo-600">{currentPage}</strong>/{totalPages})</>
                )}
              </span>
            </div>
          </div>

          <div
            ref={tableContainerRef}
            className="overflow-x-auto overflow-y-auto max-h-[72vh] lg:max-h-[max(360px,calc(100dvh-172px))] cursor-grab border-b border-[var(--mh-border)] select-none scrollbar-thin scrollbar-thumb-slate-300 overscroll-contain [-webkit-overflow-scrolling:touch] touch-pan-x"
          >
            <table className="w-full text-left border-collapse min-w-[1800px] sm:min-w-[2400px] caption-bottom text-[11px] sm:text-sm [&_th]:px-1.5 [&_td]:px-1 sm:[&_th]:px-2 sm:[&_td]:px-2">
              <AcceptanceTableHeader
                sortConfig={sortConfig}
                onSort={handleSort}
                selectedAcceptanceIds={selectedAcceptanceIds}
                onSelectAll={(checked) => {
                  if (checked) {
                    setSelectedAcceptanceIds(displayedRecords.map((r: any) => r.id));
                  } else {
                    setSelectedAcceptanceIds([]);
                  }
                }}
                isAllSelected={displayedRecords.length > 0 && selectedAcceptanceIds.length === displayedRecords.length}
                canDelete={canDelete}
              />

              <TableBody>
                {/* 1. Draft Rows for Inline Addition */}
                {draftRows.map((draft, idx) => (
                  <AcceptanceDraftRow
                    key={draft.id}
                    draftRow={draft}
                    index={idx}
                    teams={teams}
                    projects={projects}
                    blocks={blocks}
                    monthsList={uniqueMonths}
                    teamItems={baseTeamItems}
                    projectItems={baseProjectItems}
                    nsLines={nsLines}
                    nsSupport={nsSupport}
                    findTeam={teamLookup.findTeam}
                    findProject={projectLookup.findProject}
                    formatCurrency={formatCurrency}
                    onSaveDraft={handleSaveDraft}
                    onRemoveDraft={handleRemoveDraft}
                    onOpenCalculator={handleOpenCalculator}
                    allUsers={allUsers}
                    canManualAssignee={canManualAssignee}
                    suppAllowed={suppOpenFor(draft.month)}
                  />
                ))}

                {/* 2. Main Data Records (Paginated) */}
                {displayedRecords.length === 0 && draftRows.length === 0 ? (
                  <tr>
                    <td colSpan={28} className="text-center py-16 text-[var(--mh-text-3)] font-semibold text-xs bg-[var(--mh-surface-2)]/50">
                      Không có bản ghi nghiệm thu nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((item: any, idx: number) => {
                    const globalIdx = (pageSize === 'all' ? 0 : (currentPage - 1) * pageSize) + idx;
                    return (
                      <AcceptanceRow
                        key={item.id}
                        item={item}
                        index={globalIdx}
                        isFinalizedView={false}
                        isSelected={selectedAcceptanceIds.includes(item.id)}
                        isEditing={editingRowId === item.id}
                        editingState={editingRowState}
                        teams={teams}
                        projects={projects}
                        blocks={blocks}
                        monthsList={uniqueMonths}
                        teamItems={baseTeamItems}
                        projectItems={baseProjectItems}
                        nsLines={nsLines}
                        nsSupport={nsSupport}
                        teamIdSet={teamIdSet}
                        projectIdSet={projectIdSet}
                        findTeam={teamLookup.findTeam}
                        findProject={projectLookup.findProject}
                        formatCurrency={formatCurrency}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onSelectRow={handleSelectRow}
                        onStartEdit={handleStartEdit}
                        onCancelEdit={handleCancelEdit}
                        onSaveEdit={handleSaveEdit}
                        onOpenCalculator={handleOpenCalculator}
                        onDelete={handleOpenDeleteModal}
                        onOpenHistory={handleOpenHistoryModal}
                        renderBreakdownTooltip={renderBreakdownTooltip}
                        onUploadImages={showNtUpload ? openNtUpload : undefined}
                        onUploadInvoices={showNtInvoice ? setNtInvoiceFor : undefined}
                        onOpenAdLinks={setAdLinksFor}
                        allUsers={allUsers}
                        onAssignImplementer={canEdit ? handleAssignImplementer : undefined}
                        onAssignTeam={canEdit ? handleAssignTeam : undefined}
                        onAssignManual={canManualAssignee ? handleAssignManual : undefined}
                      />
                    );
                  })
                )}
              </TableBody>

              <AcceptanceFooter
                records={displayedRecords.filter(ntCountsInTotals)}
                formatCurrency={formatCurrency}
              />
            </table>
          </div>

          {/* 📄 Pagination Bar */}
          {pageSize !== 'all' && totalPages > 1 && (
            <div className="py-2.5 px-4 bg-[var(--mh-surface-2)] border-t border-[var(--mh-border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--mh-text-2)]">
              <div className="flex items-center gap-2">
                <span>
                  Hiển thị <span className="font-semibold text-[var(--mh-text)]">{(currentPage - 1) * pageSize + 1}</span> - <span className="font-semibold text-[var(--mh-text)]">{Math.min(currentPage * pageSize, displayedRecords.length)}</span> trên <span className="font-semibold text-[var(--mh-text)]">{displayedRecords.length}</span> bản ghi
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="h-7 w-7 p-0 bg-[var(--mh-surface)]"
                  title="Trang đầu"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-7 px-2.5 gap-1 bg-[var(--mh-surface)]"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Trước</span>
                </Button>

                <span className="px-2 font-medium text-[var(--mh-text)]">
                  Trang <span className="font-bold text-indigo-600">{currentPage}</span> / {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-7 px-2.5 gap-1 bg-[var(--mh-surface)]"
                >
                  <span className="hidden sm:inline">Sau</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="h-7 w-7 p-0 bg-[var(--mh-surface)]"
                  title="Trang cuối"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 💬 Dialogs (Calculator, Delete, History, Import) */}

      {/* Mobile bottom sheet editor */}
      {mobileSheetItem && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-[var(--mh-text)]/45" onClick={() => { setMobileSheetItem(null); setEditingRowId(null); setEditingRowState(null); }} />
          <div className="relative mt-auto w-full max-h-[88vh] bg-[var(--mh-surface)] rounded-t-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--mh-border)]">
              <div className="min-w-0">
                <div className="font-bold text-[15px] truncate">{mobileSheetItem.projectName || 'Chi tiết nghiệm thu'}</div>
                <div className="text-[12px] text-[var(--mh-text-2)] truncate">{mobileSheetItem.teamName} · {mobileSheetItem.month}</div>
              </div>
              <button type="button" className="h-8 w-8 grid place-items-center rounded-lg hover:bg-[var(--mh-surface-2)]" onClick={() => { setMobileSheetItem(null); setEditingRowId(null); setEditingRowState(null); }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3 pb-8">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Digital (sau VAT)', mobileSheetItem.digitalTotalSauVat ?? mobileSheetItem.digitalCost],
                  ['Visa Cty (sau VAT)', mobileSheetItem.visaTotalSauVat ?? mobileSheetItem.visaCost],
                  ['Đăng tin Cty', mobileSheetItem.dangTinCtySauVat ?? mobileSheetItem.postingCost],
                  ['Cá nhân ngoài', mobileSheetItem.caNhanTotal ?? mobileSheetItem.caNhanCost],
                  ['Tổng nghiệm thu', mobileSheetItem.totalCost ?? mobileSheetItem.grandTotal],
                  ['Tiền trên Hóa đơn', mobileSheetItem.hoaDonTien],
                  ['Tiền Hóa đơn Nợ', mobileSheetItem.hoaDonNo],
                  ['Số Lead', mobileSheetItem.caNhanNopTien],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-[10px] border border-[var(--mh-border)] p-3 bg-[#F8FAFC]">
                    <div className="text-[11px] text-[var(--mh-text-2)] mb-1">{label}</div>
                    <div className="font-bold tabular-nums text-[var(--mh-text)] text-[14px]">
                      {typeof val === 'number' || (val !== undefined && val !== null && val !== '' && !Number.isNaN(Number(val)))
                        ? (String(label).includes('Lead') ? String(val) : formatCurrency(Number(val || 0)))
                        : '—'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-[10px] border border-[var(--mh-border)] p-3 flex items-center gap-2" data-testid="vn-acc-sheet-implementer">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-[var(--mh-text-2)] mb-1">Người phụ trách</div>
                  <div className="text-sm font-semibold text-[var(--mh-text)] truncate">{implementerLabel(mobileSheetItem) || 'Chưa gán'}</div>
                </div>
                {canManualAssignee && ntManualAllowed(mobileSheetItem.month) && (
                  <Button variant="outline" className="h-9 rounded-lg text-[12px]" data-testid="vn-acc-sheet-manual" onClick={() => setSheetManualOpen(true)}>✎ Khác – tự nhập</Button>
                )}
              </div>
              <ManualAssigneeDialog open={sheetManualOpen} initial={isManualImplementer(mobileSheetItem) ? mobileSheetItem.implementerName : ''} onClose={() => setSheetManualOpen(false)}
                onSave={async (n) => { await handleAssignManual(mobileSheetItem, n); setMobileSheetItem((p: any) => p ? { ...p, implementerUid: '', implementerName: n, implementerManual: true } : p); }} />
              {mobileSheetItem.notes && (
                <div className="rounded-[10px] border border-[var(--mh-border)] p-3">
                  <div className="text-[11px] text-[var(--mh-text-2)] mb-1">Ghi chú</div>
                  <div className="text-sm text-[var(--mh-text)]">{mobileSheetItem.notes}</div>
                </div>
              )}
              <p className="text-[12px] text-[var(--mh-text-2)]">
                {canEdit
                  ? 'Chạm "Sửa trên bảng" để chỉnh chi tiết đầy đủ (sticky Tháng đã hỗ trợ trên mobile).'
                  : 'Bạn chỉ có quyền xem. Liên hệ admin nếu cần chỉnh sửa.'}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-10 rounded-lg"
                  onClick={() => { setMobileSheetItem(null); setMobileViewMode('table'); }}
                >
                  Xem dạng bảng
                </Button>
                {showNtUpload && (
                  <Button
                    data-testid="vn-acc-upload-mobile"
                    className="flex-1 h-10 rounded-lg bg-[var(--mh-navy)] hover:bg-[var(--mh-navy-hover)] text-white"
                    onClick={() => { const it = mobileSheetItem; setMobileSheetItem(null); setNtUploadFor(it); }}
                  >
                    ⬆ Tải ảnh
                  </Button>
                )}
                {showNtInvoice && (
                  <Button data-testid="vn-acc-invoice-mobile" className="flex-1 h-10 rounded-lg bg-[#0E7C66] hover:bg-[#0B6553] text-white"
                    onClick={() => { const it = mobileSheetItem; setMobileSheetItem(null); setNtInvoiceFor(it); }}>
                    🧾 Tải Hóa Đơn
                  </Button>
                )}
                <Button data-testid="vn-acc-adlinks-mobile" className="flex-1 h-10 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] text-white"
                  onClick={() => { const it = mobileSheetItem; setMobileSheetItem(null); setAdLinksFor(it); }}>
                  🔗 Link QC{Array.isArray(mobileSheetItem.adLinks) && mobileSheetItem.adLinks.length ? ` (${mobileSheetItem.adLinks.length})` : ''}
                </Button>
                {canEdit && (
                  <Button
                    className="flex-1 h-10 rounded-lg bg-[var(--mh-navy)] hover:bg-[var(--mh-navy-hover)] text-white"
                    onClick={() => {
                      setMobileSheetItem(null);
                      setMobileViewMode('table');
                      setEditingRowId(mobileSheetItem.id);
                      setEditingRowState({ ...mobileSheetItem });
                    }}
                  >
                    Sửa trên bảng
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {adLinksFor && (() => {
        const live = (acceptancesRef.current || acceptances || []).find((x: any) => x.id === adLinksFor.id) || adLinksFor;
        const r0 = isSuperAdmin ? 'super_admin' : 'x';
        const lk = lockBlock(r0, 'nt', String(live.month || '')) || pastBlock(r0, 'nt', live.ntMonth);
        const ro = !canEdit || !!lk;
        return (
          <React.Suspense fallback={null}>
            <AdLinksModal item={live} projects={projects} readOnly={ro} readOnlyReason={!canEdit ? 'không có quyền sửa' : (lk || '')}
              onClose={() => setAdLinksFor(null)}
              onSave={async (links) => {
                try { await updateDoc(doc(db, 'acceptances', live.id), { adLinks: links }); toast.success(`Đã lưu ${links.length} link QC`); }
                catch (e: any) { throw new Error(e?.code === 'permission-denied' ? 'Không có quyền hoặc kỳ đã khoá — không lưu được.' : 'Không lưu được: ' + (e?.message || e)); }
              }} />
          </React.Suspense>
        );
      })()}
      {ntInvoiceFor && ntCtx && (
        <React.Suspense fallback={null}>
          <NtInvoiceModal c={ntCtx} record={ntInvoiceFor} onClose={() => setNtInvoiceFor(null)} />
        </React.Suspense>
      )}
      {ntUploadFor && ntCtx && (
        <React.Suspense fallback={null}>
          <NtUploadModal c={ntCtx} record={ntUploadFor} onClose={() => setNtUploadFor(null)} />
        </React.Suspense>
      )}
      <AcceptanceDialogs
        isCalculatorOpen={isCalculatorOpen}
        setIsCalculatorOpen={setIsCalculatorOpen}
        activeCalculatorField={activeCalculatorField}
        calculatorFieldNameVN={calculatorFieldNameVN}
        calculatorInput={calculatorInput}
        setCalculatorInput={setCalculatorInput}
        calculatorUpdateFn={calculatorUpdateFn}
        formatCurrency={formatCurrency}

        isDeleteDialogOpen={isDeleteDialogOpen}
        setIsDeleteDialogOpen={setIsDeleteDialogOpen}
        itemToDeleteId={itemToDeleteId}
        onConfirmDelete={handleConfirmDelete}

        isBulkDeleteDialogOpen={isBulkDeleteDialogOpen}
        setIsBulkDeleteDialogOpen={setIsBulkDeleteDialogOpen}
        selectedCount={selectedAcceptanceIds.length}
        onConfirmBulkDelete={handleConfirmBulkDelete}

        isHistoryDialogOpen={isHistoryDialogOpen}
        setIsHistoryDialogOpen={setIsHistoryDialogOpen}
        historyTargetRecord={historyTargetRecord}

      />
    </div>
  );
});
