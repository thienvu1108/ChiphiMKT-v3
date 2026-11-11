import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { NS_COLLECTION } from '../../lib/vnext/budget';
import { VNEXT_PERIOD_CUTOVER, getPeriodOf } from '../../lib/vnext/period';
import { kyMonthLabel, matchesBanNsFilter, groupByProject, activeFilterCount } from '../lib/banNsFilters';
import { FilterSheet } from '../vnext/ui';
import { banApproverRole } from '../lib/banApprover';
import { normalizeRoleKey } from '../lib/rolePermissions';
import { loadXlsx } from '../lib/loadXlsx';
import { SUPPORT_COLLECTION, splitByStatus, ALL_STATUSES, SUPPORT_LABEL } from '../../lib/vnext/support';
import { usePayMap } from '../vnext/payStatus';
import { exportFileName } from '../../lib/vnext/exportName';
import { excelSupportPctFields } from '../../lib/vnext/supportPct';
import { supportable, effectiveStatus, payOf } from '../../lib/vnext/support';
import { StatusBadge } from '../vnext/statusUi';
import { type BanBudgetStatus, BAN_BUDGET_STATUSES, BAN_BUDGET_STATUS_LABEL } from '../../lib/vnext/banBudgetStatus';
function BanBudgetStatusBadge({ status }: { status?: BanBudgetStatus }) {
  if (status === 'approved' || status === 'pending' || status === 'rejected' || status === 'reapproval' || status === 'need_pay') return <StatusBadge status={status as any} />;
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--mh-surface-2)] text-[var(--mh-text-2)]">{BAN_BUDGET_STATUS_LABEL[status || 'unknown']}</span>;
}
import { SummaryBox } from '../vnext/statusUi';
import { 
  Briefcase, Building2, Users, Wallet, FileCheck, Search, Filter, 
  Download, Plus, Edit3, Trash2, Shield, AlertCircle, Sparkles,
  ChevronRight, Phone, Mail, UserCheck, Layers, Calendar, ExternalLink,
  Table as TableIcon, LayoutGrid, CheckCircle2, Clock, RefreshCw, FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch, query, where, onSnapshot 
} from '../firestore-proxy';
import { db } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AcceptanceManager } from './AcceptanceManager';
import { BanKd, BanKdContact } from './BanKdManager';
import { findUserByEmail } from '../lib/userIdentity';
import { BanBanner } from '../vnext/BanBanner';
import { BanNsApprovePanel } from '../vnext/BanNsApprovePanel';
import { BAN_STATUS_LABEL, effectiveBanStatus } from '../../lib/vnext/banSupport';
import { banKdLeaderCapabilities, isBanKdDeputy, isBanKdLeader } from '../lib/orgPermissions';
import { planSetDeputy, planUnsetDeputy, planExclusiveSetDeputy, banRoleOf, BAN_ROLE_LABEL, authUidOf, isDeputyOf, roleAfterSetDeputy, roleAfterUnsetDeputy } from '../lib/banRoleSync';
import { BanPendingGate } from '../vnext/BanPendingGate';
import type { VCtx } from '../vnext/ctx';

interface BanKdManagementViewProps {
  banKdList: BanKd[];
  currentActiveBanKd: BanKd | null;
  selectedBanKdId: string;
  setSelectedBanKdId: (id: string) => void;
  userAllowedBanKds: BanKd[];
  projects: any[];
  blocks: any[];
  myBlockIds?: string[];
  blockBudgets: any[];
  acceptances: any[];
  finalAcceptances: any[];
  teams: any[];
  regions: any[];
  allUsers: any[];
  user: any;
  userProfile: any;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isAccountant: boolean;
  isMod: boolean;
  hasPermission: (perm: string) => boolean;
  formatCurrency: (val: any) => string;
  formatCurrencyInput: (val: any) => string;
  getMarketingMonth: (date?: any) => string;
  handleFirestoreError: (error: any, op: any, entity: string) => void;
  logAction?: (action: string, entity: string, id?: string, data?: any) => Promise<void>;
  teamMap?: Record<string, string>;
  projectMap?: Record<string, string>;
  /** v-next ctx for NT image/invoice upload (Admin/Mod only via canUploadImages + perms). */
  ntCtx?: any;
  canUploadImages?: boolean;
  ntRequiredFrom?: string | null;
  activeSubTab?: 'bankd-info' | 'bankd-budgets' | 'bankd-nt';
  /** When the page-level SectionTabs drives sub-tabs, hide the in-view tab strip. */
  hideSubNav?: boolean;
  setActiveSubTab?: (tab: 'bankd-info' | 'bankd-budgets' | 'bankd-nt') => void;
}

export const BanKdManagementView: React.FC<BanKdManagementViewProps> = ({
  banKdList,
  currentActiveBanKd,
  selectedBanKdId,
  setSelectedBanKdId,
  userAllowedBanKds,
  projects,
  blocks,
  myBlockIds = [],
  blockBudgets,
  acceptances,
  finalAcceptances,
  teams,
  regions,
  allUsers,
  user,
  userProfile,
  isAdmin,
  isSuperAdmin,
  isAccountant,
  isMod,
  hasPermission,
  formatCurrency,
  formatCurrencyInput,
  getMarketingMonth,
  handleFirestoreError,
  logAction,
  teamMap = {},
  projectMap = {},
  ntCtx = null,
  canUploadImages = false,
  ntRequiredFrom = null,
  activeSubTab,
  hideSubNav,
  setActiveSubTab
}) => {
  const [internalSubTab, setInternalSubTab] = useState<'bankd-info' | 'bankd-budgets' | 'bankd-nt'>('bankd-info');
  const subTab = activeSubTab !== undefined ? activeSubTab : internalSubTab;
  const setSubTab = setActiveSubTab || setInternalSubTab;

  // Trưởng ban (leaderUid on ban_kd) can view+edit THEIR Ban info; admins keep global manage.
  const leaderCaps = banKdLeaderCapabilities(currentActiveBanKd, user, userProfile);
  const isCurrentBanLeader = leaderCaps.isLeader;
  const isCurrentBanDeputy = !!currentActiveBanKd && isBanKdDeputy(currentActiveBanKd, user, userProfile);
  // Duyệt NS tầng Ban: Trưởng Ban, Phó Ban (+ Admin / Kế toán / Super Admin). Trưởng Ban ưu tiên (rules banDecidedRole).
  const canApproveBanNs = isAdmin || isSuperAdmin || isAccountant || isCurrentBanLeader || isCurrentBanDeputy;
  const banApprover = banApproverRole({ isLeader: isCurrentBanLeader, isDeputy: isCurrentBanDeputy, isAdminLike: !!(isAdmin || isSuperAdmin || isAccountant) });
  // Member assignment: matches firestore.rules (admin / accountant write ban_kd; the
  // Trưởng ban may only change memberUids of their own Ban).
  const canManageBan = isAdmin || isSuperAdmin || isAccountant || isCurrentBanLeader;
  const canEditUserScopes = isAdmin || isSuperAdmin;
  const canViewBanBudget = isAdmin || isSuperAdmin || isAccountant || hasPermission('bankd.view') || leaderCaps.canViewBanBudget;
  const canViewBanNt = isAdmin || isSuperAdmin || isAccountant || hasPermission('bankd.view') || leaderCaps.canViewBanNt;
  // expose for future tab gating / keep referenced
  void (canViewBanBudget && canViewBanNt);

  // Projects under this Ban KD
  // Chỉ dự án gắn Ban bằng project.banKdId === Ban.id (không khớp tên — tránh lẫn dự án khác Ban).
  const currentBanProjects = useMemo(() => {
    if (!currentActiveBanKd) return [];
    const bId = currentActiveBanKd.id;
    return projects.filter((p) => p.banKdId && p.banKdId === bId);
  }, [currentActiveBanKd, projects]);

  const currentBanProjectIds = useMemo(() => new Set(currentBanProjects.map(p => p.id)), [currentBanProjects]);

  /** Mọi Ban user đang là Trưởng — popup đếm NS chờ duyệt / từ chối trên TẤT CẢ Ban này. */
  const ledBans = useMemo(
    // Trưởng Ban trước, rồi Phó Ban (Phó Ban cũng nhận popup NS chờ duyệt).
    () => [...banKdList.filter((b) => isBanKdLeader(b as any, user, userProfile)), ...banKdList.filter((b) => !isBanKdLeader(b as any, user, userProfile) && isBanKdDeputy(b as any, user, userProfile))],
    [banKdList, user, userProfile],
  );
  /** Phong t341u: Trưởng Ban đúng 1 Ban — popup/đếm chỉ Ban chính (assignedBanKd hoặc Ban lead đầu tiên). */
  const primaryLedBan = useMemo(() => {
    if (!ledBans.length) return null;
    const pref = userProfile?.assignedBanKd || user?.assignedBanKd;
    return ledBans.find((b) => b.id === pref) || ledBans[0];
  }, [ledBans, userProfile, user]);
  const isLeaderOfAny = !!primaryLedBan;
  const ledBanProjectIds = useMemo(() => {
    if (!primaryLedBan) return [] as string[];
    return projects
      .filter((p: any) => p.banKdId && p.banKdId === primaryLedBan.id)
      .map((p: any) => p.id)
      .filter(Boolean);
  }, [primaryLedBan, projects]);
  const ledBanProjectKey = useMemo(() => [...ledBanProjectIds].sort().join(','), [ledBanProjectIds]);

  const inCurrentBan = useCallback((r: any) => {
    // Ưu tiên projectId ∈ dự án của Ban. Không dùng tên/mã (dễ trùng giữa Ban).
    if (r?.projectId) return currentBanProjectIds.has(r.projectId);
    return false;
  }, [currentBanProjectIds]);

  // Từ Tháng 11/2026 (v-next): NS đăng ký nằm ở ns_lines (Phòng/Khối) — nghe theo dự án của Ban, gộp theo Dự án × Khối × Kỳ.
  const [nsBanLines, setNsBanLines] = useState<any[]>([]);
  const banProjectKey = useMemo(() => [...currentBanProjectIds].sort().join(','), [currentBanProjectIds]);
  useEffect(() => {
    const ids = banProjectKey ? banProjectKey.split(',') : [];
    if (!currentActiveBanKd || !ids.length) { setNsBanLines([]); return; }
    const parts: Record<string, any[]> = {};
    const push = () => setNsBanLines(Object.values(parts).flat());
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    // GĐK / Trợ lý Khối: rules chỉ cho đọc dòng thuộc Khối mình → truy vấn blockId == từng Khối, lọc dự án Ban phía client.
    const isKhoiMgr = ['gd_khoi', 'tro_ly_khoi'].includes(normalizeRoleKey(userProfile?.role) as any);
    if (isKhoiMgr) {
      const inBan = new Set(ids);
      const bids = myBlockIds.filter(Boolean);
      if (!bids.length) { setNsBanLines([]); return; }
      const us = bids.map((b, i) => onSnapshot(
        query(collection(db, NS_COLLECTION), where('blockId', '==', b)),
        (s: any) => { parts[i] = s.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((l: any) => inBan.has(l.projectId)); push(); },
        (e: any) => { parts[i] = []; push(); console.warn('[BanKd] ns_lines', e?.message); }
      ));
      return () => us.forEach((u: any) => u && u());
    }
    const unsubs = chunks.map((ch, i) => onSnapshot(
      query(collection(db, NS_COLLECTION), where('projectId', 'in', ch)),
      (s: any) => { parts[i] = s.docs.map((d: any) => ({ id: d.id, ...d.data() })); push(); },
      (e: any) => { parts[i] = []; push(); console.warn('[BanKd] ns_lines', e?.message); }
    ));
    return () => unsubs.forEach((u: any) => u && u());
  }, [currentActiveBanKd?.id, banProjectKey, userProfile?.role, myBlockIds.join(',')]);

  // Trạng thái duyệt hỗ trợ MKT (cùng hàm splitByStatus với Ngân sách MKT Khối / Duyệt hỗ trợ MKT → số khớp).
  const [banSup, setBanSup] = useState<Record<string, any>>({});
  const [banSupErr, setBanSupErr] = useState(false);
  useEffect(() => {
    const ids = banProjectKey ? banProjectKey.split(',') : [];
    if (!currentActiveBanKd || !ids.length) { setBanSup({}); return; }
    const parts: Record<string, any[]> = {};
    const push = () => setBanSup(Object.fromEntries(Object.values(parts).flat().map((x: any) => [x.id, x])));
    const isKm = ['gd_khoi', 'tro_ly_khoi'].includes(normalizeRoleKey(userProfile?.role) as any);
    const qs: any[] = [];
    if (isKm) for (const b of myBlockIds.filter(Boolean)) qs.push(query(collection(db, SUPPORT_COLLECTION), where('blockId', '==', b)));
    else for (let i = 0; i < ids.length; i += 30) qs.push(query(collection(db, SUPPORT_COLLECTION), where('projectId', 'in', ids.slice(i, i + 30))));
    setBanSupErr(false);
    const us = qs.map((q, i) => onSnapshot(q, (x: any) => { parts[i] = x.docs.map((d: any) => ({ id: d.id, ...d.data() })); push(); }, () => { parts[i] = []; setBanSupErr(true); push(); }));
    return () => us.forEach((u: any) => u && u());
  }, [currentActiveBanKd?.id, banProjectKey, userProfile?.role, myBlockIds.join(',')]);
  const banPay = usePayMap(db);

  // Popup Trưởng Ban: NS + nsSupport trên MỌI Ban đang lead (không chỉ Ban đang chọn).
  const [leaderAllNs, setLeaderAllNs] = useState<any[]>([]);
  const [leaderAllSup, setLeaderAllSup] = useState<Record<string, any>>({});
  useEffect(() => {
    const ids = ledBanProjectKey ? ledBanProjectKey.split(',') : [];
    if (!isLeaderOfAny || !ids.length) { setLeaderAllNs([]); return; }
    const parts: Record<string, any[]> = {};
    const push = () => setLeaderAllNs(Object.values(parts).flat());
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const unsubs = chunks.map((ch, i) => onSnapshot(
      query(collection(db, NS_COLLECTION), where('projectId', 'in', ch)),
      (s: any) => { parts[i] = s.docs.map((d: any) => ({ id: d.id, ...d.data() })); push(); },
      () => { parts[i] = []; push(); },
    ));
    return () => unsubs.forEach((u: any) => u && u());
  }, [isLeaderOfAny, ledBanProjectKey]);
  useEffect(() => {
    const ids = ledBanProjectKey ? ledBanProjectKey.split(',') : [];
    if (!isLeaderOfAny || !ids.length) { setLeaderAllSup({}); return; }
    const parts: Record<string, any[]> = {};
    const push = () => setLeaderAllSup(Object.fromEntries(Object.values(parts).flat().map((x: any) => [x.id, x])));
    const qs: any[] = [];
    for (let i = 0; i < ids.length; i += 30) qs.push(query(collection(db, SUPPORT_COLLECTION), where('projectId', 'in', ids.slice(i, i + 30))));
    const us = qs.map((q, i) => onSnapshot(q, (x: any) => { parts[i] = x.docs.map((d: any) => ({ id: d.id, ...d.data() })); push(); }, () => { parts[i] = []; push(); }));
    return () => us.forEach((u: any) => u && u());
  }, [isLeaderOfAny, ledBanProjectKey]);
  const banCtx: VCtx = useMemo(() => ({
    db, uid: user?.uid || '', email: user?.email || userProfile?.email || '', name: userProfile?.fullName || user?.displayName || user?.email || '',
    role: normalizeRoleKey(userProfile?.role || user?.role) as any, teamId: userProfile?.teamId || '',
    teams, blocks, projects, users: allUsers, banKds: banKdList, settings: {}, myBlockIds, myBanKdIds: userAllowedBanKds.map((b) => b.id), acceptances: [],
  }), [db, user, userProfile, teams, blocks, projects, allUsers, banKdList, myBlockIds, userAllowedBanKds]);
  const nsBanBudgetRows = useMemo(() => {
    const projById = new Map(projects.map((p: any) => [p.id, p]));
    const blkById = new Map(blocks.map((b: any) => [b.id, b]));
    const agg = new Map<string, any>();
    nsBanLines.forEach((l: any) => {
      if (l.deleted || !l.period || l.period < VNEXT_PERIOD_CUTOVER) return;
      const amt = Number(l.amount) || 0;
      if (amt <= 0) return;
      const st: BanBudgetStatus = banSupErr ? 'unknown' : supportable(l) ? effectiveStatus(l, banSup[l.id], payOf(banPay, l.ownerUid)) : 'na';
      const key = `${l.projectId}|${l.blockId || ''}|${l.period}|${st}`;
      let r = agg.get(key);
      if (!r) {
        const p: any = projById.get(l.projectId) || {};
        const bk: any = blkById.get(l.blockId) || {};
        r = { id: 'ns:' + key, source: 'ns_lines', month: l.period, projectId: l.projectId, projectName: p.name || '', projectCode: p.projectCode || '',
          blockId: l.blockId || '', blockCode: bk.code || bk.blockCode || l.blockId || '', blockName: bk.name || bk.blockName || '',
          amount: 0, lineCount: 0, lineIds: [] as string[], status: st, notes: 'Đăng ký NS MKT (Phòng/Khối)' };
        agg.set(key, r);
      }
      r.amount += amt; r.lineCount += 1; r.lineIds.push(l.id);
    });
    return [...agg.values()];
  }, [nsBanLines, projects, blocks, banSup, banPay, banSupErr]);

  // Synchronized Block Budgets filtered for this Ban KD's projects
  const synchronizedBanBudgets = useMemo(() => {
    if (!currentActiveBanKd) return [];
    // Khớp theo dự án HIỆN TẠI của Ban (projectId). Chỉ dùng tên khi bản ghi không có projectId.
    // Bỏ khớp projectCode (nhiều dự án dùng chung mã, vd VINHOMES) và banKdId/banKdName lưu sẵn trên bản ghi.
    return [...nsBanBudgetRows, ...blockBudgets.filter(b => inCurrentBan(b)).map((b: any) => ({ ...b, status: 'legacy' as BanBudgetStatus }))];
  }, [currentActiveBanKd, blockBudgets, nsBanBudgetRows, inCurrentBan]);

  // Synchronized Acceptances filtered for this Ban KD's projects
  const synchronizedBanAcceptances = useMemo(() => {
    if (!currentActiveBanKd) return [];
    return acceptances.filter(inCurrentBan);
  }, [currentActiveBanKd, acceptances, inCurrentBan]);

  const synchronizedBanFinalAcceptances = useMemo(() => {
    if (!currentActiveBanKd) return [];
    return finalAcceptances.filter(inCurrentBan);
  }, [currentActiveBanKd, finalAcceptances, inCurrentBan]);

  // Members assigned to this Ban KD (assignedBan / leader / deputy / memberUids)
  const assignedBanMembers = useMemo(() => {
    if (!currentActiveBanKd) return [];
    const bId = currentActiveBanKd.id;
    const bName = (currentActiveBanKd.name || '').toLowerCase().trim();
    const bCode = (currentActiveBanKd.code || '').toLowerCase().trim();
    const deps: string[] = Array.isArray(currentActiveBanKd.deputyUids) ? currentActiveBanKd.deputyUids : [];

    return allUsers.filter(u => {
      if (u.mergedInto || u.linkedToUid) return false;
      if (u.assignedBanKd && (u.assignedBanKd === bId || u.assignedBanKd.toLowerCase() === bCode || u.assignedBanKd.toLowerCase() === bName)) return true;
      if (Array.isArray(u.assignedBanKds) && (u.assignedBanKds.includes(bId) || u.assignedBanKds.map((x: string) => x.toLowerCase()).includes(bCode) || u.assignedBanKds.map((x: string) => x.toLowerCase()).includes(bName))) return true;
      if (currentActiveBanKd.leaderUid && (u.uid === currentActiveBanKd.leaderUid || u.id === currentActiveBanKd.leaderUid)) return true;
      if (currentActiveBanKd.leaderEmail && u.email && u.email.toLowerCase() === currentActiveBanKd.leaderEmail.toLowerCase()) return true;
      if (deps.some((d) => d === u.uid || d === u.id || d === u.migratedFromUid)) return true;
      if (Array.isArray(currentActiveBanKd.memberUids) && (currentActiveBanKd.memberUids.includes(u.uid) || currentActiveBanKd.memberUids.includes(u.id))) return true;
      if (Array.isArray(currentActiveBanKd.assignedUserEmails) && u.email && currentActiveBanKd.assignedUserEmails.map((e: string) => e.toLowerCase()).includes(u.email.toLowerCase())) return true;
      return false;
    });
  }, [currentActiveBanKd, allUsers]);

  // memberUids entries we cannot match to a loaded user (e.g. a Trưởng ban with role
  // "user" cannot list all users, so members added by email show as raw ids/emails).
  const unresolvedMemberIds = useMemo(() => {
    if (!currentActiveBanKd || !Array.isArray(currentActiveBanKd.memberUids)) return [] as string[];
    return currentActiveBanKd.memberUids.filter((id: string) => {
      if (!id) return false;
      const low = String(id).toLowerCase();
      return !allUsers.some(u => u.uid === id || u.id === id || (u.email && u.email.toLowerCase() === low));
    });
  }, [currentActiveBanKd, allUsers]);

  const [memberEmailInput, setMemberEmailInput] = useState('');

  // ==========================================
  // BUDGET TAB FILTERS & METRICS
  // ==========================================
  const [budgetMonthFilter, setBudgetMonthFilter] = useState(() => getPeriodOf());
  const [budgetBlockFilter, setBudgetBlockFilter] = useState('all');
  const [budgetProjectFilter, setBudgetProjectFilter] = useState('all');
  const [budgetSearchTerm, setBudgetSearchTerm] = useState('');
  const [budgetStatusFilter, setBudgetStatusFilter] = useState<'all' | BanBudgetStatus>('all');
  const [budgetViewMode, setBudgetViewMode] = useState<'table' | 'cards'>('table');

  const availableBudgetMonths = useMemo(() => {
    const set = new Set<string>();
    synchronizedBanBudgets.forEach(b => {
      if (b.month) set.add(b.month);
    });
    set.add(getPeriodOf()); // luôn có kỳ hiện tại trong bộ lọc
    return Array.from(set).sort().reverse();
  }, [synchronizedBanBudgets]);

  const availableBudgetBlocks = useMemo(() => {
    const map = new Map<string, string>();
    synchronizedBanBudgets.forEach(b => {
      const code = b.blockCode || b.blockId || 'Khác';
      const name = b.blockName || code;
      map.set(code, name);
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [synchronizedBanBudgets]);

  const filteredBanBudgets = useMemo(() => {
    return synchronizedBanBudgets.filter(b => {
      if (!matchesBanNsFilter(b, { month: budgetMonthFilter, projectId: budgetProjectFilter, block: budgetBlockFilter })) return false;
      if (budgetStatusFilter !== 'all' && b.status !== budgetStatusFilter) return false;
      if (budgetSearchTerm.trim()) {
        const q = budgetSearchTerm.toLowerCase().trim();
        const pName = (b.projectName || '').toLowerCase();
        const pCode = (b.projectCode || '').toLowerCase();
        const bName = (b.blockName || '').toLowerCase();
        const bCode = (b.blockCode || '').toLowerCase();
        const note = (b.notes || b.note || '').toLowerCase();
        if (!pName.includes(q) && !pCode.includes(q) && !bName.includes(q) && !bCode.includes(q) && !note.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [synchronizedBanBudgets, budgetMonthFilter, budgetBlockFilter, budgetProjectFilter, budgetSearchTerm, budgetStatusFilter]);

  const banSplit = useMemo(() => {
    const keep = new Set(filteredBanBudgets.filter((b: any) => b.source === 'ns_lines').flatMap((b: any) => b.lineIds || []));
    return splitByStatus(nsBanLines.filter((l: any) => l.period >= VNEXT_PERIOD_CUTOVER && keep.has(l.id)), banSup, banPay);
  }, [nsBanLines, banSup, filteredBanBudgets, banPay]);

  // Overall KPI sums
  const totalBanBudgetAmount = useMemo(() => {
    return filteredBanBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  }, [filteredBanBudgets]);

  const totalDistinctBlocksRegistered = useMemo(() => {
    const set = new Set<string>();
    filteredBanBudgets.forEach(b => {
      if (b.blockCode || b.blockId) set.add(b.blockCode || b.blockId);
    });
    return set.size;
  }, [filteredBanBudgets]);

  const totalDistinctProjectsWithBudget = useMemo(() => {
    const set = new Set<string>();
    filteredBanBudgets.forEach(b => {
      if (b.projectId) set.add(b.projectId);
    });
    return set.size;
  }, [filteredBanBudgets]);

  const budgetRowsByProject = useMemo(() => groupByProject(filteredBanBudgets, {
    projectId: (b: any) => b.projectId,
    amount: (b: any) => b.amount,
    projectName: (id: string, b: any) => currentBanProjects.find((p: any) => p.id === id)?.name || b.projectName || id,
    blockName: (b: any) => b.blockName || b.blockCode || 'Khối',
  }), [filteredBanBudgets, currentBanProjects]);
  const budgetActiveFilters = activeFilterCount({ month: budgetMonthFilter, projectId: budgetProjectFilter, block: budgetBlockFilter, status: budgetStatusFilter, search: budgetSearchTerm });

  // Project grouped summary for Budget
  const budgetsGroupedByProject = useMemo(() => {
    const map = new Map<string, {
      project: any;
      totalAmount: number;
      registrations: any[];
      blocksMap: Record<string, number>;
    }>();

    currentBanProjects.forEach(p => {
      map.set(p.id, {
        project: p,
        totalAmount: 0,
        registrations: [],
        blocksMap: {}
      });
    });

    filteredBanBudgets.forEach(b => {
      const pId = b.projectId;
      if (pId && map.has(pId)) {
        const item = map.get(pId)!;
        const amt = Number(b.amount) || 0;
        item.totalAmount += amt;
        item.registrations.push(b);
        const blk = b.blockName || b.blockCode || 'Khối khác';
        item.blocksMap[blk] = (item.blocksMap[blk] || 0) + amt;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [currentBanProjects, filteredBanBudgets]);

  // Export Ban Budget to Excel
  const handleExportBanBudgetsExcel = async () => {
    if (filteredBanBudgets.length === 0) {
      toast.info('Không có dữ liệu để xuất file Excel');
      return;
    }

    const lineById = new Map(nsBanLines.map((l: any) => [l.id, l]));
    const rows = filteredBanBudgets.map((b, idx) => {
      const ids: string[] = b.lineIds || [];
      const banLabels = ids.map((id) => {
        const l = lineById.get(id); if (!l) return '';
        return BAN_STATUS_LABEL[effectiveBanStatus(l, banSup[id])];
      }).filter(Boolean);
      const banUnique = [...new Set(banLabels)];
      const first = ids.map((id) => banSup[id]).find((s) => s?.banDecidedByName);
      const proj = projects.find((p: any) => p.id === b.projectId);
      return {
      'STT': idx + 1,
      'Ban KD': currentActiveBanKd?.name || '',
      'Tên Dự Án': b.projectName || '',
      ...excelSupportPctFields(proj, banKdList || [], String(b.month || '')),
      'Khối Đăng Ký': `${b.blockName || ''} (${b.blockCode || ''})`.trim(),
      'Kỳ / Tháng': b.month || '',
      'Mức Ngân Sách (VNĐ)': Number(b.amount) || 0,
      'Trạng thái': BAN_BUDGET_STATUS_LABEL[b.status as BanBudgetStatus] || '',
      'Trạng thái Ban': banUnique.join(', ') || '',
      'Người duyệt Ban': first?.banDecidedByName || '',
      'Thời điểm Ban duyệt': first?.banDecidedAt ? String(first.banDecidedAt).replace('T', ' ').slice(0, 16) : '',
      'Số bản đăng ký': b.lineCount || 1,
      'Người Đăng Ký': b.createdByName || b.userEmail || '',
      'Ghi Chú': b.notes || b.note || ''
    }; });

    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NganSachBan');
    const codes = budgetBlockFilter !== 'all' ? [budgetBlockFilter] : [...new Set(filteredBanBudgets.map((b: any) => b.blockCode || b.blockId).filter(Boolean))];
    const months = [...new Set(filteredBanBudgets.map((b: any) => b.month).filter(Boolean))];
    const pj = budgetProjectFilter !== 'all' ? currentBanProjects.find((p: any) => p.id === budgetProjectFilter) : null;
    XLSX.writeFile(wb, exportFileName({ blockCode: codes, month: budgetMonthFilter !== 'all' ? budgetMonthFilter : months.length === 1 ? months[0] : 'all', projectName: pj?.name || '' }, 'xlsx'));
    toast.success('Đã xuất file Excel Ngân sách Ban thành công!');
  };

  // ==========================================
  // MEMBER ASSIGNMENT DIALOG STATE
  // ==========================================
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false);
  const [isDeputyDialogOpen, setIsDeputyDialogOpen] = useState(false);
  const [deputySearchTerm, setDeputySearchTerm] = useState('');
  const [memberSearchTerm, setMemberSearchTerm] = useState('');

  const handleToggleMember = async (targetUser: any, isAssigned: boolean) => {
    if (!currentActiveBanKd) return;
    if (!canManageBan) {
      toast.error('Bạn không có quyền gán thành viên cho Ban KD này');
      return;
    }
    try {
      const curBanKds = Array.isArray(targetUser.assignedBanKds) ? [...targetUser.assignedBanKds] : (targetUser.assignedBanKd ? [targetUser.assignedBanKd] : []);
      let nextBanKds: string[];

      const curMemberUids = Array.isArray(currentActiveBanKd.memberUids) ? [...currentActiveBanKd.memberUids] : [];
      let nextMemberUids: string[];

      if (isAssigned) {
        // Remove membership (+ Phó Ban if any)
        nextBanKds = curBanKds.filter(id => id !== currentActiveBanKd.id && id !== currentActiveBanKd.code && id !== currentActiveBanKd.name);
        nextMemberUids = curMemberUids.filter(uid => uid !== targetUser.uid && uid !== targetUser.id && uid !== targetUser.email);
      } else {
        // Add
        nextBanKds = Array.from(new Set([...curBanKds, currentActiveBanKd.id]));
        nextMemberUids = Array.from(new Set([...curMemberUids, targetUser.uid || targetUser.id]));
      }

      // One atomic batch: either both docs change or neither does.
      const batch = writeBatch(db);
      const banPatch: any = {
        memberUids: nextMemberUids,
        updatedAt: serverTimestamp()
      };
      if (isAssigned && isDeputyOf(currentActiveBanKd, targetUser)) {
        banPatch.deputyUids = planUnsetDeputy(currentActiveBanKd, targetUser).banUpdate.data.deputyUids;
      }
      batch.update(doc(db, 'ban_kd', currentActiveBanKd.id), banPatch);
      // users.assignedBanKd(s) is a scope field: only Admin may change it (firestore.rules).
      // Trưởng ban / Kế toán manage membership through ban_kd.memberUids only.
      const profileStillAssigned = isAssigned && nextBanKds.length !== curBanKds.length;
      if (canEditUserScopes) {
        batch.update(doc(db, 'users', targetUser.id), {
          assignedBanKd: nextBanKds[0] || '',
          assignedBanKds: nextBanKds,
          updatedAt: serverTimestamp()
        });
      }
      await batch.commit();

      if (logAction) {
        await logAction(isAssigned ? 'REMOVE_BAN_MEMBER' : 'ADD_BAN_MEMBER', 'ban_kd', currentActiveBanKd.id, {
          targetUser: targetUser.email || targetUser.fullName,
          banName: currentActiveBanKd.name
        });
      }

      toast.success(isAssigned ? `Đã gỡ ${targetUser.fullName || targetUser.email} khỏi ${currentActiveBanKd.name}` : `Đã gán ${targetUser.fullName || targetUser.email} vào ${currentActiveBanKd.name}`);
      if (!canEditUserScopes && profileStillAssigned) {
        toast.warning('Tài khoản này còn được gán Ban KD trong hồ sơ người dùng — chỉ Admin gỡ được phần đó (Quản trị → Users).');
      }
    } catch (error) {
      console.error('Error toggling member:', error);
      toast.error('Lỗi khi cập nhật thành viên Ban KD');
    }
  };

  /** Admin: đặt / bỏ Phó Ban — đúng 1 Ban (gỡ Phó/Trưởng Ban khác + confirm). */
  const handleToggleDeputy = async (targetUser: any, makeDeputy: boolean) => {
    if (!currentActiveBanKd) return;
    if (!canEditUserScopes) {
      toast.error('Chỉ Admin / Super Admin được đặt Phó Ban (đồng bộ hồ sơ User).');
      return;
    }
    if (isBanKdLeader(currentActiveBanKd, targetUser, targetUser)) {
      toast.error('Người này đang là Trưởng Ban — không thể vừa là Phó. Đổi Trưởng Ban trước.');
      return;
    }
    if (makeDeputy) {
      let exclusive;
      try { exclusive = planExclusiveSetDeputy(targetUser, currentActiveBanKd as any, banKdList as any); }
      catch (e: any) { toast.error(e?.message || String(e)); return; }
      if (exclusive.warnLines.length) {
        const ok = window.confirm(
          `Phó Ban chỉ thuộc đúng 1 Ban.\n\n${exclusive.warnLines.map((l: string) => '• ' + l).join('\n')}\n\nTiếp tục đặt Phó Ban «${currentActiveBanKd.name}»?`,
        );
        if (!ok) return;
      }
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'ban_kd', currentActiveBanKd.id), { ...exclusive.banUpdate.data, updatedAt: serverTimestamp() });
        exclusive.sideBanUpdates.forEach((b: any) => batch.update(doc(db, 'ban_kd', b.id), { ...b.data, updatedAt: serverTimestamp() }));
        batch.update(doc(db, 'users', targetUser.id), { ...exclusive.userUpdate, updatedAt: serverTimestamp() });
        const m = Array.isArray(currentActiveBanKd.memberUids) ? currentActiveBanKd.memberUids : [];
        const uid = authUidOf(targetUser);
        if (uid && !m.includes(uid) && !m.includes(targetUser.id)) {
          batch.update(doc(db, 'ban_kd', currentActiveBanKd.id), { memberUids: [...m, uid], deputyUids: exclusive.banUpdate.data.deputyUids, updatedAt: serverTimestamp() });
        }
        await batch.commit();
        if (logAction) {
          await logAction('SET_BAN_DEPUTY', 'ban_kd', currentActiveBanKd.id, {
            targetUser: targetUser.email || targetUser.fullName,
            banName: currentActiveBanKd.name,
            exclusive: true,
          });
        }
        toast.success(`Đã đặt ${targetUser.fullName || targetUser.email} làm Phó Ban (đúng 1 Ban)`);
      } catch (error) {
        console.error('Error toggling deputy:', error);
        toast.error('Lỗi khi cập nhật Phó Ban');
      }
      return;
    }
    const plan = planUnsetDeputy(currentActiveBanKd, targetUser);
    const rolePatch = roleAfterUnsetDeputy(targetUser, banKdList as any[], currentActiveBanKd.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'ban_kd', currentActiveBanKd.id), { ...plan.banUpdate.data, updatedAt: serverTimestamp() });
      const userPatch: any = {};
      if (plan.needsUserWrite && plan.userUpdate) Object.assign(userPatch, plan.userUpdate);
      if (rolePatch) userPatch.role = rolePatch;
      if (Object.keys(userPatch).length) {
        batch.update(doc(db, 'users', targetUser.id), { ...userPatch, updatedAt: serverTimestamp() });
      }
      await batch.commit();
      if (logAction) {
        await logAction(makeDeputy ? 'SET_BAN_DEPUTY' : 'UNSET_BAN_DEPUTY', 'ban_kd', currentActiveBanKd.id, {
          targetUser: targetUser.email || targetUser.fullName,
          banName: currentActiveBanKd.name,
        });
      }
      toast.success(makeDeputy
        ? `Đã đặt ${targetUser.fullName || targetUser.email} làm Phó Ban`
        : `Đã bỏ Phó Ban ${targetUser.fullName || targetUser.email}`);
    } catch (error) {
      console.error('Error toggling deputy:', error);
      toast.error('Lỗi khi cập nhật Phó Ban');
    }
  };

  const updateBanMemberUidsOnly = async (nextMemberUids: string[], action: string, target: string) => {
    if (!currentActiveBanKd) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'ban_kd', currentActiveBanKd.id), { memberUids: nextMemberUids, updatedAt: serverTimestamp() });
    await batch.commit();
    if (logAction) {
      await logAction(action, 'ban_kd', currentActiveBanKd.id, { targetUser: target, banName: currentActiveBanKd.name });
    }
  };

  const handleRemoveRawMember = async (memberId: string) => {
    if (!currentActiveBanKd || !canManageBan) return;
    try {
      const cur = Array.isArray(currentActiveBanKd.memberUids) ? currentActiveBanKd.memberUids : [];
      await updateBanMemberUidsOnly(cur.filter((x: string) => x !== memberId), 'REMOVE_BAN_MEMBER', memberId);
      toast.success(`Đã gỡ ${memberId} khỏi ${currentActiveBanKd.name}`);
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Lỗi khi cập nhật thành viên Ban KD');
    }
  };

  const handleAddMemberByEmail = async () => {
    if (!currentActiveBanKd || !canManageBan) return;
    const email = memberEmailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Email không hợp lệ');
      return;
    }
    // Same email may still have a stale duplicate doc → pick the live (canonical) profile.
    const known = findUserByEmail(allUsers, email);
    if (known) {
      const already = assignedBanMembers.some(m => m.id === known.id);
      if (!already) await handleToggleMember(known, false);
      setMemberEmailInput('');
      return;
    }
    try {
      const cur = Array.isArray(currentActiveBanKd.memberUids) ? currentActiveBanKd.memberUids : [];
      if (!cur.map((x: string) => String(x).toLowerCase()).includes(email)) {
        await updateBanMemberUidsOnly([...cur, email], 'ADD_BAN_MEMBER', email);
      }
      toast.success(`Đã gán ${email} vào ${currentActiveBanKd.name}`);
      setMemberEmailInput('');
    } catch (error) {
      console.error('Error adding member by email:', error);
      toast.error('Lỗi khi cập nhật thành viên Ban KD');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Ban KD Selector */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 p-6 sm:p-8 rounded-[32px] text-white shadow-xl shadow-indigo-100/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[var(--mh-surface)]/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative z-10 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-[var(--mh-surface)]/20 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider inline-flex items-center gap-1.5">
                  <Briefcase className="w-3 h-3" />
                  Hệ thống Quản lý Ban Kinh Doanh
                </span>
                {currentBanProjects.length > 0 && (
                  <span className="bg-sky-400 text-[var(--mh-text)] text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-sm font-sans">
                    {currentBanProjects.length} dự án trực thuộc
                  </span>
                )}
                {synchronizedBanBudgets.length > 0 && (
                  <span className="bg-emerald-400 text-[var(--mh-text)] text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-sm font-sans">
                    {synchronizedBanBudgets.length} hồ sơ ngân sách
                  </span>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-1.5">
                Quản lý Ban KD: <span className="underline decoration-sky-300 decoration-3">{currentActiveBanKd?.name || "Chưa chọn Ban KD"}</span>
              </h2>
            </div>

            {/* Ban KD Switcher Selector */}
            <div className="flex flex-wrap items-center gap-3">
              {userAllowedBanKds.length > 0 && (
                <div className="w-full sm:w-[320px] bg-[var(--mh-surface)]/10 p-3 rounded-2xl backdrop-blur-md border border-white/20 font-sans shadow-lg shadow-indigo-950/10">
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <Label className="text-[10px] text-sky-200 uppercase font-black block">
                      {userAllowedBanKds.length > 1 ? `Ban Thao Tác (${userAllowedBanKds.length} Ban)` : "Ban KD Thao Tác"}
                    </Label>
                    {userAllowedBanKds.length > 1 && (
                      <span className="bg-sky-300 text-[var(--mh-text)] text-[9px] font-black px-2 py-0.5 rounded-md shadow-sm">
                        Đa Ban ({userAllowedBanKds.length})
                      </span>
                    )}
                  </div>
                  <Select 
                    value={currentActiveBanKd?.id || (userAllowedBanKds[0]?.id || '')} 
                    onValueChange={(val) => setSelectedBanKdId(val)}
                  >
                    <SelectTrigger className="bg-[var(--mh-surface)] text-[var(--mh-text)] border-none rounded-xl font-bold h-10 text-xs shadow-sm hover:bg-[var(--mh-surface-2)] transition-colors">
                      <SelectValue placeholder="Chọn Ban KD...">
                        <span className="truncate block text-left flex-1 font-sans">
                          {currentActiveBanKd ? `${currentActiveBanKd.name} (${currentActiveBanKd.code || 'N/A'})` : "Chọn Ban KD..."}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent searchable className="rounded-2xl max-h-[320px]">
                      {userAllowedBanKds.map((b) => {
                        const projCount = projects.filter(p => p.banKdId === b.id || (p.banKdName && p.banKdName.toLowerCase() === (b.name || '').toLowerCase())).length;
                        return (
                          <SelectItem key={b.id} value={b.id} className="text-xs font-bold font-sans cursor-pointer py-2">
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span>{b.name} ({b.code || 'N/A'})</span>
                              {projCount > 0 && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-mono">
                                  {projCount} dự án
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <p className="text-sky-100 text-sm max-w-2xl font-medium font-sans">
            Giám sát hồ sơ thông tin Ban, theo dõi đồng bộ đăng ký ngân sách Marketing từ các Khối và đối soát nghiệm thu chi phí thực tế cho từng dự án của Ban.
          </p>

          {currentActiveBanKd && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <div className="bg-[var(--mh-surface)]/10 px-3.5 py-2 rounded-xl backdrop-blur-sm border border-white/10 flex items-center gap-1.5">
                <span className="text-sky-200">Mã Ban:</span> <strong className="text-white font-bold">{currentActiveBanKd.code || 'N/A'}</strong>
              </div>
              {currentActiveBanKd.leaderName && (
                <div className="bg-[var(--mh-surface)]/10 px-3.5 py-2 rounded-xl backdrop-blur-sm border border-white/10 flex items-center gap-1.5">
                  <span className="text-sky-200">Lãnh đạo Ban:</span> <strong className="text-white font-bold">{currentActiveBanKd.leaderName}</strong>
                </div>
              )}
              {isCurrentBanLeader && (
                <div className="bg-emerald-400/90 text-[var(--mh-text)] px-3.5 py-2 rounded-xl border border-emerald-200 flex items-center gap-1.5 shadow-sm">
                  <UserCheck className="w-3.5 h-3.5" />
                  <strong className="font-black uppercase tracking-wide text-[10px]">Bạn là Trưởng ban — được xem Ban này &amp; gán thành viên</strong>
                </div>
              )}
              {currentActiveBanKd.leaderPhone && (
                <div className="bg-[var(--mh-surface)]/10 px-3.5 py-2 rounded-xl backdrop-blur-sm border border-white/10 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-sky-300" />
                  <span className="text-white font-medium">{currentActiveBanKd.leaderPhone}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>


      <BanPendingGate
        enabled={isLeaderOfAny}
        lines={leaderAllNs as any}
        sup={leaderAllSup as any}
        allowedProjectIds={new Set(ledBanProjectIds)}
        blockLabel={(id) => {
          const b = blocks.find((x: any) => x.id === id);
          return (b?.name || b?.blockName || b?.code || b?.blockCode || id) as string;
        }}
        onGoApprove={(blockId) => {
          setSubTab('bankd-budgets');
          setBudgetMonthFilter('all');
          if (blockId && blockId !== '_none') setBudgetBlockFilter(blockId);
        }}
      />

      {/* Sub Tabs Navigation */}
      <Tabs value={subTab} onValueChange={(val: any) => setSubTab(val)} className="space-y-6">
        <div className={hideSubNav ? 'hidden' : 'w-full max-w-full pb-1'}>
          <TabsList className="bg-[var(--mh-surface-2,var(--mh-surface-2))] p-1 rounded-2xl h-auto grid grid-cols-3 gap-1 md:inline-flex md:shadow-sm w-full md:w-auto md:min-w-0 shadow-sm">
            <TabsTrigger 
              value="bankd-info" 
              className="rounded-xl px-2 sm:px-5 py-2.5 min-h-11 text-[var(--mh-text-2)] data-[state=active]:bg-[var(--mh-navy,var(--mh-navy))] data-[state=active]:text-white font-bold transition-all text-[11px] sm:text-sm flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
            >
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Thông tin Ban</span>
            </TabsTrigger>
            <TabsTrigger 
              value="bankd-budgets" 
              className="rounded-xl px-2 sm:px-5 py-2.5 min-h-11 text-[var(--mh-text-2)] data-[state=active]:bg-[var(--mh-navy,var(--mh-navy))] data-[state=active]:text-white font-bold transition-all text-[11px] sm:text-sm flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
            >
              <Wallet className="w-4 h-4 text-purple-600" />
              <span>Ngân sách Ban</span>
              {synchronizedBanBudgets.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-800 font-black">
                  {synchronizedBanBudgets.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="bankd-nt" 
              className="rounded-xl px-2 sm:px-5 py-2.5 min-h-11 text-[var(--mh-text-2)] data-[state=active]:bg-[var(--mh-navy,var(--mh-navy))] data-[state=active]:text-white font-bold transition-all text-[11px] sm:text-sm flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
            >
              <FileCheck className="w-4 h-4 text-indigo-600" />
              <span>Nghiệm Thu MKT</span>
              {synchronizedBanAcceptances.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-black">
                  {synchronizedBanAcceptances.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ======================================================== */}
        {/* SUBTAB 1: THÔNG TIN BAN                                   */}
        {/* ======================================================== */}
        <TabsContent value="bankd-info" className="space-y-6 animate-in fade-in duration-300">
          {!currentActiveBanKd ? (
            <Card className="border-dashed border-2 p-10 text-center text-[var(--mh-text-2)]">
              <Briefcase className="w-12 h-12 mx-auto text-[var(--mh-text-3)] mb-2" />
              <p className="font-bold">Chưa chọn Ban KD nào để xem thông tin.</p>
            </Card>
          ) : (
            <>
            <BanBanner banId={currentActiveBanKd.id} banName={currentActiveBanKd.name} uid={user?.uid}
              canEdit={!!(canManageBan || isCurrentBanDeputy)} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: General Ban Info & Members */}
              <div className="space-y-6">
                <Card className="border-[var(--mh-border)] shadow-md overflow-hidden bg-[var(--mh-surface)]">
                  <div className="h-1 bg-gradient-to-r from-blue-500 to-sky-500 w-full" />
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-black text-[var(--mh-text)] flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        Hồ sơ Ban Kinh Doanh
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px] font-bold border-blue-200 text-blue-700 bg-blue-50">
                        {currentActiveBanKd.code || 'N/A'}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      Thông tin cơ bản và lãnh đạo phụ trách Ban
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3.5 text-xs">
                    <div>
                      <span className="text-[var(--mh-text-3)] font-bold block uppercase text-[10px]">Tên Ban:</span>
                      <p className="font-black text-[var(--mh-text)] text-sm">{currentActiveBanKd.name}</p>
                    </div>
                    {currentActiveBanKd.description && (
                      <div>
                        <span className="text-[var(--mh-text-3)] font-bold block uppercase text-[10px]">Mô tả nhiệm vụ:</span>
                        <p className="text-[var(--mh-text-2)] leading-relaxed font-sans">{currentActiveBanKd.description}</p>
                      </div>
                    )}
                    <div className="pt-2 border-t border-[var(--mh-border)] space-y-2">
                      <span className="text-[var(--mh-text-3)] font-bold block uppercase text-[10px]">Lãnh đạo phụ trách:</span>
                      <div className="p-3 rounded-xl bg-[var(--mh-surface-2)] border border-[var(--mh-border)] space-y-1">
                        <p className="font-bold text-[var(--mh-text)] flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                          {currentActiveBanKd.leaderName || 'Chưa cập nhật tên'}
                        </p>
                        {currentActiveBanKd.leaderPhone && (
                          <p className="text-[var(--mh-text-2)] flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                            {currentActiveBanKd.leaderPhone}
                          </p>
                        )}
                        {currentActiveBanKd.leaderEmail && (
                          <p className="text-[var(--mh-text-2)] flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                            {currentActiveBanKd.leaderEmail}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Assigned Members Section */}
                <Card className="border-[var(--mh-border)] shadow-md overflow-hidden bg-[var(--mh-surface)]">
                  <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500 w-full" />
                  <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base font-black text-[var(--mh-text)] flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-600" />
                        Thành viên & Phân quyền ({assignedBanMembers.length + unresolvedMemberIds.length})
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Các nhân sự được phân quyền quản trị/theo dõi Ban KD này
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                    {canManageBan && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsMemberDialogOpen(true)}
                        className="h-8 text-xs font-bold border-emerald-200 text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100 rounded-xl"
                      >
                        <UserCheck className="w-3.5 h-3.5 mr-1" /> Gán thành viên
                      </Button>
                    )}
                    {canEditUserScopes && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsDeputyDialogOpen(true)}
                        className="h-8 text-xs font-bold border-violet-200 text-violet-700 bg-violet-50/60 hover:bg-violet-100 rounded-xl"
                        data-testid="ban-add-deputy-open"
                      >
                        + Phó Ban
                      </Button>
                    )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {assignedBanMembers.length === 0 && unresolvedMemberIds.length === 0 ? (
                      <p className="text-xs text-[var(--mh-text-3)] italic py-2">Chưa có thành viên nào được gán cho Ban KD này.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                        {assignedBanMembers.map((m) => {
                          const banRole = banRoleOf(currentActiveBanKd, m);
                          const isLead = banRole === 'truong_ban';
                          const isDep = banRole === 'pho_ban';
                          return (
                          <div key={m.id} className="py-2.5 flex items-center justify-between gap-2" data-testid="ban-member-row">
                            <div>
                              <p className="font-bold text-[var(--mh-text)] text-xs">{m.fullName || m.displayName || m.email}</p>
                              <p className="text-[10px] text-[var(--mh-text-2)]">{m.email} {m.teamName ? `• ${m.teamName}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              {banRole && (
                                <Badge variant="outline" className={`text-[10px] font-bold ${isLead ? 'border-indigo-200 text-indigo-700 bg-indigo-50' : isDep ? 'border-violet-200 text-violet-700 bg-violet-50' : 'border-[var(--mh-border)] text-[var(--mh-text-2)]'}`} data-testid="ban-role-badge">
                                  {BAN_ROLE_LABEL[banRole]}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {m.role || 'user'}
                              </Badge>
                              {canEditUserScopes && !isLead && (
                                isDep ? (
                                  <button type="button" onClick={() => handleToggleDeputy(m, false)} className="text-[10px] font-bold text-violet-700 hover:underline px-1" data-testid="ban-unset-deputy" title="Bỏ Phó Ban">Bỏ Phó</button>
                                ) : (
                                  <button type="button" onClick={() => handleToggleDeputy(m, true)} className="text-[10px] font-bold text-violet-700 hover:underline px-1" data-testid="ban-set-deputy" title="Đặt làm Phó Ban">Đặt Phó</button>
                                )
                              )}
                              {canManageBan && !isLead && (
                                <button
                                  onClick={() => handleToggleMember(m, true)}
                                  className="text-rose-500 hover:text-rose-700 text-xs px-1 font-bold"
                                  title="Gỡ khỏi Ban KD"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                          );
                        })}
                        {unresolvedMemberIds.map((mid: string) => (
                          <div key={`raw-${mid}`} className="py-2.5 flex items-center justify-between gap-2">
                            <p className="font-bold text-[var(--mh-text)] text-xs break-all">{mid}</p>
                            {canManageBan && (
                              <button
                                onClick={() => handleRemoveRawMember(mid)}
                                className="text-rose-500 hover:text-rose-700 text-xs px-1 font-bold"
                                title="Gỡ khỏi Ban KD"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Projects under this Ban KD */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="border-[var(--mh-border)] shadow-md overflow-hidden bg-[var(--mh-surface)]">
                  <div className="h-1 bg-gradient-to-r from-sky-500 to-indigo-600 w-full" />
                  <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base font-black text-[var(--mh-text)] flex items-center gap-2">
                        <Layers className="w-4 h-4 text-sky-600" />
                        Danh Sách Dự Án Trực Thuộc ({currentBanProjects.length})
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Các dự án thuộc quyền quản lý và phụ trách của {currentActiveBanKd.name}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {currentBanProjects.length === 0 ? (
                      <div className="p-8 text-center border-dashed border-2 border-[var(--mh-border)] rounded-2xl">
                        <Layers className="w-10 h-10 mx-auto text-[var(--mh-text-3)] mb-2" />
                        <p className="text-sm font-bold text-[var(--mh-text)]">Chưa có dự án nào được gán vào Ban KD này</p>
                        <p className="text-xs text-[var(--mh-text-2)] mt-1">Vui lòng vào phần Quản trị Dự án để gán dự án cho Ban KD.</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[var(--mh-border)] overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
                        <Table className="min-w-[480px]">
                          <TableHeader className="bg-[var(--mh-surface-2)]">
                            <TableRow>
                              <TableHead className="w-12 text-center text-xs font-bold">STT</TableHead>
                              <TableHead className="text-xs font-bold">Tên Dự Án</TableHead>
                              <TableHead className="text-xs font-bold">Khu Vực</TableHead>
                              <TableHead className="text-right text-xs font-bold">Ngân Sách ĐK (Khối)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentBanProjects.map((p, idx) => {
                              const projBudgets = synchronizedBanBudgets.filter(b => b.projectId === p.id);
                              const totalProjBudget = projBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
                              return (
                                <TableRow key={p.id} className="hover:bg-[var(--mh-surface-2)]/50">
                                  <TableCell className="text-center font-bold text-xs text-[var(--mh-text-2)]">{idx + 1}</TableCell>
                                  <TableCell className="font-bold text-xs text-[var(--mh-text)]">{p.name}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px] font-medium border-[var(--mh-border)] bg-[var(--mh-surface-2)]">
                                      {p.region || 'Toàn quốc'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-bold text-xs text-purple-700">
                                    {totalProjBudget > 0 ? formatCurrency(totalProjBudget) : <span className="text-[var(--mh-text-3)] font-normal italic">0 đ</span>}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
            </>
          )}
        </TabsContent>

        {/* ======================================================== */}
        {/* SUBTAB 2: NGÂN SÁCH BAN                                   */}
        {/* ======================================================== */}
        <TabsContent value="bankd-budgets" /* leader/admin view */ className="space-y-6 animate-in fade-in duration-300">
          {/* KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mh-text-3)]">Tổng Ngân Sách Khối Đăng Ký</p>
                  <p className="text-xl font-black text-purple-700 font-mono mt-0.5">
                    {formatCurrency(totalBanBudgetAmount)}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                  <Wallet className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mh-text-3)]">Số Khối Đăng Ký</p>
                  <p className="text-xl font-black text-blue-700 font-sans mt-0.5">
                    {totalDistinctBlocksRegistered} <span className="text-xs text-[var(--mh-text-3)] font-normal">Khối</span>
                  </p>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Building2 className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mh-text-3)]">Dự Án Có Ngân Sách</p>
                  <p className="text-xl font-black text-emerald-700 font-sans mt-0.5">
                    {totalDistinctProjectsWithBudget} / {currentBanProjects.length}
                  </p>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)]">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--mh-text-3)]">Số Bản Ghi Đăng Ký</p>
                  <p className="text-xl font-black text-[var(--mh-text)] font-sans mt-0.5">
                    {filteredBanBudgets.length} <span className="text-xs text-[var(--mh-text-3)] font-normal">hồ sơ</span>
                  </p>
                </div>
                <div className="p-3 bg-[var(--mh-surface-2)] text-[var(--mh-text-2)] rounded-2xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters Bar */}
          <Card className="border-[var(--mh-border)] shadow-sm bg-[var(--mh-surface)]">
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <FilterSheet label="Bộ lọc Ngân sách Ban" activeCount={budgetActiveFilters}>
                <div className="flex flex-wrap items-end gap-2.5 flex-1" data-testid="bankd-budget-filters">
                  {/* Search */}
                  <div className="relative w-full md:min-w-[200px] md:flex-1 md:max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--mh-text-3)]" />
                    <Input 
                      placeholder="Tìm dự án, khối..." 
                      value={budgetSearchTerm}
                      onChange={(e) => setBudgetSearchTerm(e.target.value)}
                      className="pl-8 text-xs h-9 rounded-xl border-[var(--mh-border)]"
                    />
                  </div>

                  {/* Month Filter */}
                  <div className="space-y-1 w-full md:w-auto">
                    <label className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-wider block ml-0.5">Theo tháng (kỳ 21→20)</label>
                    <Select value={budgetMonthFilter} onValueChange={setBudgetMonthFilter}>
                      <SelectTrigger data-testid="bankd-budget-month-filter" className="w-full md:w-[210px] text-xs h-11 md:h-9 rounded-xl border-[var(--mh-border)] bg-[var(--mh-surface-2)]">
                        <SelectValue placeholder="Tháng / Kỳ" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all">Tất cả tháng</SelectItem>
                        {availableBudgetMonths.map((m) => (
                          <SelectItem key={m} value={m}>{kyMonthLabel(m)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Block Filter */}
                  <div className="space-y-1 w-full md:w-auto">
                    <label className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-wider block ml-0.5">Theo Khối</label>
                    <Select value={budgetBlockFilter} onValueChange={setBudgetBlockFilter}>
                      <SelectTrigger data-testid="bankd-budget-block-filter" className="w-full md:w-[150px] text-xs h-11 md:h-9 rounded-xl border-[var(--mh-border)] bg-[var(--mh-surface-2)]">
                        <SelectValue placeholder="Khối" />
                      </SelectTrigger>
                      <SelectContent searchable className="rounded-xl">
                        <SelectItem value="all">Tất cả Khối</SelectItem>
                        {availableBudgetBlocks.map((blk) => (
                          <SelectItem key={blk.code} value={blk.code}>
                            {blk.name} ({blk.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Project Filter */}
                  <div className="space-y-1 w-full md:w-auto">
                    <label className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-wider block ml-0.5">Theo dự án</label>
                    <Select value={budgetProjectFilter} onValueChange={setBudgetProjectFilter}>
                      <SelectTrigger data-testid="bankd-budget-project-filter" className="w-full md:w-[170px] text-xs h-11 md:h-9 rounded-xl border-[var(--mh-border)] bg-[var(--mh-surface-2)]">
                        <SelectValue placeholder="Dự án" />
                      </SelectTrigger>
                      <SelectContent searchable className="rounded-xl">
                        <SelectItem value="all">Tất cả dự án Ban</SelectItem>
                        {currentBanProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Filter */}
                  <div className="space-y-1 w-full md:w-auto">
                    <label className="text-[10px] font-black text-[var(--mh-text-3)] uppercase tracking-wider block ml-0.5">Trạng thái</label>
                    <Select value={budgetStatusFilter} onValueChange={(v: any) => setBudgetStatusFilter(v)}>
                      <SelectTrigger className="w-full md:w-[150px] text-xs h-11 md:h-9 rounded-xl border-[var(--mh-border)] bg-[var(--mh-surface-2)]" data-testid="bankd-budget-status-filter">
                        <SelectValue placeholder="Trạng thái" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all">Tất cả trạng thái</SelectItem>
                        {BAN_BUDGET_STATUSES.filter((st) => synchronizedBanBudgets.some((b: any) => b.status === st)).map((st) => (
                          <SelectItem key={st} value={st}>{BAN_BUDGET_STATUS_LABEL[st]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                </FilterSheet>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* View Mode Toggle */}
                  <div className="flex items-center bg-[var(--mh-surface-2)] p-0.5 rounded-xl border border-[var(--mh-border)]">
                    <button
                      type="button"
                      onClick={() => setBudgetViewMode('table')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                        budgetViewMode === 'table' ? 'bg-[var(--mh-surface)] text-[var(--mh-text)] shadow-xs' : 'text-[var(--mh-text-2)] hover:text-[var(--mh-text)]'
                      }`}
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>Bảng chi tiết</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBudgetViewMode('cards')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                        budgetViewMode === 'cards' ? 'bg-[var(--mh-surface)] text-[var(--mh-text)] shadow-xs' : 'text-[var(--mh-text-2)] hover:text-[var(--mh-text)]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Theo dự án</span>
                    </button>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportBanBudgetsExcel}
                    className="h-9 text-xs font-bold border-emerald-200 text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100 rounded-xl"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Xuất Excel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {!banSupErr && banSplit.total > 0 && <SummaryBox split={banSplit as any} testId="vn-ban-split" />}
          <BanNsApprovePanel
            c={banCtx}
            lines={nsBanLines}
            sup={banSup}
            canApprove={canApproveBanNs}
            approverRole={banApprover || undefined}
            allowLineActions={!!(isAdmin || isSuperAdmin || isAccountant)}
            allowedProjectIds={currentBanProjectIds}
            filterMonth={budgetMonthFilter}
            filterBlock={budgetBlockFilter}
            filterProject={budgetProjectFilter}
          />

          {/* Budget Records Content */}
          {budgetViewMode === 'table' ? (
            <Card className="border-[var(--mh-border)] shadow-md overflow-hidden bg-[var(--mh-surface)]">
              <div className="overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              <Table data-mh-responsive className="md:min-w-[640px]">
                <TableHeader className="bg-[var(--mh-surface-2)]">
                  <TableRow>
                    <TableHead className="w-12 text-center text-xs font-bold">STT</TableHead>
                    <TableHead className="text-xs font-bold">Dự Án</TableHead>
                    <TableHead className="text-xs font-bold">Khối</TableHead>
                    <TableHead className="text-xs font-bold">Kỳ / Tháng</TableHead>
                    <TableHead className="text-right text-xs font-bold">Số tiền cần duyệt (VNĐ)</TableHead>
                    <TableHead className="text-xs font-bold">Trạng thái</TableHead>
                    <TableHead className="text-xs font-bold">Trạng thái Ban</TableHead>
                    <TableHead className="text-xs font-bold">Người Tạo</TableHead>
                    <TableHead className="text-xs font-bold">Ghi Chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBanBudgets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-[var(--mh-text-3)] text-xs italic">
                        Không có bản ghi ngân sách Khối nào phù hợp với bộ lọc cho Ban KD này.
                      </TableCell>
                    </TableRow>
                  ) : (
                    budgetRowsByProject.map((g) => (<React.Fragment key={g.projectId}>
                      <TableRow className="bg-[var(--mh-surface-2)] mh-group-row" data-testid="bankd-budget-project-group" data-project={g.projectId}>
                        <TableCell colSpan={4} className="text-xs font-black text-[var(--mh-text)]">{g.label} <span className="font-normal text-[var(--mh-text-3)]">· {g.rows.length} bản · {g.blocks.length} Khối</span></TableCell>
                        <TableCell data-label="Tổng dự án" className="text-right font-mono font-black text-xs text-[var(--mh-text)]">{formatCurrency(g.subtotal)}</TableCell>
                        <TableCell colSpan={4} />
                      </TableRow>
                      {g.rows.map((b: any, idx: number) => (
                      <TableRow key={b.id || idx} className="hover:bg-[var(--mh-surface-2)]/50">
                        <TableCell data-label="STT" className="text-center font-bold text-xs text-[var(--mh-text-2)]">{idx + 1}</TableCell>
                        <TableCell data-label="Dự án">
                          <p className="font-bold text-xs text-[var(--mh-text)]">{b.projectName || 'N/A'}</p>
                        </TableCell>
                        <TableCell data-label="Khối">
                          <Badge variant="outline" className="text-xs font-bold border-[var(--mh-border)] text-[var(--mh-pending)] bg-[var(--mh-pending-soft)]">
                            {b.blockName || b.blockCode || 'Khối'}
                          </Badge>
                        </TableCell>
                        <TableCell data-label="Kỳ" className="font-mono text-xs font-semibold text-[var(--mh-text)]">
                          {b.month ? kyMonthLabel(b.month) : 'N/A'}
                        </TableCell>
                        <TableCell data-label="Số tiền cần duyệt" className="text-right font-mono font-black text-xs text-[var(--mh-pending)]">
                          {formatCurrency(Number(b.amount) || 0)}
                        </TableCell>
                        <TableCell data-label="Trạng thái" className="text-xs whitespace-nowrap" data-testid="bankd-budget-status">
                          <BanBudgetStatusBadge status={b.status} />{b.lineCount > 1 && <span className="ml-1 text-[10px] text-[var(--mh-text-3)]">{b.lineCount} bản</span>}
                        </TableCell>
                        <TableCell data-label="Trạng thái Ban" className="text-xs whitespace-nowrap" data-testid="bankd-budget-ban-status">
                          {(() => {
                            const ids: string[] = b.lineIds || [];
                            if (!ids.length) return <span className="text-[var(--mh-text-3)]">—</span>;
                            const labels = [...new Set(ids.map((id) => {
                              const l = nsBanLines.find((x: any) => x.id === id);
                              return l ? BAN_STATUS_LABEL[effectiveBanStatus(l, banSup[id])] : '';
                            }).filter(Boolean))];
                            return labels.length ? labels.join(', ') : '—';
                          })()}
                        </TableCell>
                        <TableCell data-label="Người tạo" className="text-xs text-[var(--mh-text-2)]">
                          {b.createdByName || b.userEmail || 'Hệ thống'}
                        </TableCell>
                        <TableCell data-label="Ghi chú" className="text-xs text-[var(--mh-text-2)] italic max-w-xs truncate">
                          {b.notes || b.note || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                    </React.Fragment>                    ))
                  )}
                </TableBody>
                {filteredBanBudgets.length > 0 && (
                  <TableFooter className="bg-[var(--mh-surface-2)] font-black">
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-xs uppercase tracking-wider text-[var(--mh-text)]">
                        Tổng cộng Ngân sách ({filteredBanBudgets.length} bản ghi):
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-purple-800">
                        {formatCurrency(totalBanBudgetAmount)}
                      </TableCell>
                      <TableCell colSpan={3}></TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
              </div>
            </Card>
          ) : (
            /* Cards / Grouped By Project View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {budgetsGroupedByProject.map(({ project, totalAmount, registrations, blocksMap }) => (
                <Card key={project.id} className="border-[var(--mh-border)]/90 shadow-sm rounded-2xl bg-[var(--mh-surface)] overflow-hidden flex flex-col justify-between">
                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-black text-[var(--mh-text)] text-sm">{project.name}</h4>
                      </div>
                      <Badge className="text-[10px] font-bold bg-purple-100 text-purple-800 border-none">
                        {registrations.length} lượt ĐK
                      </Badge>
                    </div>

                    <div className="pt-2 border-t border-[var(--mh-border)]">
                      <span className="text-[10px] font-bold uppercase text-[var(--mh-text-3)] block">Tổng ngân sách các Khối:</span>
                      <p className="text-lg font-black text-purple-700 font-mono">
                        {formatCurrency(totalAmount)}
                      </p>
                    </div>

                    {/* Breakdown by Block */}
                    {Object.keys(blocksMap).length > 0 && (
                      <div className="space-y-1.5 pt-2">
                        <span className="text-[10px] font-bold uppercase text-[var(--mh-text-3)] block">Phân bổ theo Khối:</span>
                        <div className="space-y-1">
                          {Object.entries(blocksMap).map(([blkName, blkAmt]) => (
                            <div key={blkName} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-[var(--mh-surface-2)]">
                              <span className="font-medium text-[var(--mh-text)]">{blkName}</span>
                              <span className="font-mono font-bold text-purple-700">{formatCurrency(blkAmt)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ======================================================== */}
        {/* SUBTAB 3: NGHIỆM THU MKT                                   */}
        {/* ======================================================== */}
        <TabsContent value="bankd-nt" className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-4 sm:p-5 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-indigo-950">
                  Nghiệm Thu MKT Theo Dự Án Ban KD: {currentActiveBanKd?.name}
                </span>
                <Badge className="bg-indigo-600 text-white text-[10px]">
                  {synchronizedBanAcceptances.length} bản ghi
                </Badge>
              </div>
              <p className="text-xs text-[var(--mh-text-2)]">
                Đồng bộ trực tiếp từ phần Nghiệm thu Marketing tổng hợp, tự động lọc tất cả các bản ghi phát sinh theo từng dự án thuộc Ban KD này.
              </p>
            </div>
          </div>

          {/* Reusable AcceptanceManager scoped to Ban KD Projects */}
          <AcceptanceManager 
            ntRequiredFrom={ntRequiredFrom}
            allUsers={allUsers}
            ntCtx={ntCtx}
            canUploadImages={canUploadImages}
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            isMod={isMod}
            isAccountant={isAccountant}
            user={user}
            userProfile={userProfile}
            isGDKhoi={false}
            isTroLyKhoi={false}
            isAssistant={false}
            canCreate={(isAdmin || isSuperAdmin || isMod)}
            canEdit={(isAdmin || isSuperAdmin || isMod)}
            canDelete={(isAdmin || isSuperAdmin || isMod)}
            teams={teams}
            uniqueTeams={teams}
            projects={currentBanProjects}
            regions={regions}
            acceptances={synchronizedBanAcceptances}
            finalAcceptances={synchronizedBanFinalAcceptances}
            teamMap={teamMap}
            projectMap={projectMap}
            formatCurrency={formatCurrency}
            getMarketingMonth={getMarketingMonth}
            handleFirestoreError={handleFirestoreError}
            formatCurrencyInput={formatCurrencyInput}
            blocks={blocks}
          />
        </TabsContent>
      </Tabs>

      {/* Member Assignment Dialog */}
      <Dialog open={isMemberDialogOpen} onOpenChange={setIsMemberDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Gán thành viên cho {currentActiveBanKd?.name}</DialogTitle>
            <DialogDescription>
              Chọn các nhân sự trong hệ thống có quyền xem và quản lý dữ liệu của Ban Kinh Doanh này.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mt-1">
            <Input
              placeholder="Thêm theo email (vd: ten@congty.vn)"
              value={memberEmailInput}
              onChange={(e) => setMemberEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddMemberByEmail(); } }}
              className="h-9 text-xs rounded-xl"
            />
            <Button size="sm" className="h-9 text-xs rounded-xl" onClick={handleAddMemberByEmail}>Thêm</Button>
          </div>

          <div className="relative my-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--mh-text-3)]" />
            <Input 
              placeholder="Tìm theo tên, email, chức vụ..."
              value={memberSearchTerm}
              onChange={(e) => setMemberSearchTerm(e.target.value)}
              className="pl-8 text-xs h-9 rounded-xl border-[var(--mh-border)]"
            />
          </div>

          <div className="max-h-[350px] overflow-y-auto space-y-1.5 py-1">
            {allUsers
              .filter(u => {
                if (!memberSearchTerm.trim()) return true;
                const q = memberSearchTerm.toLowerCase().trim();
                return (
                  (u.fullName || '').toLowerCase().includes(q) ||
                  (u.displayName || '').toLowerCase().includes(q) ||
                  (u.email || '').toLowerCase().includes(q) ||
                  (u.role || '').toLowerCase().includes(q)
                );
              })
              .map(u => {
                const isAssigned = assignedBanMembers.some(m => m.id === u.id);
                return (
                  <div key={u.id} className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--mh-border)] hover:bg-[var(--mh-surface-2)] transition-colors">
                    <div>
                      <p className="font-bold text-xs text-[var(--mh-text)]">{u.fullName || u.displayName || u.email}</p>
                      <p className="text-[10px] text-[var(--mh-text-2)]">{u.email} • Vai trò: <span className="capitalize font-medium">{u.role || 'user'}</span></p>
                    </div>
                    <Button
                      size="sm"
                      variant={isAssigned ? "destructive" : "default"}
                      className="h-7 text-xs px-3 rounded-lg"
                      onClick={() => handleToggleMember(u, isAssigned)}
                    >
                      {isAssigned ? 'Gỡ' : 'Gán vào Ban'}
                    </Button>
                  </div>
                );
              })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMemberDialogOpen(false)} className="rounded-xl">
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Thêm Phó Ban trực tiếp */}
      <Dialog open={isDeputyDialogOpen} onOpenChange={setIsDeputyDialogOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-3xl" data-testid="ban-add-deputy-dialog">
          <DialogHeader>
            <DialogTitle>Thêm Phó Ban · {currentActiveBanKd?.name}</DialogTitle>
            <DialogDescription>
              Đồng bộ ban_kd.deputyUids và users.assignedBanKds. Vai trò thường → «Phó Ban KD»; Admin/GĐK/Trưởng… giữ vai trò. Miễn cập nhật STK.
            </DialogDescription>
          </DialogHeader>
          <div className="relative my-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--mh-text-3)]" />
            <Input
              placeholder="Tìm theo tên, email..."
              value={deputySearchTerm}
              onChange={(e) => setDeputySearchTerm(e.target.value)}
              className="pl-8 text-xs h-9 rounded-xl border-[var(--mh-border)]"
            />
          </div>
          <div className="max-h-[350px] overflow-y-auto space-y-1.5 py-1">
            {allUsers
              .filter((u) => !u.mergedInto && !u.linkedToUid)
              .filter((u) => {
                if (!deputySearchTerm.trim()) return true;
                const q = deputySearchTerm.toLowerCase().trim();
                return (
                  (u.fullName || '').toLowerCase().includes(q) ||
                  (u.displayName || '').toLowerCase().includes(q) ||
                  (u.email || '').toLowerCase().includes(q)
                );
              })
              .slice(0, 80)
              .map((u) => {
                const isDep = currentActiveBanKd ? isDeputyOf(currentActiveBanKd, u) : false;
                const isLead = currentActiveBanKd ? isBanKdLeader(currentActiveBanKd, u, u) : false;
                return (
                  <div key={u.id} className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--mh-border)] hover:bg-[var(--mh-surface-2)]">
                    <div>
                      <p className="font-bold text-xs text-[var(--mh-text)]">{u.fullName || u.displayName || u.email}</p>
                      <p className="text-[10px] text-[var(--mh-text-2)]">{u.email} · {u.role || 'user'}{isLead ? ' · Trưởng ban' : ''}{isDep ? ' · Phó ban' : ''}</p>
                    </div>
                    <Button
                      size="sm"
                      disabled={isLead}
                      variant={isDep ? 'destructive' : 'default'}
                      className="h-7 text-xs px-3 rounded-lg"
                      onClick={async () => {
                        await handleToggleDeputy(u, !isDep);
                      }}
                    >
                      {isLead ? 'Trưởng ban' : isDep ? 'Bỏ Phó' : 'Đặt Phó'}
                    </Button>
                  </div>
                );
              })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeputyDialogOpen(false)} className="rounded-xl">Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
