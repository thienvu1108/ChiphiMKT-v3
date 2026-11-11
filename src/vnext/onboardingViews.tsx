import { NameReqButton } from './nameRequest';
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { Card, Btn, Badge, Field, Select, Input, Modal, Empty, useToast, vnTime, SearchSelect, Overlay } from './ui';
import { type VCtx, isAdm, vnCan, gdkdTeams, teamName, blockName, blockOfTeam, teamsOfBlock, userName, notifyUser } from './ctx';
import { asArr } from './ctx';
import {
  ACCESS_REQUESTS, APPROVER_HINT, BO_POSITIONS, BO_UNIT_LABEL, KD_POSITIONS, POSITION_LABEL, approvalUserPatch, canApprove,
  onboardingNeedsKyc, positionNeedsTeam, validateRequest, gdkdCount, needsOnboarding, type AccessRequest, type BoUnit, type Position,
} from '../../lib/vnext/onboarding';
import { isTeamActive } from '../../lib/vnext/budget';
import { isKycComplete } from '../../lib/vnext/kyc';
import { useMyKyc, KycForm } from './KycViews';

const nowIso = () => new Date().toISOString();
const posLabel = (p?: string) => (POSITION_LABEL as any)[p || ''] || p || '—';
export const approverOf = (c: VCtx) => ({ uid: c.uid, role: c.role, blockIds: c.myBlockIds, gdkdTeamIds: gdkdTeams(c) });

export function useMyRequest(c: VCtx) {
  const [r, setR] = useState<AccessRequest | null | undefined>(undefined);
  useEffect(() => {
    if (!c.uid) return;
    return onSnapshot(doc(c.db, ACCESS_REQUESTS, c.uid), (s) => setR(s.exists() ? (s.data() as AccessRequest) : null), () => setR(null));
  }, [c.db, c.uid]);
  return r;
}

/* ----------------------------- Đăng ký (người dùng) ----------------------------- */
export function RequestForm({ c, kind, initial, onDone, onDeptChange }: { c: VCtx; kind: 'onboarding' | 'transfer'; initial?: Partial<AccessRequest>; onDone?: () => void; onDeptChange?: (dept: string) => void }) {
  const { toast, node: toastNode } = useToast();
  const [dept, setDept] = useState<'kd' | 'bo' | ''>(kind === 'transfer' ? 'kd' : (initial?.dept as any) || '');
  useEffect(() => { onDeptChange?.(dept); }, [dept, onDeptChange]);
  const [position, setPosition] = useState<Position | ''>((initial?.position as any) || '');
  const [blockId, setBlockId] = useState(initial?.blockId || '');
  const [teamId, setTeamId] = useState(initial?.teamId || '');
  const [alsoTeam, setAlsoTeam] = useState('');
  const [boUnit, setBoUnit] = useState<BoUnit | ''>((initial?.boUnit as any) || '');
  const [name, setName] = useState(initial?.name || c.name || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const teamsHere = useMemo(() => (blockId ? teamsOfBlock(c, blockId).filter(isTeamActive) : []), [c.teams, blockId]);
  const positions = kind === 'transfer' ? (['gdkd', 'nvkd'] as Position[]) : dept === 'bo' ? BO_POSITIONS : dept === 'kd' ? KD_POSITIONS : [];

  async function submit() {
    const b = c.blocks.find((x) => x.id === blockId);
    const t = c.teams.find((x) => x.id === teamId);
    const r: any = { uid: c.uid, email: c.email, name: name.trim(), kind, dept, position, status: 'pending', createdAt: nowIso() };
    if (dept === 'kd') { r.blockId = blockId; r.blockCode = b?.blockCode || ''; }
    if (position && positionNeedsTeam(position as Position) && t) { r.teamId = t.id; r.teamName = t.name || ''; r.teamCode = t.teamCode || ''; }
    if (dept === 'bo') r.boUnit = boUnit;
    if (position === 'gd_khoi' && alsoTeam) { const at = c.teams.find((x) => x.id === alsoTeam); r.alsoGdkdTeamId = alsoTeam; r.alsoGdkdTeamName = at?.name || ''; }
    if (kind === 'transfer') { r.fromTeamId = c.teamId; r.fromBlockId = blockOfTeam(c, c.teamId) || ''; }
    if (note.trim()) r.note = note.trim().slice(0, 500);
    const err = validateRequest(r);
    if (err) return toast(err);
    setBusy(true);
    try { await setDoc(doc(c.db, ACCESS_REQUESTS, c.uid), r); toast('Đã gửi yêu cầu'); onDone?.(); }
    catch (e: any) { toast('Không gửi được: ' + (e?.code || e?.message)); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3" data-testid={`vn-${kind}-form`}>
      {toastNode}
      {kind === 'onboarding' && (
        <Field label="1. Bộ phận">
          <div className="flex gap-2">
            {(['kd', 'bo'] as const).map((d) => (
              <Btn key={d} primary={dept === d} onClick={() => { setDept(d); setPosition(''); setBlockId(''); setTeamId(''); setBoUnit(''); }} data-testid={`vn-dept-${d}`}>
                {d === 'kd' ? 'Kinh doanh' : 'BO (Back Office)'}
              </Btn>
            ))}
          </div>
          <p className="text-[12px] text-[var(--mh-text-2)]">Chọn bộ phận bạn đang công tác.</p>
          {dept === 'bo' && <p className="text-[12px] text-[var(--mh-text-2)]">BO không cần khai CCCD, số tài khoản hoặc ngân hàng.</p>}
        </Field>
      )}
      {!!positions.length && (
        <Field label={kind === 'onboarding' ? '2. Chức vụ' : 'Chức vụ ở Phòng mới'}>
          <Select value={position} onChange={(v: any) => { setPosition(v); setTeamId(''); }} data-testid="vn-position"
            options={[{ value: '', label: '— Chọn —' }, ...positions.map((p) => ({ value: p, label: POSITION_LABEL[p] }))]} />
          <p className="text-[12px] text-[var(--mh-text-2)]">Chọn chức vụ hiện tại.</p>
        </Field>
      )}
      {dept === 'kd' && position && (
        <Field label="Khối">
          <SearchSelect value={blockId} onChange={(v: any) => { setBlockId(v); setTeamId(''); }} data-testid="vn-block"
            options={[{ value: '', label: '— Chọn Khối —' }, ...c.blocks.filter((b) => b.status !== 'inactive').map((b) => ({ value: b.id, label: b.name || b.blockCode }))]} />
          <p className="text-[12px] text-[var(--mh-text-2)]">Chọn Khối bạn trực thuộc.</p>
        </Field>
      )}
      {dept === 'kd' && position && positionNeedsTeam(position as Position) && blockId && (
        <Field label="Phòng Kinh doanh (theo Khối)">
          <SearchSelect value={teamId} onChange={setTeamId} data-testid="vn-team"
            options={[{ value: '', label: teamsHere.length ? '— Chọn Phòng —' : 'Khối chưa có Phòng đang hoạt động' }, ...teamsHere.map((t) => ({ value: t.id, label: t.name }))]} />
          <p className="text-[12px] text-[var(--mh-text-2)]">Chọn Phòng Kinh doanh bạn trực thuộc.</p>
        </Field>
      )}
      {dept === 'kd' && position === 'gd_khoi' && blockId && (
        <Field label="Kiêm GĐKD Phòng… (không bắt buộc, Admin duyệt)">
          <SearchSelect value={alsoTeam} onChange={setAlsoTeam} data-testid="vn-also-gdkd"
            options={[{ value: '', label: '— Không kiêm —' }, ...teamsHere.map((t) => ({ value: t.id, label: t.name }))]} />
        </Field>
      )}
      {dept === 'bo' && position && (
        <Field label="Đơn vị">
          <div className="flex gap-2">{(['ban_kd', 'digital'] as BoUnit[]).map((u) => <Btn key={u} primary={boUnit === u} onClick={() => setBoUnit(u)} data-testid={`vn-bo-${u}`}>{BO_UNIT_LABEL[u]}</Btn>)}</div>
          <p className="text-[12px] text-[var(--mh-text-2)]">Chọn đơn vị bạn trực thuộc.</p>
        </Field>
      )}
      <Field label="Họ tên"><Input value={name} onChange={(e: any) => setName(e.target.value)} data-testid="vn-name" /><p className="text-[12px] text-[var(--mh-text-2)]">Nhập họ tên đầy đủ có dấu.</p></Field>
      <Field label="Ghi chú (không bắt buộc)"><Input value={note} onChange={(e: any) => setNote(e.target.value)} /><p className="text-[12px] text-[var(--mh-text-2)]">Bổ sung thông tin để người duyệt xác nhận (có thể bỏ trống).</p></Field>
      {position && <div className="text-[12px] text-[var(--mh-text-2)]">Người duyệt: <b>{APPROVER_HINT[position as Position]}</b></div>}
      <Btn primary disabled={busy} onClick={submit} data-testid="vn-submit">{kind === 'transfer' ? 'Gửi yêu cầu chuyển' : 'Gửi đăng ký'}</Btn>
    </div>
  );
}

export function SignupSteps({cur, dept}: {cur: 1 | 2; dept?: string}) {
 return <div className="flex flex-wrap items-center gap-2 text-[12px] mt-1 mb-2" data-testid="vn-onboarding-steps">
  <span className={cur === 1 ? 'font-bold text-[var(--mh-accent)]' : 'text-[#2E7D32]'}>{cur === 1 ? '①' : '✓'} Đăng ký Phòng</span>
  {onboardingNeedsKyc(dept) && <><span>→</span><span className={cur === 2 ? 'font-bold text-[var(--mh-accent)]' : 'text-[var(--mh-text-3)]'}>② Thông tin thanh toán</span></>}
 </div>;
}

/** Màn hình Chờ duyệt + form đăng ký cho người chưa được duyệt (không còn Quy trình MKT). */
export function OnboardingGate({ c }: { c: VCtx }) {
  const r = useMyRequest(c);
  const [edit, setEdit] = useState(false);
  const [selectedDept, setSelectedDept] = useState('');
  const k = useMyKyc(c);
  if (r === undefined) return <Card className="p-4" data-testid="vn-onboarding-gate"><div className="text-[13px] text-[var(--mh-text-2)]">Đang tải đăng ký tài khoản…</div></Card>;
  const pending = r && r.status === 'pending' && r.kind === 'onboarding';
  const kycStep = !!pending && onboardingNeedsKyc(r?.dept) && !edit && k !== undefined && !isKycComplete(k);
  const steps = (cur: 1 | 2) => <SignupSteps cur={cur} dept={pending && !edit ? r?.dept : selectedDept} />;
  if (kycStep) return (
    <Overlay className="bg-[var(--mh-text)]/60 flex items-center justify-center p-3" testId="vn-onboarding-modal" zClass="z-[1200]">
      <div role="dialog" aria-modal="true" className="w-full max-w-[520px] max-h-[min(90dvh,100%)] flex">
      <Card className="p-4 sm:p-5 w-full max-h-[min(90dvh,100%)] overflow-y-auto shadow-2xl border-l-4 border-l-[var(--mh-accent)] overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]" data-testid="vn-onboarding-kyc">
        <div className="text-[15px] font-bold text-[var(--mh-text)]">Đăng ký tài khoản</div>
        {steps(2)}
        <div className="text-[13px] text-[var(--mh-text-2)] mb-3">Đã gửi đăng ký Phòng. Bước tiếp theo (bắt buộc): khai Số CCCD, Số tài khoản, Tên chủ tài khoản và Ngân hàng.</div>
        <KycForm c={c} uid={c.uid} initial={k} fullName={c.name} submitLabel="Lưu và hoàn tất" />
        <button type="button" className="mt-2 text-[12px] underline text-[var(--mh-navy)]" onClick={() => setEdit(true)} data-testid="vn-onboarding-back">← Sửa đăng ký Phòng</button>
      </Card>
      </div>
    </Overlay>
  );
  // Đã gửi → màn hình trạng thái Chờ duyệt (không modal); chưa gửi/bị từ chối/sửa → form dạng modal.
  const asModal = !(pending && !edit);
  const card = (
    <Card className={(asModal ? 'p-4 sm:p-5 w-full max-w-[520px] max-h-[min(90dvh,100%)] overflow-y-auto shadow-2xl overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]' : 'p-4 sm:p-5') + ' border-l-4 border-l-[var(--mh-accent)]'} data-testid="vn-onboarding-gate">
      <div className="flex items-center justify-between gap-2"><div className="text-[15px] font-bold text-[var(--mh-text)]">Đăng ký tài khoản</div><a href="/huong-dan" className="text-[12px] font-semibold text-indigo-600 underline" data-testid="vn-gate-guide">Xem Hướng dẫn</a></div>
      {pending && !edit ? (
        <div className="mt-2 space-y-2 text-[13px]" data-testid="vn-pending">
          <div><Badge c="warn">Chờ duyệt</Badge> {posLabel(r!.position)}
            {r!.teamId ? ` · ${teamName(c, r!.teamId)}` : r!.blockId ? ` · ${blockName(c, r!.blockId)}` : r!.boUnit ? ` · ${BO_UNIT_LABEL[r!.boUnit as BoUnit]}` : ''}</div>
          <div className="text-[var(--mh-text-2)]">Người duyệt: {APPROVER_HINT[r!.position as Position]}. {r?.dept === 'bo' ? 'Đã hoàn tất đăng ký BO. Không cần khai thông tin thanh toán; vui lòng chờ duyệt.' : <>Sau khi được duyệt vào Phòng KD, bạn sẽ vào thẳng màn <b>Đăng ký Ngân sách MKT</b>.</>}</div>
          <div className="flex gap-2">
            <Btn small onClick={() => setEdit(true)}>Sửa yêu cầu</Btn>
            <Btn small onClick={() => updateDoc(doc(c.db, ACCESS_REQUESTS, c.uid), { status: 'cancelled' })}>Huỷ yêu cầu</Btn>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          {r?.status === 'rejected' && <div className="mb-3 text-[13px] text-[var(--mh-err)]" data-testid="vn-rejected">Yêu cầu bị từ chối: {r.reason || '—'}. Bạn có thể gửi lại.</div>}
          {steps(1)}
          <div className="mb-3 text-[13px] text-[var(--mh-text-2)]">Bắt buộc trước khi dùng hệ thống. Chọn bộ phận và chức vụ. Quyền và Phòng chỉ được cập nhật sau khi được duyệt.</div>
          <RequestForm c={c} kind="onboarding" initial={pending ? r! : undefined} onDone={() => setEdit(false)} onDeptChange={setSelectedDept} />
        </div>
      )}
    </Card>
  );
  if (!asModal) return card;
  return (
    <Overlay className="bg-[var(--mh-text)]/60 flex items-center justify-center p-3" testId="vn-onboarding-modal" zClass="z-[1200]">
      <div role="dialog" aria-modal="true" className="w-full max-w-[520px] max-h-[min(90dvh,100%)] flex">{card}</div>
    </Overlay>
  );
}

/* ----------------------------- Duyệt ----------------------------- */
/** Yêu cầu chờ duyệt trong phạm vi người dùng (truy vấn bằng điều kiện bằng để rules đánh giá được). */
/** Yêu cầu NVKD vào Phòng đã có GĐKD: GĐK/Trợ lý chỉ xem («đang chờ GĐKD duyệt»). */
export function awaitingGdkd(c: VCtx, r: AccessRequest): boolean {
  if (isAdm(c) || r.position !== 'nvkd' || r.kind === 'transfer' || !r.teamId) return false;
  const team = c.teams.find((t) => t.id === r.teamId);
  return gdkdCount(team, c.users) > 0 && !canApprove(approverOf(c), r, { team, users: c.users }).ok;
}
/** Số yêu cầu người này duyệt được (badge). */
export function actionablePending(c: VCtx, reqs: AccessRequest[]): AccessRequest[] {
  return reqs.filter((r) => r.kind !== 'transfer' && (isAdm(c) || canApprove(approverOf(c), r, { team: c.teams.find((t) => t.id === r.teamId), users: c.users }).ok));
}

export function usePendingRequests(c: VCtx, enabled = true) {
  const [rows, setRows] = useState<Record<string, AccessRequest[]>>({});
  const admin = isAdm(c);
  const myTeams = gdkdTeams(c);
  const keys = admin ? ['*'] : [...((c.role === 'gd_khoi' || c.role === 'tro_ly_khoi') ? c.myBlockIds.map((b) => 'b:' + b) : []), ...myTeams.map((t) => 't:' + t)];
  const sig = keys.join(',');
  useEffect(() => {
    if (!enabled || !c.uid || !keys.length) { setRows({}); return; }
    const col = collection(c.db, ACCESS_REQUESTS);
    const unsubs = keys.map((k) => {
      const q = k === '*' ? query(col, where('status', '==', 'pending'))
        : k.startsWith('b:') ? query(col, where('blockId', '==', k.slice(2))) : query(col, where('teamId', '==', k.slice(2)));
      return onSnapshot(q, (s) => setRows((p) => ({ ...p, [k]: s.docs.map((d) => d.data() as AccessRequest) })), () => setRows((p) => ({ ...p, [k]: [] })));
    });
    return () => unsubs.forEach((u) => u());
  }, [c.db, c.uid, sig, enabled]);
  return useMemo(() => {
    const m = new Map<string, AccessRequest>();
    (Object.values(rows).flat() as AccessRequest[]).forEach((r) => { if (r.status === 'pending' && r.uid !== c.uid) m.set(r.uid, r); });
    return [...m.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }, [rows, c.uid]);
}

const tsMs = (v: any) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : Date.parse(v || '') || 0);

export function ApprovalsPanel({ c, filter }: { c: VCtx; filter?: (r: AccessRequest) => boolean }) {
  const { toast, node: toastNode } = useToast();
  // Không còn chuyển Phòng ở Quản lý Khối / Phòng KD (có filter): yêu cầu «Xin chuyển» cũ chỉ hiện ở «Duyệt tài khoản» của Admin.
  const all = usePendingRequests(c).filter((r) => r.kind !== 'transfer' || (isAdm(c) && !filter));
  // Yêu cầu chờ duyệt mới nhất lên đầu.
  const reqs = (filter ? all.filter(filter) : all).slice().sort((a, b) => (Number(awaitingGdkd(c, a)) - Number(awaitingGdkd(c, b))) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const [rej, setRej] = useState<AccessRequest | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');

  async function approve(r: AccessRequest) {
    const team = c.teams.find((t) => t.id === r.teamId);
    const v = canApprove(approverOf(c), r, { team, users: c.users });
    if (!v.ok) return toast(v.reason || 'Không có quyền duyệt');
    setBusy(r.uid);
    try {
      const b = writeBatch(c.db);
      const t = nowIso();
      b.update(doc(c.db, ACCESS_REQUESTS, r.uid), { status: 'approved', decidedBy: c.uid, decidedByName: c.name, decidedAt: t });
      const cur = c.users.find((u) => (u.uid || u.id) === r.uid);
      b.update(doc(c.db, 'users', r.uid), approvalUserPatch(r, cur?.role, c.uid, t));
      const also = (r as any).alsoGdkdTeamId ? c.teams.find((t) => t.id === (r as any).alsoGdkdTeamId) : null;
      if (r.position === 'gd_khoi' && also && !asArr(also.gdkdUids).includes(r.uid)) {
        if (gdkdCount(also, c.users) >= 4) throw new Error(`Phòng ${also.name} đã đủ 4 GĐKD — duyệt GĐK không kèm kiêm GĐKD hoặc gỡ bớt GĐKD`);
        b.update(doc(c.db, 'teams', also.id), { gdkdUids: [...asArr(also.gdkdUids), r.uid], updatedAt: t });
      }
      if (r.position === 'gdkd' && team && !asArr(team.gdkdUids).includes(r.uid))
        b.update(doc(c.db, 'teams', team.id), { gdkdUids: [...(team.gdkdUids || []), r.uid], gdkdApprovedUid: r.uid, updatedAt: t });
      await b.commit();
      await notifyUser(c, { uid: r.uid, email: r.email }, 'Yêu cầu đã được duyệt', `${posLabel(r.position)}${r.teamId ? ' · ' + teamName(c, r.teamId) : ''}`).catch(() => {});
      toast('Đã duyệt');
    } catch (e: any) { toast('Không duyệt được: ' + (e?.code || e?.message)); }
    finally { setBusy(''); }
  }
  async function reject() {
    if (!rej) return;
    if (reason.trim().length < 3) return toast('Nhập lý do từ chối');
    setBusy(rej.uid);
    try {
      await updateDoc(doc(c.db, ACCESS_REQUESTS, rej.uid), { status: 'rejected', decidedBy: c.uid, decidedByName: c.name, decidedAt: nowIso(), reason: reason.trim() });
      await notifyUser(c, { uid: rej.uid, email: rej.email }, 'Yêu cầu bị từ chối', reason.trim()).catch(() => {});
      toast('Đã từ chối'); setRej(null); setReason('');
    } catch (e: any) { toast('Không từ chối được: ' + (e?.code || e?.message)); }
    finally { setBusy(''); }
  }

  // Admin: tài khoản đã đăng nhập nhưng chưa gửi yêu cầu đăng ký (để biết ai đang chờ, gán quyền thủ công nếu cần).
  const reqUids = new Set(all.map((r) => r.uid));
  const notSubmitted = isAdm(c) && !filter
    ? c.users.filter((u: any) => !u.linkedToUid && !u.mergedInto && needsOnboarding(u) && !reqUids.has(u.uid || u.id))
        .sort((a: any, b: any) => tsMs(b.createdAt) - tsMs(a.createdAt))
    : [];
  const notSubmittedNode = notSubmitted.length ? (
    <Card className="p-3" data-testid="vn-not-submitted">
      <div className="text-[13px] font-semibold mb-1">Đã đăng nhập, chưa gửi đăng ký ({notSubmitted.length})</div>
      <div className="text-[12px] text-[var(--mh-text-2)] mb-2">Người dùng cần chọn Phòng/Chức vụ trong màn Đăng ký tài khoản. Admin có thể gán quyền trực tiếp ở Quản lý người dùng.</div>
      <div className="divide-y divide-[var(--mh-border)]">{notSubmitted.slice(0, 50).map((u: any) => (
        <div key={u.uid || u.id} className="py-1.5 text-[12.5px] flex flex-wrap gap-2" data-testid="vn-not-submitted-row"><b>{u.fullName || u.displayName || '(chưa có tên)'}</b><span className="text-[var(--mh-text-2)]">{u.email}</span><Badge c="warn">Chưa đăng ký</Badge></div>
      ))}</div>
    </Card>
  ) : null;

  if (!reqs.length) return <>{toastNode}<Empty>Không có yêu cầu chờ duyệt.</Empty>{notSubmittedNode}</>;
  return (
    <div className="space-y-2" data-testid="vn-approvals">
      {toastNode}
      <div className="text-[13px] font-semibold" data-testid="vn-approvals-pending-head">Tài khoản mới chờ duyệt ({reqs.length}) · mới nhất trước</div>
      {reqs.map((r) => {
        const team = c.teams.find((t) => t.id === r.teamId);
        const v = canApprove(approverOf(c), r, { team, users: c.users });
        const wait = awaitingGdkd(c, r);
        return (
          <Card key={r.uid} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2" data-testid="vn-approval-row">
            <div className="flex-1 text-[13px]">
              <div><b>{r.name}</b> <span className="text-[var(--mh-text-2)]">{r.email}</span> {r.kind === 'transfer' && <Badge c="new">Xin chuyển</Badge>}</div>
              <div className="text-[var(--mh-text-2)]">
                {posLabel(r.position)}{r.blockId ? ` · ${blockName(c, r.blockId)}` : ''}{r.teamId ? ` · ${teamName(c, r.teamId)}` : ''}{(r as any).alsoGdkdTeamId ? ` · kiêm GĐKD ${teamName(c, (r as any).alsoGdkdTeamId)}` : ''}
                {r.boUnit ? ` · ${BO_UNIT_LABEL[r.boUnit as BoUnit]}` : ''}{r.kind === 'transfer' && r.fromTeamId ? ` (từ ${teamName(c, r.fromTeamId)})` : ''} · {vnTime(r.createdAt)}
              </div>
              {r.note && <div className="text-[12px]">Ghi chú: {r.note}</div>}
              {!v.ok && !wait && <div className="text-[12px] text-[var(--mh-warn)]" data-testid="vn-approval-blocked">{v.reason}</div>}
            </div>
            {wait ? <span data-testid="vn-awaiting-gdkd"><Badge c="warn">đang chờ GĐKD duyệt</Badge></span> : (
            <div className="flex gap-2">
              <Btn small primary disabled={!v.ok || busy === r.uid} onClick={() => approve(r)} data-testid="vn-approve">Duyệt</Btn>
              <Btn small danger disabled={busy === r.uid} onClick={() => { setRej(r); setReason(''); }} data-testid="vn-reject">Từ chối</Btn>
            </div>)}
            {r.kind !== 'transfer' && (v.ok || isAdm(c)) && <NameReqButton c={c} target={{ uid: r.uid, email: r.email, name: r.name, teamId: r.teamId }} />}
          </Card>
        );
      })}
      {notSubmittedNode}
      <Modal open={!!rej} onClose={() => setRej(null)} title={`Từ chối: ${rej?.name || ''}`}
        footer={<><Btn onClick={() => setRej(null)}>Huỷ</Btn><Btn danger onClick={reject} data-testid="vn-reject-confirm">Từ chối</Btn></>}>
        <Field label="Lý do (bắt buộc)"><Input value={reason} onChange={(e: any) => setReason(e.target.value)} data-testid="vn-reject-reason" /></Field>
      </Modal>
    </div>
  );
}

/* ----------------------------- Admin chuyển trực tiếp (đã bỏ «Xin chuyển Phòng» — chỉ Admin chuyển Phòng) ----------------------------- */
export function TransferPanel({ c }: { c: VCtx; canRequest?: boolean }) {
  const { toast, node: toastNode } = useToast();
  const admin = isAdm(c);
  const [uid, setUid] = useState('');
  const [tid, setTid] = useState('');
  async function directMove() {
    const t = c.teams.find((x) => x.id === tid);
    const u = c.users.find((x) => (x.uid || x.id) === uid);
    if (!t || !u) return toast('Chọn người dùng và Phòng');
    try {
      const b = writeBatch(c.db);
      b.update(doc(c.db, 'users', uid), { teamId: t.id, teamName: t.name || '', teamCode: t.teamCode || '', updatedAt: nowIso(),
        vnOnboarding: { ...(u.vnOnboarding || {}), status: 'approved', teamId: t.id, blockId: t.blockId || '', approvedBy: c.uid, approvedAt: nowIso() } });
      await b.commit();
      await notifyUser(c, { uid, email: u.email }, 'Bạn đã được chuyển Phòng', `Phòng mới: ${t.name}`).catch(() => {});
      toast(`Đã chuyển ${userName(c, uid)} sang ${t.name}`);
    } catch (e: any) { toast('Không chuyển được: ' + (e?.code || e?.message)); }
  }
  return (
    <div className="space-y-4" data-testid="vn-transfer">
      {toastNode}
      {admin && (
        <Card className="p-4" data-testid="vn-direct-move">
          <div className="font-semibold text-[14px] mb-2">Admin chuyển trực tiếp</div>
          <div className="flex flex-wrap gap-2 items-end">
            <Field label="Người dùng"><SearchSelect value={uid} onChange={setUid} options={[{ value: '', label: '— Chọn —' }, ...c.users.filter((u) => u.email).map((u) => ({ value: u.uid || u.id, label: `${u.fullName || u.email} (${teamName(c, u.teamId) || '—'})` }))]} /></Field>
            <Field label="Phòng mới"><SearchSelect value={tid} onChange={setTid} options={[{ value: '', label: '— Chọn —' }, ...c.teams.filter(isTeamActive).map((t) => ({ value: t.id, label: t.name }))]} /></Field>
            <Btn primary onClick={directMove}>Chuyển</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}


/* ----------------------------- B5: Popup chờ duyệt khi đăng nhập ----------------------------- */
const POPUP_KEY = (uid: string) => 'vn-approvals-popup:' + uid;
/** GĐ Khối / Trợ lý Khối (Khối mình) và GĐKD (Phòng mình): 1 lần mỗi phiên đăng nhập, khi có yêu cầu mình duyệt được. */
export function PendingApprovalsPopup({ c, onGo }: { c: VCtx; onGo: (r?: AccessRequest) => void }) {
  const eligible = (c.role === 'gd_khoi' || c.role === 'tro_ly_khoi' || c.role === 'gdkd') && vnCan(c, 'vn.approvals.review') && vnCan(c, 'vn.approvals.login_popup');
  const pending = usePendingRequests(c, eligible);
  const mine = actionablePending(c, pending);
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem(POPUP_KEY(c.uid)) === '1'; } catch { return false; } });
  const [seen, setSeen] = useState(false);
  useEffect(() => { if (mine.length) setSeen(true); }, [mine.length]);
  if (!eligible || dismissed || !seen) return null;
  const close = () => { try { sessionStorage.setItem(POPUP_KEY(c.uid), '1'); } catch { /* ignore */ } setDismissed(true); };
  const ids = new Set(mine.map((r) => r.uid));
  return (
    <Modal open onClose={close} wide title={`Thành viên chờ duyệt (${mine.length})`}
      footer={<><Btn onClick={close} data-testid="vn-appr-popup-later">Để sau</Btn><Btn primary onClick={() => { const r = mine[0]; close(); onGo(r); }} data-testid="vn-appr-popup-go">Đi tới mục Chờ duyệt ›</Btn></>}>
      <div data-testid="vn-appr-popup" className="space-y-2">
        <div className="text-[12px] text-[var(--mh-text-2)]">{c.role === 'gdkd' ? 'Yêu cầu vào Phòng KD của bạn.' : 'Yêu cầu vào các Phòng KD / chức vụ thuộc Khối của bạn.'} Duyệt hoặc từ chối ngay tại đây.</div>
        {!mine.length ? <Empty>Đã xử lý hết yêu cầu 🎉</Empty> : <ApprovalsPanel c={c} filter={(r) => ids.has(r.uid)} />}
      </div>
    </Modal>
  );
}
