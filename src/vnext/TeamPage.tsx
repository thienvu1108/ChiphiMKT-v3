import { isSupplement, suppStatus, suppViewLabel, ntCountsInTotals } from '../../lib/vnext/ntSupplement';
import React, { useMemo, useState } from 'react';
import { implementerLabel } from '../../lib/vnext/ntManual';
import { doc, updateDoc } from 'firebase/firestore';
import { Shell, Card, Btn, Badge, Th, Td, Field, Select, Tabs, Empty, Modal, useToast , SearchSelect } from './ui';
import { type VCtx, isAdm, canViewAll, gdkdTeams, teamName, blockName, userName, uidOf, blockOfTeam, useNsLines, projectName} from './ctx';
import { RenameUserButton } from './RenameUser';
import { asArr } from './ctx';
import { visibleTeams, canRegisterAsUser, canRegisterUserNs, isTeamActive } from '../../lib/vnext/budget';
import { SectionTabs } from './SectionTabs';
import { KycCells, useKycMap } from './KycViews';
import { canSeeOthersKyc } from '../../lib/vnext/kyc';
import { Wallet, PiggyBank, FileText, BarChart3, Users, UserCheck, FileCheck } from 'lucide-react';
import { PeriodPicker, defaultPeriod } from './PeriodPicker';
import { MyRegistration, TeamBudget } from './budgetViews';
import { WeeklyForm, RollupView } from './weeklyViews';
import { vnTime } from './ui';
import { vnCan } from './ctx';
import { ApprovalsPanel, usePendingRequests, actionablePending } from './onboardingViews';
import { isKhoiMgr } from './ctx';
import { normalizeMonth, recordCostBeforeVat } from '../../lib/vnext/ntReport';
import { periodLabel } from '../../lib/vnext/period';
import { fmt } from './ui';

/** Quản lý Phòng KD (Team): Thành viên · Đăng ký NS · Ngân sách Phòng · Báo cáo tuần · Báo cáo Phòng */
export default function TeamPage({ c }: { c: VCtx }) {
  const myGdkd = gdkdTeams(c);
  const all = canViewAll(c);
  const teamChoices = useMemo(() => {
    const vis = visibleTeams(c.teams, c.role);
    if (all) return vis;
    const ids = new Set([...myGdkd, c.teamId].filter(Boolean));
    return vis.filter((t) => ids.has(t.id));
  }, [c.teams, c.role, all, myGdkd.join(','), c.teamId]);
  const [teamId, setTeamId] = useState<string>(c.teamId && teamChoices.some((t) => t.id === c.teamId) ? c.teamId : teamChoices[0]?.id || '');
  const tid = teamChoices.some((t) => t.id === teamId) ? teamId : teamChoices[0]?.id || '';
  const [period, setPeriod] = useState(defaultPeriod(c.settings));
  const isGdkdHere = myGdkd.includes(tid);
  const canManage = all || isGdkdHere;
  const isRegistrant = canRegisterUserNs(c.role, myGdkd) && !!tid && (tid === c.teamId || (!c.teamId && myGdkd.includes(tid)));
  // Mặc định tính lại khi dữ liệu Phòng/vai trò tải xong (NVKD đã duyệt → Đăng ký Ngân sách MKT)
  const [tab, setTab] = useState<string>(() => { try { const t = sessionStorage.getItem('vn-team-tab') || ''; sessionStorage.removeItem('vn-team-tab'); return t; } catch { return ''; } });
  const defTab = isRegistrant && !isGdkdHere ? 'register' : canManage ? 'budget' : 'members';
  const { lines } = useNsLines(c, [period], all || isGdkdHere || c.role === 'gd_khoi' || c.role === 'tro_ly_khoi' ? 'all' : 'mine');
  // Chờ duyệt: Admin, GĐK/Trợ lý (Phòng trong Khối mình), GĐKD (Phòng mình).
  const reviewOf = (teamId: string) => vnCan(c, 'vn.approvals.review') && !!teamId
    && (isAdm(c) || myGdkd.includes(teamId) || (isKhoiMgr(c) && c.myBlockIds.includes(blockOfTeam(c, teamId) || '')));
  const canReview = reviewOf(tid);
  const canReviewAny = isAdm(c) || myGdkd.length > 0 || isKhoiMgr(c);
  const pendingAll = usePendingRequests(c, canReviewAny && vnCan(c, 'vn.approvals.review'));
  const pendingByTeam = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of actionablePending(c, pendingAll)) if (r.teamId) m[r.teamId] = (m[r.teamId] || 0) + 1;
    return m;
  }, [pendingAll, c.teams, c.users]);
  const pendingHere = pendingAll.filter((r) => r.teamId === tid);

  const tabsRaw = [
    { id: 'register', label: 'Đăng ký Ngân sách MKT', short: 'Đăng ký MKT', icon: Wallet, hidden: !isRegistrant },
    { id: 'budget', label: 'Ngân sách Phòng', short: 'NS Phòng', icon: PiggyBank, hidden: !canManage },
    { id: 'weekly', label: 'Báo cáo tuần', icon: FileText, hidden: !isRegistrant },
    { id: 'team-report', label: 'Báo cáo Phòng', icon: BarChart3, hidden: !canManage },
    { id: 'members', label: 'Thành viên', icon: Users },
    { id: 'approvals', label: 'Chờ duyệt', icon: UserCheck, badge: pendingByTeam[tid] || undefined, hidden: !canReview },
    { id: 'nt', label: 'Nghiệm thu MKT', icon: FileCheck, hidden: !(tid && vnCan(c, 'vn.team_nt.view')) },
  ];
  // NVKD / GĐKD: ưu tiên «Đăng ký MKT» + «Báo cáo tuần» trong mục chọn nhanh (SectionTabs).
  const prioritizeQuick = c.role === 'user' || c.role === 'gdkd';
  const tabs = prioritizeQuick
    ? (() => {
        const prefer = ['register', 'weekly'];
        const head = prefer.map((id) => tabsRaw.find((x) => x.id === id)!).filter(Boolean);
        const rest = tabsRaw.filter((x) => !prefer.includes(x.id));
        return [...head, ...rest];
      })()
    : tabsRaw;
  const curTab = tabs.find((t) => t.id === tab && !t.hidden) ? tab : tabs.find((t) => t.id === defTab && !t.hidden) ? defTab : tabs.find((t) => !t.hidden)!.id;

  return (
    <Shell title="Quản lý Phòng KD" sub="Đăng ký Ngân sách MKT, Báo cáo tuần và Báo cáo Phòng — kỳ 21 → 20 hằng tháng.">
      <div className="flex flex-wrap gap-2 items-end">
        {teamChoices.length > 1 ? <Field label="Phòng"><SearchSelect value={tid} onChange={setTeamId} options={teamChoices.map((t) => ({ value: t.id, label: `${t.name}${isTeamActive(t) ? '' : ' (Ngừng hoạt động)'}${pendingByTeam[t.id] ? ` (${pendingByTeam[t.id]} chờ duyệt)` : ''}` }))} /></Field>
          : <div className="text-[13px]"><div className="text-[11px] text-[var(--mh-text-2)]">Phòng</div><b>{tid ? teamName(c, tid) : 'Chưa có Phòng'}</b></div>}
        <Field label="Kỳ"><PeriodPicker value={period} onChange={setPeriod} settings={c.settings} db={c.db} /></Field>
        {tid && <div className="text-[12px] text-[var(--mh-text-2)] pb-2">Khối: <b>{blockName(c, blockOfTeam(c, tid))}</b></div>}
      </div>
      <SectionTabs items={tabs} value={curTab} onChange={setTab} ariaLabel="Các mục Quản lý Phòng KD" title="Mục Quản lý Phòng KD" className="md:top-[64px]" />
      {!tid ? <Card className="p-5 text-[13px] text-[var(--mh-text-2)]">Bạn chưa thuộc Phòng KD nào.</Card> : (
        <>
          {curTab === 'register' && <MyRegistration c={c} period={period} lines={lines} />}
          {curTab === 'budget' && <TeamBudget c={c} teamId={tid} period={period} lines={lines} readOnly={!(isAdm(c) || isGdkdHere)} />}
          {curTab === 'weekly' && <WeeklyForm c={c} period={period} lines={lines} />}
          {curTab === 'approvals' && <ApprovalsPanel c={c} filter={(r) => r.teamId === tid} />}
          {curTab === 'team-report' && <RollupView c={c} period={period} lines={lines} scope={{ teamIds: [tid] }} title={`Báo cáo Phòng ${teamName(c, tid)}`} levels={['user']} />}
          {curTab === 'members' && <Members c={c} teamId={tid} />}
          {curTab === 'nt' && <TeamNt c={c} tid={tid} period={period} />}
        </>
      )}
    </Shell>
  );
}

function Members({ c, teamId }: { c: VCtx; teamId: string }) {
  const team = c.teams.find((t) => t.id === teamId);
  const members = c.users.filter((u) => u.teamId === teamId);
  const gdkds = (team?.gdkdUids || []) as string[];
  // GĐKD không xem CCCD/STK của thành viên (rules chặn userKyc); chỉ Admin / Kế toán / GĐ Khối / Trợ lý Khối.
  const canSeeKyc = canSeeOthersKyc(c.role);
  const kycs = useKycMap(c, canSeeKyc ? members.map(uidOf) : [c.uid], true);
  return (
    <div className="space-y-3">
      <Card className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-[13px]">
        <div><div className="text-[11px] text-[var(--mh-text-2)]">Phòng</div><b>{team?.name}</b></div>
        <div><div className="text-[11px] text-[var(--mh-text-2)]">Khối</div>{blockOfTeam(c, teamId) ? <Badge c="info">{blockName(c, blockOfTeam(c, teamId))}</Badge> : <Badge c="err">Chưa gán Khối</Badge>}</div>
        <div><div className="text-[11px] text-[var(--mh-text-2)]">GĐKD (ngang quyền)</div>{gdkds.length ? gdkds.map((u) => userName(c, u)).join(', ') : members.filter((m) => String(m.role).toLowerCase() === 'gdkd').map((m) => m.fullName || m.email).join(', ') || <span className="text-[var(--mh-warn)]">Chưa có</span>}</div>
        <div><div className="text-[11px] text-[var(--mh-text-2)]">Trạng thái</div>{isTeamActive(team) ? <Badge c="ok">Hoạt động</Badge> : <Badge c="mute">Ngừng hoạt động</Badge>}</div>
      </Card>
      <Card>
        <div className="px-4 py-3 font-semibold text-[14px] border-b border-[var(--mh-border)]">Thành viên ({members.length})</div>
        {!members.length ? <Empty>Chưa có thành viên</Empty> : (
          <>
          <div className="md:hidden p-2.5 grid gap-2" data-testid="vn-team-members-cards">
            {members.map((m) => (
              <div key={uidOf(m)} className="rounded-xl border border-[var(--mh-border,var(--mh-border))] p-3 space-y-1.5">
                <div className="font-semibold text-[14px]">{m.fullName || m.displayName || '—'}</div>
                <div className="text-[11px] text-[var(--mh-text-2,var(--mh-text-2))] break-all">{m.email}</div>
                <div className="text-[12px]">Vai trò: <b>{m.role || 'user'}</b></div>
                <KycCells k={kycs[uidOf(m)]} canSee={canSeeKyc || uidOf(m) === c.uid} compact />
                <div className="pt-1"><RenameUserButton c={c} target={m} /></div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto"><table data-mh-responsive className="w-full" data-testid="vn-team-members"><thead><tr><Th>Họ tên</Th><Th>Email</Th><Th>Vai trò</Th><Th>Thông tin thanh toán</Th><Th></Th></tr></thead><tbody>
            {members.map((m) => <tr key={uidOf(m)}><Td>{m.fullName || m.displayName || '—'}</Td><Td className="text-[12px] text-[var(--mh-text-2)] break-all">{m.email}</Td><Td>{m.role || 'user'}</Td><Td><KycCells k={kycs[uidOf(m)]} canSee={canSeeKyc || uidOf(m) === c.uid} compact /></Td><Td r><RenameUserButton c={c} target={m} /></Td></tr>)}
          </tbody></table></div>
          </>
        )}
        <div className="px-4 py-2.5 text-[11px] text-[var(--mh-text-3)] border-t border-[var(--mh-border)]">Phân quyền tài khoản chỉ Admin thực hiện (Users / Phân quyền). Đổi tên: theo quyền «Đổi tên người dùng». Thông tin thanh toán (CCCD/STK) chỉ Admin, Kế toán, GĐ Khối / Trợ lý Khối xem được.</div>
      </Card>
    </div>
  );
}

/** Admin: trạng thái Ngừng hoạt động + danh sách GĐKD của từng Phòng. */
function AllTeams({ c }: { c: VCtx }) {
  const { toast, node } = useToast();
  const [edit, setEdit] = useState<any>(null);
  const [q, setQ] = useState('');
  const admin = isAdm(c) || c.role === 'accountant';
  // GĐKD + GĐ Khối (kiêm GĐKD). Ẩn hồ sơ đã chuyển UID.
  const gdkdUsers = c.users.filter((u) => (String(u.role || '').toLowerCase() === 'gdkd' || (vnCan(c, 'vn.dual_gdkd.assign') && String(u.role || '').toLowerCase() === 'gd_khoi')) && !u.linkedToUid && !u.mergedInto)
    .sort((a, b) => Number(String(b.role) === 'gdkd') - Number(String(a.role) === 'gdkd') || String(a.fullName || a.email).localeCompare(String(b.fullName || b.email), 'vi'));
  const list = c.teams.filter((t) => !q || String(t.name).toLowerCase().includes(q.toLowerCase())).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const setStatus = async (t: any, status: string) => {
    try { await updateDoc(doc(c.db, 'teams', t.id), { status, statusUpdatedAt: new Date().toISOString(), statusUpdatedBy: c.uid }); toast(status === 'inactive' ? 'Đã chuyển Ngừng hoạt động' : 'Đã kích hoạt lại'); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const saveGdkd = async () => {
    if ((edit?.gdkdUids || []).length > 4) { toast('Tối đa 4 GĐKD mỗi Phòng (tính cả GĐ Khối kiêm GĐKD)', 'err'); return; }
    try { await updateDoc(doc(c.db, 'teams', edit.id), { gdkdUids: edit.gdkdUids }); setEdit(null); toast('Đã lưu danh sách GĐKD'); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  return (
    <Card>
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-[var(--mh-border)]"><div className="font-semibold text-[14px] flex-1">Tất cả Phòng KD ({c.teams.length}) · {c.teams.filter((t) => !isTeamActive(t)).length} Ngừng hoạt động</div><input className="h-8 px-2 rounded-lg border border-[var(--mh-border)] text-[13px]" placeholder="Tìm Phòng…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Phòng</Th><Th>Khối</Th><Th>GĐKD</Th><Th r>TV</Th><Th>Trạng thái</Th><Th></Th></tr></thead><tbody>
        {list.map((t) => (
          <tr key={t.id} className={isTeamActive(t) ? '' : 'opacity-60'}>
            <Td className="font-medium">{t.name}</Td>
            <Td>{blockOfTeam(c, t.id) ? blockName(c, blockOfTeam(c, t.id)) : <Badge c="err">Chưa gán</Badge>}</Td>
            <Td className="text-[12px]">{asArr(t.gdkdUids).map((u: string) => userName(c, u)).join(', ') || '—'}</Td>
            <Td r>{c.users.filter((u) => u.teamId === t.id).length}</Td>
            <Td>{isTeamActive(t) ? <Badge c="ok">Hoạt động</Badge> : <Badge c="mute">Ngừng hoạt động</Badge>}</Td>
            <Td r className="whitespace-nowrap">{admin && <>
              <Btn small onClick={() => setEdit({ id: t.id, name: t.name, gdkdUids: [...(t.gdkdUids || [])] })}>GĐKD</Btn>{' '}
              {isTeamActive(t) ? <Btn small danger onClick={() => window.confirm(`Chuyển ${t.name} sang Ngừng hoạt động? User sẽ không thấy Phòng này.`) && setStatus(t, 'inactive')}>Ngừng</Btn> : <Btn small onClick={() => setStatus(t, 'active')}>Kích hoạt</Btn>}
            </>}</Td>
          </tr>
        ))}
      </tbody></table></div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`GĐKD của ${edit?.name || ''}`} footer={<><Btn onClick={() => setEdit(null)}>Huỷ</Btn><Btn primary onClick={saveGdkd}>Lưu</Btn></>}>
        {edit && <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          <div className="text-[12px] text-[var(--mh-text-2)] mb-2" data-testid="vn-gdkd-editor">Tối đa 4 (tính cả GĐ Khối kiêm GĐKD) · đang chọn {edit.gdkdUids.length}/4. Các GĐKD ngang quyền: cùng sửa dòng "NS bổ sung GĐKD" chung và điều chỉnh NS user của Phòng.</div>
          {gdkdUsers.map((u) => { const id = uidOf(u); const on = edit.gdkdUids.includes(id); return (
            <label key={id} className="flex items-center gap-2 text-[13px] py-1"><input type="checkbox" checked={on} onChange={() => setEdit({ ...edit, gdkdUids: on ? edit.gdkdUids.filter((x: string) => x !== id) : [...edit.gdkdUids, id] })} />{u.fullName || u.email}{String(u.role) === 'gd_khoi' && <Badge c="info">GĐ Khối · kiêm GĐKD</Badge>}<span className="text-[11px] text-[var(--mh-text-3)]">{u.teamName}</span></label>
          ); })}
          {!gdkdUsers.length && <Empty>Chưa có tài khoản vai trò GĐKD</Empty>}
        </div>}
      </Modal>
      {node}
    </Card>
  );
}

/** Tab Nghiệm thu MKT (chỉ đọc) — nguồn: acceptances, lọc Phòng + tháng của kỳ. */
export function ntScope(c: VCtx, tid: string): 'all' | 'own' | 'none' {
  if (!tid) return 'none';
  if (canViewAll(c)) return 'all';
  if (isKhoiMgr(c) && c.myBlockIds.includes(blockOfTeam(c, tid) || '')) return 'all';
  if (gdkdTeams(c).includes(tid)) return 'all';
  return 'own';
}
function TeamNt({ c, tid, period }: { c: VCtx; tid: string; period: string }) {
  const scope = ntScope(c, tid);
  const mine = new Set([c.uid, ...(c.aliasUids || [])]);
  const month = normalizeMonth(period);
  const rows = (c.acceptancesAll || c.acceptances).filter((a) => a.teamId === tid && normalizeMonth(a.month) === month
    && (scope === 'all' || (scope === 'own' && mine.has(a.implementerUid))));
  const total = rows.filter(ntCountsInTotals).reduce((s, a) => s + recordCostBeforeVat(a), 0);
  const open = (e: React.MouseEvent) => { e.preventDefault(); window.history.pushState({}, '', '/nghiem-thu'); window.dispatchEvent(new PopStateEvent('popstate')); };
  return (
    <Card data-testid="vn-team-nt">
      <div className="px-4 py-3 border-b border-[var(--mh-border)] flex flex-wrap gap-2 items-center">
        <b className="flex-1 text-[13px]">Nghiệm thu MKT — {teamName(c, tid)} · {periodLabel(month)}{scope === 'own' ? ' (bản ghi của tôi)' : ''}</b>
        {scope === 'all' && <a href="/nghiem-thu" onClick={open} className="text-[12px] font-semibold text-indigo-600" data-testid="vn-team-nt-open">Mở toàn màn hình ↗</a>}
      </div>
      {!rows.length ? <Empty>Chưa có bản ghi Nghiệm thu trong kỳ này.</Empty> : (
        <div className="overflow-x-auto"><table data-mh-responsive className="w-full">
          <thead><tr><Th>Dự án</Th><Th>Người phụ trách</Th><Th>Trạng thái</Th><Th>Chi phí (trước VAT)</Th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id} data-testid="vn-team-nt-row" className={scope === 'all' ? 'cursor-pointer hover:bg-[#F6F8FB]' : ''} onClick={scope === 'all' ? (open as any) : undefined}>
              <Td>{projectName(c, a.projectId, a.projectName)}{isSupplement(a) && <div data-testid="vn-team-nt-supp" className={`text-[11px] font-bold ${suppStatus(a) === 'rejected' ? 'text-red-600' : 'text-orange-700'}`}>{suppViewLabel(a)}</div>}</Td>
              <Td>{implementerLabel(a) || (a.implementerUid ? userName(c, a.implementerUid) : '—')}</Td>
              <Td>{a.status || '—'}</Td>
              <Td>{fmt(recordCostBeforeVat(a))}</Td>
            </tr>))}
            <tr><Td><b>Tổng ({rows.filter(ntCountsInTotals).length}{rows.some((a) => !ntCountsInTotals(a)) ? ' · không tính bổ sung chưa duyệt' : ''})</b></Td><Td></Td><Td></Td><Td><b>{fmt(total)}</b></Td></tr>
          </tbody></table></div>)}
    </Card>);
}
