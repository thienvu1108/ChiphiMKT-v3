import { pushNotif, khoiManagers } from './notify';
import { lockBlock, useLocks, pastBlock } from './locks';
const PastTag = () => <span data-testid="vn-past-locked" title="Kỳ đã qua — chỉ Super Admin được sửa / xoá" className="inline-flex items-center rounded-full border border-[#D5DCE5] bg-[var(--mh-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--mh-text-2)] mr-1">🔒 Kỳ đã khoá</span>;
import React, { useMemo, useState } from 'react';
import { Card, Btn, Badge, Th, Td, Field, Select, MoneyInput, Input, Modal, Kpi, Empty, fmt, fmtM, vnTime, useToast, SearchSelect, StickyFormBar } from './ui';
import { type VCtx, isAdm, gdkdTeams, projectName, teamName, blockName, userName, teamsOfBlock, blockOfTeam } from './ctx';
import { asArr } from './ctx';
import { summarizeTeam, summarizeBlock, blockTeamIds, checkEdit, canRegisterAsUser, canRegisterUserNs, canRegisterAsKhoi, type NsLine, type ProjectRow, legacyOf } from '../../lib/vnext/budget';
import { projectLabelWithPct, baseSupportPctAtPeriod, fmtPct } from '../../lib/vnext/supportPct';
import { periodLabel } from '../../lib/vnext/period';
import { activeLock, lockUntilText } from '../../lib/vnext/platform';

/** Dòng Đăng ký được chuyển từ NS bổ sung GĐKD/GĐK cũ (script convert-supplements-20261021). */
const convTag = (l: any) => (Array.isArray(l?.convertedFrom) && l.convertedFrom.length ? <span className="ml-1 rounded bg-[#EEF2FF] px-1 text-[10px] text-[#4F46E5]" title={l.convertedFrom.map((x: any) => x.srcId).join(', ')}>chuyển từ bổ sung {l.convertedFrom.some((x: any) => x.srcKind === 'gdk') ? 'GĐK' : 'GĐKD'}</span> : null);
import { saveNsLine, deleteNsLine } from './nsActions';
import { useSupport, SupportBadge, LineHistoryModal, StatusSplitKpis } from './SupportViews';
import { effectiveStatus, splitByStatus, payOf } from '../../lib/vnext/support';
import { BAN_STATUS_LABEL, effectiveBanStatus, banReasonText } from '../../lib/vnext/banSupport';
import { usePayMap } from './payStatus';
import { PayGateBanner } from './SupportViews';
import { useMyKyc } from './KycViews';
import { accountsOf, defaultAccount, snapOf, snapLabel, maskTail, hasPayInfo } from '../../lib/vnext/kyc';

/** Cột «Tỉ lệ hỗ trợ MKT» = Base % của dự án theo kỳ đang xem (cuối kỳ 20/M). Riêng dự án → Ban; không có lịch sử bao phủ kỳ → tỉ lệ hiện tại. */
const PctTh = () => <Th r><span className="hidden sm:inline">Tỉ lệ hỗ trợ MKT</span><span className="sm:hidden">% HT MKT</span></Th>;
function PctTd({ c, pid, period }: { c: VCtx; pid: string; period: string }) {
  const e = baseSupportPctAtPeriod(c.projects.find((p) => p.id === pid), c.banKds || [], period);
  const tip = !e ? undefined : [
    e.source === 'ban' ? 'Theo tỉ lệ chung của Ban KD' : 'Tỉ lệ Base riêng của dự án',
    e.fallback === 'current' ? 'Không có lịch sử bao phủ kỳ — đang hiện tỉ lệ hiện tại' : null,
  ].filter(Boolean).join('. ');
  return <Td r className="whitespace-nowrap" data-testid="vn-pct-cell">{e ? <span title={tip}>{fmtPct(e.pct)}{e.fallback === 'current' ? <span className="text-[10px] text-[var(--mh-text-3)] ml-0.5">*</span> : null}</span> : <span className="text-[var(--mh-text-3)]">—</span>}</Td>;
}

/** Khung đăng ký / sửa NS: CHỈ theo «Thời gian MỞ» (vnLocks/current) + khoá kỳ đã qua; Super Admin luôn mở (giống rules vnOpen). */
export const windowOpenFor = (c: VCtx, period: string, kind: 'nsCreate' | 'nsEdit' = 'nsCreate') => !lockBlock(c.role, kind, period);

export function WindowBanner({ c, period }: { c: VCtx; period: string }) {
  const locks = useLocks(c.db);
  const open = windowOpenFor(c, period);
  const openEdit = windowOpenFor(c, period, 'nsEdit');
  const past = pastBlock(c.role, 'ns', period);
  const a = activeLock(locks, 'nsCreate', period);
  return (
    <div className={`rounded-xl px-4 py-2.5 text-[13px] flex flex-wrap items-center gap-2 ${open ? 'bg-emerald-50 text-[var(--mh-ok)]' : 'bg-[var(--mh-surface-2)] text-[var(--mh-text-2)]'}`} data-testid="vn-ns-window" data-open={open ? '1' : '0'}>
      <b>{periodLabel(period)}</b>
      <span>· Theo «Thời gian MỞ» (Khoá theo ngày)</span>
      {open ? <Badge c="ok">Đang mở đăng ký</Badge> : <Badge c="mute">{past ? 'Kỳ đã khoá' : 'Đã khoá đăng ký mới'}</Badge>}
      {!open && openEdit && <Badge c="ok">Đang mở sửa NS</Badge>}
      {!open && !past && a && <span className="text-[12px]">{lockUntilText(a.until).replace(/^Đang khoá đến/, 'Mở lại lúc')}</span>}
    </div>
  );
}

function projectOptions(c: VCtx, exclude: string[] = []) {
  return [{ value: '', label: '— Chọn dự án —' }, ...c.projects
    .filter((p) => !p.deleted && !exclude.includes(p.id) && (p.status || 'active') !== 'inactive' && p.isActive !== false)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'))
    .map((p) => ({ value: p.id, label: projectLabelWithPct(p, c.banKds || []) }))];
}

export function HistoryModal({ open, onClose, lines, c, title = 'Lịch sử chỉnh sửa' }: any) {
  const rows = useMemo(() => (lines as NsLine[]).flatMap((l) => asArr(l.history).map((h) => ({ ...h, l }))).sort((a, b) => String(b.at).localeCompare(String(a.at))), [lines]);
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      {!rows.length ? <Empty>Chưa có lịch sử</Empty> : (
        <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Thời gian (VN)</Th><Th>Người sửa</Th><Th>Dòng</Th><Th r>Từ</Th><Th r>Thành</Th><Th>Lý do</Th></tr></thead><tbody>
          {rows.map((h, i) => (
            <tr key={i}><Td className="whitespace-nowrap">{vnTime(h.at)}</Td><Td>{h.byName}<div className="text-[11px] text-[var(--mh-text-3)]">{h.byRole}</div></Td>
              <Td>{projectName(c, h.l.projectId)}<div className="text-[11px] text-[var(--mh-text-3)]">{h.l.kind === 'user' ? (h.l.ownerName || userName(c, h.l.ownerUid)) : h.l.kind === 'gdkd' ? 'NS bổ sung GĐKD' : h.l.kind === 'khoi' ? `GĐ Khối đăng ký · ${h.l.ownerName || userName(c, h.l.ownerUid)}` : 'NS bổ sung GĐK'}{h.action === 'delete' ? ' · xoá' : ''}</div></Td>
              <Td r>{fmt(h.from)}</Td><Td r className="font-semibold">{fmt(h.to)}</Td><Td>{h.reason || '—'}</Td></tr>
          ))}
        </tbody></table></div>
      )}
    </Modal>
  );
}

/** Tab "Đăng ký Ngân sách MKT" — user tự đăng ký cho Phòng của mình. */
export function MyRegistration({ c, period, lines }: { c: VCtx; period: string; lines: NsLine[] }) {
  const { toast, node } = useToast();
  const mine = lines.filter((l) => l.kind === 'user' && l.ownerUid === c.uid && l.period === period && !l.deleted);
  useLocks(c.db);
  const open = windowOpenFor(c, period);
  const openEdit = windowOpenFor(c, period, 'nsEdit');
  const [pid, setPid] = useState('');
  const [amt, setAmt] = useState(0);
  const [edit, setEdit] = useState<Record<string, number>>({});
  const [hist, setHist] = useState(false);
  const myGdkd = gdkdTeams(c);
  const homeTeamId = c.teamId || myGdkd[0] || '';
  const canReg = canRegisterUserNs(c.role, myGdkd) && !!homeTeamId && ((c.teams.find((t) => t.id === homeTeamId)?.status || 'active') !== 'inactive');
  const total = mine.reduce((s, l) => s + Number(l.amount || 0), 0);
  const sup = useSupport(c, [period], { mine: true });
  const [lineHist, setLineHist] = useState<NsLine | null>(null);
  const myKyc = useMyKyc(c);
  const myPay = myKyc === undefined ? undefined : hasPayInfo(myKyc);
  const payMine = usePayMap(c.db);
  const st = (l: NsLine) => effectiveStatus(l, sup[l.id], myPay === false ? false : payOf(payMine, c.uid) ?? myPay);
  const accs = accountsOf(myKyc);
  const defAcc = defaultAccount(myKyc);
  const [payId, setPayId] = useState('');
  const [editPay, setEditPay] = useState<Record<string, string>>({});
  const pick = (id?: string) => accs.find((a) => a.id === id) || defAcc;
  const accLabel = (a: any) => `${a.bankName} · ${maskTail(a.bankAccount)} · ${a.accountHolder}`;
  const PaySelect = ({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) => accs.length <= 1
    ? <div className="h-9 px-3 flex items-center rounded-lg bg-[var(--mh-bg)] text-[12px]" data-testid={testId} data-locked="1">{defAcc ? accLabel(defAcc) : 'Chưa khai tài khoản'}</div>
    : <select className="h-9 px-2 rounded-lg border border-[var(--mh-border)] text-[12px] w-full" value={value || defAcc?.id || ''} onChange={(e) => onChange(e.target.value)} data-testid={testId}>{accs.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}{a.id === defAcc?.id ? ' (mặc định)' : ''}</option>)}</select>;

  const add = async () => {
    if (!pid || amt <= 0) return toast('Chọn dự án và nhập số tiền', 'err');
    const ck = checkEdit({ uid: c.uid, role: c.role, teamId: homeTeamId, gdkdTeamIds: myGdkd }, { kind: 'user', teamId: homeTeamId, ownerUid: c.uid }, { windowOpen: open, isNew: true });
    if (!ck.ok) return toast(ck.reason!, 'err');
    const lk = lockBlock(c.role, 'nsCreate', period); if (lk) return toast(lk, 'err');
    try {
      await saveNsLine(c, { kind: 'user', period, teamId: homeTeamId, blockId: blockOfTeam(c, homeTeamId), projectId: pid, owner: { uid: c.uid, name: c.name, email: c.email }, payAccount: pick(payId) ? snapOf(pick(payId)!) : null, existing: lines.find((l) => l.kind === 'user' && l.ownerUid === c.uid && l.projectId === pid && l.period === period) || null, amount: amt });
      setPid(''); setAmt(0); setPayId(''); toast('Đã lưu đăng ký');
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err', () => add()); }
  };
  const save = async (l: NsLine) => {
    if (st(l) === 'approved' && sup[l.id] && !window.confirm('Khoản này đã được duyệt hỗ trợ MKT. Sửa sẽ chuyển sang «Cần duyệt lại» và GĐ Khối / Trợ lý Khối phải duyệt lại. Tiếp tục?')) return;
    const lk = lockBlock(c.role, 'nsEdit', l.period); if (lk) return toast(lk, 'err');
    try { const pa = pick(editPay[l.id] || l.payAccount?.id); await saveNsLine(c, { kind: 'user', period, teamId: l.teamId, projectId: l.projectId, existing: l, amount: edit[l.id], payAccount: pa ? snapOf(pa) : null }); setEdit((e) => { const n = { ...e }; delete n[l.id]; return n; }); toast('Đã cập nhật');
      if (st(l) === 'approved' && sup[l.id]) for (const u of khoiManagers(c, l.blockId)) pushNotif(c, u, { type: 'reapproval', title: `Cần duyệt lại: ${c.name} · ${projectName(c, l.projectId)}`, body: `Đã duyệt ${fmt(sup[l.id]!.amount)} đ → nay ${fmt(edit[l.id] ?? l.amount)} đ`, link: '/quan-ly-khoi', refId: l.id }); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err', () => save(l)); }
  };
  const del = async (l: NsLine) => {
    if (!window.confirm(`Xoá đăng ký NS dự án ${projectName(c, l.projectId)}?`)) return;
    { const lk = lockBlock(c.role, 'nsEdit', l.period); if (lk) return toast(lk, 'err'); }
    try { await deleteNsLine(c, l, true); toast('Đã xoá'); } catch (e: any) { toast('Không xoá được: ' + (e?.code || e?.message), 'err'); }
  };

  if (!canReg) return <Card className="p-5 text-[13px] text-[var(--mh-text-2)]">{!canRegisterUserNs(c.role, myGdkd) ? 'Vai trò của bạn không đăng ký Ngân sách MKT như user (theo quy định: GĐK/Trợ lý chưa kiêm GĐKD, Mod, Admin, Kế toán, Trưởng ban KD).' : !homeTeamId ? 'Bạn chưa thuộc Phòng KD nào. Liên hệ Admin để được gán Phòng hoặc kiêm GĐKD.' : 'Phòng của bạn đang Ngừng hoạt động.'}</Card>;

  return (
    <div className="space-y-3">
      <WindowBanner c={c} period={period} />
      <PayGateBanner c={c} onOpenKyc={() => window.dispatchEvent(new Event('vn-open-kyc'))} />
      <Card className="p-4">
        <div className="text-[13px] font-semibold mb-2">Đăng ký mới · Phòng {teamName(c, homeTeamId)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_260px_auto] gap-2 items-end">
          <Field label="Dự án"><SearchSelect value={pid} onChange={setPid} options={projectOptions(c, mine.map((m) => m.projectId))} className="w-full" disabled={!open} /></Field>
          <Field label="Ngân sách (đ)"><MoneyInput value={amt} onChange={setAmt} disabled={!open} /></Field>
          <Field label="Tài khoản nhận tiền"><PaySelect value={payId} onChange={setPayId} testId="vn-reg-pay" /></Field>
          <div className="hidden sm:block"><Btn primary onClick={add} disabled={!open}>+ Thêm</Btn></div>
        </div>
        <StickyFormBar>
          <Btn primary className="w-full justify-center sm:hidden" onClick={add} disabled={!open}>+ Thêm đăng ký</Btn>
        </StickyFormBar>
      </Card>
      <Card>
        <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--mh-border)]"><div className="font-semibold text-[14px] flex-1">NS tôi đã đăng ký</div><Badge c="info">Tổng {fmt(total)} đ</Badge><Btn small onClick={() => setHist(true)}>Lịch sử</Btn></div>
        {!mine.length ? <Empty>Chưa đăng ký dự án nào trong kỳ này</Empty> : (
          <>
          <div className="md:hidden p-2.5 grid gap-2" data-testid="vn-my-ns-cards">
            {mine.map((l) => {
              const last = (l.history || []).slice(-1)[0];
              const byOther = last && last.byUid !== c.uid;
              return (
                <div key={l.id} className="rounded-xl border border-[var(--mh-border,var(--mh-border))] bg-[var(--mh-surface,#fff)] p-3 space-y-1.5">
                  <div className="flex items-start gap-2"><div className="font-semibold text-[14px] flex-1 min-w-0 truncate">{projectName(c, l.projectId)}</div><SupportBadge status={st(l)} /></div>
                  <div className="text-[18px] font-bold tabular-nums">{edit[l.id] != null ? <MoneyInput value={edit[l.id]} onChange={(v: number) => setEdit({ ...edit, [l.id]: v })} className="w-full" /> : <>{fmt(l.amount)} đ</>}</div>
                  <div className="text-[11px] text-[var(--mh-text-2,var(--mh-text-2))]" data-testid="vn-line-pay">TK nhận: {edit[l.id] != null ? <PaySelect value={editPay[l.id] || l.payAccount?.id || ''} onChange={(v) => setEditPay({ ...editPay, [l.id]: v })} testId="vn-edit-pay" /> : (l.payAccount ? snapLabel(l.payAccount) : defAcc ? snapLabel(snapOf(defAcc)) + ' (mặc định)' : '—')}</div>
                  {st(l) === 'need_pay' && <div className="text-[11px] text-[var(--mh-warn,var(--mh-warn))]">Cập nhật thông tin thanh toán để được duyệt</div>}
                  {st(l) === 'reapproval' && <div className="text-[11px] text-[var(--mh-warn,var(--mh-warn))]">Đã duyệt {fmt(sup[l.id]!.amount)} đ · chờ duyệt lại</div>}
                  {(() => { const b = effectiveBanStatus(l, sup[l.id]); return (b === 'pending' || b === 'rejected') ? <div className={`text-[11px] ${b === 'rejected' ? 'text-[var(--mh-err)]' : 'text-[var(--mh-pending)]'}`}>{b === 'pending' ? 'Chờ Ban' : 'Ban từ chối'}</div> : null; })()}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {pastBlock(c.role, 'ns', l.period) ? <PastTag /> : openEdit && (edit[l.id] != null
                      ? <><Btn small primary onClick={() => save(l)}>Lưu</Btn><Btn small onClick={() => setEdit((e) => { const n = { ...e }; delete n[l.id]; return n; })}>Huỷ</Btn></>
                      : <><Btn small onClick={() => setEdit({ ...edit, [l.id]: Number(l.amount) })}>Sửa</Btn><Btn small danger onClick={() => del(l)}>Xoá</Btn></>)}
                    <Btn small onClick={() => setLineHist(l)}>Lịch sử</Btn>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Dự án</Th><PctTh /><Th r>Ngân sách (đ)</Th><Th>Hỗ trợ MKT</Th><Th>Cập nhật</Th><Th></Th></tr></thead><tbody>
            {mine.map((l) => {
              const last = (l.history || []).slice(-1)[0];
              const byOther = last && last.byUid !== c.uid;
              return (
                <tr key={l.id}>
                  <Td><div className="font-medium">{projectName(c, l.projectId)}</div>{edit[l.id] != null ? <div className="mt-1 max-w-[260px]"><PaySelect value={editPay[l.id] || l.payAccount?.id || ''} onChange={(v) => setEditPay({ ...editPay, [l.id]: v })} testId="vn-edit-pay" /></div> : <div className="text-[11px] text-[var(--mh-text-2)]" data-testid="vn-line-pay">TK nhận: {l.payAccount ? snapLabel(l.payAccount) : defAcc ? snapLabel(snapOf(defAcc)) + ' (mặc định)' : '—'}</div>}{byOther && <div className="text-[11px] text-[var(--mh-warn)]">Đã được {last.byName} điều chỉnh{last.reason ? `: ${last.reason}` : ''}</div>}{l.teamId && l.teamId !== c.teamId && <div className="text-[11px] text-[var(--mh-err)]" data-testid="vn-ns-old-team">Đăng ký ở Phòng cũ: {teamName(c, l.teamId)} — không tính vào Ngân sách Phòng hiện tại</div>}</Td>
                  <PctTd c={c} pid={l.projectId} period={period} />
                  <Td r>{edit[l.id] != null ? <MoneyInput value={edit[l.id]} onChange={(v: number) => setEdit({ ...edit, [l.id]: v })} className="w-[120px] sm:w-[160px] ml-auto" /> : <b>{fmt(l.amount)}</b>}</Td>
                  <Td><SupportBadge status={st(l)} />{st(l) === 'need_pay' && <div className="text-[11px] text-[var(--mh-warn)]" data-testid="vn-my-needpay">Cập nhật thông tin thanh toán để được duyệt</div>}{st(l) === 'reapproval' && <div className="text-[11px] text-[var(--mh-warn)]" data-testid="vn-my-reappr">Đã duyệt {fmt(sup[l.id]!.amount)} đ · chờ duyệt lại</div>}{sup[l.id]?.status === 'rejected' && sup[l.id]?.reason && <div className="text-[11px] text-[var(--mh-err)] max-w-[200px]">{sup[l.id]?.reason}</div>}{(() => { const b = effectiveBanStatus(l, sup[l.id]); return (b === 'pending' || b === 'rejected') ? <div className={`text-[11px] max-w-[200px] ${b === 'rejected' ? 'text-[var(--mh-err,var(--mh-err))]' : 'text-[var(--mh-pending,#7C3AED)]'}`} data-testid="vn-my-ban">{b === 'pending' ? 'Chờ Ban' : 'Ban từ chối'}{banReasonText(sup[l.id]) ? ` — ${banReasonText(sup[l.id])}` : ''}</div> : null; })()}</Td>
                  <Td className="text-[12px] text-[var(--mh-text-2)] whitespace-nowrap">{vnTime(l.updatedAt)}</Td>
                  <Td r className="whitespace-nowrap">{pastBlock(c.role, 'ns', l.period) ? <PastTag /> : openEdit && (edit[l.id] != null
                    ? <><Btn small primary onClick={() => save(l)}>Lưu</Btn> <Btn small onClick={() => setEdit((e) => { const n = { ...e }; delete n[l.id]; return n; })}>Huỷ</Btn></>
                    : <><Btn small onClick={() => setEdit({ ...edit, [l.id]: Number(l.amount) })}>Sửa</Btn> <Btn small danger onClick={() => del(l)}>Xoá</Btn></>)} <Btn small onClick={() => setLineHist(l)} data-testid="vn-my-line-history">Lịch sử</Btn></Td>
                </tr>
              );
            })}
          </tbody></table></div>
          </>
        )}
      </Card>
      <HistoryModal open={hist} onClose={() => setHist(false)} lines={lines.filter((l) => l.ownerUid === c.uid && l.period === period)} c={c} />
      {lineHist && <LineHistoryModal c={c} line={lineHist} s={sup[lineHist.id]} onClose={() => setLineHist(null)} />}
      {node}
    </div>
  );
}

/** Cột «Bổ sung» đã bỏ; nếu còn số bổ sung cũ chưa chuyển thì cảnh báo rõ (vẫn tính trong Tổng). */
export function LegacyFlag({ amount, what = 'NS bổ sung cũ' }: { amount: number; what?: string }) {
  if (!(amount > 0)) return null;
  return <div data-testid="vn-legacy-flag" className="mx-4 my-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-[12px] text-[var(--mh-warn)]">⚠ Còn <b>{fmt(amount)} đ</b> {what} chưa chuyển thành Đăng ký — vẫn được tính trong Tổng. Liên hệ Admin để chuyển.</div>;
}
const LegacyChip = ({ amount }: { amount: number }) => amount > 0 ? <div data-testid="vn-legacy-chip" className="text-[10px] font-semibold text-[var(--mh-warn)]">gồm {fmt(amount)} bổ sung cũ</div> : null;

export function ProjectOverview({ c, rows, period, showGdk, showTeams, title = 'Bảng tổng quan theo Dự án' }: { c: VCtx; rows: ProjectRow[]; period: string; showGdk?: boolean; showTeams?: boolean; title?: string }) {
  const tot = rows.reduce((a, r) => ({ users: a.users + r.users, gdkd: a.gdkd + r.gdkd, gdk: a.gdk + r.gdk, gdkOld: a.gdkOld + (r.gdkOld || 0), total: a.total + r.total }), { users: 0, gdkd: 0, gdk: 0, gdkOld: 0, total: 0 });
  return (
    <Card>
      <div className="px-4 py-3 font-semibold text-[14px] border-b border-[var(--mh-border)]">{title}</div>
      <LegacyFlag amount={tot.gdkd + tot.gdkOld} />
      {!rows.length ? <Empty>Chưa có số liệu</Empty> : (
        <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Dự án</Th><PctTh />{showTeams && <Th r>Số Phòng</Th>}<Th r>Số user</Th><Th r>NS user</Th>{showGdk && <Th r>NS GĐ Khối</Th>}<Th r>Tổng NS</Th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.projectId}><Td className="font-medium">{projectName(c, r.projectId)}</Td><PctTd c={c} pid={r.projectId} period={period} />{showTeams && <Td r>{r.teams.size}</Td>}<Td r>{r.userCount}</Td><Td r>{fmt(r.users)}</Td>{showGdk && <Td r>{fmt(r.gdk - (r.gdkOld || 0))}</Td>}<Td r className="font-semibold">{fmt(r.total)}<LegacyChip amount={legacyOf(r)} /></Td></tr>)}
          <tr className="bg-[var(--mh-bg)] font-semibold"><Td>TỔNG</Td><Td />{showTeams && <Td />}<Td r>{rows.reduce((s, r) => s + r.userCount, 0)}</Td><Td r>{fmt(tot.users)}</Td>{showGdk && <Td r>{fmt(tot.gdk - tot.gdkOld)}</Td>}<Td r>{fmt(tot.total)}</Td></tr>
        </tbody></table></div>
      )}
    </Card>
  );
}

/** Tab "Ngân sách Phòng" — GĐKD sửa dòng user (bắt buộc lý do) + dòng bổ sung GĐKD chung. readOnly cho GĐK / Kế toán / Trưởng ban. */
export function TeamBudget({ c, teamId, period, lines, readOnly }: { c: VCtx; teamId: string; period: string; lines: NsLine[]; readOnly?: boolean }) {
  const { toast, node } = useToast();
  useLocks(c.db);
  const open = windowOpenFor(c, period);
  const openEdit = windowOpenFor(c, period, 'nsEdit');
  const sum = useMemo(() => summarizeTeam(lines, period, teamId), [lines, period, teamId]);
  const actor = { uid: c.uid, role: c.role, teamId: c.teamId, gdkdTeamIds: gdkdTeams(c) };
  const isGdkdHere = actor.gdkdTeamIds.includes(teamId);
  const canEditUsers = !readOnly && (isAdm(c) || (isGdkdHere && openEdit));
    // Bỏ hẳn «Bổ sung ngân sách» (kể cả Admin): NS chỉ ghi nhận từ Đăng ký Ngân sách MKT.
  const canEditSupp = false as boolean;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ line: NsLine; amount: number; reason: string } | null>(null);
  const [supp, setSupp] = useState<{ projectId: string; amount: number; line?: NsLine } | null>(null);
  const [hist, setHist] = useState(false);
  const teamLines = lines.filter((l) => l.period === period && l.teamId === teamId);
  const userLines = teamLines.filter((l) => l.kind === 'user' && !l.deleted && Number(l.amount) > 0);
  const gdkdNames = (c.teams.find((t) => t.id === teamId)?.gdkdUids || []).map((u: string) => userName(c, u));
  // Cùng nguồn trạng thái với Ngân sách Khối / Duyệt hỗ trợ MKT, chỉ lấy dòng của Phòng (khớp theo teamId).
  const supT = useSupport(c, [period], { blockIds: [blockOfTeam(c, teamId)].filter(Boolean) as string[] });
  const payT = usePayMap(c.db);
  const split = useMemo(() => splitByStatus(teamLines, supT, payT), [teamLines, supT, payT, c.blocks]);
  const stOf = (l: NsLine) => effectiveStatus(l, supT[l.id], payOf(payT, l.ownerUid));

  const saveUser = async () => {
    if (!editing) return;
    const ck = checkEdit(actor, editing.line, { windowOpen: openEdit, isNew: false });
    if (!ck.ok) return toast(ck.reason!, 'err');
    if (ck.needsReason && editing.reason.trim().length < 3) return toast('Bắt buộc nhập lý do (≥ 3 ký tự)', 'err');
    try {
      await saveNsLine(c, { kind: 'user', period, teamId, projectId: editing.line.projectId, existing: editing.line, amount: editing.amount, reason: editing.reason.trim() || undefined, notifyOwner: ck.notifyOwner });
      setEditing(null); toast(ck.notifyOwner ? 'Đã lưu và thông báo cho user' : 'Đã lưu');
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const saveSupp = async () => {
    if (!supp || !supp.projectId) return toast('Chọn dự án', 'err');
    try {
      const existing = supp.line || teamLines.find((l) => l.kind === 'gdkd' && l.projectId === supp.projectId) || null;
      await saveNsLine(c, { kind: 'gdkd', period, teamId, blockId: blockOfTeam(c, teamId), projectId: supp.projectId, existing, amount: supp.amount });
      setSupp(null); toast('Đã lưu NS bổ sung GĐKD');
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };

  return (
    <div className="space-y-3">
      <WindowBanner c={c} period={period} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="NS Phòng" value={fmtM(sum.total)} hint={sum.gdkd > 0 ? `= Σ user + ${fmtM(sum.gdkd)} bổ sung cũ` : '= Σ Đăng ký NS user'} />
        <Kpi label="Σ NS user" value={fmtM(sum.users)} hint={`${userLines.length} dòng`} />
        <Kpi label="GĐKD" value={gdkdNames.length || '—'} hint={gdkdNames.length ? gdkdNames.join(', ') : undefined} />
        <Kpi label="Số dự án" value={sum.rows.length} />
      </div>
      <div className="text-[12px] font-semibold text-[var(--mh-text-2)]">Trạng thái duyệt hỗ trợ MKT · chỉ bản ghi của Phòng</div>
      <StatusSplitKpis split={split} testId="vn-team-split" />
      <Card>
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-[var(--mh-border)]">
          <div className="font-semibold text-[14px] flex-1">Ngân sách Phòng {teamName(c, teamId)} theo dự án</div>
          {readOnly && <Badge c="mute">Chỉ xem</Badge>}
          {canEditSupp && <Btn small primary onClick={() => setSupp({ projectId: '', amount: 0 })}>+ NS bổ sung GĐKD</Btn>}
          <Btn small onClick={() => setHist(true)}>Lịch sử</Btn>
        </div>
        <LegacyFlag amount={sum.gdkd} what="NS bổ sung GĐKD cũ" />
        {!sum.rows.length ? <Empty>Chưa có đăng ký trong kỳ</Empty> : (
          <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Dự án / User</Th><PctTh /><Th>Trạng thái</Th><Th r>NS user</Th><Th r>Tổng</Th><Th></Th></tr></thead><tbody>
            {sum.rows.map((r) => {
              const ul = userLines.filter((l) => l.projectId === r.projectId);
              const sl = teamLines.find((l) => l.kind === 'gdkd' && l.projectId === r.projectId);
              return (
                <React.Fragment key={r.projectId}>
                  <tr className="bg-[#FAFBFD]">
                    <Td><button className="font-semibold text-left" onClick={() => setExpanded({ ...expanded, [r.projectId]: !expanded[r.projectId] })}>{expanded[r.projectId] ? '▾' : '▸'} {projectName(c, r.projectId)}</button> <span className="text-[11px] text-[var(--mh-text-3)]">{r.userCount} user</span></Td>
                    <PctTd c={c} pid={r.projectId} period={period} /><Td />
                    <Td r>{fmt(r.users)}</Td><Td r className="font-semibold">{fmt(r.total)}<LegacyChip amount={r.gdkd} /></Td>
                    <Td r>{canEditSupp && <Btn small onClick={() => setSupp({ projectId: r.projectId, amount: Number(sl?.amount || 0), line: sl })}>Bổ sung</Btn>}</Td>
                  </tr>
                  {expanded[r.projectId] && ul.map((l) => {
                    const last = (l.history || []).slice(-1)[0];
                    return (
                      <tr key={l.id}><Td className="pl-8">{l.ownerName || userName(c, l.ownerUid)}{convTag(l)}{last?.reason && <div className="text-[11px] text-[var(--mh-warn)]">Sửa bởi {last.byName}: {last.reason}</div>}</Td><PctTd c={c} pid={l.projectId} period={period} /><Td data-testid="vn-team-line-st"><SupportBadge status={stOf(l)} />{supT[l.id]?.status === 'rejected' && supT[l.id]?.reason && <div className="text-[11px] text-[var(--mh-err)] max-w-[200px]">{supT[l.id]?.reason}</div>}{(() => { const b = effectiveBanStatus(l, supT[l.id]); return (b === 'pending' || b === 'rejected') ? <div className={`text-[11px] max-w-[200px] ${b === 'rejected' ? 'text-[var(--mh-err,var(--mh-err))]' : 'text-[var(--mh-pending,#7C3AED)]'}`} data-testid="vn-team-ban">{b === 'pending' ? 'Chờ Ban' : 'Ban từ chối'}{banReasonText(supT[l.id]) ? ` — ${banReasonText(supT[l.id])}` : ''}</div> : null; })()}</Td><Td r>{fmt(l.amount)}</Td><Td /><Td r>{canEditUsers && <Btn small onClick={() => setEditing({ line: l, amount: Number(l.amount), reason: '' })}>Sửa</Btn>}</Td></tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            <tr className="bg-[var(--mh-bg)] font-semibold"><Td>TỔNG PHÒNG</Td><Td /><Td /><Td r>{fmt(sum.users)}</Td><Td r>{fmt(sum.total)}</Td><Td /></tr>
          </tbody></table></div>
        )}
      </Card>
      <ProjectOverview c={c} rows={sum.rows} period={period} />
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Điều chỉnh NS của user" footer={<><Btn onClick={() => setEditing(null)}>Huỷ</Btn><Btn primary onClick={saveUser}>Lưu</Btn></>}>
        {editing && <div className="space-y-3">
          <div className="text-[13px]"><b>{editing.line.ownerName || userName(c, editing.line.ownerUid)}</b> · {projectName(c, editing.line.projectId)}</div>
          <Field label="Ngân sách mới (đ)"><MoneyInput value={editing.amount} onChange={(v: number) => setEditing({ ...editing, amount: v })} /></Field>
          {!isAdm(c) && <Field label="Lý do (bắt buộc — user sẽ nhận thông báo)"><Input value={editing.reason} onChange={(e: any) => setEditing({ ...editing, reason: e.target.value })} placeholder="VD: Điều chỉnh theo kế hoạch Phòng" /></Field>}
          {isAdm(c) && <Field label="Ghi chú (tuỳ chọn, Admin sửa không gửi thông báo)"><Input value={editing.reason} onChange={(e: any) => setEditing({ ...editing, reason: e.target.value })} /></Field>}
        </div>}
      </Modal>
      <Modal open={!!supp} onClose={() => setSupp(null)} title="NS bổ sung GĐKD (dòng chung của Phòng)" footer={<><Btn onClick={() => setSupp(null)}>Huỷ</Btn><Btn primary onClick={saveSupp}>Lưu</Btn></>}>
        {supp && <div className="space-y-3">
          <Field label="Dự án">{supp.line || (supp.projectId && sum.rows.some((r) => r.projectId === supp.projectId)) ? <div className="text-[13px] font-medium">{projectName(c, supp.projectId)}</div> : <SearchSelect value={supp.projectId} onChange={(v: string) => setSupp({ ...supp, projectId: v })} options={projectOptions(c)} className="w-full" />}</Field>
          <Field label="Số tiền bổ sung (đ)"><MoneyInput value={supp.amount} onChange={(v: number) => setSupp({ ...supp, amount: v })} /></Field>
          <div className="text-[12px] text-[var(--mh-text-2)]">Mọi GĐKD của Phòng cùng sửa dòng này; lịch sử ghi rõ ai sửa.</div>
        </div>}
      </Modal>
      <HistoryModal open={hist} onClose={() => setHist(false)} lines={teamLines} c={c} />
      {node}
    </div>
  );
}

/** Ngân sách Khối (thay màn "Ngân sách Khối" cũ). Phòng chỉ đọc với GĐK; GĐK nhập dòng bổ sung GĐK. Admin: mọi Khối. */
export function KhoiBudget({ c, blockIds, period, lines, defaultAll = false }: { c: VCtx; blockIds: string[]; period: string; lines: NsLine[]; defaultAll?: boolean }) {
  const { toast, node } = useToast();
  const showAllOpt = defaultAll || (isAdm(c) && blockIds.length > 1);
  const [blockId, setBlockId] = useState(showAllOpt ? '' : (blockIds[0] || ''));
  const [openTeam, setOpenTeam] = useState<string>('');
  const [supp, setSupp] = useState<{ projectId: string; amount: number; line?: NsLine } | null>(null);
  const [hist, setHist] = useState(false);
  const allMode = showAllOpt && blockId === '';
  const bid = allMode ? '' : (blockIds.includes(blockId) ? blockId : blockIds[0] || '');
  const teams = useMemo(() => allMode ? c.teams.filter((t) => blockIds.includes(t.blockId || '')) : teamsOfBlock(c, bid), [c, bid, allMode, blockIds]);
  // Phòng của Khối = Phòng đang thuộc Khối ∪ Phòng có dòng NS ghi blockId Khối này trong kỳ (chuyển Khối giữa kỳ vẫn tính Khối cũ).
  const teamIds = useMemo(() => {
    if (allMode) {
      const s = new Set<string>();
      for (const b of blockIds) blockTeamIds(lines, period, b, teamsOfBlock(c, b).map((t) => t.id)).forEach((id) => s.add(id));
      return [...s];
    }
    return blockTeamIds(lines, period, bid, teams.map((t) => t.id));
  }, [lines, period, bid, teams, allMode, blockIds, c]);
  const sum = useMemo(() => {
    if (!allMode) return summarizeBlock(lines, period, bid, teamIds);
    // Gộp mọi Khối: cộng NS từng Khối (Σ Phòng + bổ sung GĐK)
    let phong = 0, gdk = 0, legacy = 0; const rowsMap = new Map<string, any>(); const teamRows: any[] = [];
    for (const b of blockIds) {
      const tids = blockTeamIds(lines, period, b, teamsOfBlock(c, b).map((t) => t.id));
      const s = summarizeBlock(lines, period, b, tids);
      phong += s.phong; gdk += s.gdk; legacy += s.legacy;
      for (const t of s.teams) teamRows.push({ ...t, blockId: b });
      for (const r of s.rows) {
        const cur = rowsMap.get(r.projectId) || { projectId: r.projectId, users: 0, gdkd: 0, gdk: 0, gdkOld: 0, total: 0, userCount: 0, teams: new Set<string>() };
        cur.users += r.users; cur.gdkd += r.gdkd; cur.gdk += r.gdk; cur.gdkOld += r.gdkOld || 0; cur.total += r.total; cur.userCount += r.userCount || 0;
        if (r.teams) for (const tid of r.teams) cur.teams.add(tid);
        rowsMap.set(r.projectId, cur);
      }
    }
    return { phong, gdk, legacy, total: phong + gdk, teams: teamRows, rows: [...rowsMap.values()] };
  }, [lines, period, bid, teamIds, allMode, blockIds, c]);
  useLocks(c.db);
  const open = windowOpenFor(c, period);
  const openEdit = windowOpenFor(c, period, 'nsEdit');
  const isMgr = !allMode && (c.role === 'gd_khoi' || c.role === 'tro_ly_khoi') && c.myBlockIds.includes(bid);
    // Bỏ hẳn «Bổ sung GĐK» (kể cả Admin).
  const canSupp = false as boolean;
  void isMgr; void open; void openEdit;
  const supK = useSupport(c, [period], { blockIds: allMode ? blockIds : [bid] });
  const payK = usePayMap(c.db);
  // Cùng nguồn với Duyệt hỗ trợ MKT: dòng đăng ký (user + Khối) ghi blockId của Khối, trong kỳ.
  const split = useMemo(() => splitByStatus(lines.filter((l) => l.period === period && (allMode ? blockIds.includes(l.blockId || '') : l.blockId === bid)), supK, payK), [lines, period, allMode, blockIds, bid, supK, payK, c.blocks]);
  const blockLines = lines.filter((l) => l.period === period && (allMode ? (blockIds.includes(l.blockId) || teams.some((t) => t.id === l.teamId)) : (l.blockId === bid || teams.some((t) => t.id === l.teamId))));

  const saveSupp = async () => {
    if (!supp?.projectId) return toast('Chọn dự án', 'err');
    try {
      const existing = supp.line || blockLines.find((l) => l.kind === 'gdk' && l.projectId === supp.projectId) || null;
      await saveNsLine(c, { kind: 'gdk', period, blockId: bid, projectId: supp.projectId, existing, amount: supp.amount });
      setSupp(null); toast('Đã lưu NS bổ sung GĐK');
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };

  if (!blockIds.length) return <Card className="p-5 text-[13px] text-[var(--mh-text-2)]">Bạn chưa được gán Khối nào.</Card>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        {blockIds.length > 1 && <Field label="Khối"><SearchSelect value={bid} onChange={setBlockId} data-testid="vn-ns-khoi-filter" options={[...(showAllOpt ? [{ value: '', label: 'Tất cả các Khối' }] : []), ...blockIds.map((b) => ({ value: b, label: blockName(c, b) }))]} /></Field>}
      </div>
      <WindowBanner c={c} period={period} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <span hidden data-testid="vn-ns-khoi-total" data-v={sum.total} data-phong={sum.phong} data-gdk={sum.gdk} data-block={allMode ? 'ALL' : bid} />
        <Kpi label="NS Khối" value={fmtM(sum.total)} hint={allMode ? '= Σ mọi Khối' : '= Σ Phòng + NS GĐ Khối'} />
        <Kpi label="Σ NS Phòng" value={fmtM(sum.phong)} hint={`${sum.teams.length} Phòng${allMode ? ' · mọi Khối' : ''}`} />
        <Kpi label="NS GĐ Khối" value={fmtM(sum.gdk)} hint={(() => { const o = sum.rows.reduce((a: number, r: any) => a + (r.gdkOld || 0), 0); return o > 0 ? `gồm ${fmtM(o)} bổ sung GĐK cũ` : 'GĐ Khối / Trợ lý Khối đăng ký'; })()} />
        <Kpi label="Số dự án" value={sum.rows.length} />
      </div>
      <div className="text-[12px] font-semibold text-[var(--mh-text-2)]">Trạng thái duyệt hỗ trợ MKT (khớp mục Duyệt hỗ trợ MKT)</div>
      <StatusSplitKpis split={split} testId="vn-khoi-split" />
      <Card>
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-[var(--mh-border)]"><div className="font-semibold text-[14px] flex-1">Ngân sách theo Phòng · {allMode ? 'Tất cả các Khối' : blockName(c, bid)}</div><Badge c="mute">Số Phòng chỉ xem</Badge><Btn small onClick={() => setHist(true)}>Lịch sử</Btn></div>
        <LegacyFlag amount={sum.legacy} what="NS bổ sung cũ (GĐKD/GĐK)" />
        <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr>{allMode && <Th>Khối</Th>}<Th>Phòng</Th><Th>Trạng thái</Th><Th r>NS user</Th><Th r>NS Phòng</Th><Th></Th></tr></thead><tbody>
          {sum.teams.map((t: any) => {
            const team = c.teams.find((x) => x.id === t.teamId);
            return (
              <React.Fragment key={(t.blockId || '') + t.teamId}>
                <tr>{allMode && <Td className="text-[12px] text-[var(--mh-text-2)]">{blockName(c, t.blockId || team?.blockId)}</Td>}<Td className="font-medium">{teamName(c, t.teamId)}</Td><Td>{(team?.status || 'active') === 'inactive' ? <Badge c="mute">Ngừng hoạt động</Badge> : <Badge c="ok">Hoạt động</Badge>}</Td><Td r>{fmt(t.users)}</Td><Td r className="font-semibold">{fmt(t.total)}<LegacyChip amount={t.gdkd} /></Td><Td r><Btn small onClick={() => setOpenTeam(openTeam === t.teamId ? '' : t.teamId)}>{openTeam === t.teamId ? 'Đóng' : 'Xem ›'}</Btn></Td></tr>
                {openTeam === t.teamId && <tr><td colSpan={allMode ? 6 : 5} className="p-3 bg-[#FAFBFD]"><TeamBudget c={c} teamId={t.teamId} period={period} lines={lines} readOnly={!isAdm(c)} /></td></tr>}
              </React.Fragment>
            );
          })}
          <tr className="bg-[var(--mh-bg)] font-semibold">{allMode && <Td />}<Td>Σ PHÒNG</Td><Td /><Td r>{fmt(sum.teams.reduce((s: number, t: any) => s + t.users, 0))}</Td><Td r>{fmt(sum.phong)}</Td><Td /></tr>
        </tbody></table></div>
      </Card>
      <Card>
        <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--mh-border)]"><div className="font-semibold text-[14px] flex-1">NS GĐ Khối{allMode ? ' · mọi Khối' : ''}</div>{canSupp && <Btn small primary onClick={() => setSupp({ projectId: '', amount: 0 })}>+ Bổ sung GĐK (Admin)</Btn>}</div>
        {(() => { const g = blockLines.filter((l) => (l.kind === 'gdk' || l.kind === 'khoi') && !l.deleted && Number(l.amount) > 0); return !g.length ? <Empty>Chưa có</Empty> : (
          <div className="overflow-x-auto" data-testid="vn-gdk-supp-table"><table data-mh-responsive className="w-full"><thead><tr>{allMode && <Th>Khối</Th>}<Th>Dự án</Th><PctTh /><Th r>Số tiền</Th><Th>Cập nhật</Th><Th></Th></tr></thead><tbody>
            {g.map((l) => <tr key={l.id}>{allMode && <Td className="text-[12px] text-[var(--mh-text-2)]">{blockName(c, l.blockId)}</Td>}<Td>{projectName(c, l.projectId)}<div className="text-[11px] text-[var(--mh-text-3)]">{l.kind === 'khoi' ? `Đăng ký MKT · ${l.ownerName || userName(c, l.ownerUid)}` : 'Bổ sung GĐK (cũ)'}{convTag(l)}</div></Td><PctTd c={c} pid={l.projectId} period={period} /><Td r className="font-semibold">{fmt(l.amount)}</Td><Td className="text-[12px] text-[var(--mh-text-2)]">{vnTime(l.updatedAt)} · {(l.history || []).slice(-1)[0]?.byName}</Td><Td r>{canSupp && l.kind === 'gdk' && <Btn small onClick={() => setSupp({ projectId: l.projectId, amount: Number(l.amount), line: l })}>Sửa</Btn>}</Td></tr>)}
          </tbody></table></div>); })()}
      </Card>
      <ProjectOverview c={c} rows={sum.rows} period={period} showGdk showTeams />
      <Modal open={!!supp} onClose={() => setSupp(null)} title="NS bổ sung GĐK" footer={<><Btn onClick={() => setSupp(null)}>Huỷ</Btn><Btn primary onClick={saveSupp}>Lưu</Btn></>}>
        {supp && <div className="space-y-3">
          <Field label="Dự án">{supp.line ? <div className="text-[13px] font-medium">{projectName(c, supp.projectId)}</div> : <SearchSelect value={supp.projectId} onChange={(v: string) => setSupp({ ...supp, projectId: v })} options={projectOptions(c)} className="w-full" />}</Field>
          <Field label="Số tiền (đ)"><MoneyInput value={supp.amount} onChange={(v: number) => setSupp({ ...supp, amount: v })} /></Field>
        </div>}
      </Modal>
      <HistoryModal open={hist} onClose={() => setHist(false)} lines={blockLines} c={c} />
      {node}
    </div>
  );
}

/** Quản lý Khối › «Đăng ký MKT»: GĐ Khối tự đăng ký Ngân sách MKT cho Khối mình (dòng kind 'khoi', tính vào NS Khối). */
export function KhoiRegistration({ c, period, lines, blockIds }: { c: VCtx; period: string; lines: NsLine[]; blockIds: string[] }) {
  const { toast, node } = useToast();
  const [bpick, setBpick] = useState(blockIds[0] || '');
  const bid = blockIds.includes(bpick) ? bpick : blockIds[0] || '';
  const mine = lines.filter((l) => l.kind === 'khoi' && l.ownerUid === c.uid && l.period === period && l.blockId === bid && !l.deleted);
  useLocks(c.db);
  const open = windowOpenFor(c, period);
  const openEdit = windowOpenFor(c, period, 'nsEdit');
  const [pid, setPid] = useState('');
  const [amt, setAmt] = useState(0);
  const [edit, setEdit] = useState<Record<string, number>>({});
  const [hist, setHist] = useState(false);
  const canReg = canRegisterAsKhoi(c.role) && !!bid && c.myBlockIds.includes(bid);
  const total = mine.reduce((s, l) => s + Number(l.amount || 0), 0);
  const actor = { uid: c.uid, role: c.role, blockIds: c.myBlockIds };

  const add = async () => {
    if (!pid || amt <= 0) return toast('Chọn dự án và nhập số tiền', 'err');
    const ck = checkEdit(actor, { kind: 'khoi', blockId: bid, ownerUid: c.uid }, { windowOpen: open, isNew: true });
    if (!ck.ok) return toast(ck.reason!, 'err');
    try {
      await saveNsLine(c, { kind: 'khoi', period, blockId: bid, projectId: pid, owner: { uid: c.uid, name: c.name, email: c.email }, existing: lines.find((l) => l.kind === 'khoi' && l.ownerUid === c.uid && l.blockId === bid && l.projectId === pid && l.period === period) || null, amount: amt });
      setPid(''); setAmt(0); toast('Đã lưu đăng ký');
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const save = async (l: NsLine) => {
    try { await saveNsLine(c, { kind: 'khoi', period, blockId: l.blockId, projectId: l.projectId, existing: l, amount: edit[l.id] }); setEdit((e) => { const n = { ...e }; delete n[l.id]; return n; }); toast('Đã cập nhật'); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const del = async (l: NsLine) => {
    if (!window.confirm(`Xoá đăng ký NS dự án ${projectName(c, l.projectId)}?`)) return;
    { const lk = lockBlock(c.role, 'nsEdit', l.period); if (lk) return toast(lk, 'err'); }
    try { await deleteNsLine(c, l, true); toast('Đã xoá'); } catch (e: any) { toast('Không xoá được: ' + (e?.code || e?.message), 'err'); }
  };

  if (!canReg) return <Card className="p-5 text-[13px] text-[var(--mh-text-2)]" data-testid="vn-khoi-reg-denied">{!canRegisterAsKhoi(c.role) ? 'Mục «Đăng ký MKT» dành cho Giám đốc Khối / Trợ lý Khối.' : 'Bạn chưa phụ trách Khối nào.'}</Card>;

  return (
    <div className="space-y-3" data-testid="vn-khoi-reg">
      {blockIds.length > 1 && <Field label="Khối"><SearchSelect value={bid} onChange={setBpick} options={blockIds.map((b) => ({ value: b, label: blockName(c, b) }))} /></Field>}
      <WindowBanner c={c} period={period} />
      <Card className="p-4">
        <div className="text-[13px] font-semibold mb-2">Đăng ký mới · Khối {blockName(c, bid)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_auto] gap-2 items-end">
          <Field label="Dự án"><SearchSelect value={pid} onChange={setPid} options={projectOptions(c, mine.map((m) => m.projectId))} className="w-full" disabled={!open} /></Field>
          <Field label="Ngân sách (đ)"><MoneyInput value={amt} onChange={setAmt} disabled={!open} /></Field>
          <Btn primary onClick={add} disabled={!open}>+ Thêm</Btn>
        </div>
        <div className="text-[11px] text-[var(--mh-text-3)] mt-2">NS này tính vào NS Khối (cột «NS GĐ Khối»). Ai đăng ký MKT đều phải nộp Báo cáo tuần.</div>
      </Card>
      <Card>
        <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--mh-border)]"><div className="font-semibold text-[14px] flex-1">NS tôi đã đăng ký</div><Badge c="info">Tổng {fmt(total)} đ</Badge><Btn small onClick={() => setHist(true)}>Lịch sử</Btn></div>
        {!mine.length ? <Empty>Chưa đăng ký dự án nào trong kỳ này</Empty> : (
          <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Dự án</Th><PctTh /><Th r>Ngân sách (đ)</Th><Th>Cập nhật</Th><Th></Th></tr></thead><tbody>
            {mine.map((l) => (
              <tr key={l.id}>
                <Td><div className="font-medium">{projectName(c, l.projectId)}</div></Td>
                <PctTd c={c} pid={l.projectId} period={period} />
                <Td r>{edit[l.id] != null ? <MoneyInput value={edit[l.id]} onChange={(v: number) => setEdit({ ...edit, [l.id]: v })} className="w-[120px] sm:w-[160px] ml-auto" /> : <b>{fmt(l.amount)}</b>}</Td>
                <Td className="text-[12px] text-[var(--mh-text-2)] whitespace-nowrap">{vnTime(l.updatedAt)}</Td>
                <Td r className="whitespace-nowrap">{pastBlock(c.role, 'ns', l.period) ? <PastTag /> : openEdit && (edit[l.id] != null
                  ? <><Btn small primary onClick={() => save(l)}>Lưu</Btn> <Btn small onClick={() => setEdit((e) => { const n = { ...e }; delete n[l.id]; return n; })}>Huỷ</Btn></>
                  : <><Btn small onClick={() => setEdit({ ...edit, [l.id]: Number(l.amount) })}>Sửa</Btn> <Btn small danger onClick={() => del(l)}>Xoá</Btn></>)}</Td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Card>
      <HistoryModal open={hist} onClose={() => setHist(false)} lines={lines.filter((l) => l.ownerUid === c.uid && l.period === period && l.kind === 'khoi')} c={c} />
      {node}
    </div>
  );
}
