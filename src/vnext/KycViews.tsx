import { isBoProfile, missingRequiredKyc } from '../../lib/vnext/onboarding';
import { snapPending, snapExists } from '../lib/clientErrorFilter';
/** B1 — Thông tin thanh toán (CCCD / STK / Chủ TK / Ngân hàng). Lưu ở userKyc/{uid}; GĐKD không đọc được (rules). */
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { PAY_STATUS_COLLECTION, payDoc } from './payStatus';
import { type VCtx, isAdm, teamName, blockName, blockOfTeam, uidOf, userName } from './ctx';
import { Btn, Card, Empty, Field, Input, Modal, Td, Th, Badge, useToast, vnTime, Overlay } from './ui';
import { KYC_COLLECTION, VN_BANKS, type Kyc, type KycAccount, validateKyc, normalizeKyc, isKycComplete, maskTail, canSeeOthersKyc, accountsOf, defaultAccount, validateAccounts, MAX_ACCOUNTS, normHolder, digits } from '../../lib/vnext/kyc';

/** undefined = đang tải; null = chưa khai. */
export function useMyKyc(c: VCtx) {
  const [k, setK] = useState<Kyc | null | undefined>(undefined);
  useEffect(() => {
    if (!c.uid) return;
    // Bỏ qua snapshot ghi lạc quan (chưa được server xác nhận): nếu rules từ chối, popup không được đóng rồi mở lại mất lỗi.
    return onSnapshot(doc(c.db, KYC_COLLECTION, c.uid), { includeMetadataChanges: true }, (s) => { if (!s || snapPending(s)) return; setK(snapExists(s) ? ({ uid: c.uid, ...(s.data() as any) }) : null); }, () => setK(null));
  }, [c.db, c.uid]);
  return k;
}

export async function saveKyc(c: VCtx, uid: string, v: { cccd: string; bankAccount: string; bankName: string; accountHolder: string; accounts?: KycAccount[]; defaultAccountId?: string }, fullName: string) {
  const accs = (v.accounts || []).map((a) => ({ id: a.id, ...normalizeKyc({ ...a, cccd: '' }), cccd: undefined } as any)).map(({ cccd: _c, ...a }: any) => a as KycAccount);
  const def = accs.find((a) => a.id === v.defaultAccountId) || accs[0];
  // Cấp gốc = tài khoản mặc định (giữ tương thích màn hình / rules cũ).
  const n = normalizeKyc(def ? { cccd: v.cccd, ...def } : v);
  const extra = accs.length ? { accounts: accs, defaultAccountId: def!.id } : {};
  const now = new Date().toISOString();
  const ps = await getDoc(doc(c.db, PAY_STATUS_COLLECTION, uid)).then((x) => (x.exists() ? { has: (x.data() as any).hasPay === true, since: (x.data() as any).since || '' } : undefined)).catch(() => undefined);
  const b = writeBatch(c.db);
  b.set(doc(c.db, KYC_COLLECTION, uid), { uid, ...n, ...extra, fullName: String(fullName || '').slice(0, 120), updatedAt: now, updatedBy: c.uid });
  // Cờ công khai «đã có STK» (cùng batch → rules kiểm bằng getAfter).
  b.set(doc(c.db, PAY_STATUS_COLLECTION, uid), payDoc(uid, /^[0-9]{6,20}$/.test(n.bankAccount), ps, now));
  const w = b.commit();
  let t: any;
  try { await Promise.race([w, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), 20000); })]); }
  finally { clearTimeout(t); }
}

export function kycSaveErrorText(x: any): string {
  const code = String(x?.code || x?.message || 'unknown');
  if (/permission/.test(code)) return 'Không lưu được: hệ thống từ chối ghi (permission-denied). Vui lòng chụp màn hình gửi Admin/kỹ thuật.';
  if (/timeout|unavailable|network/.test(code)) return 'Không lưu được: mất kết nối máy chủ. Kiểm tra mạng rồi bấm lại.';
  return 'Không lưu được: ' + code;
}

/** Đọc thông tin thanh toán của nhiều người (từng doc — rules đánh giá theo từng người). Lỗi quyền → không có. */
export function useKycMap(c: VCtx, uids: string[], enabled: boolean) {
  const [m, setM] = useState<Record<string, Kyc | null>>({});
  const key = enabled ? [...new Set(uids)].sort().join(',') : '';
  useEffect(() => {
    if (!key) { setM({}); return; }
    let live = true;
    const ids = key.split(',').filter(Boolean);
    Promise.all(ids.map((id) => getDoc(doc(c.db, KYC_COLLECTION, id)).then((s) => [id, s.exists() ? ({ uid: id, ...(s.data() as any) }) : null] as const).catch(() => [id, null] as const)))
      .then((rows) => { if (live) setM(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [c.db, key]);
  return m;
}

/** Admin: toàn bộ (1 listener). */
export function useAllKyc(c: VCtx, enabled: boolean) {
  const [m, setM] = useState<Record<string, Kyc>>({});
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(collection(c.db, KYC_COLLECTION), (s) => setM(Object.fromEntries(s.docs.map((d) => [d.id, { uid: d.id, ...(d.data() as any) }]))), () => {});
  }, [c.db, enabled]);
  return m;
}

export function KycForm({ c, uid, initial, fullName, onDone, submitLabel = 'Lưu thông tin' }: { c: VCtx; uid: string; initial?: Partial<Kyc> | null; fullName: string; onDone?: () => void; submitLabel?: string }) {
  const init = accountsOf(initial);
  const [cccd, setCccd] = useState(initial?.cccd || '');
  const [accs, setAccs] = useState<KycAccount[]>(init.length ? init : [{ id: 'a1', bankAccount: '', bankName: '', accountHolder: '' }]);
  const [def, setDef] = useState(defaultAccount(initial)?.id || 'a1');
  // Một tên chủ TK chung cho mọi tài khoản = tên của TK mặc định (TK khác chỉ đọc, tự đồng bộ).
  const [holder, setHolder] = useState(defaultAccount(initial)?.accountHolder || init[0]?.accountHolder || '');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cccdErr = /^\d{12}$/.test(digits(cccd)) ? '' : 'Số CCCD gồm đúng 12 chữ số';
  const full = accs.map((a) => ({ ...a, accountHolder: holder }));
  const accErrs = full.map((a) => validateKyc({ cccd: '000000000000', ...a }));
  const listErr = validateAccounts(full);
  const setA = (i: number, p: Partial<KycAccount>) => setAccs((o) => o.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const addAcc = () => { if (accs.length >= MAX_ACCOUNTS) return; const used = new Set(accs.map((a) => a.id)); let n = 1; while (used.has('a' + n)) n++; setAccs([...accs, { id: 'a' + n, bankAccount: '', bankName: '', accountHolder: '' }]); };
  const delAcc = (i: number) => { const id = accs[i].id; const n = accs.filter((_, j) => j !== i); setAccs(n); if (def === id) setDef(n[0]?.id || 'a1'); };
  const submit = async () => {
    setTouched(true); setErr('');
    if (cccdErr || listErr) return;
    setBusy(true);
    const d = full.find((a) => a.id === def) || full[0];
    try { await saveKyc(c, uid, { cccd, bankAccount: d.bankAccount, bankName: d.bankName, accountHolder: holder, accounts: full, defaultAccountId: d.id }, fullName); onDone?.(); }
    catch (x: any) { console.error('saveKyc', x); setErr(kycSaveErrorText(x)); }
    setBusy(false);
  };
  return (
    <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); submit(); }} data-testid="vn-kyc-form">
      <Field label="Số CCCD (12 số)">
        <Input inputMode="numeric" autoComplete="off" maxLength={14} value={cccd} onChange={(x: any) => setCccd(x.target.value.replace(/\D/g, ''))} placeholder="VD: 001099012345" data-testid="vn-kyc-cccd" />
        {touched && cccdErr && <div className="text-[11px] text-[var(--mh-err)] mt-1">{cccdErr}</div>}
      </Field>
      <datalist id="vn-kyc-banks">{VN_BANKS.map((b) => <option key={b} value={b} />)}</datalist>
      {accs.map((a, i) => { const e = accErrs[i]; const bad = (k: string) => touched && (e as any)[k];
        return (
        <div key={a.id} className="border border-[var(--mh-border)] rounded-lg p-3 space-y-2" data-testid="vn-kyc-acc">
          <div className="flex items-center gap-2 text-[13px] font-semibold"><span className="flex-1">Tài khoản {i + 1}</span>
            <label className="flex items-center gap-1 text-[12px] font-normal"><input type="radio" name="vn-kyc-def" checked={def === a.id} onChange={() => setDef(a.id)} data-testid="vn-kyc-def" />Mặc định</label>
            {accs.length > 1 && <button type="button" className="text-[12px] text-[var(--mh-err)]" onClick={() => delAcc(i)} data-testid="vn-kyc-acc-del">Xoá</button>}</div>
          <Field label="Số tài khoản ngân hàng">
            <Input inputMode="numeric" autoComplete="off" maxLength={24} value={a.bankAccount} onChange={(x: any) => setA(i, { bankAccount: x.target.value.replace(/\D/g, '') })} placeholder="Chỉ nhập số" data-testid={i ? `vn-kyc-account-${i}` : 'vn-kyc-account'} />
            {i === 0 && <div className="text-[11px] text-[var(--mh-text-2)] mt-1" data-testid="vn-kyc-account-note">Tài khoản liên kết với thẻ Visa, thanh toán chi phí quảng cáo</div>}
            {bad('bankAccount') && <div className="text-[11px] text-[var(--mh-err)] mt-1">{e.bankAccount}</div>}
          </Field>
          <Field label="Tên chủ tài khoản">
            {a.id === def
              ? <Input autoComplete="off" maxLength={100} value={holder} onChange={(x: any) => setHolder(x.target.value.toLocaleUpperCase('vi-VN'))} onBlur={() => setHolder(normHolder(holder))} placeholder="VD: NGUYỄN VĂN A" data-testid={i ? `vn-kyc-holder-${i}` : 'vn-kyc-holder'} data-readonly="0" />
              : <><Input readOnly tabIndex={-1} className="bg-[#F4F6F9] text-[var(--mh-text-2)] cursor-not-allowed" value={holder} placeholder="Lấy từ tài khoản mặc định" data-testid={i ? `vn-kyc-holder-${i}` : 'vn-kyc-holder'} data-readonly="1" />
                <div className="text-[11px] text-[var(--mh-text-2)] mt-1">Tự lấy theo tên chủ tài khoản mặc định — mọi tài khoản phải cùng chủ.</div></>}
            {bad('accountHolder') && <div className="text-[11px] text-[var(--mh-err)] mt-1">{e.accountHolder}</div>}
          </Field>
          <Field label="Tên ngân hàng">
            <Input list="vn-kyc-banks" value={a.bankName} onChange={(x: any) => setA(i, { bankName: x.target.value })} placeholder="Gõ để chọn, VD: Vietcombank" data-testid={i ? `vn-kyc-bank-${i}` : 'vn-kyc-bank'} />
            {bad('bankName') && <div className="text-[11px] text-[var(--mh-err)] mt-1">{e.bankName}</div>}
          </Field>
        </div>); })}
      {accs.length < MAX_ACCOUNTS && <Btn small type="button" onClick={addAcc} data-testid="vn-kyc-acc-add">+ Thêm tài khoản ({accs.length}/{MAX_ACCOUNTS})</Btn>}
      {touched && listErr && <div className="text-[11px] text-[var(--mh-err)]">{listErr}</div>}
      <div className="text-[11px] text-[var(--mh-text-2)]">Thông tin dùng để chi hỗ trợ MKT. Chỉ bạn, Admin, Kế toán và GĐ Khối / Trợ lý Khối của Khối bạn xem được. GĐKD không xem được.</div>
      {err && <div role="alert" className="text-[13px] font-semibold text-[var(--mh-err)] bg-[#FDECEA] border border-[#F5C2BD] rounded-md px-3 py-2" data-testid="vn-kyc-error">{err}</div>}
      <div className="flex justify-end"><Btn primary type="submit" disabled={busy} data-testid="vn-kyc-submit">{busy ? 'Đang lưu…' : submitLabel}</Btn></div>
    </form>
  );
}

/** Popup BẮT BUỘC khi đăng nhập: chưa khai đủ thì không dùng được hệ thống (không có nút đóng). */
export function KycGate({ c }: { c: VCtx }) {
  const k = useMyKyc(c);
  if (isBoProfile(c.profile || c.users.find((u: any) => uidOf(u) === c.uid)) || k === undefined || isKycComplete(k)) return null;
  return (
    <Overlay className="bg-[var(--mh-text)]/60 flex items-center justify-center p-3" testId="vn-kyc-gate" zClass="z-[1200]">
      <div role="dialog" aria-modal="true" className="w-full max-w-[460px] max-h-[min(90dvh,100%)] flex">
      <Card className="p-4 sm:p-5 w-full max-h-[min(90dvh,100%)] overflow-y-auto shadow-2xl border-l-4 border-l-[var(--mh-accent)] overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="text-[15px] font-bold text-[var(--mh-text)]">Cập nhật thông tin thanh toán</div>
        <div className="text-[13px] text-[var(--mh-text-2)] mt-1 mb-3">Bắt buộc với mọi tài khoản. Vui lòng khai Số CCCD, Số tài khoản, Tên chủ tài khoản và Tên ngân hàng để tiếp tục.</div>
        <KycForm c={c} uid={c.uid} initial={k} fullName={c.name} submitLabel="Lưu và tiếp tục" />
      </Card>
      </div>
    </Overlay>
  );
}

/** Menu tài khoản › Thông tin thanh toán (xem / sửa của chính mình). */
export function KycSelfDialog({ c, open, onClose }: { c: VCtx; open: boolean; onClose: () => void }) {
  const k = useMyKyc(c);
  const { toast, node } = useToast();
  return (
    <Modal open={open} onClose={onClose} title="Thông tin thanh toán của tôi">
      {k === undefined ? <div className="text-[13px]">Đang tải…</div> : <KycForm c={c} uid={c.uid} initial={k} fullName={c.name} onDone={() => { toast('Đã lưu'); onClose(); }} />}
      {node}
    </Modal>
  );
}

/** Ô hiển thị (che bớt, bấm để hiện đủ). */
export function KycCells({ k, canSee, compact }: { k?: Kyc | null; canSee: boolean; compact?: boolean }) {
  const [show, setShow] = useState(false);
  if (!canSee) return <span className="text-[11px] text-[var(--mh-text-3)]" data-testid="vn-kyc-hidden">Ẩn</span>;
  if (!k) return <Badge c="warn">Chưa khai</Badge>;
  return (
    <span className={`inline-flex ${compact ? 'flex-col' : 'flex-wrap gap-x-2'} text-[12px] tabular-nums`} data-testid="vn-kyc-cell">
      <span>CCCD: <b>{show ? k.cccd : maskTail(k.cccd)}</b></span>
      <span>STK: <b>{show ? k.bankAccount : maskTail(k.bankAccount)}</b> · {k.bankName}</span>
      <span>Chủ TK: <b data-testid="vn-kyc-holder-cell">{k.accountHolder || '—'}</b>{accountsOf(k).length > 1 && <span className="text-[var(--mh-text-3)]"> · mặc định, {accountsOf(k).length} TK</span>}</span>
      <button type="button" className="text-[11px] text-[var(--mh-navy)] underline text-left" onClick={() => setShow((s) => !s)}>{show ? 'Ẩn' : 'Hiện'}</button>
    </span>
  );
}

/** Quản lý Người dùng (Admin / Kế toán): danh sách thông tin thanh toán, Admin sửa hộ. */
export function KycAdminPanel({ c }: { c: VCtx }) {
  const can = isAdm(c) || c.role === 'accountant';
  const all = useAllKyc(c, can);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'missing' | 'done'>('all');
  const [edit, setEdit] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const { toast, node } = useToast();
  const rows = useMemo(() => {
    const n = (s: any) => String(s || '').normalize('NFC').toLowerCase();
    return c.users.filter((u) => !u.linkedToUid && !u.mergedInto)
      .map((u) => ({ u, k: all[uidOf(u)] || null }))
      .filter((r) => only === 'all' || (only === 'missing' ? missingRequiredKyc(r.u, r.k) : isKycComplete(r.k)))
      .filter((r) => !q || n(`${r.u.fullName} ${r.u.email} ${r.k?.cccd || ''} ${r.k?.bankAccount || ''} ${r.k?.accountHolder || ''}`).includes(n(q)))
      .sort((a, b) => String(a.u.fullName || a.u.email || '').localeCompare(String(b.u.fullName || b.u.email || ''), 'vi'));
  }, [c.users, all, q, only]);
  if (!can) return null;
  const missing = c.users.filter((u) => missingRequiredKyc(u, all[uidOf(u)])).length;
  return (
    <Card className="mb-4" data-testid="vn-kyc-admin">
      <button type="button" className="w-full px-4 py-3 flex flex-wrap items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="font-semibold text-[14px] flex-1">Thông tin thanh toán (CCCD / STK / Ngân hàng)</div>
        <Badge c="ok">{Object.keys(all).length} đã khai</Badge>{missing > 0 && <Badge c="warn">{missing} chưa khai</Badge>}
        <span className="text-[12px] text-[var(--mh-navy)]">{open ? 'Thu gọn ▲' : 'Xem ▼'}</span>
      </button>
      {open && <>
        <div className="px-4 pb-3 flex flex-wrap gap-2 items-end border-b border-[var(--mh-border)]">
          <Input placeholder="Tìm tên / email / CCCD / STK" value={q} onChange={(e: any) => setQ(e.target.value)} className="w-full sm:w-72" data-testid="vn-kyc-admin-search" />
          <div className="flex rounded-lg border border-[var(--mh-border)] overflow-hidden h-9 text-[12px]">{(['all', 'missing', 'done'] as const).map((o) => <button key={o} onClick={() => setOnly(o)} className={`px-3 ${only === o ? 'bg-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)]'}`}>{o === 'all' ? 'Tất cả' : o === 'missing' ? 'Chưa khai' : 'Đã khai'}</button>)}</div>
        </div>
        {!rows.length ? <Empty>Không có người dùng</Empty> : (
          <div className="overflow-x-auto max-h-[60vh]"><table data-mh-responsive className="w-full"><thead><tr><Th>Họ tên</Th><Th className="hidden md:table-cell">Phòng / Khối</Th><Th>CCCD · STK · Ngân hàng</Th><Th className="hidden md:table-cell">Cập nhật</Th><Th></Th></tr></thead><tbody>
            {rows.slice(0, 400).map(({ u, k }) => <tr key={uidOf(u)} data-testid="vn-kyc-admin-row"><Td>{u.fullName || u.displayName || '—'}<div className="text-[11px] text-[var(--mh-text-2)] break-all">{u.email}</div></Td>
              <Td className="hidden md:table-cell text-[12px]">{u.teamId ? teamName(c, u.teamId) : '—'}<div className="text-[11px] text-[var(--mh-text-3)]">{blockName(c, blockOfTeam(c, u.teamId))}</div></Td>
              <Td>{isBoProfile(u) && !isKycComplete(k) ? <Badge c="mute">Không bắt buộc (BO)</Badge> : <KycCells k={k} canSee />}</Td>
              <Td className="hidden md:table-cell text-[11px] text-[var(--mh-text-2)]">{k?.updatedAt ? vnTime(k.updatedAt) : ''}{k?.updatedBy && k.updatedBy !== uidOf(u) ? <div>bởi {userName(c, k.updatedBy)}</div> : null}</Td>
              <Td r>{isAdm(c) && <Btn small onClick={() => setEdit({ u, k })}>Sửa</Btn>}</Td></tr>)}
          </tbody></table></div>
        )}
      </>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Thông tin thanh toán · ${edit?.u?.fullName || edit?.u?.email || ''}`}>
        {edit && <KycForm c={c} uid={uidOf(edit.u)} initial={edit.k} fullName={edit.u.fullName || ''} onDone={() => { toast('Đã lưu'); setEdit(null); }} />}
      </Modal>
      {node}
    </Card>
  );
}

export { canSeeOthersKyc };
