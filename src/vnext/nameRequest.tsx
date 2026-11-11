/** Yêu cầu cập nhật tên (nameUpdateRequests/{uid}).
 *  - Gắn cờ: Admin / người duyệt thành viên (GĐKD·GĐK·Trợ lý trong phạm vi).
 *  - Người dùng: popup CHẶN (kiểu KycGate) → nhập họ tên → lưu (RENAME_USER) + xoá cờ + báo người yêu cầu.
 *  - Quản lý Users (Admin): nút từng dòng, badge «Chờ đổi tên», lọc, gửi hàng loạt.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc, writeBatch, collection, deleteDoc } from 'firebase/firestore';
import { type VCtx, vnCan, gdkdTeams } from './ctx';
import { pushNotif } from './notify';
import { Btn, Field, Input, Modal, Badge, Card, useToast, Overlay } from './ui';
import { buildRename, cleanName, validateName, RENAME_FEATURE, type RenameActor } from '../../lib/vnext/rename';

function renameActor(c: VCtx): RenameActor {
  return { uid: c.uid, email: (c.email || '').toLowerCase() || undefined, name: c.name, role: c.role, can: vnCan(c, RENAME_FEATURE), myBlockIds: c.myBlockIds || [], gdkdTeamIds: gdkdTeams(c) };
}

export const NAME_REQ = 'nameUpdateRequests';
export type NameReq = { uid: string; by: string; byName?: string; byEmail?: string; at: string; note?: string; oldName?: string; teamId?: string };

export function useNameReq(c: VCtx, uid: string | undefined) {
  const [r, setR] = useState<NameReq | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) { setR(null); return; }
    return onSnapshot(doc(c.db, NAME_REQ, uid), (s) => setR(s.exists() ? (s.data() as NameReq) : null), () => setR(null));
  }, [c.db, uid]);
  return r;
}

/** Admin: map uid → NameReq (để badge / lọc / bulk). */
export function useNameReqMap(c: VCtx, enabled: boolean) {
  const [m, setM] = useState<Record<string, NameReq>>({});
  useEffect(() => {
    if (!enabled) { setM({}); return; }
    return onSnapshot(collection(c.db, NAME_REQ), (snap) => {
      const next: Record<string, NameReq> = {};
      snap.forEach((d) => { next[d.id] = d.data() as NameReq; });
      setM(next);
    }, () => setM({}));
  }, [c.db, enabled]);
  return m;
}

async function writeNameReq(c: VCtx, target: { uid: string; email?: string; name?: string; teamId?: string }, note: string) {
  const u = c.users.find((x: any) => (x.uid || x.id) === target.uid);
  const oldName = String(u?.fullName ?? target.name ?? '');
  const at = new Date().toISOString();
  await setDoc(doc(c.db, NAME_REQ, target.uid), {
    uid: target.uid, by: c.uid, byName: c.name || '', byEmail: (c.email || '').toLowerCase(),
    at, note: note.trim().slice(0, 300), oldName, teamId: target.teamId || '',
  });
  await pushNotif(c, target.uid, {
    type: 'member',
    title: 'Yêu cầu cập nhật họ tên',
    body: `${c.name || 'Quản trị'} đề nghị bạn cập nhật họ tên hiển thị${note.trim() ? ': ' + note.trim() : ''}.`,
    refId: target.uid,
  }).catch(() => {});
}

/** Nút «Yêu cầu cập nhật tên» (duyệt thành viên hoặc Quản lý Users). */
export function NameReqButton({ c, target, label = 'Yêu cầu cập nhật tên', compact }: {
  c: VCtx; target: { uid: string; email?: string; name?: string; teamId?: string }; label?: string; compact?: boolean;
}) {
  const cur = useNameReq(c, target.uid);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  const u = c.users.find((x: any) => (x.uid || x.id) === target.uid);
  const oldName = String(u?.fullName ?? target.name ?? '');
  async function send() {
    if (!target.uid) return toast('Tài khoản chưa có uid', 'err');
    setBusy(true);
    try {
      await writeNameReq(c, target, note);
      toast('Đã gửi yêu cầu cập nhật tên'); setOpen(false);
    } catch (e: any) { toast('Không gửi được: ' + (e?.code || e?.message), 'err'); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!window.confirm('Huỷ yêu cầu đổi tên?')) return;
    setBusy(true);
    try { await deleteDoc(doc(c.db, NAME_REQ, target.uid)); toast('Đã huỷ yêu cầu'); }
    catch (e: any) { toast('Không huỷ được: ' + (e?.code || e?.message), 'err'); }
    finally { setBusy(false); }
  }
  return (
    <>
      {cur
        ? <span className="inline-flex items-center gap-1" data-testid="vn-namereq-sent">
            <Badge c="warn">Chờ đổi tên</Badge>
            <button type="button" className="text-[10px] font-bold text-rose-600 hover:underline" disabled={busy} onClick={cancel} data-testid="vn-namereq-cancel" title="Huỷ yêu cầu">Huỷ</button>
          </span>
        : <Btn small onClick={() => { setNote('Ghi đủ họ tên có dấu, như trên CCCD'); setOpen(true); }} data-testid="vn-namereq-btn" title="Đề nghị người dùng sửa họ tên hiển thị">{compact ? 'Yêu cầu đổi tên' : label}</Btn>}
      <Modal open={open} onClose={() => setOpen(false)} title={`Yêu cầu đổi tên: ${oldName || target.email || ''}`}
        footer={<><Btn onClick={() => setOpen(false)}>Huỷ</Btn><Btn primary disabled={busy} onClick={send} data-testid="vn-namereq-send">{busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</Btn></>}>
        <div className="space-y-3 text-[13px]">
          <div className="text-[var(--mh-text-2)]">Người dùng sẽ thấy popup bắt buộc nhập họ tên ở lần đăng nhập / tải trang tiếp theo cho tới khi đổi tên xong.</div>
          <Field label="Ghi chú (không bắt buộc)"><Input value={note} onChange={(e: any) => setNote(e.target.value)} maxLength={300} placeholder="VD: Ghi đủ họ tên có dấu, như trên CCCD" data-testid="vn-namereq-note" /></Field>
        </div>
      </Modal>
      {node}
    </>
  );
}

/** Gửi yêu cầu hàng loạt (Admin Users). */
export function NameReqBulkBar({ c, selected, onDone }: { c: VCtx; selected: { uid: string; email?: string; name?: string; teamId?: string }[]; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('Ghi đủ họ tên có dấu, như trên CCCD');
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  if (!selected.length) return null;
  async function send() {
    setBusy(true);
    let ok = 0; const bad: string[] = [];
    for (const t of selected) {
      try { await writeNameReq(c, t, note); ok++; }
      catch (e: any) { bad.push((t.email || t.uid) + ': ' + (e?.code || e?.message)); }
    }
    setBusy(false);
    if (ok) toast(`Đã gửi yêu cầu đổi tên cho ${ok} người`);
    if (bad.length) toast('Lỗi: ' + bad.slice(0, 3).join('; '), 'err');
    setOpen(false); onDone?.();
  }
  return (
    <>
      <Btn small primary onClick={() => setOpen(true)} data-testid="vn-namereq-bulk" disabled={!selected.length}>Yêu cầu đổi tên ({selected.length})</Btn>
      <Modal open={open} onClose={() => setOpen(false)} title={`Yêu cầu đổi tên · ${selected.length} người`}
        footer={<><Btn onClick={() => setOpen(false)}>Huỷ</Btn><Btn primary disabled={busy} onClick={send} data-testid="vn-namereq-bulk-send">{busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</Btn></>}>
        <div className="space-y-3 text-[13px]">
          <div className="text-[var(--mh-text-2)]">Mỗi người sẽ nhận thông báo và phải cập nhật họ tên trước khi dùng tiếp hệ thống.</div>
          <Field label="Ghi chú chung"><Input value={note} onChange={(e: any) => setNote(e.target.value)} maxLength={300} data-testid="vn-namereq-bulk-note" /></Field>
        </div>
      </Modal>
      {node}
    </>
  );
}

/**
 * Popup CHẶN (kiểu KycGate): không có «Để sau». Nhập họ tên → lưu RENAME_USER + xoá cờ + báo người yêu cầu trong 1 batch.
 */
export function NameUpdateGate({ c, onDone }: { c: VCtx; onDone?: (name: string) => void }) {
  const r = useNameReq(c, c.uid);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(true);
  const { toast, node } = useToast();
  const profile = c.users.find((u: any) => (u.uid || u.id) === c.uid) || { id: c.uid, uid: c.uid, email: c.email, fullName: c.name };
  const oldName = String((profile as any)?.fullName || c.name || '');
  useEffect(() => { if (r) setName(oldName); }, [r, oldName]);
  useEffect(() => {
    const tick = () => setBlocked(!!document.querySelector('[data-testid="vn-kyc-gate"],[data-testid="vn-onboarding-modal"]'));
    const i = setInterval(tick, 800); const t0 = setTimeout(tick, 400);
    return () => { clearInterval(i); clearTimeout(t0); };
  }, []);
  if (r === undefined || !r || blocked) return null;

  async function save() {
    const err = validateName(name); if (err) return toast(err, 'err');
    if (cleanName(name) === cleanName(r!.oldName || '')) return toast('Vui lòng nhập họ tên khác tên hiện tại (đủ họ tên có dấu).', 'err');
    setBusy(true);
    try {
      const b = writeBatch(c.db);
      const aref = doc(collection(c.db, 'auditLogs'));
      const me = { ...(profile as any), id: c.uid, uid: c.uid, email: (profile as any)?.email || c.email };
      const { userPatch, audit } = buildRename(renameActor(c), me, name, new Date().toISOString(), aref.id);
      b.set(aref, audit);
      b.update(doc(c.db, 'users', c.uid), userPatch);
      if (r!.by) {
        b.set(doc(collection(c.db, 'userNotifs')), {
          toUid: r!.by, type: 'member', title: 'Người dùng đã cập nhật họ tên',
          body: `${r!.oldName || '—'} → ${userPatch.fullName}`.slice(0, 1000),
          link: '', refId: c.uid, createdAt: new Date().toISOString(), createdBy: c.uid, read: false,
        });
      }
      b.delete(doc(c.db, NAME_REQ, c.uid));
      await b.commit();
      toast(`Đã cập nhật họ tên: ${userPatch.fullName}`);
      onDone?.(userPatch.fullName);
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
    finally { setBusy(false); }
  }

  return (
    <Overlay className="bg-[var(--mh-text)]/60 flex items-center justify-center p-3" testId="vn-namereq-gate" zClass="z-[1200]">
      <div role="dialog" aria-modal="true" className="w-full max-w-[460px] max-h-[min(90dvh,100%)] flex">
      <Card className="p-4 sm:p-5 w-full max-h-[min(90dvh,100%)] overflow-y-auto shadow-2xl border-l-4 border-l-[var(--mh-accent)] overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="text-[15px] font-bold text-[var(--mh-text)]">Cập nhật họ tên hiển thị</div>
        <div className="text-[13px] text-[var(--mh-text-2)] mt-1 mb-3">
          <b>{r.byName || 'Quản trị'}</b> yêu cầu bạn cập nhật họ tên (dùng họ tên đầy đủ có dấu).
        </div>
        <div className="text-[12px] text-[var(--mh-text-2)] mb-2">Tên hiện tại: <b>{oldName || '—'}</b>{c.email ? ` · ${c.email}` : ''}</div>
        {r.note && <div className="text-[12.5px] bg-[#FFF8EB] border border-[#F5C26B] rounded p-2 mb-3">Ghi chú: {r.note}</div>}
        <Field label="Họ tên đầy đủ (có dấu)">
          <Input value={name} onChange={(e: any) => setName(e.target.value)} maxLength={120} autoFocus data-testid="vn-namereq-gate-input" />
        </Field>
        <div className="flex justify-end mt-3">
          <Btn primary disabled={busy} onClick={save} data-testid="vn-namereq-gate-save">{busy ? 'Đang lưu…' : 'Lưu và tiếp tục'}</Btn>
        </div>
        {node}
      </Card>
      </div>
    </Overlay>
  );
}

/** @deprecated dùng NameUpdateGate — giữ alias để import cũ không gãy. */
export const NameUpdatePopup = NameUpdateGate;

export function nameReqUidOf(u: { uid?: string; id?: string }) {
  return u.uid || u.id || '';
}
