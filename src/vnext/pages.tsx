import React, { useEffect, useState } from 'react';
import { khoiScope } from '../../lib/vnext/khoiScope';
import { Shell, Field, Tabs, Card, Select , SearchSelect } from './ui';
import { type VCtx, isAdm, useNsLines, blockName } from './ctx';
import { PeriodPicker, defaultPeriod } from './PeriodPicker';
import { KhoiBudget, KhoiRegistration } from './budgetViews';
import { RollupView, WeeklyForm } from './weeklyViews';
import { LegacyBudgetPage } from './LegacyBudgetPage';
import { Btn } from './ui';
import { AdminNsRecords, SupportReviewPanel, SUPPORT_PERIOD_KEY } from './SupportViews';

/** Quản lý Báo cáo (Admin / Mod / Kế toán). */
export function ReportMgmtPage({ c }: { c: VCtx }) {
  const [period, setPeriod] = useState(defaultPeriod(c.settings));
  const { lines } = useNsLines(c, [period], 'all');
  return (
    <Shell title="Quản lý Báo cáo" sub="Báo cáo tuần toàn hệ thống: Khối → Phòng → User, tình trạng Đã nộp / Chưa nộp, xuất Excel.">
      <div className="flex flex-wrap gap-2 items-end"><Field label="Tháng (kỳ)"><PeriodPicker value={period} onChange={setPeriod} settings={c.settings} db={c.db} /></Field></div>
      <RollupView c={c} period={period} lines={lines} scope={{}} title="Báo cáo tuần theo Khối → Phòng → User" />
    </Shell>
  );
}

/** Ngân sách MKT toàn hệ thống (Admin) — thay màn "Ngân sách Khối" cũ. */
export function AdminBudgetPage({ c }: { c: VCtx }) {
  const [period, setPeriod] = useState(defaultPeriod(c.settings));
  const { lines } = useNsLines(c, [period], 'all');
  const blockIds = c.blocks.map((b) => b.id);
  const [tab, setTab] = useState<'overview' | 'records'>('records');
  return (
    <Shell title="Ngân sách MKT" sub="NS Khối = Σ NS Phòng · NS Phòng = Σ NS user. Hỗ trợ MKT: GĐ Khối / Trợ lý Khối duyệt từng bản đăng ký.">
      <Tabs tabs={[{ id: 'records', label: 'Bản ghi đăng ký & trạng thái duyệt' }, { id: 'overview', label: 'Tổng quan Khối / Phòng' }]} value={tab} onChange={(v) => setTab(v as any)} />
      {tab === 'records' ? <AdminNsRecords c={c} /> : <>
        <div className="flex flex-wrap gap-2 items-end"><Field label="Kỳ"><PeriodPicker value={period} onChange={setPeriod} settings={c.settings} db={c.db} /></Field></div>
        <KhoiBudget c={c} blockIds={blockIds} period={period} lines={lines} defaultAll />
      </>}
    </Shell>
  );
}

/** Tab trong Quản lý Khối: Ngân sách MKT của Khối + Báo cáo Khối.
 *  Khối hiển thị = Khối đang chọn ở đầu trang (activeBlockId) nếu nằm trong phạm vi; GĐK/Trợ lý chỉ Khối mình phụ trách. */
export function KhoiVNext({ c, mode, activeBlockId }: { c: VCtx; mode: 'budget' | 'report' | 'register' | 'myweekly' | 'support'; activeBlockId?: string }) {
  const [period, setPeriod] = useState(() => { if (mode === 'support') { try { const p = sessionStorage.getItem(SUPPORT_PERIOD_KEY); if (p) { setTimeout(() => { try { sessionStorage.removeItem(SUPPORT_PERIOD_KEY); } catch { /* */ } }, 3000); return p; } } catch { /* */ } } return defaultPeriod(c.settings); });
  const { lines } = useNsLines(c, [period], 'all');
  const [pick, setPick] = useState(activeBlockId || '');
  const [legacy, setLegacy] = useState(false);
  useEffect(() => { if (activeBlockId) setPick(activeBlockId); }, [activeBlockId]);
  const sc = khoiScope(c.role, c.myBlockIds, c.blocks.map((b) => b.id), pick);
  const blockIds = sc.selected ? [sc.selected] : [];
  return (
    <div className="space-y-3 font-['Be_Vietnam_Pro',sans-serif]">
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Kỳ"><PeriodPicker value={period} onChange={setPeriod} settings={c.settings} db={c.db} /></Field>
        {sc.canSwitch ? <Field label="Khối"><SearchSelect value={sc.selected} onChange={setPick} options={sc.allowed.map((b) => ({ value: b, label: blockName(c, b) }))} data-testid="vn-khoi-select" /></Field>
          : sc.selected ? <Field label="Khối"><div className="h-9 px-3 flex items-center rounded-lg bg-[var(--mh-bg)] text-[13px] font-semibold" data-testid="vn-khoi-locked">{blockName(c, sc.selected)}</div></Field> : null}
        {mode === 'budget' && <Btn small onClick={() => setLegacy((v) => !v)} data-testid="vn-legacy-toggle">{legacy ? 'Về NS kỳ mới' : 'Xem NS kỳ cũ (≤ T10)'}</Btn>}
      </div>
      {mode === 'budget' && legacy ? <LegacyBudgetPage c={c} /> : <>
      {!blockIds.length ? <Card className="p-5 text-[13px]">Bạn chưa được gán Khối.</Card>
        : mode === 'support' ? <React.Fragment key={'s' + sc.selected}><SupportReviewPanel c={c} blockId={sc.selected} period={period} lines={lines} /></React.Fragment>
        : mode === 'register' ? <React.Fragment key={'g' + sc.selected}><KhoiRegistration c={c} period={period} lines={lines} blockIds={blockIds} /></React.Fragment>
        : mode === 'myweekly' ? <React.Fragment key={'w' + sc.selected}>{(c.role === 'gd_khoi' || c.role === 'tro_ly_khoi') ? <WeeklyForm c={c} period={period} lines={lines} blockId={sc.selected} /> : <Card className="p-5 text-[13px]">Mục «Báo cáo tuần» dành cho Giám đốc Khối / Trợ lý Khối đã Đăng ký MKT.</Card>}</React.Fragment>
        : mode === 'budget' ? <React.Fragment key={sc.selected}><KhoiBudget c={c} blockIds={blockIds} period={period} lines={lines} /></React.Fragment>
        : <React.Fragment key={"r" + sc.selected}><RollupView c={c} period={period} lines={lines} scope={{ blockIds }} title={`Báo cáo Khối · ${blockName(c, sc.selected)} · Phòng → User`} levels={['team', 'user']} /></React.Fragment>}
      </>}
    </div>
  );
}

/** Tab trong Quản lý Ban KD: Báo cáo Ban (dự án thuộc Ban). */
export function BanReport({ c, banKdIds }: { c: VCtx; banKdIds: string[] }) {
  const [period, setPeriod] = useState(defaultPeriod(c.settings));
  const { lines } = useNsLines(c, [period], 'all');
  const projectIds = c.projects.filter((p) => banKdIds.includes(p.banKdId)).map((p) => p.id);
  return (
    <div className="space-y-3 font-['Be_Vietnam_Pro',sans-serif]">
      <div className="flex flex-wrap gap-2 items-end"><Field label="Kỳ"><PeriodPicker value={period} onChange={setPeriod} settings={c.settings} db={c.db} /></Field></div>
      {!projectIds.length ? <Card className="p-5 text-[13px]">Ban chưa có dự án.</Card>
        : <RollupView c={c} period={period} lines={lines} scope={{ projectIds }} title="Báo cáo Ban KD · theo Khối → Phòng → User (chỉ dự án của Ban)" />}
    </div>
  );
}
