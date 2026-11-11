import React, { useState, useMemo } from 'react';
import { loadXlsx } from '../lib/loadXlsx';
import { 
  Receipt, Building2, Calendar, Search, Filter, Plus, 
  Edit3, Trash2, CheckCircle2, AlertCircle, FileSpreadsheet, 
  ArrowUpDown, RefreshCw, Layers, Check, X, ShieldCheck, 
  AlertTriangle, DollarSign, CreditCard, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp 
} from '../firestore-proxy';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DraggableTableContainer } from './DraggableTableContainer';

interface AdminReciprocalBudgetsProps {
  reciprocalBudgets: any[];
  blocks: any[];
  teams: any[];
  allUsers: any[];
  blockBudgets: any[];
  budgets: any[];
  projects?: any[];
  banKdList?: any[];
  user: any;
  userProfile: any;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isAccountant: boolean;
  canView?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  currentMarketingPeriod: string;
  formatCurrency: (val: number) => string;
  formatCurrencyInput: (val: string) => string;
  parseVal: (val: any) => number;
  safeFormat: (date: any, fmt?: string) => string;
  logAction: (action: string, entity: string, id?: string, data?: any) => Promise<void>;
  db: any;
}

type SortField = 'stt' | 'block' | 'director' | 'month' | 'totalBlockBudget' | 'companyCardBudget' | 'externalBudget' | 'approvedReciprocalBudget' | 'paymentStatus' | 'note' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export type PaymentStatusType = 'unpaid' | 'paid' | 'rejected';

const normalizeBlockIdentifier = (val: string | undefined | null): string => {
  if (!val) return '';
  return String(val)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(khoi|block|k\.|k)\s*/i, '')
    .replace(/[^a-z0-9.]/gi, '')
    .trim();
};

const isBlockRecordMatch = (record: any, block: any): boolean => {
  if (!record || !block) return false;

  const targetId = (block.id || '').trim();
  const targetCode = (block.blockCode || '').trim().toLowerCase();
  const targetName = (block.name || '').trim().toLowerCase();

  const recBlockId = (record.blockId || '').trim();
  const recCode = (record.blockCode || '').trim().toLowerCase();
  const recName = (record.blockName || '').trim().toLowerCase();

  // 1. Exact blockId match
  if (recBlockId && targetId && recBlockId === targetId) {
    return true;
  }

  // 2. Legacy: blockId was stored as blockCode
  if (recBlockId && targetCode && recBlockId.toLowerCase() === targetCode) {
    return true;
  }

  // 3. If recBlockId is a distinct Firestore ID (>= 15 chars) and doesn't match targetId, it's another block!
  if (recBlockId && recBlockId.length >= 15 && targetId && recBlockId !== targetId) {
    return false;
  }

  // 4. Exact code match
  if (recCode && targetCode && recCode === targetCode) {
    return true;
  }

  // 5. Exact name match
  if (recName && targetName && recName === targetName) {
    return true;
  }

  // If both have codes and they differ, do not cross-match different blocks
  if (recCode && targetCode && recCode !== targetCode) {
    return false;
  }

  // 6. Normalized match
  const normTargetCode = normalizeBlockIdentifier(block.blockCode);
  const normTargetName = normalizeBlockIdentifier(block.name);
  const normRecCode = normalizeBlockIdentifier(record.blockCode);
  const normRecName = normalizeBlockIdentifier(record.blockName);

  if (normTargetCode && normRecCode && normTargetCode === normRecCode) return true;
  if (normTargetName && normRecName && normTargetName === normRecName) return true;
  if (normTargetCode && normRecName && normTargetCode === normRecName) return true;
  if (normTargetName && normRecCode && normTargetName === normRecCode) return true;

  return false;
};

export const getPaymentStatusInfo = (status?: string) => {
  if (status === 'paid' || status === 'Đã thanh toán') {
    return {
      value: 'paid' as PaymentStatusType,
      label: 'Đã thanh toán',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
      selectItemClass: 'text-emerald-800 font-bold',
      dotClass: 'bg-emerald-500'
    };
  }
  if (status === 'rejected' || status === 'Từ chối') {
    return {
      value: 'rejected' as PaymentStatusType,
      label: 'Từ chối',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
      selectItemClass: 'text-rose-800 font-bold',
      dotClass: 'bg-rose-500'
    };
  }
  return {
    value: 'unpaid' as PaymentStatusType,
    label: 'Chưa thanh toán',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
    selectItemClass: 'text-amber-800 font-bold',
    dotClass: 'bg-amber-500'
  };
};

export function AdminReciprocalBudgets({
  reciprocalBudgets,
  blocks,
  teams,
  allUsers,
  blockBudgets,
  budgets,
  projects = [],
  banKdList = [],
  user,
  userProfile,
  isAdmin,
  isSuperAdmin,
  isAccountant,
  canView,
  canCreate,
  canEdit,
  canDelete,
  currentMarketingPeriod,
  formatCurrency,
  formatCurrencyInput,
  parseVal,
  safeFormat,
  logAction,
  db
}: AdminReciprocalBudgetsProps) {
  const hasViewPerm = canView !== undefined ? canView : (isAdmin || isSuperAdmin || isAccountant);
  const hasCreatePerm = canCreate !== undefined ? canCreate : (isAdmin || isSuperAdmin || isAccountant);
  const hasEditPerm = canEdit !== undefined ? canEdit : (isAdmin || isSuperAdmin || isAccountant);
  const hasDeletePerm = canDelete !== undefined ? canDelete : (isAdmin || isSuperAdmin || isAccountant);

  // Filters
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterBanKd, setFilterBanKd] = useState<string>('all');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('month');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Quick Approval Dialog / Inline
  const [approvalRecord, setApprovalRecord] = useState<any | null>(null);
  const [approvalAmountInput, setApprovalAmountInput] = useState<string>('');
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState<boolean>(false);

  // Add / Edit Dialog
  const [isFormDialogOpen, setIsFormDialogOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [formBlockId, setFormBlockId] = useState<string>('');
  const [formMonth, setFormMonth] = useState<string>('');
  const [formCompanyCardInput, setFormCompanyCardInput] = useState<string>('');
  const [formExternalInput, setFormExternalInput] = useState<string>('');
  const [formApprovedInput, setFormApprovedInput] = useState<string>('');
  const [formPaymentStatus, setFormPaymentStatus] = useState<PaymentStatusType>('unpaid');
  const [formNote, setFormNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Delete Dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [recordToDelete, setRecordToDelete] = useState<any | null>(null);

  // Quick Update Payment Status
  const handleQuickUpdatePaymentStatus = async (record: any, newStatus: string) => {
    if (!hasEditPerm) {
      toast.error('Bạn không có quyền cập nhật trạng thái thanh toán! Chỉ Admin, Kế toán hoặc người được phân quyền mới có thể cập nhật.');
      return;
    }
    try {
      const statusInfo = getPaymentStatusInfo(newStatus);
      await updateDoc(doc(db, 'reciprocal_budgets', record.id), {
        paymentStatus: statusInfo.value,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'Admin',
        updatedByName: userProfile?.displayName || user?.displayName || user?.email || 'Admin'
      });

      await logAction('UPDATE_PAYMENT_STATUS_RECIPROCAL', 'reciprocal_budgets', record.id, {
        blockCode: record.blockCode,
        month: record.month,
        previousStatus: record.paymentStatus || 'unpaid',
        newStatus: statusInfo.value
      });

      toast.success(`Đã cập nhật trạng thái thanh toán: "${statusInfo.label}" cho khối ${record.blockName || record.blockCode} (Kỳ ${record.month})`);
    } catch (err: any) {
      console.error('Error updating payment status:', err);
      toast.error('Lỗi khi cập nhật thanh toán: ' + (err.message || ''));
    }
  };

  // Helper to compute block total budget for a block and month
  const computeBlockTotalBudget = (targetBlock: any, targetMonth: string) => {
    if (!targetBlock || !targetMonth) return 0;
    
    // 1. Direct block budgets
    const directSum = blockBudgets
      .filter(bb => 
        (bb.blockId === targetBlock.id || bb.blockCode === targetBlock.blockCode) && 
        bb.month === targetMonth
      )
      .reduce((sum, bb) => sum + (bb.amount || 0), 0);

    if (directSum > 0) return directSum;

    // 2. Team budgets fallback
    const blockTeams = teams.filter(t => {
      if (t.blockId && t.blockId === targetBlock.id) return true;
      if (t.blockCode && t.blockCode === targetBlock.blockCode) return true;
      const prefix = targetBlock.teamPrefix || '';
      if (prefix && t.teamCode && t.teamCode.toUpperCase().startsWith(prefix.toUpperCase())) return true;
      return false;
    });
    const blockTeamIds = new Set(blockTeams.map(t => t.id));
    const blockTeamNames = new Set(blockTeams.map(t => (t.name || '').toLowerCase().trim()));

    const teamSum = budgets
      .filter(b => 
        b.month === targetMonth && 
        (blockTeamIds.has(b.teamId) || blockTeamNames.has((b.teamName || '').toLowerCase().trim()))
      )
      .reduce((sum, b) => sum + (b.amount || 0), 0);

    return teamSum;
  };

  // List of distinct months in reciprocal records and block budgets
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    reciprocalBudgets.forEach(r => { if (r.month) set.add(r.month); });
    blockBudgets.forEach(b => { if (b.month) set.add(b.month); });
    if (currentMarketingPeriod) set.add(currentMarketingPeriod);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [reciprocalBudgets, blockBudgets, currentMarketingPeriod]);

  // Director Lookup Helper
  const getBlockDirectorName = (blockIdOrCode: string, fallbackName?: string) => {
    const block = blocks.find(b => b.id === blockIdOrCode || b.blockCode === blockIdOrCode);
    if (!block) return fallbackName || 'Chưa gán';
    if (block.directorUid) {
      const u = allUsers.find(usr => usr.uid === block.directorUid || usr.id === block.directorUid);
      if (u) return u.displayName || u.email || 'Chưa gán';
    }
    // Check users by assignedBlock
    const u = allUsers.find(usr => (usr.role === 'gd_khoi' || usr.role === 'gdkhoi') && (usr.assignedBlock === block.blockCode || usr.assignedBlocks?.includes(block.blockCode)));
    if (u) return u.displayName || u.email || 'Chưa gán';
    return fallbackName || block.directorName || 'Chưa gán';
  };

  // Filtered list
  const filteredRecords = useMemo(() => {
    return reciprocalBudgets.filter(rec => {
      // Filter Block
      if (filterBlock !== 'all') {
        const targetBlock = blocks.find(b => b.id === filterBlock || b.blockCode === filterBlock);
        if (targetBlock) {
          if (!isBlockRecordMatch(rec, targetBlock)) return false;
        } else {
          if (rec.blockId !== filterBlock && rec.blockCode !== filterBlock) return false;
        }
      }

      // Filter Month
      if (filterMonth !== 'all') {
        if (rec.month !== filterMonth) return false;
      }

      // Filter Project
      if (filterProject !== 'all') {
        const matchesProject = () => {
          if (rec.projectId === filterProject) return true;
          const targetBlock = blocks.find(b => isBlockRecordMatch(rec, b));
          const blockId = targetBlock?.id || rec.blockId;
          const blockCode = targetBlock?.blockCode || rec.blockCode;
          // Check in blockBudgets
          const hasInBlockBudgets = blockBudgets.some(bb => 
            (bb.blockId === blockId || bb.blockCode === blockCode) &&
            bb.month === rec.month &&
            (bb.projectId === filterProject || bb.projectName === filterProject)
          );
          if (hasInBlockBudgets) return true;
          // Check in budgets (team budgets)
          const hasInTeamBudgets = budgets.some(b => {
            if (b.month !== rec.month || b.projectId !== filterProject) return false;
            const t = teams.find(tm => tm.id === b.teamId);
            return t && (t.blockId === blockId || t.blockCode === blockCode);
          });
          return hasInTeamBudgets;
        };
        if (!matchesProject()) return false;
      }

      // Filter Ban KD
      if (filterBanKd !== 'all') {
        const matchesBanKd = () => {
          if (rec.banKdId === filterBanKd) return true;
          const targetBlock = blocks.find(b => isBlockRecordMatch(rec, b));
          const blockId = targetBlock?.id || rec.blockId;
          const blockCode = targetBlock?.blockCode || rec.blockCode;
          // Check in blockBudgets
          const hasInBlockBudgets = blockBudgets.some(bb => {
            if ((bb.blockId !== blockId && bb.blockCode !== blockCode) || bb.month !== rec.month) return false;
            if (bb.banKdId === filterBanKd || bb.banKdName === filterBanKd) return true;
            const proj = projects.find((p: any) => p.id === bb.projectId);
            return proj && (proj.banKdId === filterBanKd || proj.banKdName === filterBanKd);
          });
          if (hasInBlockBudgets) return true;
          // Check block itself or its assigned leader / users
          const targetBan = banKdList.find((b: any) => b.id === filterBanKd);
          if (targetBan) {
            if (targetBlock?.directorUid && (targetBan.leaderUid === targetBlock.directorUid || targetBan.leaderId === targetBlock.directorUid)) return true;
            if (targetBan.code && (targetBlock?.name || '').includes(targetBan.code)) return true;
          }
          return false;
        };
        if (!matchesBanKd()) return false;
      }

      // Filter Payment Status
      if (filterPaymentStatus !== 'all') {
        const pStatus = getPaymentStatusInfo(rec.paymentStatus).value;
        if (pStatus !== filterPaymentStatus) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const bName = (rec.blockName || '').toLowerCase();
        const bCode = (rec.blockCode || '').toLowerCase();
        const dName = (rec.directorName || getBlockDirectorName(rec.blockId || rec.blockCode, '')).toLowerCase();
        const note = (rec.note || '').toLowerCase();
        const pLabel = getPaymentStatusInfo(rec.paymentStatus).label.toLowerCase();
        const creator = (rec.createdByName || rec.createdBy || '').toLowerCase();
        if (!bName.includes(q) && !bCode.includes(q) && !dName.includes(q) && !note.includes(q) && !pLabel.includes(q) && !creator.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [reciprocalBudgets, filterBlock, filterMonth, filterProject, filterBanKd, filterPaymentStatus, searchQuery, blocks, blockBudgets, budgets, teams, projects, banKdList, allUsers]);

  // Sorted list
  const sortedRecords = useMemo(() => {
    const list = [...filteredRecords];
    list.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (sortField) {
        case 'block':
          valA = a.blockName || a.blockCode || '';
          valB = b.blockName || b.blockCode || '';
          return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'director':
          valA = a.directorName || getBlockDirectorName(a.blockId || a.blockCode, '');
          valB = b.directorName || getBlockDirectorName(b.blockId || b.blockCode, '');
          return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'month':
          valA = a.month || '';
          valB = b.month || '';
          return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'totalBlockBudget':
          valA = Number(a.totalBlockBudget || 0);
          valB = Number(b.totalBlockBudget || 0);
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        case 'companyCardBudget':
          valA = Number(a.companyCardBudget || 0);
          valB = Number(b.companyCardBudget || 0);
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        case 'externalBudget':
          valA = Number(a.externalBudget || 0);
          valB = Number(b.externalBudget || 0);
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        case 'approvedReciprocalBudget':
          valA = Number(a.approvedReciprocalBudget || 0);
          valB = Number(b.approvedReciprocalBudget || 0);
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        case 'paymentStatus':
          valA = getPaymentStatusInfo(a.paymentStatus).label;
          valB = getPaymentStatusInfo(b.paymentStatus).label;
          return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'note':
          valA = a.note || '';
          valB = b.note || '';
          return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'createdAt':
          valA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          valB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        default:
          return 0;
      }
    });
    return list;
  }, [filteredRecords, sortField, sortDirection, blocks, allUsers]);

  // Aggregate Metrics
  const summaryTotals = useMemo(() => {
    return sortedRecords.reduce(
      (acc, r) => {
        acc.totalBlock += (r.totalBlockBudget || 0);
        acc.totalCard += (r.companyCardBudget || 0);
        acc.totalExternal += (r.externalBudget || 0);
        acc.totalApproved += (r.approvedReciprocalBudget || 0);
        return acc;
      },
      { totalBlock: 0, totalCard: 0, totalExternal: 0, totalApproved: 0 }
    );
  }, [sortedRecords]);

  // Sort Toggle Handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Open Quick Approval Dialog
  const handleOpenApproval = (record: any) => {
    setApprovalRecord(record);
    setApprovalAmountInput(
      record.approvedReciprocalBudget 
        ? formatCurrencyInput(String(record.approvedReciprocalBudget)) 
        : (record.externalBudget ? formatCurrencyInput(String(record.externalBudget)) : '0')
    );
    setIsApprovalDialogOpen(true);
  };

  // Save Approved Reciprocal Budget
  const handleSaveApproval = async () => {
    if (!hasEditPerm) {
      toast.error('Bạn không có quyền phê duyệt ngân sách đối ứng!');
      return;
    }
    if (!approvalRecord) return;
    const approvedVal = parseVal(approvalAmountInput);
    if (approvedVal < 0) {
      toast.error('Ngân sách đối ứng được duyệt không thể âm!');
      return;
    }

    try {
      await updateDoc(doc(db, 'reciprocal_budgets', approvalRecord.id), {
        approvedReciprocalBudget: approvedVal,
        approvalStatus: approvedVal > 0 ? 'approved' : 'pending',
        approvedAt: serverTimestamp(),
        approvedBy: user?.email || 'Admin',
        approvedByName: userProfile?.displayName || user?.displayName || user?.email || 'Admin',
        updatedAt: serverTimestamp()
      });

      await logAction('APPROVE_RECIPROCAL_BUDGET', 'reciprocal_budgets', approvalRecord.id, {
        blockCode: approvalRecord.blockCode,
        month: approvalRecord.month,
        approvedReciprocalBudget: approvedVal
      });

      toast.success(`Đã cập nhật Ngân sách đối ứng được duyệt: ${formatCurrency(approvedVal)}`);
      setIsApprovalDialogOpen(false);
      setApprovalRecord(null);
    } catch (err: any) {
      console.error('Error approving reciprocal budget:', err);
      toast.error('Lỗi khi phê duyệt: ' + (err.message || ''));
    }
  };

  // Open Add / Edit Form Modal
  const handleOpenFormModal = (record?: any) => {
    if (record && !hasEditPerm) {
      toast.error('Bạn không có quyền chỉnh sửa ngân sách đối ứng!');
      return;
    }
    if (!record && !hasCreatePerm) {
      toast.error('Bạn không có quyền thêm mới ngân sách đối ứng!');
      return;
    }
    if (record) {
      setEditingRecord(record);
      setFormBlockId(record.blockId || record.blockCode);
      setFormMonth(record.month || currentMarketingPeriod);
      setFormCompanyCardInput(record.companyCardBudget ? formatCurrencyInput(String(record.companyCardBudget)) : '0');
      setFormExternalInput(record.externalBudget ? formatCurrencyInput(String(record.externalBudget)) : '0');
      setFormApprovedInput(record.approvedReciprocalBudget ? formatCurrencyInput(String(record.approvedReciprocalBudget)) : '0');
      setFormPaymentStatus(getPaymentStatusInfo(record.paymentStatus).value);
      setFormNote(record.note || '');
    } else {
      setEditingRecord(null);
      setFormBlockId(blocks[0]?.id || '');
      setFormMonth(currentMarketingPeriod || '');
      setFormCompanyCardInput('0');
      setFormExternalInput('0');
      setFormApprovedInput('0');
      setFormPaymentStatus('unpaid');
      setFormNote('');
    }
    setIsFormDialogOpen(true);
  };

  // Calculate total block budget for selected block and month in form
  const selectedFormBlock = useMemo(() => {
    return blocks.find(b => b.id === formBlockId || b.blockCode === formBlockId) || null;
  }, [blocks, formBlockId]);

  const formComputedBlockBudget = useMemo(() => {
    if (!selectedFormBlock || !formMonth) return 0;
    return computeBlockTotalBudget(selectedFormBlock, formMonth);
  }, [selectedFormBlock, formMonth, blockBudgets, budgets, teams]);

  // Suggested external in form
  const formParsedCard = parseVal(formCompanyCardInput);
  const formSuggestedExternal = Math.max(0, formComputedBlockBudget - formParsedCard);

  // Submit Add / Edit Form
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRecord && !hasEditPerm) {
      toast.error('Bạn không có quyền chỉnh sửa ngân sách đối ứng!');
      return;
    }
    if (!editingRecord && !hasCreatePerm) {
      toast.error('Bạn không có quyền thêm mới ngân sách đối ứng!');
      return;
    }
    if (!selectedFormBlock) {
      toast.error('Vui lòng chọn Khối!');
      return;
    }
    if (!formMonth.trim()) {
      toast.error('Vui lòng nhập Tháng (YYYY-MM)!');
      return;
    }
    const cardVal = parseVal(formCompanyCardInput);
    const extVal = parseVal(formExternalInput);
    const appVal = parseVal(formApprovedInput);

    if (formComputedBlockBudget > 0 && cardVal > formComputedBlockBudget) {
      toast.error(`Ngân sách qua thẻ (${formatCurrency(cardVal)}) không được vượt quá Tổng ngân sách Khối (${formatCurrency(formComputedBlockBudget)})!`);
      return;
    }

    setIsSaving(true);
    try {
      const directorName = getBlockDirectorName(selectedFormBlock.id, selectedFormBlock.directorName);
      const payload = {
        blockId: selectedFormBlock.id,
        blockCode: selectedFormBlock.blockCode,
        blockName: selectedFormBlock.name || selectedFormBlock.blockCode,
        directorUid: selectedFormBlock.directorUid || '',
        directorName,
        month: formMonth.trim(),
        totalBlockBudget: formComputedBlockBudget,
        companyCardBudget: cardVal,
        externalBudget: extVal,
        approvedReciprocalBudget: appVal,
        approvalStatus: appVal > 0 ? 'approved' : 'pending',
        paymentStatus: formPaymentStatus || 'unpaid',
        note: formNote.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'Admin',
        updatedByName: userProfile?.displayName || user?.displayName || user?.email || 'Admin'
      };

      if (editingRecord) {
        await updateDoc(doc(db, 'reciprocal_budgets', editingRecord.id), payload);
        await logAction('ADMIN_UPDATE_RECIPROCAL_BUDGET', 'reciprocal_budgets', editingRecord.id, payload);
        toast.success(`Đã cập nhật bản ghi đối ứng cho khối ${selectedFormBlock.name} kỳ ${formMonth}`);
      } else {
        const docRef = await addDoc(collection(db, 'reciprocal_budgets'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user?.email || 'Admin',
          createdByName: userProfile?.displayName || user?.displayName || user?.email || 'Admin'
        });
        await logAction('ADMIN_CREATE_RECIPROCAL_BUDGET', 'reciprocal_budgets', docRef.id, payload);
        toast.success(`Đã tạo bản ghi đối ứng mới cho khối ${selectedFormBlock.name} kỳ ${formMonth}`);
      }

      setIsFormDialogOpen(false);
      setEditingRecord(null);
    } catch (err: any) {
      console.error('Error saving form:', err);
      toast.error('Lỗi khi lưu: ' + (err.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    if (!hasDeletePerm) {
      toast.error('Bạn không có quyền xóa ngân sách đối ứng!');
      return;
    }
    try {
      await deleteDoc(doc(db, 'reciprocal_budgets', recordToDelete.id));
      await logAction('ADMIN_DELETE_RECIPROCAL_BUDGET', 'reciprocal_budgets', recordToDelete.id, {
        blockCode: recordToDelete.blockCode,
        month: recordToDelete.month
      });
      toast.success(`Đã xóa bản ghi đối ứng kỳ ${recordToDelete.month} của khối ${recordToDelete.blockName || recordToDelete.blockCode}`);
    } catch (err: any) {
      console.error('Error deleting record:', err);
      toast.error('Lỗi khi xóa: ' + (err.message || ''));
    } finally {
      setIsDeleteDialogOpen(false);
      setRecordToDelete(null);
    }
  };

  // Sync Total Block Budgets from current block_budgets
  const handleSyncBlockBudgets = async () => {
    if (reciprocalBudgets.length === 0) {
      toast.info('Chưa có bản ghi đối ứng nào để đồng bộ.');
      return;
    }
    const toastId = toast.loading('Đang đồng bộ lại Tổng Ngân sách Khối...');
    let updatedCount = 0;
    try {
      for (const rec of reciprocalBudgets) {
        const targetBlock = blocks.find(b => b.id === rec.blockId || b.blockCode === rec.blockCode);
        if (targetBlock && rec.month) {
          const freshBudget = computeBlockTotalBudget(targetBlock, rec.month);
          if (freshBudget !== (rec.totalBlockBudget || 0)) {
            await updateDoc(doc(db, 'reciprocal_budgets', rec.id), {
              totalBlockBudget: freshBudget,
              directorName: getBlockDirectorName(targetBlock.id, rec.directorName),
              updatedAt: serverTimestamp()
            });
            updatedCount++;
          }
        }
      }
      toast.success(`Đồng bộ hoàn tất! Đã cập nhật ${updatedCount} bản ghi.`, { id: toastId });
    } catch (err: any) {
      console.error('Error syncing budgets:', err);
      toast.error('Lỗi khi đồng bộ: ' + (err.message || ''), { id: toastId });
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    if (sortedRecords.length === 0) {
      toast.error('Không có dữ liệu đối ứng nào để xuất Excel!');
      return;
    }

    const rows = sortedRecords.map((r, idx) => {
      const director = r.directorName || getBlockDirectorName(r.blockId || r.blockCode, '');
      return {
        'STT': idx + 1,
        'Khối': r.blockName || r.blockCode || 'N/A',
        'Mã Khối': r.blockCode || '',
        'Giám đốc Khối': director,
        'Tháng': r.month || '',
        'Tổng Ngân sách Khối': Number(r.totalBlockBudget || 0),
        'Ngân sách qua thẻ Mayhomes': Number(r.companyCardBudget || 0),
        'Ngân sách chạy ngoài': Number(r.externalBudget || 0),
        'Ngân sách đối ứng được duyệt': Number(r.approvedReciprocalBudget || 0),
        'Trạng thái duyệt': (r.approvedReciprocalBudget || 0) > 0 ? 'Đã duyệt' : 'Chờ duyệt',
        'Thanh toán': getPaymentStatusInfo(r.paymentStatus).label,
        'Ghi chú': r.note || '',
        'Thời gian đăng ký': safeFormat(r.createdAt, 'HH:mm dd/MM/yyyy') || '',
        'Người đăng ký': r.createdByName || r.createdBy || ''
      };
    });

    // Summary row
    rows.push({
      'STT': 'TỔNG CỘNG' as any,
      'Khối': `Tổng ${sortedRecords.length} bản ghi`,
      'Mã Khối': '',
      'Giám đốc Khối': '',
      'Tháng': '',
      'Tổng Ngân sách Khối': summaryTotals.totalBlock,
      'Ngân sách qua thẻ Mayhomes': summaryTotals.totalCard,
      'Ngân sách chạy ngoài': summaryTotals.totalExternal,
      'Ngân sách đối ứng được duyệt': summaryTotals.totalApproved,
      'Trạng thái duyệt': '',
      'Thanh toán': '',
      'Ghi chú': '',
      'Thời gian đăng ký': '',
      'Người đăng ký': ''
    });

    const XLSX = await loadXlsx();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ngan_Sach_Doi_Ung');
    
    // Auto column widths
    const colWidths = [
      { wch: 6 },  // STT
      { wch: 22 }, // Khối
      { wch: 12 }, // Mã Khối
      { wch: 22 }, // GĐK
      { wch: 10 }, // Tháng
      { wch: 22 }, // Tổng NS Khối
      { wch: 24 }, // NS qua thẻ
      { wch: 22 }, // NS chạy ngoài
      { wch: 24 }, // NS đối ứng duyệt
      { wch: 16 }, // Trạng thái duyệt
      { wch: 18 }, // Thanh toán
      { wch: 30 }, // Ghi chú
      { wch: 18 }, // Thời gian
      { wch: 20 }, // Người tạo
    ];
    worksheet['!cols'] = colWidths;

    const fileName = `Ngan_sach_doi_ung_Khoi_${safeFormat(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success(`Đã xuất file Excel thành công: ${fileName}`);
  };

  if (!hasViewPerm) {
    return (
      <Card className="border-none shadow-sm p-8 text-center bg-[var(--mh-surface)] rounded-3xl">
        <div className="max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
            <Receipt className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black text-[var(--mh-text)]">Không có quyền truy cập</h3>
          <p className="text-xs text-[var(--mh-text-2)] leading-relaxed">
            Bạn chưa được phân quyền xem mục <strong>Ngân sách đối ứng</strong>. Vui lòng liên hệ Quản trị viên hệ thống để được cấp quyền <code className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-mono">reciprocal_budget.view</code>.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header Card */}
      <Card className="border-none shadow-sm overflow-hidden bg-[var(--mh-surface)]">
        <div className="h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 w-full" />
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="w-5 h-5 text-amber-600" />
              <CardTitle className="text-xl font-black text-[var(--mh-text)]">
                Quản trị Ngân sách Đối ứng
              </CardTitle>
            </div>
            <CardDescription className="text-xs font-medium text-[var(--mh-text-2)]">
              Tổng hợp, rà soát và phê duyệt các khoản đăng ký Ngân sách đối ứng của các Khối Kinh doanh
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="h-9 text-xs font-bold text-emerald-700 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100 rounded-xl"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> Xuất Excel
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncBlockBudgets}
              title="Đồng bộ lại Tổng ngân sách Khối từ danh mục Ngân sách khối mới nhất"
              className="h-9 text-xs font-bold text-[var(--mh-text)] border-[var(--mh-border)] hover:bg-[var(--mh-surface-2)] rounded-xl"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Đồng bộ số liệu
            </Button>

            {hasCreatePerm && (
              <Button
                size="sm"
                onClick={() => handleOpenFormModal()}
                className="h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-md shadow-amber-200"
              >
                <Plus className="w-4 h-4 mr-1" /> Thêm Bản Ghi Đối Ứng
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-100 flex items-center gap-3">
              <div className="p-2.5 bg-[var(--mh-surface)] rounded-xl shadow-xs border border-amber-100">
                <Receipt className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider">Tổng bản ghi</p>
                <p className="text-lg font-black text-[var(--mh-text)]">{sortedRecords.length} kỳ đăng ký</p>
              </div>
            </div>

            <div className="p-3.5 bg-[var(--mh-surface-2)]/80 rounded-2xl border border-[var(--mh-border)] flex items-center gap-3">
              <div className="p-2.5 bg-[var(--mh-surface)] rounded-xl shadow-xs border border-[var(--mh-border)]">
                <Building2 className="w-5 h-5 text-[var(--mh-text)]" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider">Tổng NS Khối (Đồng bộ)</p>
                <p className="text-base font-black text-[var(--mh-text)] font-mono">
                  {formatCurrency(summaryTotals.totalBlock)}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-indigo-50/60 rounded-2xl border border-indigo-100 flex items-center gap-3">
              <div className="p-2.5 bg-[var(--mh-surface)] rounded-xl shadow-xs border border-indigo-100">
                <CreditCard className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider">NS Chạy Ngoài (Đề xuất)</p>
                <p className="text-base font-black text-indigo-700 font-mono">
                  {formatCurrency(summaryTotals.totalExternal)}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-100 flex items-center gap-3">
              <div className="p-2.5 bg-[var(--mh-surface)] rounded-xl shadow-xs border border-emerald-100">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider">Đối Ứng Đã Duyệt</p>
                <p className="text-base font-black text-emerald-700 font-mono">
                  {formatCurrency(summaryTotals.totalApproved)}
                </p>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Search */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider block">Tìm kiếm</label>
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--mh-text-3)] absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Tìm khối, giám đốc..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 rounded-xl border-[var(--mh-border)] text-xs font-semibold"
                />
              </div>
            </div>

            {/* Filter by Block */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider block">Khối</label>
              <Select value={filterBlock} onValueChange={setFilterBlock}>
                <SelectTrigger className="h-10 rounded-xl border-[var(--mh-border)] text-xs font-semibold">
                  <SelectValue placeholder="Lọc theo Khối" />
                </SelectTrigger>
                <SelectContent searchable className="max-h-60 rounded-xl">
                  <SelectItem value="all" className="text-xs font-semibold">
                    Tất cả các Khối ({blocks.length})
                  </SelectItem>
                  {blocks.map(b => (
                    <SelectItem key={b.id} value={b.id} className="text-xs font-semibold">
                      {b.name || b.blockCode} ({b.blockCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Month */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider block">Tháng</label>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="h-10 rounded-xl border-[var(--mh-border)] text-xs font-semibold">
                  <SelectValue placeholder="Lọc theo Tháng" />
                </SelectTrigger>
                <SelectContent className="max-h-60 rounded-xl">
                  <SelectItem value="all" className="text-xs font-semibold">
                    Tất cả các Tháng
                  </SelectItem>
                  {availableMonths.map(m => (
                    <SelectItem key={m} value={m} className="text-xs font-semibold font-mono">
                      Tháng {m} {m === currentMarketingPeriod ? '★ (Hiện tại)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Project */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider block">Dự án</label>
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="h-10 rounded-xl border-[var(--mh-border)] text-xs font-semibold">
                  <SelectValue placeholder="Lọc theo Dự án" />
                </SelectTrigger>
                <SelectContent searchable className="max-h-60 rounded-xl">
                  <SelectItem value="all" className="text-xs font-semibold">
                    Tất cả Dự án ({(projects || []).length})
                  </SelectItem>
                  {(projects || []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs font-semibold">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Ban KD */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider block">Ban KD</label>
              <Select value={filterBanKd} onValueChange={setFilterBanKd}>
                <SelectTrigger className="h-10 rounded-xl border-[var(--mh-border)] text-xs font-semibold">
                  <SelectValue placeholder="Lọc theo Ban KD" />
                </SelectTrigger>
                <SelectContent searchable className="max-h-60 rounded-xl">
                  <SelectItem value="all" className="text-xs font-semibold">
                    Tất cả Ban KD ({(banKdList || []).length})
                  </SelectItem>
                  {(banKdList || []).map((b: any) => (
                    <SelectItem key={b.id} value={b.id} className="text-xs font-semibold">
                      {b.name} ({b.code || 'N/A'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter by Payment Status */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[var(--mh-text-2)] uppercase tracking-wider block">Trạng thái thanh toán</label>
              <Select value={filterPaymentStatus} onValueChange={setFilterPaymentStatus}>
                <SelectTrigger className="h-10 rounded-xl border-[var(--mh-border)] text-xs font-semibold">
                  <SelectValue placeholder="Trạng thái thanh toán" />
                </SelectTrigger>
                <SelectContent className="max-h-60 rounded-xl">
                  <SelectItem value="all" className="text-xs font-semibold">
                    Tất cả thanh toán
                  </SelectItem>
                  <SelectItem value="unpaid" className="text-xs font-semibold text-amber-800">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Chưa thanh toán</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="paid" className="text-xs font-semibold text-emerald-800">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Đã thanh toán</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="rejected" className="text-xs font-semibold text-rose-800">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>Từ chối</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DRAGGABLE TABLE SECTION (Tính năng kéo như mục Nghiệm thu MKT) */}
      <Card className="border-[var(--mh-border)] shadow-md rounded-3xl overflow-hidden bg-[var(--mh-surface)]">
        <CardHeader className="pb-3 border-b border-[var(--mh-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-black text-[var(--mh-text)]">
              Danh Sách Ngân Sách Đối Ứng Các Khối ({sortedRecords.length})
            </CardTitle>
            <span className="text-[11px] text-[var(--mh-text-3)] font-medium italic">
              (Bảng có tính năng kéo ngang bằng chuột / cảm ứng)
            </span>
          </div>

          <div className="text-xs text-[var(--mh-text-3)] font-medium">
            Click vào tiêu đề cột để sắp xếp
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <DraggableTableContainer className="rounded-none border-0 bg-[var(--mh-surface)]">
            <Table>
              <TableHeader className="bg-[var(--mh-surface-2)]/80 border-b border-[var(--mh-border)]">
                <TableRow>
                  <TableHead className="w-12 text-center text-[11px] font-black uppercase text-[var(--mh-text-2)]">
                    STT
                  </TableHead>

                  {/* KHỐI */}
                  <TableHead 
                    onClick={() => handleSort('block')}
                    className="cursor-pointer select-none text-[11px] font-black uppercase text-[var(--mh-text)] hover:text-amber-600 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span>Khối</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                    </div>
                  </TableHead>

                  {/* GIÁM ĐỐC KHỐI */}
                  <TableHead 
                    onClick={() => handleSort('director')}
                    className="cursor-pointer select-none text-[11px] font-black uppercase text-[var(--mh-text)] hover:text-amber-600 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span>Giám đốc Khối</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                    </div>
                  </TableHead>

                  {/* THÁNG */}
                  <TableHead 
                    onClick={() => handleSort('month')}
                    className="cursor-pointer select-none text-[11px] font-black uppercase text-[var(--mh-text)] hover:text-amber-600 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span>Tháng</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                    </div>
                  </TableHead>

                  {/* TỔNG NGÂN SÁCH KHỐI */}
                  <TableHead 
                    onClick={() => handleSort('totalBlockBudget')}
                    className="cursor-pointer select-none text-[11px] font-black uppercase text-[var(--mh-text)] hover:text-amber-600 transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <span>Tổng Ngân sách Khối</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                    </div>
                  </TableHead>

                  {/* NGÂN SÁCH QUA THẺ CÔNG TY */}
                  <TableHead 
                    onClick={() => handleSort('companyCardBudget')}
                    className="cursor-pointer select-none text-[11px] font-black uppercase text-[var(--mh-text)] hover:text-amber-600 transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <span>NS Qua Thẻ Công Ty</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                    </div>
                  </TableHead>

                  {/* NGÂN SÁCH CHẠY NGOÀI */}
                  <TableHead 
                    onClick={() => handleSort('externalBudget')}
                    className="cursor-pointer select-none text-[11px] font-black uppercase text-[var(--mh-text)] hover:text-amber-600 transition-colors text-right"
                  >
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <span>Ngân sách Chạy Ngoài</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                    </div>
                  </TableHead>

                  {/* NGÂN SÁCH ĐỐI ỨNG ĐƯỢC DUYỆT */}
                  <TableHead 
                    onClick={() => handleSort('approvedReciprocalBudget')}
                    className="cursor-pointer select-none text-[11px] font-black uppercase text-emerald-800 hover:text-emerald-950 transition-colors text-right bg-emerald-50/60"
                  >
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <span>NS Đối Ứng Được Duyệt</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                  </TableHead>

                  {/* THANH TOÁN (3 TRẠNG THÁI: Chưa thanh toán / Đã thanh toán / Từ chối) */}
                  <TableHead 
                    onClick={() => handleSort('paymentStatus')}
                    className="cursor-pointer select-none text-[11px] font-black uppercase text-[var(--mh-text)] hover:text-amber-600 transition-colors min-w-[155px]"
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span>Thanh Toán</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                    </div>
                  </TableHead>

                  {/* GHI CHÚ */}
                  <TableHead 
                    onClick={() => handleSort('note')}
                    className="cursor-pointer select-none text-[11px] font-black uppercase text-[var(--mh-text)] hover:text-amber-600 transition-colors min-w-[140px]"
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span>Ghi Chú</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--mh-text-3)]" />
                    </div>
                  </TableHead>

                  {/* TRẠNG THÁI DUYỆT */}
                  <TableHead className="text-[11px] font-black uppercase text-[var(--mh-text-2)]">
                    Trạng Thái Duyệt
                  </TableHead>

                  {/* THAO TÁC */}
                  <TableHead className="text-right text-[11px] font-black uppercase text-[var(--mh-text-2)] pr-4">
                    Thao Tác
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-44 text-center">
                      <div className="flex flex-col items-center justify-center text-[var(--mh-text-3)] space-y-2">
                        <Receipt className="w-8 h-8 text-[var(--mh-text-3)]" />
                        <span className="font-semibold text-sm">Không tìm thấy bản ghi ngân sách đối ứng nào</span>
                        <p className="text-xs text-[var(--mh-text-3)]">
                          Thử thay đổi bộ lọc hoặc bấm "Thêm Bản Ghi Đối Ứng" để tạo mới
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRecords.map((item, index) => {
                    const directorName = item.directorName || getBlockDirectorName(item.blockId || item.blockCode, '');
                    const isApproved = (item.approvedReciprocalBudget || 0) > 0;

                    return (
                      <TableRow 
                        key={item.id} 
                        className="hover:bg-amber-50/30 transition-colors border-b border-[var(--mh-border)] text-xs font-semibold"
                      >
                        {/* STT */}
                        <TableCell className="text-center font-mono text-[var(--mh-text-3)] py-3.5">
                          {index + 1}
                        </TableCell>

                        {/* Khối */}
                        <TableCell className="whitespace-nowrap py-3.5">
                          <div className="font-bold text-[var(--mh-text)] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            <span>{item.blockName || item.blockCode}</span>
                          </div>
                          {item.blockCode && (
                            <span className="text-[10px] text-[var(--mh-text-3)] font-mono block pl-3.5">
                              {item.blockCode}
                            </span>
                          )}
                        </TableCell>

                        {/* Giám đốc Khối */}
                        <TableCell className="whitespace-nowrap py-3.5 text-[var(--mh-text)]">
                          {directorName}
                        </TableCell>

                        {/* Tháng */}
                        <TableCell className="whitespace-nowrap py-3.5">
                          <span className="font-mono bg-[var(--mh-surface-2)] text-[var(--mh-text)] px-2 py-0.5 rounded-md font-bold">
                            {item.month}
                          </span>
                        </TableCell>

                        {/* Tổng Ngân sách Khối */}
                        <TableCell className="text-right font-mono font-bold text-[var(--mh-text)] py-3.5 whitespace-nowrap">
                          {formatCurrency(item.totalBlockBudget || 0)}
                        </TableCell>

                        {/* Ngân sách qua thẻ công ty */}
                        <TableCell className="text-right font-mono font-bold text-indigo-700 py-3.5 whitespace-nowrap">
                          {formatCurrency(item.companyCardBudget || 0)}
                        </TableCell>

                        {/* Ngân sách chạy ngoài */}
                        <TableCell className="text-right font-mono font-bold text-amber-700 py-3.5 whitespace-nowrap">
                          {formatCurrency(item.externalBudget || 0)}
                        </TableCell>

                        {/* Ngân sách đối ứng được duyệt (Admin nhập) */}
                        <TableCell className="text-right font-mono font-black py-3.5 whitespace-nowrap bg-emerald-50/40">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className={isApproved ? 'text-emerald-700 text-sm' : 'text-[var(--mh-text-3)]'}>
                              {isApproved ? formatCurrency(item.approvedReciprocalBudget) : '0 đ'}
                            </span>
                            {hasEditPerm && (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => handleOpenApproval(item)}
                                title="Duyệt / Sửa ngân sách đối ứng"
                                className="h-6 w-6 p-0 text-emerald-600 hover:bg-emerald-100 rounded-lg shrink-0"
                              >
                                <Edit3 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>

                        {/* Thanh toán (3 trạng thái: Chưa thanh toán / Đã thanh toán / Từ chối) */}
                        <TableCell className="whitespace-nowrap py-3.5">
                          {hasEditPerm ? (
                            <Select 
                              value={getPaymentStatusInfo(item.paymentStatus).value}
                              onValueChange={(val) => handleQuickUpdatePaymentStatus(item, val)}
                            >
                              <SelectTrigger className={`h-8 w-[148px] text-xs font-bold rounded-xl border ${
                                getPaymentStatusInfo(item.paymentStatus).badgeClass
                              }`}>
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${getPaymentStatusInfo(item.paymentStatus).dotClass}`} />
                                  <span className="truncate">{getPaymentStatusInfo(item.paymentStatus).label}</span>
                                </div>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unpaid" className="text-xs font-semibold text-amber-800">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                                    <span>Chưa thanh toán</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="paid" className="text-xs font-semibold text-emerald-800">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                    <span>Đã thanh toán</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="rejected" className="text-xs font-semibold text-rose-800">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                                    <span>Từ chối</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge className={getPaymentStatusInfo(item.paymentStatus).badgeClass}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${getPaymentStatusInfo(item.paymentStatus).dotClass}`} />
                              {getPaymentStatusInfo(item.paymentStatus).label}
                            </Badge>
                          )}
                        </TableCell>

                        {/* Ghi chú */}
                        <TableCell className="py-3.5 max-w-[200px]">
                          {item.note ? (
                            <div className="text-xs text-[var(--mh-text)] truncate" title={item.note}>
                              {item.note}
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--mh-text-3)] italic">—</span>
                          )}
                        </TableCell>

                        {/* Trạng thái duyệt */}
                        <TableCell className="whitespace-nowrap py-3.5">
                          <Badge 
                            className={
                              isApproved
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold'
                                : 'bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold'
                            }
                          >
                            {isApproved ? 'Đã duyệt' : 'Chờ duyệt'}
                          </Badge>
                        </TableCell>

                        {/* Thao tác */}
                        <TableCell className="text-right whitespace-nowrap py-3.5 pr-4">
                          <div className="flex items-center justify-end gap-1">
                            {hasEditPerm && (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => handleOpenFormModal(item)}
                                className="h-7 px-2 text-[11px] font-bold text-amber-700 hover:bg-amber-50 rounded-lg"
                              >
                                <Edit3 className="w-3 h-3 mr-1" /> Sửa
                              </Button>
                            )}

                            {hasDeletePerm && (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => {
                                  setRecordToDelete(item);
                                  setIsDeleteDialogOpen(true);
                                }}
                                className="h-7 px-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg"
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> Xóa
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </DraggableTableContainer>
        </CardContent>
      </Card>

      {/* QUICK APPROVAL DIALOG (Admin nhập Ngân sách đối ứng được duyệt) */}
      <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[var(--mh-text)] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" /> Phê Duyệt Ngân Sách Đối Ứng
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--mh-text-2)] pt-1 font-medium">
              Khối: <strong>{approvalRecord?.blockName || approvalRecord?.blockCode}</strong> — Kỳ: <strong>{approvalRecord?.month}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="p-3.5 bg-[var(--mh-surface-2)] rounded-2xl border border-[var(--mh-border)] text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--mh-text-2)]">Tổng Ngân sách Khối:</span>
                <strong className="font-mono text-[var(--mh-text)]">{formatCurrency(approvalRecord?.totalBlockBudget || 0)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--mh-text-2)]">Ngân sách qua thẻ:</span>
                <strong className="font-mono text-indigo-700">{formatCurrency(approvalRecord?.companyCardBudget || 0)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--mh-text-2)]">Ngân sách chạy ngoài đề xuất:</span>
                <strong className="font-mono text-amber-700">{formatCurrency(approvalRecord?.externalBudget || 0)}</strong>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[var(--mh-text)] flex items-center justify-between">
                <span>Ngân sách đối ứng được duyệt (VNĐ) <span className="text-rose-500">*</span></span>
                <button
                  type="button"
                  onClick={() => setApprovalAmountInput(formatCurrencyInput(String(approvalRecord?.externalBudget || 0)))}
                  className="text-[10px] font-bold text-amber-600 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Duyệt 100% NS ngoài
                </button>
              </Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="0"
                  value={approvalAmountInput}
                  onChange={(e) => setApprovalAmountInput(formatCurrencyInput(e.target.value))}
                  className="h-11 rounded-2xl border-emerald-300 font-mono text-base font-black text-emerald-900 pr-12 focus:ring-2 focus:ring-emerald-500/20"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--mh-text-3)]">
                  VNĐ
                </span>
              </div>
              <p className="text-[10px] text-[var(--mh-text-3)]">
                Nhập 0 nếu không duyệt đối ứng cho kỳ này.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsApprovalDialogOpen(false)}
              className="rounded-xl text-xs font-bold h-10"
            >
              Hủy
            </Button>
            <Button
              onClick={handleSaveApproval}
              className="rounded-xl text-xs font-black h-10 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-100"
            >
              <Check className="w-4 h-4 mr-1.5" /> Lưu Phê Duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ADD / EDIT FORM DIALOG */}
      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[var(--mh-text)] flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-600" />
              {editingRecord ? 'Chỉnh Sửa Bản Ghi Đối Ứng' : 'Thêm Bản Ghi Đối Ứng Mới'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--mh-text-2)] font-medium">
              Thông tin sẽ được đồng bộ trực tiếp tới mục Đăng ký đối ứng của Khối.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveForm} className="space-y-4 my-2">
            {/* Choose Block */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[var(--mh-text)]">Khối Kinh Doanh <span className="text-rose-500">*</span></Label>
              <Select value={formBlockId} onValueChange={setFormBlockId}>
                <SelectTrigger className="h-10 rounded-xl border-[var(--mh-border)] text-xs font-bold">
                  <SelectValue placeholder="Chọn Khối..." />
                </SelectTrigger>
                <SelectContent searchable>
                  {blocks.map(b => (
                    <SelectItem key={b.id} value={b.id} className="text-xs font-semibold">
                      {b.name || b.blockCode} ({b.blockCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Choose Month */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[var(--mh-text)]">Tháng (YYYY-MM) <span className="text-rose-500">*</span></Label>
              <Input
                type="text"
                placeholder="YYYY-MM"
                value={formMonth}
                onChange={(e) => setFormMonth(e.target.value.trim())}
                className="h-10 rounded-xl border-[var(--mh-border)] font-mono text-xs font-bold"
                required
              />
            </div>

            {/* Total Block Budget Computed */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-between text-xs">
              <span className="font-bold text-amber-900">Tổng NS Khối (Đồng bộ):</span>
              <strong className="font-mono text-amber-950 font-black text-sm">
                {formatCurrency(formComputedBlockBudget)}
              </strong>
            </div>

            {/* Company Card Budget */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[var(--mh-text)]">Ngân sách qua thẻ Mayhomes</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="0"
                  value={formCompanyCardInput}
                  onChange={(e) => setFormCompanyCardInput(formatCurrencyInput(e.target.value))}
                  className="h-10 rounded-xl border-[var(--mh-border)] font-mono text-xs font-bold pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--mh-text-3)]">
                  VNĐ
                </span>
              </div>
            </div>

            {/* External Budget */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-[var(--mh-text)]">Ngân sách chạy ngoài</Label>
                {formComputedBlockBudget > 0 && (
                  <button
                    type="button"
                    onClick={() => setFormExternalInput(formatCurrencyInput(String(formSuggestedExternal)))}
                    className="text-[10px] font-bold text-amber-600 hover:underline cursor-pointer"
                  >
                    💡 Gợi ý: {formatCurrency(formSuggestedExternal)}
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="0"
                  value={formExternalInput}
                  onChange={(e) => setFormExternalInput(formatCurrencyInput(e.target.value))}
                  className="h-10 rounded-xl border-[var(--mh-border)] font-mono text-xs font-bold pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--mh-text-3)]">
                  VNĐ
                </span>
              </div>
            </div>

            {/* Approved Reciprocal Budget */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-emerald-800">Ngân sách đối ứng được duyệt</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="0"
                  value={formApprovedInput}
                  onChange={(e) => setFormApprovedInput(formatCurrencyInput(e.target.value))}
                  className="h-10 rounded-xl border-emerald-200 bg-emerald-50/30 font-mono text-xs font-black text-emerald-900 pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600">
                  VNĐ
                </span>
              </div>
            </div>

            {/* Payment Status */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[var(--mh-text)]">Trạng thái thanh toán</Label>
              <Select
                value={formPaymentStatus}
                onValueChange={(val: PaymentStatusType) => setFormPaymentStatus(val)}
              >
                <SelectTrigger className="h-10 rounded-xl border-[var(--mh-border)] text-xs font-semibold">
                  <SelectValue placeholder="Chọn trạng thái thanh toán" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid" className="text-xs font-semibold text-amber-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Chưa thanh toán (Mặc định)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="paid" className="text-xs font-semibold text-emerald-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Đã thanh toán</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="rejected" className="text-xs font-semibold text-rose-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>Từ chối</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-[var(--mh-text)]">Ghi chú</Label>
              <Input
                type="text"
                placeholder="Ghi chú thêm..."
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="h-10 rounded-xl border-[var(--mh-border)] text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormDialogOpen(false)}
                className="rounded-xl text-xs font-bold h-10"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="rounded-xl text-xs font-black h-10 bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-100"
              >
                {isSaving ? 'Đang lưu...' : 'Lưu Bản Ghi'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[var(--mh-text)] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" /> Xác nhận xóa bản ghi đối ứng?
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--mh-text-2)] pt-2 font-medium">
              Bạn có chắc chắn muốn xóa bản ghi đối ứng của khối <strong>{recordToDelete?.blockName || recordToDelete?.blockCode}</strong> trong kỳ <strong>{recordToDelete?.month}</strong>? Dữ liệu này sẽ được đồng bộ xóa khỏi hệ thống.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="rounded-xl text-xs font-bold h-10"
            >
              Hủy bỏ
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="rounded-xl text-xs font-black h-10 bg-rose-600 hover:bg-rose-700 text-white"
            >
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
