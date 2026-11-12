import React, { useState, useEffect, useMemo } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calculator, Save, Trash2, Loader2 } from 'lucide-react';
import { getRowComputed, handleCostInputChange, resolveBlockForTeam, formatAcceptanceMonth, resolveAcceptanceProject } from './acceptanceUtils';
import { implementerOptions } from '../../../lib/vnext/onboarding';
import { AcceptanceSearchableSelect, SearchableItem } from './AcceptanceSearchableSelect';
import { ManualAssigneeDialog } from './ManualAssigneeDialog';
import { suppMonths } from '../../../lib/vnext/ntSupplement';
import { normalizeMonth } from '../../../lib/vnext/ntReport';
import { NT_MANUAL_LABEL, NT_MANUAL_VALUE, ntManualAllowed, isManualImplementer, implementerLabel } from '../../../lib/vnext/ntManual';
import { acceptanceAssigneeUids, acceptanceChoicesFor, acceptanceKhoiAssignees, clearStaleProject, filterAssigneeOptions, ntUsesBudgetProjects, type NtBudgetLine } from '../../../lib/vnext/ntBudgetProjects';
import type { Support } from '../../../lib/vnext/support';

interface DraftRowProps {
  draftRow: any;
  index: number;
  teams: any[];
  allUsers?: any[];
  projects: any[];
  blocks: any[];
  monthsList: string[];
  teamItems?: SearchableItem[];
  projectItems?: SearchableItem[];
  findTeam?: (idOrCodeOrName: string) => any;
  findProject?: (idOrCodeOrName: string) => any;
  formatCurrency: (amount: number) => string;
  onSaveDraft: (draftRow: any) => Promise<void> | void;
  onRemoveDraft: (id: string) => void;
  onOpenCalculator: (fieldKey: string, fieldVNName: string, currentVal: string, onUpdate: (val: string) => void) => void;
  /** Cho phép «Khác – tự nhập» (Tháng 10/2026, có quyền). */
  canManualAssignee?: boolean;
  /** Kỳ NT của tháng đang chọn đang MỞ → hiện ô «Bổ sung cho T{M-1}». */
  suppAllowed?: boolean;
  nsLines?: NtBudgetLine[];
  nsSupport?: Record<string, Partial<Support> | undefined>;
}

export const AcceptanceDraftRow: React.FC<DraftRowProps> = React.memo(({
  draftRow,
  index,
  teams,
  allUsers = [],
  projects,
  blocks,
  monthsList,
  suppAllowed = false,
  teamItems: propTeamItems,
  projectItems: propProjectItems,
  findTeam,
  findProject,
  formatCurrency,
  onSaveDraft,
  onRemoveDraft,
  onOpenCalculator,
  canManualAssignee = false,
  nsLines = [],
  nsSupport,
}) => {
  const [manualOpen, setManualOpen] = useState(false);
  // Local state keeps typing 100% fluid without triggering parent table re-renders
  const [localDraft, setLocalDraft] = useState<any>(draftRow);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    setLocalDraft(draftRow);
  }, [draftRow.id]);

  useEffect(() => {
    setLocalDraft((prev: any) => {
      const next = clearStaleProject(prev, acceptanceChoicesFor(prev, nsLines, nsSupport, allUsers));
      return next.projectId === prev.projectId && next.projectName === prev.projectName ? prev : next;
    });
  }, [nsLines, nsSupport, allUsers]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSaveDraft(localDraft);
    } finally {
      setIsSaving(false);
    }
  };

  const comp = useMemo(() => getRowComputed(localDraft), [localDraft]);

  const selectedTeam = useMemo(() => {
    return (findTeam
      ? (findTeam(localDraft.teamId) || findTeam(localDraft.teamCode) || findTeam(localDraft.teamName))
      : null) || (teams || []).find((t: any) => 
          t.id === localDraft.teamId || 
          (localDraft.teamCode && t.teamCode === localDraft.teamCode) || 
          (localDraft.teamName && t.name === localDraft.teamName) ||
          t.id === localDraft.teamCode
        );
  }, [findTeam, localDraft.teamId, localDraft.teamCode, localDraft.teamName, teams]);

  const currentDraftTeamId = selectedTeam?.id || localDraft.teamId || '';

  const selectedProj = useMemo(() => {
    return resolveAcceptanceProject(localDraft, projects);
  }, [localDraft, projects]);

  const currentDraftProjId = selectedProj?.id || localDraft.projectId || '';

  const draftResolvedBlock = useMemo(() => {
    return resolveBlockForTeam(selectedTeam || localDraft, blocks, teams, findTeam);
  }, [selectedTeam, localDraft, blocks, teams, findTeam]);

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

  const budgetChoices = useMemo(() => acceptanceChoicesFor(localDraft, nsLines, nsSupport, allUsers), [localDraft.month, localDraft.teamId, localDraft.implementerUid, localDraft.implementerManual, nsLines, nsSupport, allUsers]);

  // Kỳ ≥ 2026-11: Người phụ trách chỉ còn user đã đăng ký NS cho Phòng + kỳ này.
  const assigneeUids = useMemo(() => acceptanceAssigneeUids({ month: localDraft.month, teamId: localDraft.teamId, lines: nsLines, support: nsSupport }), [localDraft.month, localDraft.teamId, nsLines, nsSupport]);

  // Ưu tiên blockId đã lưu (giá trị khớp dòng NS khoi) hơn giá trị resolveBlockForTeam chuẩn hoá,
  // để danh sách GĐ/TL Khối (khớp theo blockId) không lệch sau khi chọn.
  const currentDraftBlockId = localDraft.blockId || draftResolvedBlock.blockId || '';
  // GĐ Khối / Trợ lý Khối (đăng ký 'khoi' theo Khối, không thuộc Phòng) — bổ sung vào dropdown Người phụ trách.
  const khoiAssignees = useMemo(() => acceptanceKhoiAssignees({ month: localDraft.month, blockId: currentDraftBlockId, lines: nsLines, support: nsSupport }), [localDraft.month, currentDraftBlockId, nsLines, nsSupport]);
  const khoiUidSet = useMemo(() => new Set((khoiAssignees || []).map((k) => k.uid)), [khoiAssignees]);

  const projectItems = useMemo(() => {
    const catalog = (list: any[]) => list.map((p: any) => {
      const code = p.projectCode || '';
      const name = p.name || p.projectName || p.id;
      const label = code ? `[${code}] ${name}` : name;
      return {
        value: p.id || p.projectId,
        label,
        code,
        subLabel: p.region ? `Khu vực: ${p.region}` : '',
        searchString: `${code} ${name} ${p.id || p.projectId}`.toLowerCase(),
        rawItem: p.rawItem || p,
      };
    });
    if (budgetChoices) {
      return budgetChoices.map((c) => {
        const p = (projects || []).find((pr: any) => pr.id === c.projectId);
        return catalog([{ ...(p || {}), id: c.projectId, name: p?.name || c.projectName || c.projectId, rawItem: p }])[0];
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

  const handleUpdateLocalField = (fieldKey: string, val: any) => {
    setLocalDraft((prev: any) => ({
      ...prev,
      [fieldKey]: val
    }));
  };

  const handleUpdateLocalFields = (fieldsObj: Record<string, any>) => {
    setLocalDraft((prev: any) => ({
      ...prev,
      ...fieldsObj
    }));
  };

  const renderCalcInput = (
    fieldKey: string,
    fieldLabel: string,
    value: string,
    placeholder: string = '0',
    className: string = ''
  ) => {
    return (
      <div className="relative group flex items-center min-w-[80px]">
        <Input
          value={value || ''}
          placeholder={placeholder}
          onChange={(e) => handleCostInputChange(e.target.value, (val) => handleUpdateLocalField(fieldKey, val))}
          className={`h-7 text-right font-mono text-[11px] font-bold pr-5 border-[var(--mh-border)] focus:border-indigo-500 rounded bg-[var(--mh-surface)] ${className}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onOpenCalculator(fieldKey, fieldLabel, value || '', (val) => handleUpdateLocalField(fieldKey, val))}
          className="absolute right-1 text-[var(--mh-text-3)] hover:text-indigo-600 opacity-60 group-hover:opacity-100 transition-opacity"
          title={`Mở máy tính cộng dồn (${fieldLabel})`}
        >
          <Calculator className="w-3 h-3" />
        </button>
      </div>
    );
  };

  return (
    <TableRow className="bg-amber-50/50 hover:bg-amber-50/80 border-b-2 border-amber-300 transition-colors">
      {/* STT */}
      <TableCell className="text-center font-bold text-xs text-amber-700 bg-amber-100 md:sticky md:left-0 md:z-10">
        <div className="flex items-center justify-center gap-1">
          <span className="text-[10px] font-mono font-black">+{index + 1}</span>
        </div>
      </TableCell>

      {/* Col A: THÁNG */}
      <TableCell className="p-1 min-w-[110px] sticky left-0 z-10 bg-amber-50 shadow-[2px_0_6px_rgba(15,23,42,0.08)] md:left-16">
        <Select
          value={formatAcceptanceMonth(localDraft.month) || (monthsList && monthsList.length > 0 ? monthsList[0] : '')}
          onValueChange={(val) => setLocalDraft((prev: any) => clearStaleProject({ ...prev, month: val }, acceptanceChoicesFor({ ...prev, month: val }, nsLines, nsSupport, allUsers)))}
        >
          <SelectTrigger className="h-7 text-[11px] font-bold border-[var(--mh-border)] bg-[var(--mh-surface)] rounded">
            <SelectValue placeholder="Chọn kỳ / tháng" />
          </SelectTrigger>
          <SelectContent className="max-h-56">
            {localDraft.month && !monthsList.includes(localDraft.month) && (
              <SelectItem key={localDraft.month} value={localDraft.month}>{localDraft.month}</SelectItem>
            )}
            {monthsList.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(() => {
          const opts = suppMonths(normalizeMonth(localDraft.month));
          if (!opts.length || !suppAllowed) return null;
          const cur = localDraft.supplement === true ? opts[0] : (typeof localDraft.supplement === 'string' ? localDraft.supplement : '');
          return (
            <label className="mt-1 flex items-center gap-1 text-[10px] font-bold text-orange-700 whitespace-nowrap" title="Nghiệm thu bổ sung cho kỳ đã qua — lưu ở mục «Nghiệm thu bổ sung» của kỳ này, Super Admin duyệt thì được ghi vào kỳ gốc">
              Bổ sung cho
              <select data-testid="nt-supp-toggle" className="h-5 text-[10px] border border-orange-300 rounded bg-[var(--mh-surface)]" value={cur} onChange={(e) => handleUpdateLocalField('supplement', e.target.value || false)}>
                <option value="">— (bản thường)</option>
                {opts.map((m) => <option key={m} value={m}>Kỳ T{+m.split('-')[1]}/{m.split('-')[0]}</option>)}
              </select>
            </label>
          );
        })()}
      </TableCell>

      {/* Col: KHỐI */}
      <TableCell className="p-1 min-w-[110px] text-center">
        {draftResolvedBlock.blockName ? (
          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold text-[11px] px-2 py-1 inline-flex items-center gap-1 justify-center whitespace-nowrap">
            {draftResolvedBlock.blockName}
          </Badge>
        ) : (
          <span className="text-[var(--mh-text-3)] text-[11px] italic px-1 block text-center">Tự động</span>
        )}
      </TableCell>

      {/* Col B: MÃ TEAM */}
      <TableCell className="p-1 min-w-[150px]">
        <AcceptanceSearchableSelect
          value={currentDraftTeamId || ''}
          items={teamItems}
          placeholder="Chọn Team"
          searchPlaceholder="Tìm kiếm Team, mã Team..."
          triggerDisplay={
            selectedTeam ? (
              <span className="truncate text-[var(--mh-text)] font-bold">
                {selectedTeam.teamCode ? `${selectedTeam.teamCode} - ${selectedTeam.name}` : selectedTeam.name}
              </span>
            ) : undefined
          }
          onValueChange={(teamId, rawTm) => {
            const tm = rawTm || (teams || []).find((t: any) => t.id === teamId) || (findTeam ? findTeam(teamId) : null);
            if (tm) {
              const tmName = tm.name || '';
              const code = tm.teamCode || tm.name || '';
              let gdkd = tmName;
              if (code && tmName.startsWith(code)) {
                gdkd = tmName.substring(code.length).trim();
              }
              const resolvedBlk = resolveBlockForTeam(tm, blocks, teams, findTeam);
              handleUpdateLocalFields(clearStaleProject({
                teamId: tm.id,
                teamCode: tm.teamCode || tm.name || '',
                teamName: tm.name || tm.teamCode || '',
                blockId: resolvedBlk.blockId || tm.blockId || '',
                blockCode: resolvedBlk.blockCode || tm.blockCode || '',
                blockName: resolvedBlk.blockName || tm.blockName || '',
                gdkdName: gdkd,
                implementerUid: '',
                implementerName: '',
                implementerManual: false,
                projectId: '',
                projectName: '',
                projectCode: '',
              }, []));
            } else {
              handleUpdateLocalField('teamId', teamId);
            }
          }}
        />
      </TableCell>

      {/* Col D: NGƯỜI PHỤ TRÁCH */}
      <TableCell className="p-1 min-w-[160px] overflow-visible">
        {!currentDraftTeamId && !currentDraftBlockId ? (
          <span className="text-[11px] text-amber-700 italic px-1">Chọn Phòng trước</span>
        ) : (
          <AcceptanceSearchableSelect
            value={localDraft.implementerUid || ''}
            items={[
              ...(canManualAssignee && ntManualAllowed(localDraft.month) ? [{ value: NT_MANUAL_VALUE, label: NT_MANUAL_LABEL, searchString: 'khac tu nhap' }] : []),
              ...filterAssigneeOptions(
                implementerOptions(allUsers, currentDraftTeamId, (teams||[]).find((t:any)=>t.id===currentDraftTeamId)),
                assigneeUids,
                allUsers,
              ).map((o)=>({ value:o.uid, label:o.name+(o.role==='gdkd'?' · GĐKD':''), searchString:o.name })),
              ...(khoiAssignees || []).map((k)=>({ value:k.uid, label:k.name+' · GĐ/TL Khối', searchString:k.name })),
            ]}
            placeholder={isManualImplementer(localDraft) ? implementerLabel(localDraft) : ((assigneeUids && assigneeUids.size === 0 && !(khoiAssignees && khoiAssignees.length)) ? 'Chưa có đăng ký NS kỳ này' : 'Chọn người phụ trách')}
            searchPlaceholder="Tìm tên (không cần dấu)…"
            triggerClassName="h-7 text-[11px] font-semibold border-[var(--mh-border)] bg-[var(--mh-surface)] rounded"
            onValueChange={(uid)=>{
              if (uid === NT_MANUAL_VALUE) { setManualOpen(true); return; }
              const isKhoi = khoiUidSet.has(uid);
              const k = (khoiAssignees || []).find((x)=>x.uid===uid);
              const u=allUsers.find((x:any)=>(x.uid||x.id)===uid);
              // GĐ/TL Khối không thuộc Phòng: xoá teamId, ghim blockId theo đúng Khối của dòng NS khoi
              // (không để blockId của Phòng điều hướng/heuristic ghi sai Khối khi lưu).
              const teamPatch = isKhoi ? { teamId: '', teamCode: '', teamName: '', ...(k?.blockId ? { blockId: k.blockId, blockCode: '', blockName: '' } : {}) } : {};
              const name = isKhoi ? (k?.name || uid) : (u?.fullName||u?.displayName||u?.email||uid);
              setLocalDraft((prev: any) => clearStaleProject({ ...prev, ...teamPatch, implementerUid: uid, implementerName: name, implementerManual: false }, acceptanceChoicesFor({ ...prev, ...teamPatch, implementerUid: uid, implementerManual: false }, nsLines, nsSupport, allUsers)));
            }}
          />
        )}
        <ManualAssigneeDialog open={manualOpen} initial={isManualImplementer(localDraft) ? localDraft.implementerName : ''} onClose={() => setManualOpen(false)}
          onSave={(n) => { setLocalDraft((prev: any) => clearStaleProject({ ...prev, implementerUid: '', implementerName: n, implementerManual: true }, acceptanceChoicesFor({ ...prev, implementerUid: '', implementerManual: true }, nsLines, nsSupport, allUsers))); }} />
      </TableCell>

      {/* Col E: DỰ ÁN */}
      <TableCell className="p-1 min-w-[190px]">
        <AcceptanceSearchableSelect
          /* Kỳ ≥ 2026-11: khi đổi Phòng/người/kỳ, danh sách dự án đổi theo đăng ký NS của người mới.
             Remount select theo (team|người|kỳ) để Base UI không giữ lựa chọn/trạng thái cũ (bug: đổi người xong ô dự án không cập nhật, không thao tác được). */
          key={budgetChoices ? `proj-${currentDraftTeamId}-${localDraft.implementerUid || 'none'}-${normalizeMonth(localDraft.month)}` : 'proj-all'}
          testId="nt-project-select"
          value={budgetChoices && !budgetChoices.some((c) => c.projectId === currentDraftProjId) ? '' : (currentDraftProjId || '')}
          items={projectItems}
          disabled={!!budgetChoices && (!localDraft.implementerUid || projectItems.length === 0)}
          placeholder={!currentDraftTeamId && !currentDraftBlockId ? 'Chọn Phòng trước' : !localDraft.implementerUid ? 'Chọn người phụ trách trước' : budgetChoices && projectItems.length === 0 ? 'Chưa có đăng ký NS kỳ này' : 'Chọn Dự án'}
          searchPlaceholder="Tìm kiếm dự án, mã dự án..."
          triggerDisplay={
            selectedProj ? (
              <span className="truncate text-[var(--mh-text)] font-bold">
                {selectedProj.name}
              </span>
            ) : undefined
          }
          onValueChange={(projectId, rawP) => {
            const p = rawP || (projects || []).find((pr: any) => pr.id === projectId) || (findProject ? findProject(projectId) : null);
            if (p) {
              handleUpdateLocalFields({
                projectId: p.id,
                projectName: p.name || '',
                projectCode: p.projectCode || ''
              });
            } else {
              handleUpdateLocalField('projectId', projectId);
            }
          }}
        />
      </TableCell>

      {/* Col TỔNG — after DỰ ÁN */}
      <TableCell className="p-1 text-right font-mono text-xs font-black text-rose-900 bg-rose-100/70">
        {formatCurrency(comp.grandTotal).replace(' đ', '')}
      </TableCell>
      <TableCell className="p-1 bg-orange-50/30">
        {renderCalcInput('hoaDonTien', 'Tiền trên Hóa đơn', localDraft.hoaDonTien)}
      </TableCell>
      <TableCell className="p-1 text-right font-mono text-[11px] font-bold text-fuchsia-950 bg-fuchsia-50/40">
        {formatCurrency(comp.hoaDonNo).replace(' đ', '')}
      </TableCell>

      {/* Group 1: DIGITAL CHẠY (Chưa VAT) */}
      <TableCell className="p-1 bg-sky-50/30">
        {renderCalcInput('digitalFb', 'Digital FB', localDraft.digitalFb)}
      </TableCell>
      <TableCell className="p-1 bg-sky-50/30">
        {renderCalcInput('digitalZalo', 'Digital Zalo', localDraft.digitalZalo)}
      </TableCell>
      <TableCell className="p-1 bg-sky-50/30">
        {renderCalcInput('digitalTiktok', 'Digital Tiktok', localDraft.digitalTiktok)}
      </TableCell>
      <TableCell className="p-1 bg-sky-50/30">
        {renderCalcInput('digitalKhac', 'Digital Khác', localDraft.digitalKhac)}
      </TableCell>

      {/* Col J: TỔNG DIGITAL CHƯA VAT */}
      <TableCell className="p-1 text-right font-mono text-[11px] font-bold text-sky-950 bg-sky-100/50">
        {formatCurrency(comp.dTotalChuaVat).replace(' đ', '')}
      </TableCell>

      {/* Col K: DIGITAL CHẠY (SAU VAT) */}
      <TableCell className="p-1 text-right font-mono text-[11px] font-black text-sky-900 bg-sky-200/50">
        {formatCurrency(comp.dTotalSauVat).replace(' đ', '')}
      </TableCell>

      {/* Group 2: THẺ VISA CÔNG TY (Chưa VAT) */}
      <TableCell className="p-1 bg-emerald-50/30">
        {renderCalcInput('visaFb', 'Visa FB', localDraft.visaFb)}
      </TableCell>
      <TableCell className="p-1 bg-emerald-50/30">
        {renderCalcInput('visaZalo', 'Visa Zalo', localDraft.visaZalo)}
      </TableCell>
      <TableCell className="p-1 bg-emerald-50/30">
        {renderCalcInput('visaTiktok', 'Visa Tiktok', localDraft.visaTiktok)}
      </TableCell>
      <TableCell className="p-1 bg-emerald-50/30">
        {renderCalcInput('visaDangTin', 'Visa Đăng Tin', localDraft.visaDangTin)}
      </TableCell>

      {/* Col P: TỔNG VISA CHƯA VAT */}
      <TableCell className="p-1 text-right font-mono text-[11px] font-bold text-emerald-950 bg-emerald-100/50">
        {formatCurrency(comp.vTotalChuaVat).replace(' đ', '')}
      </TableCell>

      {/* Col Q: THẺ VISA CÔNG TY (SAU VAT) */}
      <TableCell className="p-1 text-right font-mono text-[11px] font-black text-indigo-900 bg-indigo-100/50">
        {formatCurrency(comp.vTotalSauVat).replace(' đ', '')}
      </TableCell>

      {/* Group 3: ĐĂNG TIN CÔNG TY */}
      <TableCell className="p-1 bg-indigo-50/30">
        {renderCalcInput('dangTinCtyChuaVat', 'Đăng tin CTY chưa VAT', localDraft.dangTinCtyChuaVat)}
      </TableCell>

      {/* Col S: ĐĂNG TIN CÔNG TY (SAU VAT 8%) */}
      <TableCell className="p-1 text-right font-mono text-[11px] font-black text-indigo-950 bg-indigo-100/60">
        {formatCurrency(comp.dtCtySauVat).replace(' đ', '')}
      </TableCell>

      {/* Group 4: CÁ NHÂN CHẠY NGOÀI */}
      <TableCell className="p-1 bg-amber-50/30">
        {renderCalcInput('caNhanFb', 'Cá nhân FB', localDraft.caNhanFb)}
      </TableCell>
      <TableCell className="p-1 bg-amber-50/30">
        {renderCalcInput('caNhanDangTin', 'Cá nhân Đăng tin', localDraft.caNhanDangTin)}
      </TableCell>
      <TableCell className="p-1 bg-amber-50/30">
        {renderCalcInput('caNhanZalo', 'Cá nhân Zalo', localDraft.caNhanZalo)}
      </TableCell>
      <TableCell className="p-1 bg-amber-50/30">
        {renderCalcInput('caNhanGoogle', 'Cá nhân Google', localDraft.caNhanGoogle)}
      </TableCell>
      <TableCell className="p-1 bg-amber-50/30">
        {renderCalcInput('caNhanTiktok', 'Cá nhân Tiktok', localDraft.caNhanTiktok)}
      </TableCell>
      <TableCell className="p-1 bg-amber-50/30">
        {renderCalcInput('caNhanNativeAds', 'Cá nhân Native Ads', localDraft.caNhanNativeAds)}
      </TableCell>
      <TableCell className="p-1 bg-amber-50/30">
        {renderCalcInput('caNhanUCall', 'Cá nhân UCall', localDraft.caNhanUCall)}
      </TableCell>

      {/* Col Y: CÁ NHÂN TỔNG */}
      <TableCell className="p-1 text-right font-mono text-[11px] font-extrabold text-amber-950 bg-amber-100/60">
        {formatCurrency(comp.cnTotal).replace(' đ', '')}
      </TableCell>

      {/* Cột: CÁ NHÂN NẠP TIỀN QUA CÔNG TY */}
      <TableCell className="p-1 bg-violet-50/30">
        {renderCalcInput('caNhanNapTienQuaCty', 'Cá nhân nạp tiền qua CTY', localDraft.caNhanNapTienQuaCty)}
      </TableCell>

      {/* Col AA: SỐ LEAD */}
      <TableCell className="p-1 bg-cyan-50/40">
        {renderCalcInput('caNhanNopTien', 'Số Lead', localDraft.caNhanNopTien)}
      </TableCell>

      {/* Col AB: TRẠNG THÁI */}
      <TableCell className="p-1 bg-yellow-50/40 min-w-[100px]">
        <Select
          value={localDraft.status || 'Đã nghiệm thu'}
          onValueChange={(val) => handleUpdateLocalField('status', val)}
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
      <TableCell className="p-1 bg-yellow-50/40 min-w-[120px]">
        <Input
          value={localDraft.notes || ''}
          placeholder="Ghi chú..."
          onChange={(e) => handleUpdateLocalField('notes', e.target.value)}
          className="h-7 text-xs font-medium border-yellow-200 rounded bg-[var(--mh-surface)]"
        />
      </TableCell>

      {/* THAO TÁC */}
      <TableCell className="p-1 text-center md:sticky md:right-0 md:z-20 bg-amber-50 md:shadow-l">
        <div className="flex items-center justify-center gap-1">
          <Button
            size="sm"
            disabled={isSaving}
            onClick={handleSave}
            className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-[10px] rounded flex items-center gap-1 shadow-sm transition-all"
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
            onClick={() => onRemoveDraft(draftRow.id)}
            className="h-7 px-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50 rounded text-[10px]"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});
