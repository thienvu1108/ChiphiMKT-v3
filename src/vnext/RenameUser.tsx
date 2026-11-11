import React, { useMemo, useState } from 'react';
import { doc, collection, writeBatch } from 'firebase/firestore';
import { type VCtx, vnCan, gdkdTeams, teamName, teamsOfBlock, uidOf } from './ctx';
import { Btn, Card, Empty, Field, Input, Modal, Td, Th, useToast } from './ui';
import { KycCells, useKycMap } from './KycViews';
import { canSeeOthersKyc } from '../../lib/vnext/kyc';
import { RENAME_FEATURE, RENAME_SELF_FEATURE, buildRename, canRenameSelf, canRenameUser, cleanName, validateName, targetBlockIds, type RenameActor } from '../../lib/vnext/rename';

export function renameActor(c: VCtx): RenameActor {
  return { uid: c.uid, email: (c.email || '').toLowerCase() || undefined, name: c.name, role: c.role, can: vnCan(c, RENAME_FEATURE), myBlockIds: c.myBlockIds || [], gdkdTeamIds: gdkdTeams(c) };
}

/** Nút «Đổi tên» (chỉ hiện khi được phép theo phạm vi). Ghi users + auditLogs trong 1 batch. */
export function RenameUserButton({ c, target, small = true }: { c: VCtx; target: any; small?: boolean }) {
  const a = useMemo(() => renameActor(c), [c.uid, c.role, c.perms, c.myBlockIds, c.teams]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  if (!canRenameUser(a, target, c.teams, c.blocks)) return null;
  const old = String(target.fullName || target.displayName || '');
  async function save() {
    const err = validateName(name); if (err) return toast(err, 'err');
    if (cleanName(name) === cleanName(target.fullName)) return toast('Tên không đổi', 'err');
    setBusy(true);
    try {
      const b = writeBatch(c.db);
      const aref = doc(collection(c.db, 'auditLogs'));
      const { userPatch, audit } = buildRename(a, target, name, new Date().toISOString(), aref.id);
      b.set(aref, audit);
      b.update(doc(c.db, 'users', uidOf(target)), userPatch);
      await b.commit();
      toast(`Đã đổi tên: ${old || '—'} → ${userPatch.fullName}`); setOpen(false);
    } catch (e: any) { toast('Không đổi được tên: ' + String(e?.code || e?.message || e), 'err'); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Btn small={small} onClick={() => { setName(old); setOpen(true); }} data-testid="vn-rename-btn" title="Đổi tên hiển thị">Đổi tên</Btn>
      <Modal open={open} onClose={() => setOpen(false)} title="Đổi tên người dùng"
        footer={<><Btn onClick={() => setOpen(false)}>Huỷ</Btn><Btn primary disabled={busy} onClick={save} data-testid="vn-rename-save">{busy ? 'Đang lưu…' : 'Lưu'}</Btn></>}>
        <div className="space-y-3 text-[13px]">
          <div className="text-[var(--mh-text-2)]">{target.email} · tên hiện tại: <b>{old || '—'}</b></div>
          <Field label="Họ tên mới"><Input value={name} onChange={(e: any) => setName(e.target.value)} maxLength={120} autoFocus data-testid="vn-rename-input" /></Field>
          <div className="text-[11px] text-[var(--mh-text-3)]">Chỉ đổi họ tên hiển thị. Thay đổi được ghi vào Nhật ký (người đổi, tên cũ → mới).</div>
        </div>
      </Modal>
      {node}
    </>
  );
}

/** Thành viên Khối (GĐ Khối / Trợ lý / Admin): người thuộc các Phòng của Khối hoặc được duyệt vào Khối. */
export function KhoiMembers({ c, blockId }: { c: VCtx; blockId?: string }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    if (!blockId) return [];
    const tids = new Set(teamsOfBlock(c, blockId).map((t) => t.id));
    const b = c.blocks.find((x) => x.id === blockId);
    const named = new Set([b?.directorUid, ...((b?.assistantUids as string[]) || [])].filter(Boolean));
    const n = (s: any) => String(s || '').normalize('NFC').toLowerCase();
    return c.users.filter((u) => !u.linkedToUid && !u.mergedInto && (tids.has(u.teamId) || named.has(uidOf(u)) || targetBlockIds(u, c.teams, c.blocks).includes(blockId)))
      .filter((u) => !q || n(`${u.fullName} ${u.displayName} ${u.email}`).includes(n(q)))
      .sort((x, y) => String(x.fullName || '').localeCompare(String(y.fullName || ''), 'vi'));
  }, [c.users, c.teams, c.blocks, blockId, q]);
  const canSeeKyc = canSeeOthersKyc(c.role);
  const kycs = useKycMap(c, rows.map(uidOf), canSeeKyc && !!blockId);
  if (!blockId) return <Card className="p-5 text-[13px]">Bạn chưa được gán Khối.</Card>;
  return (
    <Card>
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-[var(--mh-border)]">
        <div className="font-semibold text-[14px] flex-1">Thành viên Khối ({rows.length})</div>
        <Input placeholder="Tìm tên / email" value={q} onChange={(e: any) => setQ(e.target.value)} className="w-full sm:w-64" data-testid="vn-khoi-members-search" />
      </div>
      {!rows.length ? <Empty>Chưa có thành viên</Empty> : (
        <div className="overflow-x-auto"><table data-mh-responsive className="w-full" data-testid="vn-khoi-members"><thead><tr><Th>Họ tên</Th><Th className="hidden md:table-cell">Email</Th><Th>Phòng</Th><Th>Vai trò</Th><Th>Thông tin thanh toán</Th><Th></Th></tr></thead><tbody>
          {rows.map((m) => <tr key={uidOf(m)}><Td>{m.fullName || m.displayName || '—'}<div className="md:hidden text-[11px] text-[var(--mh-text-2)] break-all">{m.email}</div></Td><Td className="hidden md:table-cell text-[12px] text-[var(--mh-text-2)] break-all">{m.email}</Td><Td className="text-[12px]">{m.teamId ? teamName(c, m.teamId) : '—'}</Td><Td className="text-[12px]">{m.role || 'user'}</Td><Td><KycCells k={kycs[uidOf(m)]} canSee={canSeeKyc} compact /></Td><Td r><RenameUserButton c={c} target={m} /></Td></tr>)}
        </tbody></table></div>
      )}
    </Card>
  );
}

export const canSelfRename = (c: VCtx) => !!c.uid && canRenameSelf(c.role, vnCan(c, RENAME_SELF_FEATURE));

/** Tự đổi tên mình (menu tài khoản, desktop + mobile). Ghi users/{me} + auditLogs RENAME_USER trong 1 batch. */
export function SelfRenameDialog({ c, profile, open, onClose, onDone }: { c: VCtx; profile: any; open: boolean; onClose: () => void; onDone?: (name: string) => void }) {
  const old = String(profile?.fullName || profile?.displayName || '');
  const [name, setName] = useState(old);
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  React.useEffect(() => { if (open) setName(old); }, [open]);
  async function save() {
    const err = validateName(name); if (err) return toast(err, 'err');
    if (cleanName(name) === cleanName(profile?.fullName)) return toast('Tên không đổi', 'err');
    setBusy(true);
    try {
      const b = writeBatch(c.db);
      const aref = doc(collection(c.db, 'auditLogs'));
      const me = { ...(profile || {}), id: c.uid, uid: c.uid, email: profile?.email || c.email };
      const { userPatch, audit } = buildRename(renameActor(c), me, name, new Date().toISOString(), aref.id);
      b.set(aref, audit);
      b.update(doc(c.db, 'users', c.uid), userPatch);
      await b.commit();
      toast(`Đã đổi tên: ${old || '—'} → ${userPatch.fullName}`);
      onDone?.(userPatch.fullName); onClose();
    } catch (e: any) { toast('Không đổi được tên: ' + String(e?.code || e?.message || e), 'err'); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Modal open={open} onClose={onClose} title="Đổi tên của tôi"
        footer={<><Btn onClick={onClose}>Huỷ</Btn><Btn primary disabled={busy} onClick={save} data-testid="vn-self-rename-save">{busy ? 'Đang lưu…' : 'Lưu'}</Btn></>}>
        <div className="space-y-3 text-[13px]" data-testid="vn-self-rename">
          <div className="text-[var(--mh-text-2)]">{profile?.email || c.email} · tên hiện tại: <b>{old || '—'}</b></div>
          <Field label="Họ tên mới"><Input value={name} onChange={(e: any) => setName(e.target.value)} maxLength={120} autoFocus data-testid="vn-self-rename-input" /></Field>
          <div className="text-[11px] text-[var(--mh-text-3)]">Chỉ đổi họ tên hiển thị của bạn. Thay đổi được ghi vào Nhật ký (tên cũ → mới).</div>
        </div>
      </Modal>
      {node}
    </>
  );
}
