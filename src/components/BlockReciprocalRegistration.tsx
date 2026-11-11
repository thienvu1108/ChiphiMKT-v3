import React, { useState, useEffect, useMemo } from 'react';
import { resolveProject } from '../../lib/vnext/projectRef';
import { 
  Receipt, CreditCard, Building2, Calendar, AlertCircle, 
  CheckCircle2, Clock, Trash2, Edit3, Plus, RefreshCw, 
  HelpCircle, ArrowRight, ShieldCheck, Sparkles, AlertTriangle,
  FileSpreadsheet, LayoutGrid, Table as TableIcon
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getPaymentStatusInfo, PaymentStatusType } from './AdminReciprocalBudgets';

interface BlockReciprocalRegistrationProps {
  currentActiveBlock: any;
  setSelectedBlockId?: (id: string) => void;
  userAllowedBlocks?: any[];
  user: any;
  userProfile: any;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isGDKhoi: boolean;
  isTroLyKhoi: boolean;
  isAssistant: boolean;
  isAccountant: boolean;
  canView?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  currentMarketingPeriod: string;
  currentOpenBlockBudgetMonth: string;
  systemSettings: any;
  reciprocalBudgets: any[];
  blockBudgets: any[];
  budgets: any[];
  teams: any[];
  blocks: any[];
  projects?: any[];
  allUsers: any[];
  formatCurrency: (val: number) => string;
  formatCurrencyInput: (val: string) => string;
  parseVal: (val: any) => number;
  safeFormat: (date: any, fmt?: string) => string;
  logAction: (action: string, entity: string, id?: string, data?: any) => Promise<void>;
  db: any;
}

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

export function BlockReciprocalRegistration({
  currentActiveBlock,
  setSelectedBlockId,
  userAllowedBlocks,
  user,
  userProfile,
  isAdmin,
  isSuperAdmin,
  isGDKhoi,
  isTroLyKhoi,
  isAssistant,
  isAccountant,
  canView,
  canCreate,
  canEdit,
  canDelete,
  currentMarketingPeriod,
  currentOpenBlockBudgetMonth,
  systemSettings,
  reciprocalBudgets,
  blockBudgets,
  budgets,
  teams,
  blocks,
  projects = [],
  allUsers,
  formatCurrency,
  formatCurrencyInput,
  parseVal,
  safeFormat,
  logAction,
  db
}: BlockReciprocalRegistrationProps) {
  const hasViewPerm = canView ?? (isAdmin || isSuperAdmin || isGDKhoi || isTroLyKhoi || isAssistant || isAccountant);
  const hasCreatePerm = canCreate ?? (isAdmin || isSuperAdmin || isGDKhoi || isTroLyKhoi || isAssistant);
  const hasEditPerm = canEdit ?? (isAdmin || isSuperAdmin || isGDKhoi || isTroLyKhoi || isAssistant || isAccountant);
  const hasDeletePerm = canDelete ?? (isAdmin || isSuperAdmin || isGDKhoi || isTroLyKhoi || isAssistant);

  // Selected Month: Default to current marketing period (e.g. 2026-09)
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMarketingPeriod || '');
  const [companyCardBudgetInput, setCompanyCardBudgetInput] = useState<string>('');
  const [externalBudgetInput, setExternalBudgetInput] = useState<string>('');
  const [noteInput, setNoteInput] = useState<string>('');
  const [historyViewMode, setHistoryViewMode] = useState<'table' | 'cards'>('table');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [recordToDelete, setRecordToDelete] = useState<any | null>(null);

  // Sync selectedMonth when currentMarketingPeriod becomes available if not set
  useEffect(() => {
    if (!selectedMonth && currentMarketingPeriod) {
      setSelectedMonth(currentMarketingPeriod);
    }
  }, [currentMarketingPeriod, selectedMonth]);

  // Compute total block budget for currentActiveBlock in selectedMonth
  const totalBlockBudget = useMemo(() => {
    if (!currentActiveBlock || !selectedMonth) return 0;
    
    // 1. Direct block budgets
    const directSum = blockBudgets
      .filter(bb => 
        isBlockRecordMatch(bb, currentActiveBlock) && 
        bb.month === selectedMonth
      )
      .reduce((sum, bb) => sum + (bb.amount || 0), 0);

    if (directSum > 0) return directSum;

    // 2. Fallback to team budgets in this block
    const blockTeams = teams.filter(t => {
      if (t.blockId && t.blockId === currentActiveBlock.id) return true;
      if (t.blockCode && t.blockCode === currentActiveBlock.blockCode) return true;
      const prefix = currentActiveBlock.teamPrefix || currentActiveBlock.blockCode || '';
      if (prefix && t.teamCode && t.teamCode.toUpperCase().startsWith(prefix.toUpperCase())) return true;
      return false;
    });

    const blockTeamIds = new Set(blockTeams.map(t => t.id));
    const blockTeamNames = new Set(blockTeams.map(t => (t.name || '').toLowerCase().trim()));

    const teamSum = budgets
      .filter(b => 
        b.month === selectedMonth && 
        (blockTeamIds.has(b.teamId) || blockTeamNames.has((b.teamName || '').toLowerCase().trim()))
      )
      .reduce((sum, b) => sum + (b.amount || 0), 0);

    return teamSum;
  }, [currentActiveBlock, selectedMonth, blockBudgets, budgets, teams]);

  // List of block budgets for this block in selectedMonth (with projects and Ban KD)
  const relevantBlockBudgets = useMemo(() => {
    if (!currentActiveBlock || !selectedMonth) return [];
    return blockBudgets.filter(bb => 
      isBlockRecordMatch(bb, currentActiveBlock) && 
      bb.month === selectedMonth
    );
  }, [currentActiveBlock, selectedMonth, blockBudgets]);

  // Existing reciprocal record for currentActiveBlock and selectedMonth
  const existingRecord = useMemo(() => {
    if (!currentActiveBlock || !selectedMonth) return null;
    return reciprocalBudgets.find(rb => 
      isBlockRecordMatch(rb, currentActiveBlock) &&
      rb.month === selectedMonth
    ) || null;
  }, [currentActiveBlock, selectedMonth, reciprocalBudgets]);

  // When existingRecord changes or month changes, populate fields if not manually editing
  useEffect(() => {
    if (existingRecord) {
      setEditingRecordId(existingRecord.id);
      setCompanyCardBudgetInput(existingRecord.companyCardBudget ? formatCurrencyInput(String(existingRecord.companyCardBudget)) : '0');
      setExternalBudgetInput(existingRecord.externalBudget ? formatCurrencyInput(String(existingRecord.externalBudget)) : '0');
      setNoteInput(existingRecord.note || '');
    } else {
      setEditingRecordId(null);
      setCompanyCardBudgetInput('');
      setExternalBudgetInput('');
      setNoteInput('');
    }
  }, [existingRecord, selectedMonth, formatCurrencyInput]);

  // Parsed numerical values
  const parsedCompanyCard = parseVal(companyCardBudgetInput);
  const parsedExternal = parseVal(externalBudgetInput);

  // Suggested external budget = Total Block Budget - Company Card Budget
  const suggestedExternal = Math.max(0, totalBlockBudget - parsedCompanyCard);

  // Check if company card exceeds total block budget
  const isCompanyCardExceeded = totalBlockBudget > 0 && parsedCompanyCard > totalBlockBudget;

  // Handle Apply Suggestion
  const handleApplySuggestedExternal = () => {
    setExternalBudgetInput(formatCurrencyInput(String(suggestedExternal)));
    toast.info(`Đã áp dụng gợi ý Ngân sách chạy ngoài: ${formatCurrency(suggestedExternal)}`);
  };

  // Recent reciprocal registration history for currentActiveBlock
  const blockHistory = useMemo(() => {
    if (!currentActiveBlock) return [];
    return reciprocalBudgets
      .filter(rb => isBlockRecordMatch(rb, currentActiveBlock))
      .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
  }, [currentActiveBlock, reciprocalBudgets]);

  // Block Director Info
  const blockDirector = useMemo(() => {
    if (!currentActiveBlock) return null;
    return allUsers.find(u => u.uid === currentActiveBlock.directorUid || u.id === currentActiveBlock.directorUid) || null;
  }, [currentActiveBlock, allUsers]);

  // Can user edit/register?
  const canRegister = isGDKhoi || isTroLyKhoi || isAssistant || isAdmin || isSuperAdmin || isAccountant;

  // Handle Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRecordId && !hasEditPerm) {
      toast.error('Bạn không có quyền chỉnh sửa bản ghi đối ứng!');
      return;
    }
    if (!editingRecordId && !hasCreatePerm) {
      toast.error('Bạn không có quyền thêm mới bản ghi đối ứng!');
      return;
    }
    if (!canRegister) {
      toast.error('Bạn không có quyền thực hiện đăng ký đối ứng cho Khối!');
      return;
    }
    if (!currentActiveBlock) {
      toast.error('Vui lòng chọn Khối trước khi đăng ký!');
      return;
    }
    if (!selectedMonth) {
      toast.error('Vui lòng chọn Tháng đăng ký!');
      return;
    }
    if (isCompanyCardExceeded) {
      toast.error(`Ngân sách chạy qua thẻ (${formatCurrency(parsedCompanyCard)}) không được vượt quá Tổng ngân sách Khối (${formatCurrency(totalBlockBudget)})!`);
      return;
    }
    if (parsedCompanyCard < 0 || parsedExternal < 0) {
      toast.error('Ngân sách nhập vào không được âm!');
      return;
    }
    if (parsedCompanyCard === 0 && parsedExternal === 0 && totalBlockBudget > 0) {
      toast.error('Vui lòng nhập Ngân sách chạy qua thẻ hoặc Ngân sách chạy ngoài!');
      return;
    }

    setIsSubmitting(true);
    try {
      const directorName = blockDirector?.displayName || blockDirector?.email || currentActiveBlock.directorName || 'Chưa gán';
      const directorUid = currentActiveBlock.directorUid || '';

      // Preserve existing payment status on update, default to 'unpaid' for new records
      const preservedPaymentStatus = editingRecordId ? (existingRecord?.paymentStatus || 'unpaid') : 'unpaid';

      const payload = {
        blockId: currentActiveBlock.id,
        blockCode: currentActiveBlock.blockCode,
        blockName: currentActiveBlock.name || currentActiveBlock.blockCode,
        directorUid,
        directorName,
        month: selectedMonth,
        totalBlockBudget,
        companyCardBudget: parsedCompanyCard,
        externalBudget: parsedExternal,
        paymentStatus: preservedPaymentStatus,
        note: noteInput.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'N/A',
        updatedByName: userProfile?.displayName || user?.displayName || user?.email || 'N/A'
      };

      if (editingRecordId) {
        // Update existing record
        await updateDoc(doc(db, 'reciprocal_budgets', editingRecordId), payload);
        await logAction('UPDATE_RECIPROCAL_BUDGET', 'reciprocal_budgets', editingRecordId, {
          blockCode: currentActiveBlock.blockCode,
          month: selectedMonth,
          totalBlockBudget,
          companyCardBudget: parsedCompanyCard,
          externalBudget: parsedExternal,
          paymentStatus: preservedPaymentStatus
        });
        toast.success(`Đã cập nhật Đăng ký đối ứng kỳ ${selectedMonth} thành công!`);
      } else {
        // Create new record (default paymentStatus is 'unpaid')
        const newDoc = await addDoc(collection(db, 'reciprocal_budgets'), {
          ...payload,
          approvedReciprocalBudget: 0,
          approvalStatus: 'pending',
          paymentStatus: 'unpaid',
          createdAt: serverTimestamp(),
          createdBy: user?.email || 'N/A',
          createdByName: userProfile?.displayName || user?.displayName || user?.email || 'N/A'
        });
        await logAction('CREATE_RECIPROCAL_BUDGET', 'reciprocal_budgets', newDoc.id, {
          blockCode: currentActiveBlock.blockCode,
          month: selectedMonth,
          totalBlockBudget,
          companyCardBudget: parsedCompanyCard,
          externalBudget: parsedExternal,
          paymentStatus: 'unpaid'
        });
        toast.success(`Đã gửi Đăng ký đối ứng kỳ ${selectedMonth} thành công!`);
      }
    } catch (err: any) {
      console.error('Error saving reciprocal budget:', err);
      toast.error('Lỗi khi lưu đăng ký đối ứng: ' + (err.message || 'Lỗi không xác định'));
    } finally {
      setIsSubmitting(false);
    }
  };


  // Handle Delete
  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    try {
      await deleteDoc(doc(db, 'reciprocal_budgets', recordToDelete.id));
      await logAction('DELETE_RECIPROCAL_BUDGET', 'reciprocal_budgets', recordToDelete.id, {
        blockCode: recordToDelete.blockCode,
        month: recordToDelete.month
      });
      toast.success(`Đã xóa bản ghi đối ứng kỳ ${recordToDelete.month}`);
      if (editingRecordId === recordToDelete.id) {
        setEditingRecordId(null);
        setCompanyCardBudgetInput('');
        setExternalBudgetInput('');
        setNoteInput('');
      }
    } catch (err: any) {
      console.error('Error deleting reciprocal budget:', err);
      toast.error('Lỗi khi xóa bản ghi: ' + (err.message || ''));
    } finally {
      setIsDeleteDialogOpen(false);
      setRecordToDelete(null);
    }
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
            Bạn chưa được phân quyền xem mục <strong>Đăng ký đối ứng</strong>. Vui lòng liên hệ Quản trị viên để được cấp quyền <code className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-mono">reciprocal_budget.view</code>.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300 font-sans">
      {/* Top Banner Guide */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 md:p-8 rounded-[28px] text-white shadow-xl shadow-amber-100/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--mh-surface)]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="bg-[var(--mh-surface)]/20 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider inline-flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" /> Quản Lý Đối Ứng Khối
              </span>
              {currentMarketingPeriod && (
                <Badge className="bg-[var(--mh-surface)] text-amber-900 border-none font-black text-[10px]">
                  Kỳ MKT hiện tại: {currentMarketingPeriod}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">
                Đăng ký Ngân sách Đối ứng - {currentActiveBlock ? `${currentActiveBlock.name || currentActiveBlock.blockCode}` : 'Chưa chọn Khối'}
              </h2>
              {currentActiveBlock && (
                <Badge className="bg-[var(--mh-surface)]/20 text-white border-white/30 rounded-xl font-bold px-3 py-1 text-xs backdrop-blur-sm">
                  {currentActiveBlock.blockCode || 'Khối'}
                </Badge>
              )}
            </div>
            <p className="text-amber-100 text-xs sm:text-sm font-medium leading-relaxed">
              Kê khai phân bổ ngân sách chạy qua thẻ công ty và ngân sách chạy ngoài. Ngân sách đối ứng sẽ được tính toán và phê duyệt dựa trên nguồn ngân sách tự chạy ngoài.
            </p>
          </div>

          <div className="bg-[var(--mh-surface)]/15 backdrop-blur-md p-4 rounded-2xl border border-white/20 min-w-[240px] text-right space-y-1 self-start md:self-center">
            <div className="text-[10px] uppercase font-black tracking-wider text-amber-100">
              Tổng Ngân sách Khối ({selectedMonth || 'Kỳ này'})
            </div>
            <div className="text-2xl font-black text-white">
              {formatCurrency(totalBlockBudget)}
            </div>
            <div className="text-[10px] text-amber-100 font-medium">
              Đồng bộ từ mục Ngân sách Khối
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Form, Right History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* FORM REGISTER: 5 Cols */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-[var(--mh-border)] shadow-lg rounded-3xl overflow-hidden bg-[var(--mh-surface)]">
            <div className="h-1.5 bg-gradient-to-r from-amber-500 to-orange-500 w-full" />
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-black text-[var(--mh-text)] flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-600" />
                  {editingRecordId ? 'Cập Nhật Đăng Ký Đối Ứng' : 'Tạo Bản Đăng Ký Mới'}
                </CardTitle>
                {existingRecord && (
                  <Badge 
                    className={
                      existingRecord.approvedReciprocalBudget > 0
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold'
                        : 'bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold'
                    }
                  >
                    {existingRecord.approvedReciprocalBudget > 0 ? 'Đã duyệt' : 'Chờ Admin duyệt'}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-[var(--mh-text-2)] font-medium">
                Kê khai số liệu ngân sách đối ứng cho khối <strong>{currentActiveBlock?.name || currentActiveBlock?.blockCode}</strong>.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* 1. Month Picker */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-[var(--mh-text)] flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[var(--mh-text-3)]" /> Tháng Đăng Ký <span className="text-rose-500">*</span>
                    </Label>
                    {selectedMonth === currentMarketingPeriod && (
                      <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Kỳ MKT hiện tại
                      </span>
                    )}
                  </div>
                  <Input 
                    type="text"
                    placeholder="YYYY-MM (VD: 2026-09)"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value.trim())}
                    className="h-11 rounded-2xl border-[var(--mh-border)] font-mono text-sm font-bold focus:ring-2 focus:ring-amber-500/20"
                    required
                  />
                  <p className="text-[10px] text-[var(--mh-text-3)] italic">
                    * Mặc định lấy theo Tháng của kì đăng ký MKT hiện tại ({currentMarketingPeriod})
                  </p>
                </div>

                {/* 2. Tổng Ngân sách Khối (Đồng bộ) */}
                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                      Tổng Ngân sách Khối ({selectedMonth || 'N/A'})
                    </Label>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">
                      Tự động đồng bộ
                    </span>
                  </div>
                  <div className="text-2xl font-black text-amber-950 font-mono">
                    {formatCurrency(totalBlockBudget)}
                  </div>
                  {totalBlockBudget === 0 ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-700 font-medium pt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Chưa có hạn mức Ngân sách Khối được đăng ký trong kỳ {selectedMonth}.</span>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div className="text-[10px] text-[var(--mh-text-2)]">
                        Dữ liệu được lấy từ mục Ngân sách Khối tương ứng của tháng {selectedMonth}.
                      </div>
                      {relevantBlockBudgets.length > 0 && (
                        <div className="pt-2 border-t border-amber-200/60 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase text-amber-900">
                            <span>Dự án & Ban KD trong kỳ ({relevantBlockBudgets.length}):</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                            {relevantBlockBudgets.map((bb: any) => {
                              const proj = resolveProject(projects, bb);
                              const banName = bb.banKdName || proj?.banKdName;
                              return (
                                <div 
                                  key={bb.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--mh-surface)] border border-amber-200 text-xs text-[var(--mh-text)] shadow-2xs"
                                >
                                  <span className="font-bold">{bb.projectName || proj?.name}</span>
                                  {banName && (
                                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-bold">
                                      {banName}
                                    </Badge>
                                  )}
                                  <span className="font-mono font-bold text-amber-800 ml-1">
                                    {formatCurrency(bb.amount || 0)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Ngân sách chạy qua thẻ công ty Mayhomes */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[var(--mh-text)] flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-indigo-500" /> Ngân sách qua thẻ Mayhomes <span className="text-rose-500">*</span>
                    </span>
                    <span className="text-[10px] font-medium text-[var(--mh-text-3)]">(Tự chạy hoặc Digital chạy)</span>
                  </Label>
                  <div className="relative">
                    <Input 
                      type="text"
                      placeholder="0"
                      value={companyCardBudgetInput}
                      onChange={(e) => {
                        const formatted = formatCurrencyInput(e.target.value);
                        setCompanyCardBudgetInput(formatted);
                        // Auto update suggested external budget if external was untouched or equal to previous diff
                        const newCard = parseVal(formatted);
                        if (totalBlockBudget > 0) {
                          const newDiff = Math.max(0, totalBlockBudget - newCard);
                          setExternalBudgetInput(formatCurrencyInput(String(newDiff)));
                        }
                      }}
                      className={`h-11 rounded-2xl border-[var(--mh-border)] font-mono text-sm font-bold pr-12 focus:ring-2 ${
                        isCompanyCardExceeded 
                          ? 'border-rose-400 focus:ring-rose-200 bg-rose-50/50 text-rose-700' 
                          : 'focus:ring-amber-500/20'
                      }`}
                      required
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--mh-text-3)] pointer-events-none">
                      VNĐ
                    </span>
                  </div>
                  {isCompanyCardExceeded ? (
                    <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Không được vượt quá Tổng ngân sách Khối ({formatCurrency(totalBlockBudget)})
                    </p>
                  ) : (
                    <p className="text-[10px] text-[var(--mh-text-3)]">
                      Tối đa: {formatCurrency(totalBlockBudget)}
                    </p>
                  )}
                </div>

                {/* 4. Ngân sách chạy ngoài (Không dùng thẻ Mayhomes) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-[var(--mh-text)] flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-emerald-500" /> Ngân sách chạy ngoài <span className="text-rose-500">*</span>
                    </Label>
                    {totalBlockBudget > 0 && (
                      <button
                        type="button"
                        onClick={handleApplySuggestedExternal}
                        className="text-[10px] font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Sparkles className="w-3 h-3 text-amber-500" /> Gợi ý: {formatCurrency(suggestedExternal)}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input 
                      type="text"
                      placeholder="0"
                      value={externalBudgetInput}
                      onChange={(e) => setExternalBudgetInput(formatCurrencyInput(e.target.value))}
                      className="h-11 rounded-2xl border-[var(--mh-border)] font-mono text-sm font-bold pr-12 focus:ring-2 focus:ring-amber-500/20"
                      required
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--mh-text-3)] pointer-events-none">
                      VNĐ
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--mh-text-3)]">
                    Gợi ý = Tổng ngân sách Khối - Ngân sách chạy qua thẻ Mayhomes
                  </p>
                </div>

                {/* 5. GHI CHÚ QUY ĐỊNH BẮT BUỘC */}
                <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/70 text-amber-900 space-y-1">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold leading-relaxed">
                      <strong>Ghi chú quan trọng:</strong> Ngân sách đối ứng sẽ dựa trên <u>ngân sách chạy ngoài</u> (Không bao gồm ngân sách chạy qua thẻ công ty Mayhomes).
                    </p>
                  </div>
                </div>

                {/* 6. Ghi chú thêm của Khối */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-[var(--mh-text)]">Ghi chú bổ sung (nếu có)</Label>
                  <textarea 
                    rows={2}
                    placeholder="Nhập nội dung giải trình hoặc đề xuất thêm..."
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--mh-border)] p-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all resize-none"
                  />
                </div>

                {/* Approved Reciprocal Budget Info (if Admin has approved) */}
                {existingRecord && existingRecord.approvedReciprocalBudget > 0 && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                        Ngân sách đối ứng ĐƯỢC DUYỆT:
                      </div>
                      <div className="text-lg font-black font-mono text-emerald-900">
                        {formatCurrency(existingRecord.approvedReciprocalBudget)}
                      </div>
                    </div>
                    <Badge className="bg-emerald-600 text-white border-none font-bold text-xs py-1 px-3">
                      Đã được duyệt
                    </Badge>
                  </div>
                )}

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={isSubmitting || isCompanyCardExceeded}
                  className={`w-full h-12 rounded-2xl font-black text-sm text-white shadow-lg transition-all ${
                    isCompanyCardExceeded 
                      ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                      : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200 active:scale-[0.98]'
                  }`}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Đang lưu dữ liệu...
                    </span>
                  ) : editingRecordId ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Cập Nhật Đăng Ký Đối Ứng Kỳ {selectedMonth}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Gửi Đăng Ký Đối Ứng Kỳ {selectedMonth}
                    </span>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* HISTORY & RECENT RECORDS: 7 Cols */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-[var(--mh-border)] shadow-lg rounded-3xl overflow-hidden bg-[var(--mh-surface)]">
            <CardHeader className="pb-4 border-b border-[var(--mh-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-black text-[var(--mh-text)] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" /> Lịch Sử Đăng Ký Đối Ứng
                  <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200 font-bold ml-1">
                    {blockHistory.length} kỳ
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-[var(--mh-text-2)] font-medium">
                  Các bản ghi đăng ký đối ứng của khối <strong>{currentActiveBlock?.name || currentActiveBlock?.blockCode}</strong> các tháng gần đây
                </CardDescription>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                {/* View switcher: Table vs Cards */}
                <div className="flex items-center bg-[var(--mh-surface-2)] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('table')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      historyViewMode === 'table'
                        ? 'bg-[var(--mh-surface)] text-[var(--mh-text)] shadow-xs'
                        : 'text-[var(--mh-text-2)] hover:text-[var(--mh-text)]'
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5" /> Bảng
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('cards')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      historyViewMode === 'cards'
                        ? 'bg-[var(--mh-surface)] text-[var(--mh-text)] shadow-xs'
                        : 'text-[var(--mh-text-2)] hover:text-[var(--mh-text)]'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> Thẻ
                  </button>
                </div>

                {/* Quick block director display */}
                <div className="text-right text-xs hidden sm:block">
                  <span className="text-[var(--mh-text-3)] font-medium">GĐ Khối: </span>
                  <strong className="text-[var(--mh-text)] font-bold">
                    {blockDirector?.displayName || blockDirector?.email || currentActiveBlock?.directorName || 'Chưa gán'}
                  </strong>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {blockHistory.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
                    <Receipt className="w-7 h-7" />
                  </div>
                  <div className="text-[var(--mh-text)] font-bold text-sm">
                    Chưa có bản ghi đăng ký đối ứng nào
                  </div>
                  <p className="text-xs text-[var(--mh-text-3)] max-w-sm mx-auto">
                    Hãy điền thông tin vào biểu mẫu bên trái để thực hiện đăng ký đối ứng cho khối trong kỳ hiện tại.
                  </p>
                </div>
              ) : historyViewMode === 'table' ? (
                /* TABLE VIEW: Explicit columns including Thanh Toán & Ghi Chú */
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-[var(--mh-surface-2)]/80 border-b border-[var(--mh-border)]">
                      <TableRow>
                        <TableHead className="text-[11px] font-black uppercase text-[var(--mh-text-2)]">Kỳ (Tháng)</TableHead>
                        <TableHead className="text-[11px] font-black uppercase text-[var(--mh-text-2)]">Tổng NS Khối</TableHead>
                        <TableHead className="text-[11px] font-black uppercase text-[var(--mh-text-2)]">NS Thẻ C.Ty</TableHead>
                        <TableHead className="text-[11px] font-black uppercase text-[var(--mh-text-2)]">NS Chạy Ngoài</TableHead>
                        <TableHead className="text-[11px] font-black uppercase text-emerald-700">Đối Ứng Duyệt</TableHead>
                        {/* CỘT THANH TOÁN (3 trạng thái: Chưa thanh toán / Đã thanh toán / Từ chối) */}
                        <TableHead className="text-[11px] font-black uppercase text-[var(--mh-text)] min-w-[150px]">Thanh Toán</TableHead>
                        {/* CỘT GHI CHÚ */}
                        <TableHead className="text-[11px] font-black uppercase text-[var(--mh-text)] min-w-[130px]">Ghi Chú</TableHead>
                        <TableHead className="text-[11px] font-black uppercase text-[var(--mh-text-2)]">Trạng Thái Duyệt</TableHead>
                        <TableHead className="text-right text-[11px] font-black uppercase text-[var(--mh-text-2)]">Thao Tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockHistory.map((item) => {
                        const isCurrent = item.month === currentMarketingPeriod;
                        const hasApproved = (item.approvedReciprocalBudget || 0) > 0;
                        const paymentInfo = getPaymentStatusInfo(item.paymentStatus);

                        return (
                          <TableRow 
                            key={item.id}
                            className={`transition-colors hover:bg-[var(--mh-surface-2)]/80 ${
                              item.month === selectedMonth ? 'bg-amber-50/40' : ''
                            }`}
                          >
                            {/* Kỳ (Tháng) */}
                            <TableCell className="whitespace-nowrap py-3.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-xs text-[var(--mh-text)] bg-[var(--mh-surface-2)] px-2 py-0.5 rounded-md">
                                  {item.month}
                                </span>
                                {isCurrent && (
                                  <Badge className="bg-amber-500 text-white text-[9px] font-black py-0 px-1.5">
                                    Hiện tại
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            {/* Tổng NS Khối */}
                            <TableCell className="whitespace-nowrap py-3.5 font-mono text-xs font-semibold text-[var(--mh-text)]">
                              {formatCurrency(item.totalBlockBudget || 0)}
                            </TableCell>

                            {/* NS Qua Thẻ C.Ty */}
                            <TableCell className="whitespace-nowrap py-3.5 font-mono text-xs font-semibold text-indigo-700">
                              {formatCurrency(item.companyCardBudget || 0)}
                            </TableCell>

                            {/* NS Chạy Ngoài */}
                            <TableCell className="whitespace-nowrap py-3.5 font-mono text-xs font-bold text-amber-700">
                              {formatCurrency(item.externalBudget || 0)}
                            </TableCell>

                            {/* Đối Ứng Được Duyệt */}
                            <TableCell className="whitespace-nowrap py-3.5 font-mono text-xs font-black text-emerald-800">
                              {hasApproved ? (
                                formatCurrency(item.approvedReciprocalBudget)
                              ) : (
                                <span className="text-[var(--mh-text-3)] font-normal italic">—</span>
                              )}
                            </TableCell>

                            {/* CỘT THANH TOÁN (Chỉ xem trạng thái; chỉnh sửa trạng thái được thực hiện trong Quản trị đối ứng) */}
                            <TableCell className="whitespace-nowrap py-3.5">
                              <Badge className={paymentInfo.badgeClass}>
                                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${paymentInfo.dotClass}`} />
                                {paymentInfo.label}
                              </Badge>
                            </TableCell>

                            {/* CỘT GHI CHÚ */}
                            <TableCell className="py-3.5 max-w-[180px]">
                              {item.note ? (
                                <div className="text-xs text-[var(--mh-text)] truncate" title={item.note}>
                                  {item.note}
                                </div>
                              ) : (
                                <span className="text-xs text-[var(--mh-text-3)] italic">—</span>
                              )}
                            </TableCell>

                            {/* Trạng Thái Duyệt */}
                            <TableCell className="whitespace-nowrap py-3.5">
                              <Badge 
                                className={
                                  hasApproved
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold'
                                    : 'bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold'
                                }
                              >
                                {hasApproved ? 'Đã duyệt' : 'Chờ duyệt'}
                              </Badge>
                            </TableCell>

                            {/* Thao Tác */}
                            <TableCell className="text-right whitespace-nowrap py-3.5">
                              <div className="flex items-center justify-end gap-1">
                                {hasEditPerm && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setSelectedMonth(item.month);
                                      setEditingRecordId(item.id);
                                      setCompanyCardBudgetInput(formatCurrencyInput(String(item.companyCardBudget || 0)));
                                      setExternalBudgetInput(formatCurrencyInput(String(item.externalBudget || 0)));
                                      setNoteInput(item.note || '');
                                      toast.info(`Đang chỉnh sửa bản ghi kỳ ${item.month}`);
                                    }}
                                    className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-50 rounded-lg"
                                    title="Chỉnh sửa"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {hasDeletePerm && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setRecordToDelete(item);
                                      setIsDeleteDialogOpen(true);
                                    }}
                                    className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50 rounded-lg"
                                    title="Xóa"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                /* CARDS VIEW: Enhanced with Payment Status & Note */
                <div className="divide-y divide-slate-100">
                  {blockHistory.map((item) => {
                    const isCurrent = item.month === currentMarketingPeriod;
                    const hasApproved = (item.approvedReciprocalBudget || 0) > 0;
                    const paymentInfo = getPaymentStatusInfo(item.paymentStatus);

                    return (
                      <div 
                        key={item.id} 
                        className={`p-5 transition-colors ${
                          item.month === selectedMonth ? 'bg-amber-50/40' : 'hover:bg-[var(--mh-surface-2)]/60'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-black font-mono text-[var(--mh-text)] bg-[var(--mh-surface-2)] px-3 py-1 rounded-xl">
                              Tháng {item.month}
                            </span>
                            {isCurrent && (
                              <Badge className="bg-amber-500 text-white border-none text-[9px] font-black">
                                Kỳ hiện tại
                              </Badge>
                            )}
                            <Badge 
                              className={
                                hasApproved
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold'
                                  : 'bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold'
                              }
                            >
                              {hasApproved ? 'Đã duyệt đối ứng' : 'Chờ Admin duyệt'}
                            </Badge>

                            {/* Payment Status in Card Header (Read-only badge in Block Management) */}
                            <Badge className={paymentInfo.badgeClass}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${paymentInfo.dotClass}`} />
                              {paymentInfo.label}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-auto">
                            {hasEditPerm && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedMonth(item.month);
                                  setEditingRecordId(item.id);
                                  setCompanyCardBudgetInput(formatCurrencyInput(String(item.companyCardBudget || 0)));
                                  setExternalBudgetInput(formatCurrencyInput(String(item.externalBudget || 0)));
                                  setNoteInput(item.note || '');
                                  toast.info(`Đang chỉnh sửa bản ghi kỳ ${item.month}`);
                                }}
                                className="h-8 text-xs font-bold text-amber-700 hover:bg-amber-100 rounded-xl"
                              >
                                <Edit3 className="w-3.5 h-3.5 mr-1" /> Sửa
                              </Button>
                            )}

                            {hasDeletePerm && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRecordToDelete(item);
                                  setIsDeleteDialogOpen(true);
                                }}
                                className="h-8 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Xóa
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Metric stats grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--mh-surface)] p-3.5 rounded-2xl border border-[var(--mh-border)]">
                          <div>
                            <div className="text-[10px] font-bold text-[var(--mh-text-3)] uppercase tracking-wider">
                              Tổng NS Khối
                            </div>
                            <div className="text-xs sm:text-sm font-black text-[var(--mh-text)] font-mono mt-0.5">
                              {formatCurrency(item.totalBlockBudget || 0)}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] font-bold text-[var(--mh-text-3)] uppercase tracking-wider">
                              NS Qua Thẻ C.Ty
                            </div>
                            <div className="text-xs sm:text-sm font-black text-indigo-700 font-mono mt-0.5">
                              {formatCurrency(item.companyCardBudget || 0)}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] font-bold text-[var(--mh-text-3)] uppercase tracking-wider">
                              NS Chạy Ngoài
                            </div>
                            <div className="text-xs sm:text-sm font-black text-amber-700 font-mono mt-0.5">
                              {formatCurrency(item.externalBudget || 0)}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                              Đối Ứng Được Duyệt
                            </div>
                            <div className="text-xs sm:text-sm font-black text-emerald-700 font-mono mt-0.5">
                              {hasApproved ? formatCurrency(item.approvedReciprocalBudget) : '— (Chờ duyệt)'}
                            </div>
                          </div>
                        </div>

                        {/* Note display */}
                        {item.note && (
                          <div className="mt-2.5 px-3 py-2 rounded-xl bg-[var(--mh-surface-2)] border border-[var(--mh-border)] text-xs text-[var(--mh-text)] flex items-start gap-2">
                            <span className="font-bold text-[var(--mh-text-2)] shrink-0">Ghi chú:</span>
                            <span className="italic">{item.note}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-[var(--mh-text-3)] mt-2.5 px-1">
                          <span>
                            Người đăng ký: <strong className="text-[var(--mh-text-2)]">{item.createdByName || item.createdBy || 'N/A'}</strong>
                          </span>
                          <span>
                            {safeFormat(item.updatedAt || item.createdAt, 'HH:mm dd/MM/yyyy')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[var(--mh-text)] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" /> Xác nhận xóa bản ghi đối ứng?
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--mh-text-2)] pt-2 font-medium">
              Bạn có chắc chắn muốn xóa bản đăng ký đối ứng của khối <strong>{recordToDelete?.blockName || recordToDelete?.blockCode}</strong> trong kỳ <strong>{recordToDelete?.month}</strong>? Thao tác này không thể hoàn tác.
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
