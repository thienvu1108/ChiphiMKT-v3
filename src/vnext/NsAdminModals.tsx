/** MC-6 — modal Super Admin: thêm / sửa / xoá đăng ký NS của user (dùng trong TeamBudget). */
import React, { useEffect, useMemo, useState } from 'react';
import { Btn, Field, Input, Modal, MoneyInput, SearchSelect, fmt } from './ui';
import { type VCtx, projectName, userName, uidOf } from './ctx';
import { nsLineId, isNsLinePaid, type NsLine } from '../../lib/vnext/budget';
import { periodLabel } from '../../lib/vnext/period';
import { SUPPORT_LABEL } from '../../lib/vnext/support';
import { reasonOk, deleteConfirmOk, planProjectChange, willNeedReapproval, type WeeklySnapItem } from '../../lib/vnext/nsAdmin';
import { saCreateNsLine, saUpdateNsLine, saDeleteNsLine, previewWeeklyForNsLine, previewNtForNsLine } from './nsActions';
import { pushNotif, khoiManagers } from './notify';

type Toast = (m: string, kind?: 'ok' | 'err' | string, retry?: () => void) => void;
type Opts = { value: string; label: string }[];

const Notify = ({ v, set }: { v: boolean; set: (b: boolean) => void }) => (
  <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} data-testid="vn-sa-ns-notify" /> Gửi thông báo cho user</label>
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

export function SaEditModal({ c, line, lines, status, projectOpts, onClose, toast }: { c: VCtx; line: NsLine; lines: NsLine[]; status: string; projectOpts: Opts; onClose: () => void; toast: Toast }) {
  const [pid, setPid] = useState(line.projectId);
  const [amt, setAmt] = useState(Number(line.amount || 0));
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const reappr = willNeedReapproval(status, { amount: Number(line.amount || 0), projectId: line.projectId }, { amount: amt, projectId: pid });
  const submit = async () => {
    if (!pid) return toast('Chọn dự án', 'err');
    if (!(amt > 0)) return toast('Số tiền phải > 0', 'err');
    if (!reasonOk(reason)) return toast('Bắt buộc nhập lý do (≥ 3 ký tự)', 'err');
    const plan = planProjectChange(line, pid);
    const exNew = plan.changed ? lines.find((l) => l.id === plan.newId) || null : null;
    if (exNew && !exNew.deleted) return toast('User đã có đăng ký ở dự án đó — hãy sửa dòng kia', 'err');
    setBusy(true);
    try {
      await saUpdateNsLine(c, { line, amount: amt, projectId: pid, reason: reason.trim(), notify, existingNew: exNew, supportStatus: status });
      if (reappr) for (const u of khoiManagers(c, line.blockId)) pushNotif(c, u, { type: 'reapproval', title: `Cần duyệt lại: ${line.ownerName || userName(c, line.ownerUid)} · ${projectName(c, pid)}`, body: `NS đã duyệt bị Super Admin điều chỉnh → ${fmt(amt)} đ`, link: '/quan-ly-khoi', refId: plan.newId });
      toast('Đã cập nhật'); onClose();
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Sửa đăng ký NS (Super Admin)" footer={<><Btn onClick={onClose}>Huỷ</Btn><Btn primary onClick={submit} disabled={busy} data-testid="vn-sa-ns-edit-save">Lưu</Btn></>}>
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
