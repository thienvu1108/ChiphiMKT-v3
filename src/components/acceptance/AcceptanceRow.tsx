import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Calculator, 
  Edit, 
  Trash2, 
  Save, 
  History,
  Loader2
} from 'lucide-react';
import { getRowComputed, handleCostInputChange, resolveBlockForTeam, formatAcceptanceMonth, resolveAcceptanceProject, parseCurrencyFormula } from './acceptanceUtils';
import { resolveEditRaw, resolveLines, debtOf, sumLines, linesToFormula } from '../../lib/amountLines';
import { AmountLinesEditor, AmountCellButton } from './AmountLinesEditor';
import { implementerOptions } from '../../../lib/vnext/onboarding';
import { AcceptanceSearchableSelect, SearchableItem } from './AcceptanceSearchableSelect';
import { ManualAssigneeDialog } from './ManualAssigneeDialog';
import { suppBadge, suppStatus, SUPP_STATUS_LABEL } from '../../../lib/vnext/ntSupplement';
import { NT_MANUAL_LABEL, NT_MANUAL_VALUE, ntManualAllowed, isManualImplementer, implementerLabel } from '../../../lib/vnext/ntManual';
import { acceptanceAssigneeUids, acceptanceChoicesFor, acceptanceKhoiAssignees, clearStaleProject, filterAssigneeOptions, type NtBudgetLine } from '../../../lib/vnext/ntBudgetProjects';
import type { Support } from '../../../lib/vnext/support';

interface RowProps {
  item: any;
  index: number;
  isFinalizedView?: boolean;
  isSelected: boolean;
  isEditing: boolean;
  editingState?: any;
  teams: any[];
  allUsers?: any[];
  projects: any[];
  blocks: any[];
  monthsList: string[];
  teamMap?: Record<string, string>;
  projectMap?: Record<string, string>;
  teamIdSet?: Set<string>;
  projectIdSet?: Set<string>;
  teamItems?: SearchableItem[];
  projectItems?: SearchableItem[];
  findTeam?: (idOrCodeOrName: string) => any;
  findProject?: (idOrCodeOrName: string) => any;
  formatCurrency: (amount: number) => string;
  canEdit?: boolean;
  canDelete?: boolean;
  onSelectRow: (id: string, checked: boolean) => void;
  onStartEdit: (item: any) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, updatedState: any) => Promise<void> | void;
  onOpenCalculator: (fieldKey: string, fieldVNName: string, currentVal: string, onUpdate: (val: string) => void) => void;
  onFinalize?: (item: any) => void;
  onDelete: (id: string) => void;
  onOpenHistory: (item: any) => void;
  renderBreakdownTooltip: (amount: number, breakdown: any, label: string) => React.ReactNode;
  onUploadImages?: (item: any) => void;
  onUploadInvoices?: (item: any) => void;
  onOpenAdLinks?: (item: any) => void;
  onAssignImplementer?: (item: any, uid: string, name: string) => Promise<void> | void;
  onAssignTeam?: (item: any, teamId: string) => Promise<void> | void;
  /** Tự nhập Người phụ trách (chỉ Tháng 10/2026; undefined = không có quyền). */
  onAssignManual?: (item: any, name: string) => Promise<void> | void;
  nsLines?: NtBudgetLine[];
  nsSupport?: Record<string, Partial<Support> | undefined>;
}

export const AcceptanceRow: React.FC<RowProps> = React.memo(({
  item,
  index,
  isFinalizedView = false,
  isSelected,
  isEditing,
  editingState: propEditingState,
  teams,
  allUsers = [],
  projects,
  blocks,
  monthsList,
  teamMap = {},
  projectMap = {},
  teamIdSet,
  projectIdSet,
  teamItems: propTeamItems,
  projectItems: propProjectItems,
  findTeam,
  findProject,
  formatCurrency,
  canEdit = true,
  canDelete = true,
  onSelectRow,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onOpenCalculator,
  onDelete,
  onOpenHistory,
  renderBreakdownTooltip,
  onUploadImages,
  onUploadInvoices,
  onOpenAdLinks,
  onAssignImplementer,
  onAssignTeam,
  onAssignManual,
  nsLines = [],
  nsSupport,
}) => {
  const [manualOpen, setManualOpen] = useState<'' | 'view' | 'edit'>('');
  // Local edit state to ensure typing inside edit row is 100% instant and doesn't re-render parent/other rows
  const [localEditState, setLocalEditState] = useState<any>(() => {
    return propEditingState || item;
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSaveEdit(item.id, localEditState);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (isEditing) {
      const base = propEditingState || {
        ...item,
        digitalFb: item.digitalFb ?? item.fbDigitalChuaVat ?? '',
        digitalZalo: item.digitalZalo ?? '',
        digitalTiktok: item.digitalTiktok ?? '',
        digitalKhac: item.digitalKhac ?? '',
        visaFb: item.visaFb ?? item.fbVisaCostChuaVat ?? '',
        visaZalo: item.visaZalo ?? '',
        visaTiktok: item.visaTiktok ?? '',
        visaDangTin: item.visaDangTin ?? '',
        dangTinCtyChuaVat: item.dangTinCtyChuaVat ?? item.dangTinCongTyChuaVat ?? '',
        caNhanFb: item.caNhanFb ?? item.caNhanCost ?? item.otherCost ?? '',
        caNhanDangTin: item.caNhanDangTin ?? item.dangTinCaNhanCost ?? '',
        caNhanZalo: item.caNhanZalo ?? item.zaloCost ?? '',
        caNhanGoogle: item.caNhanGoogle ?? item.googleCost ?? '',
        caNhanTiktok: item.caNhanTiktok ?? item.tiktokCost ?? '',
        caNhanNativeAds: item.caNhanNativeAds ?? '',
        caNhanUCall: item.caNhanUCall ?? '',
        caNhanNapTienQuaCty: item.caNhanNapTienQuaCty ?? item.caNhanNapTienCty ?? '',
        caNhanNopTien: item.caNhanNopTien ?? item.personalPaidToCompany ?? '',
        hoaDonTien: item.hoaDonTien ?? '',
        hoaDonLines: item.hoaDonLines || [],
        status: item.status || 'Đã nghiệm thu',
        notes: item.notes || ''
      };
      // Khôi phục công thức/chi tiết từ costBreakdowns (sửa lỗi chỉ hiện tổng sau khi lưu).
      const COST = ['digitalFb','digitalZalo','digitalTiktok','digitalKhac','visaFb','visaZalo','visaTiktok','visaDangTin','dangTinCtyChuaVat','caNhanFb','caNhanDangTin','caNhanZalo','caNhanGoogle','caNhanTiktok','caNhanNativeAds','caNhanUCall','caNhanNapTienQuaCty','caNhanNopTien','hoaDonTien'];
      const restored: any = { ...base };
      for (const f of COST) restored[f] = resolveEditRaw(f, { ...item, ...base }, parseCurrencyFormula);
      setLocalEditState(restored);
    }
  }, [isEditing, propEditingState, item]);

  // Fast O(1) Raw database ID check
  const isRawId = useCallback((val: string | undefined | null) => {
    if (!val) return false;
    const str = String(val).trim();
    if (str.startsWith('draft-')) return true;
    if (teamIdSet && teamIdSet.has(str)) return true;
    if (projectIdSet && projectIdSet.has(str)) return true;
    if (str.length >= 16 && /^[a-zA-Z0-9_-]+$/.test(str) && !str.includes(' ') && !str.includes('.')) return true;
    return false;
  }, [teamIdSet, projectIdSet]);

  const teamItems = useMemo(() => {
    if (propTeamItems) return propTeamItems;
    return (teams || []).map((t: any) => {
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
  }, [propTeamItems, teams]);

  const budgetChoices = useMemo(() => acceptanceChoicesFor(localEditState || item, nsLines, nsSupport, allUsers), [localEditState?.month, localEditState?.teamId, localEditState?.implementerUid, localEditState?.implementerManual, item.month, item.teamId, item.implementerUid, nsLines, nsSupport, allUsers]);

  // Kỳ ≥ 2026-11: lọc Người phụ trách theo đăng ký NS của Phòng + kỳ.
  const assigneeUids = useMemo(() => acceptanceAssigneeUids({ month: localEditState?.month ?? item.month, teamId: localEditState?.teamId ?? item.teamId, lines: nsLines, support: nsSupport }), [localEditState?.month, localEditState?.teamId, item.month, item.teamId, nsLines, nsSupport]);

  useEffect(() => {
    if (!isEditing) return;
    setLocalEditState((prev: any) => {
      if (!prev) return prev;
      const next = clearStaleProject(prev, acceptanceChoicesFor(prev, nsLines, nsSupport, allUsers));
      return next.projectId === prev.projectId ? prev : next;
    });
  }, [isEditing, nsLines, nsSupport, allUsers]);

  const projectItems = useMemo(() => {
    if (budgetChoices) {
      return budgetChoices.map((c) => {
        const p = (projects || []).find((pr: any) => pr.id === c.projectId);
        const name = p?.name || c.projectName || c.projectId;
        const code = p?.projectCode || '';
        return {
          value: c.projectId,
          label: code ? `[${code}] ${name}` : name,
          code,
          searchString: `${code} ${name} ${c.projectId}`.toLowerCase(),
          rawItem: p,
        };
      });
    }
    if (propProjectItems) return propProjectItems;
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
  }, [propProjectItems, projects, budgetChoices]);

  const handleUpdateEditField = (fieldKey: string, val: any) => {
    setLocalEditState((prev: any) => ({
      ...prev,
      [fieldKey]: val
    }));
  };

  const handleUpdateEditFields = (fieldsObj: Record<string, any>) => {
    setLocalEditState((prev: any) => ({
      ...prev,
      ...fieldsObj
    }));
  };

  // 1. EDITING MODE RENDER
  if (isEditing && localEditState) {
    const editComp = getRowComputed(localEditState);

    const currentEditTeam = (findTeam 
      ? (findTeam(localEditState.teamId) || findTeam(localEditState.teamCode) || findTeam(localEditState.teamName))
      : null) || (teams || []).find((t: any) => 
          t.id === localEditState.teamId || 
          t.id === localEditState.teamCode || 
          t.id === localEditState.teamName ||
          (localEditState.teamCode && t.teamCode === localEditState.teamCode) || 
          (localEditState.teamName && t.name === localEditState.teamName)
        );
    const currentEditTeamId = currentEditTeam?.id || localEditState.teamId || '';
    const editResolvedBlock = resolveBlockForTeam(currentEditTeam || localEditState, blocks, teams, findTeam);
    const editBlockId = editResolvedBlock.blockId || localEditState.blockId || '';
    // GĐ/TL Khối (đăng ký 'khoi' theo Khối, không thuộc Phòng) — bổ sung vào Người phụ trách.
    const editKhoiAssignees = acceptanceKhoiAssignees({ month: localEditState.month, blockId: editBlockId, lines: nsLines, support: nsSupport });
    const editKhoiUidSet = new Set((editKhoiAssignees || []).map((k) => k.uid));

    const currentEditProj = resolveAcceptanceProject(localEditState, projects);
    const currentEditProjId = currentEditProj?.id || localEditState.projectId || '';

    const renderEditInput = (
      fieldKey: string,
      fieldLabel: string,
      val: string,
      placeholder: string = '0'
    ) => (
      <div className="relative group flex items-center min-w-[75px]">
        <Input
          value={val || ''}
          placeholder={placeholder}
          onChange={(e) => handleCostInputChange(e.target.value, (v) => handleUpdateEditField(fieldKey, v))}
          className="h-7 text-right font-mono text-[11px] font-bold pr-5 border-indigo-200 focus:border-indigo-500 rounded bg-[var(--mh-surface)]"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onOpenCalculator(fieldKey, fieldLabel, val || '', (v) => handleUpdateEditField(fieldKey, v))}
          className="absolute right-1 text-[var(--mh-text-3)] hover:text-indigo-600 opacity-60 group-hover:opacity-100 transition-opacity"
          title={`Mở máy tính (${fieldLabel})`}
        >
          <Calculator className="w-3 h-3" />
        </button>
      </div>
    );

    return (
      <TableRow className="bg-indigo-50/40 border-y-2 border-indigo-300">
        {/* STT */}
        <TableCell className="text-center font-bold text-xs text-indigo-700 bg-indigo-100 md:sticky md:left-0 md:z-10">
          <span className="font-mono">{index + 1}</span>
        </TableCell>

        {/* Col A: THÁNG */}
        <TableCell className="p-1 min-w-[110px] sticky left-0 z-10 bg-[#E8EEF8] shadow-[inset_-1px_0_0_#C9D4E5,2px_0_6px_rgba(15,23,42,0.08)] md:left-16">
          <Select
            value={localEditState.month || (monthsList && monthsList.length > 0 ? monthsList[0] : '')}
            onValueChange={(val) => setLocalEditState((prev: any) => clearStaleProject({ ...prev, month: val }, acceptanceChoicesFor({ ...prev, month: val }, nsLines, nsSupport, allUsers)))}
          >
            <SelectTrigger className="h-7 text-[11px] font-bold border-indigo-200 bg-[var(--mh-surface)] rounded">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {localEditState.month && !monthsList.includes(localEditState.month) && (
                <SelectItem key={localEditState.month} value={localEditState.month}>{localEditState.month}</SelectItem>
              )}
              {monthsList.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>

        {/* Col: KHỐI */}
        <TableCell className="p-1 min-w-[110px] text-center">
          {editResolvedBlock.blockName ? (
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold text-[11px] px-2 py-1 inline-flex items-center gap-1 justify-center whitespace-nowrap">
              {editResolvedBlock.blockName}
            </Badge>
          ) : (
            <span className="text-[var(--mh-text-3)] text-[11px] italic px-1 block text-center">Tự động</span>
          )}
        </TableCell>

        {/* Col B: MÃ TEAM */}
        <TableCell className="p-1 min-w-[140px]">
          <AcceptanceSearchableSelect
            value={currentEditTeamId}
            items={teamItems}
            placeholder="Chọn Team"
            searchPlaceholder="Tìm kiếm Team, mã Team..."
            triggerClassName="h-7 text-[11px] font-bold border-indigo-200 bg-[var(--mh-surface)] rounded"
            triggerDisplay={
              currentEditTeam ? (
                <span className="truncate text-[var(--mh-text)] font-bold">
                  {currentEditTeam.teamCode ? `${currentEditTeam.teamCode} - ${currentEditTeam.name}` : currentEditTeam.name}
                </span>
              ) : undefined
            }
            onValueChange={(teamId, rawTm) => {
              const tm = rawTm || (teams || []).find((t: any) => t.id === teamId) || (findTeam ? findTeam(teamId) : null);
              if (tm) {
                const tmName = tm.name || '';
                const code = tm.teamCode || '';
                let gdkd = tmName;
                if (code && tmName.startsWith(code)) {
                  gdkd = tmName.substring(code.length).trim();
                }
                const resolvedBlk = resolveBlockForTeam(tm, blocks, teams, findTeam);
                handleUpdateEditFields({
                  teamId: tm.id,
                  teamCode: tm.teamCode || tm.name || '',
                  teamName: tm.name || tm.teamCode || '',
                  blockId: resolvedBlk.blockId || tm.blockId || '',
                  blockCode: resolvedBlk.blockCode || tm.blockCode || '',
                  blockName: resolvedBlk.blockName || tm.blockName || '',
                  gdkdName: (!localEditState.gdkdName || localEditState.gdkdName === '-') ? gdkd : localEditState.gdkdName,
                  implementerUid: '',
                  implementerName: '',
                  implementerManual: false,
                  projectId: '',
                  projectName: '',
                  projectCode: '',
                });
              } else {
                handleUpdateEditField('teamId', teamId);
              }
            }}
          />
        </TableCell>

        {/* Col C: GĐKD */}
        <TableCell className="p-1 min-w-[120px]">
          <Input
            value={localEditState.gdkdName || ''}
            onChange={(e) => handleUpdateEditField('gdkdName', e.target.value)}
            className="h-7 text-xs font-semibold border-indigo-200 rounded bg-[var(--mh-surface)]"
          />
        </TableCell>

        {/* Col D: NGƯỜI PHỤ TRÁCH — searchable, thành viên đã duyệt của Phòng */}
        <TableCell className="p-1 min-w-[160px] relative z-20 overflow-visible">
          {!currentEditTeamId && !editBlockId ? (
            <span className="text-[11px] text-amber-700 italic px-1">Chọn Phòng trước</span>
          ) : (
            <AcceptanceSearchableSelect
              value={localEditState.implementerUid || ''}
              items={(() => {
                const tm = currentEditTeam || (teams || []).find((t: any) => t.id === currentEditTeamId);
                const opts = filterAssigneeOptions(implementerOptions(allUsers, currentEditTeamId, tm), assigneeUids, allUsers);
                const items = opts.map((o) => ({ value: o.uid, label: o.name + (o.role === 'gdkd' ? ' · GĐKD' : ''), searchString: o.name }));
                (editKhoiAssignees || []).forEach((k) => { if (!items.some((i) => i.value === k.uid)) items.push({ value: k.uid, label: k.name + ' · GĐ/TL Khối', searchString: k.name }); });
                if (localEditState.implementerUid && !items.some((i) => i.value === localEditState.implementerUid)) {
                  items.unshift({ value: localEditState.implementerUid, label: (localEditState.implementerName || localEditState.implementerUid) + ' (ngoài Phòng)', searchString: localEditState.implementerName || '' });
                } else if (!localEditState.implementerUid && localEditState.implementerName) {
                  items.unshift({ value: '', label: isManualImplementer(localEditState) ? implementerLabel(localEditState) : `(cũ) ${localEditState.implementerName}`, searchString: localEditState.implementerName });
                }
                if (onAssignManual && ntManualAllowed(localEditState.month || item.month)) items.unshift({ value: NT_MANUAL_VALUE, label: NT_MANUAL_LABEL, searchString: 'khac tu nhap' });
                return items;
              })()}
              placeholder={(assigneeUids && assigneeUids.size === 0 && !(editKhoiAssignees && editKhoiAssignees.length)) ? 'Chưa có đăng ký NS kỳ này' : ((filterAssigneeOptions(implementerOptions(allUsers, currentEditTeamId), assigneeUids, allUsers).length || (editKhoiAssignees && editKhoiAssignees.length)) ? 'Chọn người phụ trách' : 'Phòng chưa có thành viên')}
              searchPlaceholder="Tìm tên (không cần dấu)…"
              triggerClassName="h-7 text-[11px] font-bold border-indigo-200 bg-[var(--mh-surface)] rounded"
              contentClassName="max-h-72 w-[280px] sm:w-[320px] z-[2000]"
              onValueChange={(uid, raw) => {
                if (uid === NT_MANUAL_VALUE) { setManualOpen('edit'); return; }
                const isKhoi = editKhoiUidSet.has(uid);
                const kk = (editKhoiAssignees || []).find((x) => x.uid === uid);
                const name = raw?.label?.replace(/ · (GĐKD|GĐ\/TL Khối)$/, '') || (allUsers.find((u: any) => (u.uid || u.id) === uid)?.fullName) || uid;
                const u = allUsers.find((x: any) => (x.uid || x.id) === uid);
                // GĐ/TL Khối không thuộc Phòng: xoá teamId, giữ blockId để bản ghi gộp theo Khối.
                const teamPatch = isKhoi ? { teamId: '', teamCode: '', teamName: '' } : {};
                setLocalEditState((prev: any) => clearStaleProject({
                  ...prev,
                  ...teamPatch,
                  implementerUid: uid,
                  implementerName: isKhoi ? (kk?.name || uid) : (u?.fullName || u?.displayName || u?.email || name || '').replace(/ · (GĐKD|GĐ\/TL Khối)$/, ''),
                  implementerManual: false,
                }, acceptanceChoicesFor({ ...prev, ...teamPatch, implementerUid: uid, implementerManual: false }, nsLines, nsSupport, allUsers)));
              }}
            />
          )}
          <ManualAssigneeDialog open={manualOpen === 'edit'} initial={isManualImplementer(localEditState) ? localEditState.implementerName : ''} onClose={() => setManualOpen('')}
            onSave={(n) => { handleUpdateEditFields({ implementerUid: '', implementerName: n, implementerManual: true }); }} />
        </TableCell>

        {/* Col E: DỰ ÁN */}
        <TableCell className="p-1 min-w-[180px]">
          <AcceptanceSearchableSelect
            /* Remount theo (team|người|kỳ) để danh sách dự án đổi theo người phụ trách mới (Base UI giữ trạng thái cũ nếu không remount). */
            key={budgetChoices ? `proj-${currentEditTeamId}-${localEditState?.implementerUid || 'none'}-${localEditState?.month || ''}` : 'proj-all'}
            testId="nt-project-select"
            value={budgetChoices && !budgetChoices.some((c) => c.projectId === currentEditProjId) ? '' : currentEditProjId}
            items={projectItems}
            disabled={!!budgetChoices && (!(localEditState?.implementerUid) || projectItems.length === 0)}
            placeholder={!currentEditTeamId && !editBlockId ? 'Chọn Phòng trước' : !(localEditState?.implementerUid) ? 'Chọn người phụ trách trước' : budgetChoices && projectItems.length === 0 ? 'Chưa có đăng ký NS kỳ này' : 'Chọn Dự án'}
            searchPlaceholder="Tìm kiếm dự án, mã dự án..."
            triggerClassName="h-7 text-[11px] font-bold border-indigo-200 bg-[var(--mh-surface)] rounded"
            triggerDisplay={
              currentEditProj ? (
                <span className="truncate text-[var(--mh-text)] font-bold">
                  {currentEditProj.name}
                </span>
              ) : undefined
            }
            onValueChange={(projectId, rawP) => {
              const p = rawP || (projects || []).find((pr: any) => pr.id === projectId) || (findProject ? findProject(projectId) : null);
              if (p) {
                handleUpdateEditFields({
                  projectId: p.id,
                  projectName: p.name || '',
                  projectCode: p.projectCode || '',
                  banKdId: p.banKdId || '',
                  banKdName: p.banKdName || ''
                });
              } else {
                handleUpdateEditField('projectId', projectId);
              }
            }}
          />
        </TableCell>

        {/* Col TỔNG — after DỰ ÁN */}
        <TableCell className="p-1 text-right font-mono text-xs font-black text-rose-900 bg-rose-100/70">
          {formatCurrency(editComp.grandTotal).replace(' đ', '')}
        </TableCell>
        <TableCell className="p-1 bg-orange-50/40">{renderEditInput('hoaDonTien', 'Tiền trên Hóa đơn', localEditState.hoaDonTien)}</TableCell>
        <TableCell className="p-1 text-right font-mono text-[11px] font-bold text-fuchsia-950 bg-fuchsia-50/50">
          {formatCurrency(editComp.hoaDonNo).replace(' đ', '')}
        </TableCell>

        {/* Group 1: DIGITAL */}
        <TableCell className="p-1 bg-sky-50/40">{renderEditInput('digitalFb', 'Digital FB', localEditState.digitalFb)}</TableCell>
        <TableCell className="p-1 bg-sky-50/40">{renderEditInput('digitalZalo', 'Digital Zalo', localEditState.digitalZalo)}</TableCell>
        <TableCell className="p-1 bg-sky-50/40">{renderEditInput('digitalTiktok', 'Digital Tiktok', localEditState.digitalTiktok)}</TableCell>
        <TableCell className="p-1 bg-sky-50/40">{renderEditInput('digitalKhac', 'Digital Khác', localEditState.digitalKhac)}</TableCell>

        {/* Col J: TỔNG DIGITAL CHƯA VAT */}
        <TableCell className="p-1 text-right font-mono text-[11px] font-bold text-sky-950 bg-sky-100/50">
          {formatCurrency(editComp.dTotalChuaVat).replace(' đ', '')}
        </TableCell>

        {/* Col K: DIGITAL CHẠY (SAU VAT) */}
        <TableCell className="p-1 text-right font-mono text-[11px] font-black text-sky-900 bg-sky-200/50">
          {formatCurrency(editComp.dTotalSauVat).replace(' đ', '')}
        </TableCell>

        {/* Group 2: VISA CÔNG TY */}
        <TableCell className="p-1 bg-emerald-50/40">{renderEditInput('visaFb', 'Visa FB', localEditState.visaFb)}</TableCell>
        <TableCell className="p-1 bg-emerald-50/40">{renderEditInput('visaZalo', 'Visa Zalo', localEditState.visaZalo)}</TableCell>
        <TableCell className="p-1 bg-emerald-50/40">{renderEditInput('visaTiktok', 'Visa Tiktok', localEditState.visaTiktok)}</TableCell>
        <TableCell className="p-1 bg-emerald-50/40">{renderEditInput('visaDangTin', 'Visa Đăng Tin', localEditState.visaDangTin)}</TableCell>

        {/* Col P: TỔNG VISA CHƯA VAT */}
        <TableCell className="p-1 text-right font-mono text-[11px] font-bold text-emerald-950 bg-emerald-100/50">
          {formatCurrency(editComp.vTotalChuaVat).replace(' đ', '')}
        </TableCell>

        {/* Col Q: THẺ VISA CÔNG TY (SAU VAT) */}
        <TableCell className="p-1 text-right font-mono text-[11px] font-black text-indigo-900 bg-indigo-100/50">
          {formatCurrency(editComp.vTotalSauVat).replace(' đ', '')}
        </TableCell>

        {/* Group 3: ĐĂNG TIN CÔNG TY */}
        <TableCell className="p-1 bg-indigo-50/40">{renderEditInput('dangTinCtyChuaVat', 'Đăng tin CTY chưa VAT', localEditState.dangTinCtyChuaVat)}</TableCell>
        <TableCell className="p-1 text-right font-mono text-[11px] font-black text-indigo-950 bg-indigo-100/60">
          {formatCurrency(editComp.dtCtySauVat).replace(' đ', '')}
        </TableCell>

        {/* Group 4: CÁ NHÂN */}
        <TableCell className="p-1 bg-amber-50/40">{renderEditInput('caNhanFb', 'Cá nhân FB', localEditState.caNhanFb)}</TableCell>
        <TableCell className="p-1 bg-amber-50/40">{renderEditInput('caNhanDangTin', 'Cá nhân Đăng tin', localEditState.caNhanDangTin)}</TableCell>
        <TableCell className="p-1 bg-amber-50/40">{renderEditInput('caNhanZalo', 'Cá nhân Zalo', localEditState.caNhanZalo)}</TableCell>
        <TableCell className="p-1 bg-amber-50/40">{renderEditInput('caNhanGoogle', 'Cá nhân Google', localEditState.caNhanGoogle)}</TableCell>
        <TableCell className="p-1 bg-amber-50/40">{renderEditInput('caNhanTiktok', 'Cá nhân Tiktok', localEditState.caNhanTiktok)}</TableCell>
        <TableCell className="p-1 bg-amber-50/40">{renderEditInput('caNhanNativeAds', 'Cá nhân Native Ads', localEditState.caNhanNativeAds)}</TableCell>
        <TableCell className="p-1 bg-amber-50/40">{renderEditInput('caNhanUCall', 'Cá nhân UCall', localEditState.caNhanUCall)}</TableCell>

        {/* Col Y: CÁ NHÂN TỔNG */}
        <TableCell className="p-1 text-right font-mono text-[11px] font-extrabold text-amber-950 bg-amber-100/60">
          {formatCurrency(editComp.cnTotal).replace(' đ', '')}
        </TableCell>

        {/* Cột: CÁ NHÂN NẠP TIỀN QUA CÔNG TY */}
        <TableCell className="p-1 bg-violet-50/40">{renderEditInput('caNhanNapTienQuaCty', 'Cá nhân nạp tiền qua CTY', localEditState.caNhanNapTienQuaCty)}</TableCell>

        {/* Col AA: SỐ LEAD */}
        <TableCell className="p-1 bg-cyan-50/40">{renderEditInput('caNhanNopTien', 'Số Lead', localEditState.caNhanNopTien)}</TableCell>

        {/* Col AB: TRẠNG THÁI */}
        <TableCell className="p-1 min-w-[100px]">
          <Select
            value={localEditState.status || 'Đã nghiệm thu'}
            onValueChange={(val) => handleUpdateEditField('status', val)}
          >
            <SelectTrigger className="h-7 text-[10px] font-bold border-yellow-200 bg-[var(--mh-surface)] rounded">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Đã nghiệm thu">Đã nghiệm thu</SelectItem>
              <SelectItem value="Chưa nghiệm thu">Chưa nghiệm thu</SelectItem>
              <SelectItem value="Đang xử lý">Đang xử lý</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>

        {/* Col AC: GHI CHÚ */}
        <TableCell className="p-1 min-w-[120px]">
          <Input
            value={localEditState.notes || ''}
            placeholder="Ghi chú..."
            onChange={(e) => handleUpdateEditField('notes', e.target.value)}
            className="h-7 text-xs font-medium border-yellow-200 rounded bg-[var(--mh-surface)]"
          />
        </TableCell>

        {/* THAO TÁC */}
        <TableCell className="p-1 text-center md:sticky md:right-0 md:z-20 bg-indigo-100 md:shadow-l">
          <div className="flex items-center justify-center gap-1">
            <Button
              size="sm"
              disabled={isSaving}
              onClick={handleSave}
              className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-[10px] rounded flex items-center gap-1 shadow-sm transition-all"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Lưu...
                </>
              ) : (
                <>
                  <Save className="w-3 h-3" /> Lưu
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isSaving}
              onClick={onCancelEdit}
              className="h-7 px-2 text-[var(--mh-text-2)] hover:bg-[var(--mh-border)] disabled:opacity-50 rounded text-[10px]"
            >
              Hủy
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  // 2. NORMAL READ-ONLY ROW
  const comp = getRowComputed(item);

  const matchedTeam = (findTeam 
    ? (findTeam(item.teamId) || findTeam(item.teamCode) || findTeam(item.teamName))
    : null) || (teams || []).find((t: any) => 
        (t.id && (t.id === item.teamId || t.id === item.teamCode || t.id === item.teamName)) ||
        (t.teamCode && (t.teamCode === item.teamCode || t.teamCode === item.teamName || t.teamCode === item.teamId)) ||
        (t.name && (t.name === item.teamName || t.name === item.teamCode || t.name === item.teamId))
      );

  const rawTeamCode = item.teamCode || '';
  const rawTeamName = item.teamName || teamMap[item.teamId] || teamMap[item.teamCode] || '';

  const displayTeamCode = matchedTeam?.teamCode || 
    (!isRawId(rawTeamCode) && rawTeamCode ? rawTeamCode : '') || 
    matchedTeam?.name || 
    (!isRawId(rawTeamName) && rawTeamName ? rawTeamName : '') || 
    '-';

  const displayTeamName = matchedTeam?.name || 
    (!isRawId(rawTeamName) && rawTeamName ? rawTeamName : '') || 
    matchedTeam?.teamCode || 
    (displayTeamCode !== '-' ? displayTeamCode : '');

  const matchedProject = resolveAcceptanceProject(item, projects);

  const rawProjectName = item.projectName || projectMap[item.projectId] || projectMap[item.projectName] || '';
  const rawProjectCode = item.projectCode || '';

  const displayProjectName = matchedProject?.name || 
    (!isRawId(rawProjectName) && rawProjectName ? rawProjectName : '') || 
    matchedProject?.projectCode || 
    '-';

  const displayProjectCode = matchedProject?.projectCode || 
    (!isRawId(rawProjectCode) && rawProjectCode ? rawProjectCode : '') || 
    '';

  const resolvedBlock = resolveBlockForTeam(matchedTeam || item, blocks, teams, findTeam);

  const stickyBg = isSelected ? 'bg-indigo-50' : index % 2 === 0 ? 'bg-[var(--mh-surface)]' : 'bg-[var(--mh-surface-2)]';

  return (
    <TableRow
      className={`hover:bg-indigo-50/25 transition-colors group ${
        isSelected ? 'bg-indigo-50' : index % 2 === 0 ? 'bg-[var(--mh-surface)]' : 'bg-[var(--mh-surface-2)]'
      }`}
    >
      {/* STT / Select — sticky only from md+ so mobile keeps scroll room */}
      <TableCell className={`text-center font-medium text-xs text-[var(--mh-text-2)] md:sticky md:left-0 md:z-10 ${stickyBg} md:shadow-[2px_0_6px_rgba(15,23,42,0.06)]`}>
        <div className="flex items-center justify-center gap-1.5">
          {canDelete && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelectRow(item.id, e.target.checked)}
              className="rounded border-[var(--mh-border-strong)] text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
            />
          )}
          <span className="font-mono text-[var(--mh-text-3)] font-semibold">{index + 1}</span>
        </div>
      </TableCell>

      {/* Col A: THÁNG — sticky on all sizes (primary pin on mobile) */}
      <TableCell className={`font-bold text-xs text-[var(--mh-text)] whitespace-nowrap sticky left-0 z-10 bg-[#E8EEF8] shadow-[inset_-1px_0_0_#C9D4E5,2px_0_6px_rgba(15,23,42,0.08)] md:left-16`}>
        <Badge variant="outline" className="bg-[var(--mh-surface-2)]/80 text-[var(--mh-text)] border-[var(--mh-border)] font-bold text-[11px] px-1.5 py-0.5">
          {formatAcceptanceMonth(item.month) || item.month || '-'}
        </Badge>
        {suppBadge(item) && (
          <div className="mt-0.5 flex flex-col items-start gap-0.5" data-testid="nt-supp-badge">
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 font-black text-[10px] px-1.5 py-0">{suppBadge(item)}</Badge>
            <span className={`text-[9px] font-bold ${suppStatus(item) === 'approved' ? 'text-emerald-700' : suppStatus(item) === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>{SUPP_STATUS_LABEL[suppStatus(item) as 'pending']}</span>
          </div>
        )}
      </TableCell>

      {/* Col: KHỐI */}
      <TableCell className="font-bold text-xs text-[var(--mh-text)] whitespace-nowrap">
        {resolvedBlock.blockName ? (
          <Badge variant="outline" className="bg-indigo-50/80 text-indigo-700 border-indigo-200 font-bold text-[11px] px-2 py-0.5 shadow-2xs">
            {resolvedBlock.blockName}
          </Badge>
        ) : (
          <span className="text-[var(--mh-text-3)] text-xs italic">-</span>
        )}
      </TableCell>

      {/* Col B: MÃ TEAM */}
      <TableCell className="font-mono font-bold text-xs text-indigo-700 whitespace-nowrap">
        <Badge variant="outline" className="bg-indigo-50/70 text-indigo-700 border-indigo-200 font-mono font-extrabold text-[11px] px-1.5 py-0.5" title={displayTeamName}>
          {displayTeamCode}
        </Badge>
      </TableCell>

      {/* Col C: GĐKD */}
      <TableCell className="font-semibold text-xs text-[var(--mh-text)] whitespace-nowrap">
        {item.gdkdName || displayTeamName || '-'}
      </TableCell>

      {/* Col D: NGƯỜI PHỤ TRÁCH — picker trên mọi dòng (Admin/Mod); chưa có Phòng → chọn Phòng trước */}
      <TableCell className="p-1 text-xs text-[var(--mh-text)] min-w-[170px] max-w-[220px]" title={item.implementerName || ''} data-testid="nt-implementer-cell">
        {canEdit && onAssignImplementer ? (
          !(matchedTeam?.id || item.teamId || item.blockId) ? (
            onAssignTeam ? (
              <AcceptanceSearchableSelect
                value=""
                items={teamItems || []}
                placeholder="① Chọn Phòng trước"
                searchPlaceholder="Tìm Phòng (không cần dấu)…"
                triggerClassName="h-7 text-[11px] font-bold border-amber-300 bg-amber-50 rounded"
                onValueChange={(tid) => onAssignTeam(item, tid)}
              />
            ) : <span className="text-amber-700 italic">Chọn Phòng trước</span>
          ) : (
            <AcceptanceSearchableSelect
              value={item.implementerUid || ''}
              items={(() => {
                const tid = matchedTeam?.id || item.teamId;
                const assignUids = acceptanceAssigneeUids({ month: item.month, teamId: tid, lines: nsLines, support: nsSupport });
                const opts = filterAssigneeOptions(implementerOptions(allUsers, tid, matchedTeam), assignUids, allUsers);
                const items: any[] = opts.map((o) => ({ value: o.uid, label: o.name + (o.role === 'gdkd' ? ' · GĐKD' : ''), searchString: o.name }));
                const kAssignees = acceptanceKhoiAssignees({ month: item.month, blockId: matchedTeam?.blockId || item.blockId, lines: nsLines, support: nsSupport });
                (kAssignees || []).forEach((k) => { if (!items.some((i) => i.value === k.uid)) items.push({ value: k.uid, label: k.name + ' · GĐ/TL Khối', searchString: k.name }); });
                if (item.implementerUid && !items.some((i) => i.value === item.implementerUid)) items.unshift({ value: item.implementerUid, label: `${item.implementerName || item.implementerUid} (ngoài Phòng)`, searchString: item.implementerName || '' });
                if (onAssignManual && ntManualAllowed(item.month)) items.unshift({ value: NT_MANUAL_VALUE, label: NT_MANUAL_LABEL, searchString: 'khac tu nhap' });
                return items;
              })()}
              placeholder={item.implementerName && !item.implementerUid ? (isManualImplementer(item) ? implementerLabel(item) : `(cũ) ${item.implementerName}`) : 'Chọn người phụ trách'}
              searchPlaceholder="Tìm tên (không cần dấu)…"
              triggerClassName="h-7 text-[11px] font-semibold border-[var(--mh-border)] bg-[var(--mh-surface)] rounded"
              onValueChange={(uid) => {
                if (uid === NT_MANUAL_VALUE) { setManualOpen('view'); return; }
                const u = allUsers.find((x: any) => (x.uid || x.id) === uid);
                onAssignImplementer(item, uid, u?.fullName || u?.displayName || u?.email || uid);
              }}
            />
          )
        ) : (
          <span className="truncate block" data-testid="nt-implementer-text">{implementerLabel(item) || '-'}</span>
        )}
        {onAssignManual && <ManualAssigneeDialog open={manualOpen === 'view'} initial={isManualImplementer(item) ? item.implementerName : ''} onClose={() => setManualOpen('')} onSave={(n) => onAssignManual(item, n)} />}
      </TableCell>

      {/* Col E: DỰ ÁN */}
      <TableCell className="font-bold text-xs text-[var(--mh-text)] min-w-[170px]" title={displayProjectName}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            {false && displayProjectCode && (
              <Badge variant="outline" className="text-[10px] font-mono px-1 py-0 bg-indigo-50/60 text-indigo-700 border-indigo-200 shrink-0 font-bold">
                {displayProjectCode}
              </Badge>
            )}
            <span className="truncate">{displayProjectName}</span>
          </div>
          {(matchedProject?.banKdName || item.banKdName) && (
            <div className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span className="truncate">{matchedProject?.banKdName || item.banKdName}</span>
            </div>
          )}
        </div>
      </TableCell>


      {/* Col TỔNG — after DỰ ÁN */}
      <TableCell className="text-right font-mono text-xs font-black text-rose-900 bg-rose-100/60">
        {formatCurrency(comp.grandTotal).replace(' đ', '')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-orange-950 bg-orange-50/30">
        {renderBreakdownTooltip(comp.hoaDonTien, item.costBreakdowns?.hoaDonTien || (Array.isArray(item.hoaDonLines) && item.hoaDonLines.length ? { items: item.hoaDonLines.map((x: any) => ({ amount: Number(x.amount) || 0, label: x.note || 'Khoản chi' })), total: comp.hoaDonTien } : null), 'Tiền trên Hóa đơn')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs font-bold text-fuchsia-950 bg-fuchsia-50/40">
        {formatCurrency(comp.hoaDonNo).replace(' đ', '')}
      </TableCell>
      {/* Group 1: DIGITAL CHẠY (Chưa VAT) */}
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-sky-50/20">
        {renderBreakdownTooltip(comp.dFb, item.costBreakdowns?.digitalFb || item.costBreakdowns?.fbDigital, 'FB Digital')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-sky-50/20">
        {renderBreakdownTooltip(comp.dZalo, item.costBreakdowns?.digitalZalo, 'Zalo Digital')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-sky-50/20">
        {renderBreakdownTooltip(comp.dTiktok, item.costBreakdowns?.digitalTiktok, 'Tiktok Digital')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-sky-50/20">
        {renderBreakdownTooltip(comp.dKhac, item.costBreakdowns?.digitalKhac, 'Khác Digital')}
      </TableCell>

      {/* Col J: TỔNG DIGITAL CHƯA VAT */}
      <TableCell className="text-right font-mono text-xs font-bold text-sky-950 bg-sky-100/40">
        {formatCurrency(comp.dTotalChuaVat).replace(' đ', '')}
      </TableCell>

      {/* Col K: DIGITAL CHẠY (SAU VAT) */}
      <TableCell className="text-right font-mono text-xs font-black text-sky-900 bg-sky-200/40">
        {formatCurrency(comp.dTotalSauVat).replace(' đ', '')}
      </TableCell>

      {/* Group 2: THẺ VISA CÔNG TY (Chưa VAT) */}
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-emerald-50/20">
        {renderBreakdownTooltip(comp.vFb, item.costBreakdowns?.visaFb || item.costBreakdowns?.fbVisa, 'FB Visa')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-emerald-50/20">
        {renderBreakdownTooltip(comp.vZalo, item.costBreakdowns?.visaZalo, 'Zalo Visa')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-emerald-50/20">
        {renderBreakdownTooltip(comp.vTiktok, item.costBreakdowns?.visaTiktok, 'Tiktok Visa')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-emerald-50/20">
        {renderBreakdownTooltip(comp.vDangTin, item.costBreakdowns?.visaDangTin, 'Đăng tin Visa')}
      </TableCell>

      {/* Col P: TỔNG VISA CHƯA VAT */}
      <TableCell className="text-right font-mono text-xs font-bold text-emerald-950 bg-emerald-100/40">
        {formatCurrency(comp.vTotalChuaVat).replace(' đ', '')}
      </TableCell>

      {/* Col Q: THẺ VISA CÔNG TY (SAU VAT) */}
      <TableCell className="text-right font-mono text-xs font-black text-indigo-900 bg-indigo-100/40">
        {formatCurrency(comp.vTotalSauVat).replace(' đ', '')}
      </TableCell>

      {/* Group 3: ĐĂNG TIN CÔNG TY */}
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-indigo-50/20">
        {renderBreakdownTooltip(comp.dtCtyChuaVat, item.costBreakdowns?.dangTinCtyChuaVat || item.costBreakdowns?.dangTinCongTy, 'Đăng tin CTY chưa VAT')}
      </TableCell>

      {/* Col S: ĐĂNG TIN CÔNG TY (SAU VAT 8%) */}
      <TableCell className="text-right font-mono text-xs font-black text-indigo-950 bg-indigo-100/50">
        {formatCurrency(comp.dtCtySauVat).replace(' đ', '')}
      </TableCell>

      {/* Group 4: CÁ NHÂN CHẠY NGOÀI */}
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-amber-50/20">
        {renderBreakdownTooltip(comp.cnFb, item.costBreakdowns?.caNhanFb || item.costBreakdowns?.caNhan, 'Cá nhân FB')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-amber-50/20">
        {renderBreakdownTooltip(comp.cnDangTin, item.costBreakdowns?.caNhanDangTin, 'Cá nhân Đăng tin')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-amber-50/20">
        {renderBreakdownTooltip(comp.cnZalo, item.costBreakdowns?.caNhanZalo || item.costBreakdowns?.zalo, 'Cá nhân Zalo')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-amber-50/20">
        {renderBreakdownTooltip(comp.cnGoogle, item.costBreakdowns?.caNhanGoogle || item.costBreakdowns?.google, 'Cá nhân Google')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-amber-50/20">
        {renderBreakdownTooltip(comp.cnTiktok, item.costBreakdowns?.caNhanTiktok || item.costBreakdowns?.tiktok, 'Cá nhân Tiktok')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-amber-50/20">
        {renderBreakdownTooltip(comp.cnNativeAds, item.costBreakdowns?.caNhanNativeAds, 'Cá nhân Native Ads')}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-[var(--mh-text-2)] bg-amber-50/20">
        {renderBreakdownTooltip(comp.cnUCall, item.costBreakdowns?.caNhanUCall, 'Cá nhân UCall')}
      </TableCell>

      {/* Col Y: CÁ NHÂN TỔNG */}
      <TableCell className="text-right font-mono text-xs font-extrabold text-amber-950 bg-amber-100/50">
        {formatCurrency(comp.cnTotal).replace(' đ', '')}
      </TableCell>

      {/* Cột: CÁ NHÂN NẠP TIỀN QUA CÔNG TY */}
      <TableCell className="text-right font-mono text-xs font-bold text-violet-950 bg-violet-50/30">
        {renderBreakdownTooltip(comp.cnNapTienCty, item.costBreakdowns?.caNhanNapTienQuaCty || item.costBreakdowns?.caNhanNapTienCty, 'Cá nhân nạp qua Cty')}
      </TableCell>

      {/* Col AA: SỐ LEAD */}
      <TableCell className="text-right font-mono text-xs font-bold text-cyan-950 bg-cyan-50/30">
        {(comp.cnNopTien || 0).toLocaleString('vi-VN')}
      </TableCell>

      {/* Col AB: TRẠNG THÁI */}
      <TableCell className="text-center bg-yellow-50/30">
        <Badge
          className={`text-[10px] font-bold border-none ${
            item.status === 'Đã nghiệm thu'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {item.status || 'Đã nghiệm thu'}
        </Badge>
      </TableCell>

      {/* Col AC: GHI CHÚ */}
      <TableCell className="text-xs text-[var(--mh-text-2)] max-w-[140px] truncate bg-yellow-50/30" title={item.notes}>
        {item.notes || '-'}
      </TableCell>

      {/* THAO TÁC */}
      <TableCell className={`text-center md:sticky md:right-0 md:z-20 ${stickyBg} group-hover:bg-[var(--mh-surface-2)] md:shadow-l`}>
        <div className="flex items-center justify-center gap-1">
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onStartEdit(item)}
              className="h-6 w-6 p-0 text-[var(--mh-text-2)] hover:text-indigo-600 hover:bg-indigo-50 rounded"
              title="Chỉnh sửa dòng"
            >
              <Edit className="w-3 h-3" />
            </Button>
          )}
          {onUploadImages && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onUploadImages(item)}
              data-testid="vn-acc-upload"
              className="h-6 px-1.5 text-[10px] font-bold text-white bg-[var(--mh-navy)] hover:bg-[var(--mh-navy-hover)] hover:text-white rounded whitespace-nowrap"
              title="Tải ảnh Nghiệm thu lên Google Drive"
            >
              ⬆ Tải ảnh
            </Button>
          )}
          {onUploadInvoices && (
            <Button size="sm" variant="ghost" onClick={() => onUploadInvoices(item)} data-testid="vn-acc-invoice"
              className="h-6 px-1.5 text-[10px] font-bold text-white bg-[#0E7C66] hover:bg-[#0B6553] hover:text-white rounded whitespace-nowrap"
              title="Tải hóa đơn (ảnh / PDF) lên Google Drive — thư mục Hóa đơn">
              🧾 Tải Hóa Đơn
            </Button>
          )}
          {onOpenAdLinks && (() => { const n = Array.isArray(item.adLinks) ? item.adLinks.length : 0; return (
            <Button size="sm" variant="ghost" onClick={() => onOpenAdLinks(item)} data-testid="vn-acc-adlinks"
              className="h-6 px-1.5 text-[10px] font-bold text-white bg-[#6D28D9] hover:bg-[#5B21B6] hover:text-white rounded whitespace-nowrap"
              title="Link quảng cáo của bản ghi">
              🔗 Link QC{n ? <span className="ml-1 rounded-full bg-[var(--mh-surface)] text-[#6D28D9] px-1.5 leading-4" data-testid="vn-acc-adlinks-count">{n}</span> : null}
            </Button>
          ); })()}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenHistory(item)}
            className="h-6 w-6 p-0 text-[var(--mh-text-2)] hover:text-[var(--mh-text)] hover:bg-[var(--mh-surface-2)] rounded"
            title="Lịch sử chỉnh sửa"
          >
            <History className="w-3 h-3" />
          </Button>
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(item.id)}
              className="h-6 w-6 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
              title="Xóa bản ghi"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});
