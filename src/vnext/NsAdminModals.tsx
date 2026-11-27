/** MC-6 — modal Super Admin: thêm / sửa / xoá đăng ký NS của user (dùng trong TeamBudget). */
import React, { useEffect, useMemo, useState } from 'react';
import { Btn, Field, Input, Modal, MoneyInput, SearchSelect, fmt } from './ui';
import { type VCtx, projectName, userName, uidOf } from './ctx';
import { nsLineId, isNsLinePaid, type NsLine } from '../../lib/vnext/budget';
import { periodLabel } from '../../lib/vnext/period';
import { SUPPORT_LABEL } from '../../lib/vnext/support';
import { reasonOk, deleteConfirmOk, planProjectChange, willNeedReapproval, type WeeklySnapItem } from '../../lib/vnext/nsAdmin';
import { saCreateNsLine, saUpdateNsLine, saDeleteNsLine, previewWeeklyForNsLine, previewNtForNsLine, syncNsAmount } from './nsActions';
import type { NsSyncRequest } from '../../lib/vnext/nsSync';
import { pushNotif, khoiManagers } from './notify';

type Toast = (m: string, kind?: 'ok' | 'err' | string, retry?: () => void) => void;
type Opts = { value: string; label: string }[];

const Notify = ({ v, set, disabled }: { v: boolean; set: (b: boolean) => void; disabled?: boolean }) => (
  <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v} disabled={disabled} onChange={(e) => set(e.target.checked)} data-testid="vn-sa-ns-notify" /> Gửi thông báo cho user</label>
);

export function SaAddModal({ c, teamId, period, lines, projectOpts, onClose, toast }: { c: VCtx; teamId: string; period: string; lines: NsLine[]; projectOpts: Opts; onClose: () => void; toast: Toast }) {
  const [uid, setUid] = useState('');
  const [pid, setPid] = useState('');
  const [amt, setAmt] = useState(0);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const members = useMemo(() => c.users.filter((u) => u.teamId === teamId && (u.status || 'active') !== 'inactive' && u.isActive !== false), [c.users, teamId]);
  const userOpts = [{ value: '', label: '— Chọn user —' }, ...members.map((u) => ({ value: uidOf(u), label: `${u.name || u.displayName || u.email || uidOf(u)}${u.email ? ` · ${u.email}` : ''}` }))];
  const submit = async () => {
    if (!uid) return toast('Chọn user', 'err');
    if (!pid) return toast('Chọn dự án', 'err');
    if (!(amt > 0)) return toast('Số tiền phải > 0', 'err');
    if (!reasonOk(reason)) return toast('Bắt buộc nhập lý do (≥ 3 ký tự)', 'err');
    const id = nsLineId('user', period, teamId, pid, uid);
    const ex = lines.find((l) => l.id === id) || null;
    if (ex && !ex.deleted) return toast('User đã có đăng ký dự án này trong kỳ — hãy dùng «Sửa»', 'err');
    const u = members.find((x) => uidOf(x) === uid);
    setBusy(true);
    try {
      await saCreateNsLine(c, { period, teamId, owner: { uid, name: u?.name || u?.displayName || '', email: u?.email || '' }, projectId: pid, amount: amt, reason: reason.trim(), notify, existing: ex });
      toast('Đã thêm đăng ký cho user'); onClose();
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Thêm đăng ký NS cho user (Super Admin)" footer={<><Btn onClick={onClose}>Huỷ</Btn><Btn primary onClick={submit} disabled={busy} data-testid="vn-sa-ns-add-save">Lưu</Btn></>}>
      <div className="space-y-3" data-testid="vn-sa-ns-add-modal">
        <div className="text-[12px] text-[var(--mh-text-2)]">{periodLabel(period)}</div>
        <Field label="User (thành viên Phòng)"><SearchSelect value={uid} onChange={setUid} options={userOpts} className="w-full" /></Field>
        <Field label="Dự án"><SearchSelect value={pid} onChange={setPid} options={projectOpts} className="w-full" /></Field>
        <Field label="Số tiền (đ)"><MoneyInput value={amt} onChange={setAmt} /></Field>
        <Field label="Lý do (bắt buộc, ≥ 3 ký tự)"><Input value={reason} onChange={(e: any) => setReason(e.target.value)} data-testid="vn-sa-ns-reason" /></Field>
        <Notify v={notify} set={setNotify} />
      </div>
    </Modal>
  );
}

export function SaEditModal({ c, line, lines, status, paid, projectOpts, onClose, toast }: { c: VCtx; line: NsLine; lines: NsLine[]; status: string; paid: boolean; projectOpts: Opts; onClose: () => void; toast: Toast }) {
  const [pid, setPid] = useState(line.projectId);
  const [amt, setAmt] = useState(Number(line.amount || 0));
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ request: NsSyncRequest; preview: Awaited<ReturnType<typeof syncNsAmount>> } | null>(null);
  const [error, setError] = useState('');
  const reappr = willNeedReapproval(status, { amount: Number(line.amount || 0), projectId: line.projectId }, { amount: amt, projectId: pid });
  const notifyManagers = (lineId: string) => {
    if (reappr) for (const u of khoiManagers(c, line.blockId)) void pushNotif(c, u, { type: 'reapproval', title: `Cần duyệt lại: ${line.ownerName || userName(c, line.ownerUid)} · ${projectName(c, pid)}`, body: `NS đã duyệt bị Super Admin điều chỉnh → ${fmt(amt)} đ`, link: '/quan-ly-khoi', refId: lineId });
  };
  const submit = async () => {
    if (busy || paid) return;
    if (!pid) return toast('Chọn dự án', 'err');
    if (!(amt > 0)) return toast('Số tiền phải > 0', 'err');
    if (pid === line.projectId && amt === Number(line.amount)) return onClose();
    if (!reasonOk(reason)) return toast('Bắt buộc nhập lý do (≥ 3 ký tự)', 'err');
    const plan = planProjectChange(line, pid);
    const exNew = plan.changed ? lines.find((l) => l.id === plan.newId) || null : null;
    if (exNew && !exNew.deleted) return toast('User đã có đăng ký ở dự án đó — hãy sửa dòng kia', 'err');
    setBusy(true);
    try {
      if (!plan.changed) {
        const request = {
          lineId: line.id, amount: amt, expectedAmount: Number(line.amount), expectedUpdatedAt: line.updatedAt ?? null,
          operationId: crypto.randomUUID(), reason: reason.trim(), notify,
        };
        const preview = await syncNsAmount('preview', request);
        setError('');
        setConfirmation({ request, preview });
        return;
      }
      await saUpdateNsLine(c, { line, amount: amt, projectId: pid, reason: reason.trim(), notify, existingNew: exNew, supportStatus: status });
      notifyManagers(plan.newId);
      toast('Đã cập nhật'); onClose();
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); } finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!confirmation || busy || paid) return;
    setBusy(true);
    setError('');
    try {
      const result = await syncNsAmount('commit', { ...confirmation.request, version: confirmation.preview.version });
      if (!result.replayed) notifyManagers(result.lineId);
      toast(result.notificationFailed ? 'Đã cập nhật. Gửi thông báo cho user thất bại.' : 'Đã cập nhật');
      onClose();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (confirmation) {
    const { preview, request } = confirmation;
    const back = () => { if (!busy) setConfirmation(null); };
    return (
      <Modal open onClose={back} title="Xác nhận đồng bộ số tiền NS" footer={<><Btn onClick={back} disabled={busy}>Quay lại</Btn><Btn primary onClick={confirm} disabled={busy || paid} data-testid="vn-sa-ns-sync-confirm">Xác nhận lưu</Btn></>}>
        <div className="space-y-3 text-[13px]" data-testid="vn-sa-ns-sync-modal">
          <div>{line.ownerName || userName(c, line.ownerUid)} · {projectName(c, line.projectId)} · {periodLabel(line.period)}</div>
          <div className="text-base font-semibold">{fmt(preview.before.amount)} → {fmt(preview.after.amount)} đ</div>
          {preview.locked && <div className="font-semibold text-[var(--mh-warn)]">Kỳ đã khoá — Super Admin sửa kèm lý do, sẽ ghi audit</div>}
          <div><b>Sẽ tự cập nhật</b><p>Tổng NS Phòng/Khối, đối chiếu NS–NT, Dashboard/Tổng quan, KPI Báo cáo tuần và tổng đã duyệt đều dùng số mới.</p></div>
          <div><b>Ghi chú</b><p>Khoản đã duyệt có thể hiện «Đã sửa sau duyệt» hoặc «Cần duyệt lại». Tổng đã duyệt vẫn tính số mới.</p></div>
          <div><b>Giữ nguyên</b><p>Bản NT đã lưu (tiền NT, hoá đơn, ảnh), snapshot nsAtSubmit của báo cáo tuần đã nộp và ntKeys cùng user, dự án, kỳ.</p></div>
          <Field label="Lý do"><div className="whitespace-pre-wrap break-words">{request.reason}</div></Field>
          <Notify v={request.notify} set={(value) => {
            if (!busy && !error) setConfirmation({ preview, request: { ...request, notify: value } });
          }} disabled={busy || !!error} />
          {paid && <div role="alert">Dòng NS đã chi tiền.</div>}
          {error && <div role="alert" className="text-[var(--mh-err)]">{error}</div>}
        </div>
      </Modal>
    );
  }
  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Sửa đăng ký NS (Super Admin)" footer={<><Btn onClick={onClose} disabled={busy}>Huỷ</Btn><Btn primary onClick={submit} disabled={busy || paid} data-testid="vn-sa-ns-edit-save">Lưu</Btn></>}>
      <div className="space-y-3" data-testid="vn-sa-ns-edit-modal">
        <div className="text-[13px]"><b>{line.ownerName || userName(c, line.ownerUid)}</b> · {periodLabel(line.period)}</div>
        <Field label="Dự án"><SearchSelect value={pid} onChange={setPid} options={projectOpts} className="w-full" /></Field>
        {pid !== line.projectId && <div className="text-[12px] text-[var(--mh-warn)]">Đổi dự án = tạo dòng mới ở dự án mới và xoá mềm dòng cũ.</div>}
        <Field label="Số tiền (đ)"><MoneyInput value={amt} onChange={setAmt} /></Field>
        {reappr && <div className="text-[12px] text-[var(--mh-warn)]" data-testid="vn-sa-ns-reappr-warn">Khoản này đã được duyệt hỗ trợ — sửa sẽ chuyển sang «Cần duyệt lại».</div>}
        <Field label="Lý do (bắt buộc, ≥ 3 ký tự)"><Input value={reason} onChange={(e: any) => setReason(e.target.value)} data-testid="vn-sa-ns-reason" /></Field>
        <Notify v={notify} set={setNotify} />
      </div>
    </Modal>
  );
}

export function SaDeleteModal({ c, line, support, status, onClose, toast }: { c: VCtx; line: NsLine; support: any; status: string; onClose: () => void; toast: Toast }) {
  const [hard, setHard] = useState(false);
  const [reason, setReason] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [nt, setNt] = useState<number | null | undefined>(undefined);
  const [weekly, setWeekly] = useState<{ docs: WeeklySnapItem[]; count: number } | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    previewNtForNsLine(c, line).then((n) => { if (!off) setNt(n); });
    previewWeeklyForNsLine(c, line).then((w) => { if (!off) setWeekly(w); }).catch(() => { if (!off) setWeekly(null); });
    return () => { off = true; };
  }, [c, line]);
  const paid = isNsLinePaid(line, support);
  const ready = nt !== undefined && weekly !== undefined;
  const can = ready && !paid && !busy && reasonOk(reason) && deleteConfirmOk(word);
  const submit = async () => {
    if (!can) return;
    setBusy(true);
    try {
      await saDeleteNsLine(c, line, hard, reason.trim(), { ntCount: nt ?? null, supportStatus: status }, weekly?.docs || []);
      toast(hard ? 'Đã xoá hẳn' : 'Đã xoá mềm (có thể khôi phục)'); onClose();
    } catch (e: any) { toast('Không xoá được: ' + (e?.code || e?.message), 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Xoá đăng ký NS (Super Admin)" footer={<><Btn onClick={onClose}>Huỷ</Btn><Btn danger onClick={submit} disabled={!can} title={paid ? 'Đã chi tiền — không xoá được' : undefined} data-testid="vn-sa-ns-delete-confirm">Xoá</Btn></>}>
      <div className="space-y-3" data-testid="vn-sa-ns-delete-modal">
        <div className="text-[13px]"><b>{line.ownerName || userName(c, line.ownerUid)}</b> · {projectName(c, line.projectId)} · {periodLabel(line.period)} · <b>{fmt(line.amount)} đ</b></div>
        <div className="rounded-lg border border-[var(--mh-border)] bg-[var(--mh-surface-2)] p-3 text-[12px] space-y-1" data-testid="vn-sa-ns-impact">
          <div className="font-semibold">Ảnh hưởng</div>
          <div>Hỗ trợ MKT: <b>{status ? ((SUPPORT_LABEL as Record<string, string>)[status] || status) : 'Chưa có'}</b></div>
          <div>Nghiệm thu đang gắn: <b>{nt === undefined ? 'đang tải…' : nt === null ? 'không đọc được' : nt}</b></div>
          {typeof nt === 'number' && nt > 0 && <div className="text-[11px] text-[var(--mh-text-3)]">Bản Nghiệm thu giữ nguyên, sẽ hiện cờ «Không còn đăng ký NS».</div>}
          <div>Mục Báo cáo tuần sẽ bị gỡ: <b>{weekly === undefined ? 'đang tải…' : weekly === null ? 'không đọc được' : `${weekly.count} (${weekly.docs.length} báo cáo)`}</b></div>
          {weekly && weekly.count > 0 && <div className="text-[11px] text-[var(--mh-text-3)]">Các mục này được lưu trong Nhật ký để khôi phục khi Khôi phục dòng (chỉ với xoá mềm).</div>}
          {paid && <div className="text-[var(--mh-err)] font-semibold">Đã chi tiền — không xoá được</div>}
        </div>
        <div className="space-y-1 text-[13px]">
          <label className="flex items-center gap-2"><input type="radio" name="sa-del-kind" checked={!hard} onChange={() => setHard(false)} data-testid="vn-sa-ns-del-soft" /> Xoá mềm (khôi phục được)</label>
          <label className="flex items-center gap-2"><input type="radio" name="sa-del-kind" checked={hard} onChange={() => setHard(true)} data-testid="vn-sa-ns-del-hard" /> Xoá hẳn</label>
        </div>
        <Field label="Lý do (bắt buộc, ≥ 3 ký tự)"><Input value={reason} onChange={(e: any) => setReason(e.target.value)} data-testid="vn-sa-ns-reason" /></Field>
        <Field label="Gõ XOA để xác nhận"><Input value={word} onChange={(e: any) => setWord(e.target.value)} placeholder="XOA" data-testid="vn-sa-ns-del-word" /></Field>
      </div>
    </Modal>
  );
}
