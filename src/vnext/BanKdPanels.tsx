import { pushNotif, banManagers } from './notify';
/**
 * Quản lý Ban KD:
 *  - «Dự án của Ban»: Trưởng Ban / Phó Ban (+ Admin) thêm, sửa, xoá (mềm) dự án thuộc Ban; Admin gán Trưởng/Phó Ban.
 *  - «Tỉ lệ hỗ trợ MKT»: % chung cho mọi dự án của Ban + % riêng từng dự án (có lịch sử).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, updateDoc, addDoc, onSnapshot, runTransaction, writeBatch, serverTimestamp } from 'firebase/firestore';
import { unassignedProjects, isProjectUnassigned } from '../../lib/vnext/banProjects';
import { Card, Btn, Badge, Th, Td, Field, Input, Modal, Empty, SearchSelect, vnTime, useToast } from './ui';
import { type VCtx, isAdm, vnCan, uidOf } from './ctx';
import { effectiveSupportPct, fmtPct, pushPctHistory, validPct, banOfProject, policyOf, CDT_LABEL, MAX_LABEL, validMax, type SupportCdt, type BonusTier, parseBonusTiers, fmtTiers, fmtTierCond, fmtTierValue, MAX_BONUS_TIERS } from '../../lib/vnext/supportPct';
import { isBanKdLeader, isBanKdDeputy } from '../lib/orgPermissions';
import { planSetDeputy, planUnsetDeputy, planExclusiveSetDeputy, planLeaderSync, authUidOf, isDeputyOf, userLeadsBan } from '../lib/banRoleSync';

const norm = (s?: string) => (s || '').toLowerCase().trim();
const userLabel = (u: any) => `${u.fullName || u.displayName || u.email || uidOf(u)}${u.email ? ` · ${u.email}` : ''}`;

export function banProjects(c: VCtx, ban: any) {
  return c.projects.filter((p) => !p.deleted && (p.banKdId === ban.id || (!p.banKdId && p.banKdName && norm(p.banKdName) === norm(ban.name))));
}

export function useBanRole(c: VCtx, ban: any) {
  const me = { uid: c.uid, email: c.email };
  const leader = !!ban && isBanKdLeader(ban, me);
  const deputy = !!ban && isBanKdDeputy(ban, me);
  const admin = isAdm(c);
  return { leader, deputy, admin, manager: admin || leader || deputy };
}

function RoleCard({ c, ban }: { c: VCtx; ban: any }) {
  const { toast, node } = useToast();
  const admin = isAdm(c);
  const [pick, setPick] = useState('');
  const [leadPick, setLeadPick] = useState('');
  const [busy, setBusy] = useState(false);
  const deputies: string[] = Array.isArray(ban.deputyUids) ? ban.deputyUids : [];
  const findUser = (uid: string) => c.users.find((x) => uidOf(x) === uid || x.id === uid || x.uid === uid);
  const nameOf = (uid: string) => { const u = findUser(uid); return u ? (u.fullName || u.displayName || u.email) : uid; };
  const leaderName = ban.leaderUid ? nameOf(ban.leaderUid) : ban.leaderName || ban.leaderEmail || '';
  const opts = [{ value: '', label: '— Chọn người —' }, ...c.users.filter((u) => !u.mergedInto && !u.linkedToUid).map((u) => ({ value: authUidOf(u) || uidOf(u), label: userLabel(u) }))];
  const applyDeputy = async (u: any, set: boolean) => {
    if (!admin || !u) return;
    if (set) {
      if (userLeadsBan(ban, u)) return toast('Không thể vừa Trưởng vừa Phó cùng Ban', 'err');
      let exclusive;
      try { exclusive = planExclusiveSetDeputy(u, ban, c.banKds || []); }
      catch (e: any) { return toast(e?.message || String(e), 'err'); }
      if (exclusive.warnLines.length) {
        const ok = window.confirm(`Phó Ban chỉ thuộc đúng 1 Ban.\n\n${exclusive.warnLines.map((l) => '• ' + l).join('\n')}\n\nTiếp tục đặt Phó Ban «${ban.name}»?`);
        if (!ok) return;
      }
      setBusy(true);
      try {
        const batch = writeBatch(c.db);
        batch.update(doc(c.db, 'ban_kd', ban.id), { ...exclusive.banUpdate.data, updatedAt: serverTimestamp() });
        exclusive.sideBanUpdates.forEach((b) => batch.update(doc(c.db, 'ban_kd', b.id), { ...b.data, updatedAt: serverTimestamp() }));
        batch.update(doc(c.db, 'users', u.id), { ...exclusive.userUpdate, updatedAt: serverTimestamp() });
        await batch.commit();
        toast('Đã thêm Phó Ban (đúng 1 Ban)');
        banNotify(c, ban, `Ban ${ban.name}: Đã thêm Phó Ban`, '');
      } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
      setBusy(false);
      return;
    }
    const plan = planUnsetDeputy(ban, u);
    setBusy(true);
    try {
      const batch = writeBatch(c.db);
      batch.update(doc(c.db, 'ban_kd', ban.id), { ...plan.banUpdate.data, updatedAt: serverTimestamp() });
      if (plan.needsUserWrite && plan.userUpdate) batch.update(doc(c.db, 'users', u.id), { ...plan.userUpdate, updatedAt: serverTimestamp() });
      await batch.commit();
      toast('Đã bỏ Phó Ban');
      banNotify(c, ban, `Ban ${ban.name}: Đã bỏ Phó Ban`, '');
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
    setBusy(false);
  };
  const addDeputy = () => {
    if (!pick) return;
    const u = findUser(pick); if (!u) return toast('Không tìm thấy người', 'err');
    if (isDeputyOf(ban, u)) return toast('Đã là Phó Ban', 'err');
    applyDeputy(u, true).then(() => setPick(''));
  };
  const setLeader = async () => {
    const u = c.users.find((x) => authUidOf(x) === leadPick || uidOf(x) === leadPick); if (!u) return;
    const keep = (u.role || '') === 'gd_khoi';
    const plan = planLeaderSync(u, ban, c.banKds || []);
    const warn = plan.warnLines.length ? '\n\n' + plan.warnLines.map((l) => '• ' + l).join('\n') + '\n' : '';
    if (!window.confirm(`Trưởng Ban chỉ thuộc đúng 1 Ban.\nĐặt ${u.fullName || u.email} làm Trưởng Ban ${ban.name}?${keep ? ' (Giữ GĐ Khối)' : ' (→ Trưởng ban KD)'}${warn}`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(c.db);
      batch.update(doc(c.db, 'users', u.id), { ...plan.userUpdate, updatedAt: serverTimestamp() });
      plan.banUpdates.forEach((b) => batch.update(doc(c.db, 'ban_kd', b.id), { ...b.data, updatedAt: serverTimestamp() }));
      plan.deputyClears.forEach((b) => batch.update(doc(c.db, 'ban_kd', b.id), { ...b.data, updatedAt: serverTimestamp() }));
      await batch.commit();
      toast('Đã đổi Trưởng Ban'); banNotify(c, ban, `Ban ${ban.name}: Đã đổi Trưởng Ban`, '');
      setLeadPick('');
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
    setBusy(false);
  };
  return (
    <Card className="p-4 space-y-3" data-testid="vn-ban-roles">
      <div className="font-semibold text-[14px]">Trưởng Ban / Phó Ban · {ban.name}</div>
      <div className="text-[12px] text-[var(--mh-text-2)]">Trưởng Ban và Phó Ban được thêm, sửa, xoá dự án thuộc Ban và đặt Tỉ lệ hỗ trợ MKT. Đồng bộ với Cài đặt › Users.{admin ? ' Chỉ Admin gán.' : ''}</div>
      <div className="text-[13px]"><b>Trưởng Ban:</b> {leaderName || <span className="text-[var(--mh-text-3)]">Chưa có</span>}</div>
      {admin && <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end"><Field label="Đổi Trưởng Ban"><SearchSelect value={leadPick} onChange={setLeadPick} options={opts} className="w-full" /></Field><Btn onClick={setLeader} disabled={!leadPick || busy}>Đặt Trưởng Ban</Btn></div>}
      <div className="text-[13px]"><b>Phó Ban:</b> {!deputies.length && <span className="text-[var(--mh-text-3)]">Chưa có</span>}</div>
      <div className="flex flex-wrap gap-2">{deputies.map((d) => <span key={d} className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[12px]">{nameOf(d)}{admin && <button className="text-[var(--mh-err)] font-bold" title="Bỏ Phó Ban" disabled={busy} onClick={() => { const u = findUser(d); if (u && window.confirm(`Bỏ Phó Ban ${nameOf(d)}?`)) applyDeputy(u, false); }}>×</button>}</span>)}</div>
      {admin && <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end"><Field label="Thêm Phó Ban"><SearchSelect value={pick} onChange={setPick} options={opts} className="w-full" /></Field><Btn primary onClick={addDeputy} disabled={!pick || busy}>+ Phó Ban</Btn></div>}
      {node}
    </Card>
  );
}

/** Tab «Dự án của Ban». */
export function BanProjectsPanel({ c, ban }: { c: VCtx; ban: any }) {
  const { toast, node } = useToast();
  const role = useBanRole(c, ban);
  const can = role.admin || (role.manager && vnCan(c, 'vn.bankd.projects'));
  const list = useMemo(() => banProjects(c, ban).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi')), [c.projects, ban]);
  const [form, setForm] = useState<{ id?: string; name: string; cdtId: string; region: string; type: string } | null>(null);
  const { cdts } = useCdts(c);
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const free = useMemo(() => unassignedProjects(c.projects).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi')), [c.projects]);
  if (!ban) return <Card className="p-5 text-[13px]">Chưa chọn Ban KD.</Card>;
  const editable = (p: any) => can && (role.admin || p.banKdId === ban.id);

  const save = async () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return toast('Nhập tên dự án', 'err');
    if (c.projects.some((p) => p.id !== form.id && norm(p.name) === norm(name))) return toast('Đã có dự án trùng tên', 'err');
    setBusy(true);
    const now = new Date().toISOString();
    const cdt = form.cdtId ? (cdts.find((x) => x.id === form.cdtId) || null) : null;
    const base: any = { name, cdtId: cdt?.id || '', cdtName: cdt?.name || '', region: form.region.trim() || 'Chưa xác định', type: form.type.trim() || 'Khác', banKdName: ban.name || '', updatedAt: now, updatedBy: c.uid };
    try {
      if (form.id) await updateDoc(doc(c.db, 'projects', form.id), base);
      else await addDoc(collection(c.db, 'projects'), { ...base, banKdId: ban.id, createdAt: now, createdBy: c.uid });
      toast(form.id ? 'Đã sửa dự án' : 'Đã thêm dự án'); banNotify(c, ban, `${form.id ? 'Sửa' : 'Thêm'} dự án trong Ban: ${name}`, ''); setForm(null);
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
    setBusy(false);
  };
  // «Thêm dự án»: chỉ gắn dự án CÓ SẴN, chưa thuộc Ban nào (transaction kiểm tra lại trên server). Không tạo dự án mới.
  const link = async () => {
    if (!sel.length) return toast('Chọn ít nhất 1 dự án', 'err');
    setBusy(true); let ok = 0; const bad: string[] = [];
    for (const id of sel) {
      try {
        await runTransaction(c.db, async (tx) => {
          const ref = doc(c.db, 'projects', id); const snap = await tx.get(ref);
          if (!snap.exists() || !isProjectUnassigned(snap.data())) throw new Error('taken');
          tx.update(ref, { banKdId: ban.id, banKdName: ban.name || '', updatedAt: new Date().toISOString(), updatedBy: c.uid });
        });
        ok++;
      } catch (e: any) { bad.push((c.projects.find((p) => p.id === id)?.name || id) + (e?.message === 'taken' ? ' (đã thuộc Ban khác)' : ' (' + (e?.code || e?.message) + ')')); }
    }
    setBusy(false);
    if (ok) toast(`Đã gắn ${ok} dự án vào Ban`);
    if (bad.length) toast('Không gắn được: ' + bad.join(', '), 'err');
    if (!bad.length) { setPickOpen(false); setSel([]); setQ(''); }
  };
  // «Gỡ khỏi Ban»: chỉ bỏ liên kết Ban của dự án; dự án vẫn còn trong hệ thống (chỉ Admin xoá dự án).
  const unassign = async (p: any) => {
    if (!window.confirm(`Gỡ dự án «${p.name}» khỏi Ban ${ban.name}? Dự án vẫn còn trong hệ thống, chỉ không thuộc Ban này nữa.`)) return;
    setBusy(true);
    try { await updateDoc(doc(c.db, 'projects', p.id), { banKdId: '', banKdName: '', updatedAt: new Date().toISOString(), updatedBy: c.uid }); toast('Đã gỡ dự án khỏi Ban'); }
    catch (e: any) { toast('Không gỡ được: ' + (e?.code || e?.message), 'err'); }
    setBusy(false);
  };

  return (
    <div className="space-y-3" data-testid="vn-ban-projects">
      <RoleCard c={c} ban={ban} />
      <Card>
        <div className="px-4 py-3 flex items-center gap-2 border-b border-[var(--mh-border)]">
          <div className="font-semibold text-[14px] flex-1">Dự án của Ban · {list.length}</div>
          {can && <Btn small primary onClick={() => { setSel([]); setQ(''); setPickOpen(true); }} data-testid="vn-ban-add-project">+ Thêm dự án</Btn>}
        </div>
        {!can && <div className="px-4 py-2 text-[12px] text-[var(--mh-text-3)]">Chỉ Trưởng Ban / Phó Ban / Admin được thêm, sửa, gỡ dự án khỏi Ban.</div>}
        {!list.length ? <Empty>Ban chưa có dự án</Empty> : (
          <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Dự án</Th><Th>CĐT</Th><Th className="hidden sm:table-cell">Khu vực</Th><Th r>Hỗ trợ MKT</Th><Th></Th></tr></thead><tbody>
            {list.map((p) => { const e = effectiveSupportPct(p, c.banKds); return (
              <tr key={p.id}>
                <Td><div className="font-medium">{p.name}</div><div className="sm:hidden text-[11px] text-[var(--mh-text-3)]">{p.region || ''}</div></Td>
                <Td className="text-[12px]">{cdtNameOf(p, cdts) || '—'}</Td>
                <Td className="hidden sm:table-cell text-[12px]">{p.region || '—'}</Td>
                <Td r>{e ? <>{fmtPct(e.pct)}{e.source === 'ban' && <div className="text-[10px] text-[var(--mh-text-3)]">theo Ban</div>}</> : '—'}</Td>
                <Td r className="whitespace-nowrap">{editable(p) && <><Btn small onClick={() => setForm({ id: p.id, name: p.name || '', cdtId: p.cdtId || '', region: p.region || '', type: p.type || '' })}>Sửa</Btn> <Btn small danger disabled={busy} onClick={() => unassign(p)}>Gỡ khỏi Ban</Btn></>}</Td>
              </tr>); })}
          </tbody></table></div>
        )}
      </Card>
      <Modal open={pickOpen} onClose={() => !busy && setPickOpen(false)} title={`Thêm dự án có sẵn · Ban ${ban.name}`} footer={<><Btn onClick={() => setPickOpen(false)} disabled={busy}>Huỷ</Btn><Btn primary disabled={busy || !sel.length} onClick={link} data-testid="vn-ban-link-save">{busy ? 'Đang gắn…' : `Gắn ${sel.length || ''} dự án`}</Btn></>}>
        <div className="space-y-2" data-testid="vn-ban-pick">
          <div className="text-[12px] text-[var(--mh-text-2)]">Chỉ hiện dự án đã có trong hệ thống và <b>chưa thuộc Ban KD nào</b> (mỗi dự án chỉ thuộc 1 Ban). Dự án mới do Admin / Kế toán tạo ở Danh mục Dự án.</div>
          <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="Tìm dự án…" data-testid="vn-ban-pick-search" />
          <div className="max-h-[50vh] overflow-y-auto border border-[var(--mh-border)] rounded-lg divide-y divide-[var(--mh-surface-2)]">
            {free.filter((p) => !q.trim() || norm(p.name).includes(norm(q))).map((p) => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer" data-testid="vn-ban-pick-item">
                <input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />
                <span className="flex-1">{p.name}</span><span className="text-[11px] text-[var(--mh-text-3)]">{p.region || ''}</span>
              </label>))}
            {!free.length && <div className="p-3 text-[12px] text-[var(--mh-text-3)]">Không còn dự án nào chưa thuộc Ban.</div>}
          </div>
        </div>
      </Modal>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Sửa dự án' : `Thêm dự án · Ban ${ban.name}`} footer={<><Btn onClick={() => setForm(null)}>Huỷ</Btn><Btn primary disabled={busy} onClick={save}>Lưu</Btn></>}>
        {form && <div className="space-y-3">
          <Field label="Tên dự án *"><Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} data-testid="vn-ban-proj-name" /></Field>
          <Field label="Chủ đầu tư (CĐT)"><SearchSelect value={form.cdtId} onChange={(v: string) => setForm({ ...form, cdtId: v })} options={[{ value: '', label: '— Chưa chọn —' }, ...cdts.filter((x) => !x.deleted).map((x) => ({ value: x.id, label: x.name }))]} className="w-full" data-testid="vn-ban-proj-cdt" /></Field>
          <Field label="Khu vực"><Input value={form.region} onChange={(e: any) => setForm({ ...form, region: e.target.value })} /></Field>
          <Field label="Loại hình"><Input value={form.type} onChange={(e: any) => setForm({ ...form, type: e.target.value })} /></Field>
        </div>}
      </Modal>
      {node}
    </div>
  );
}

const tierRow = (t: BonusTier) => ({ pct: t.pct != null ? String(t.pct) : '', amount: t.amount != null ? String(t.amount) : '', minUnits: t.minUnits != null ? String(t.minUnits) : '', cond: t.cond });
const emptyTier = () => ({ pct: '', amount: '', minUnits: '', cond: '' });
export function TierList({ tiers }: { tiers: BonusTier[] }) {
  if (!tiers.length) return <span>—</span>;
  return <div className="space-y-0.5" data-testid="vn-tier-list">{tiers.map((t, i) => <div key={i}><b>M{i + 1}: {fmtTierValue(t)}</b>{fmtTierCond(t) && <span className="text-[var(--mh-text-2)] whitespace-pre-wrap"> — {fmtTierCond(t)}</span>}</div>)}</div>;
}

const toPct = (s: string): number | null | 'bad' => { const t = s.trim().replace(',', '.'); if (!t) return null; const n = Number(t); return validPct(n) ? n : 'bad'; };

/** Tab «Tỉ lệ hỗ trợ MKT». */
export function BanSupportPctPanel({ c, ban }: { c: VCtx; ban: any }) {
  const { toast, node } = useToast();
  const role = useBanRole(c, ban);
  const can = (role.admin || role.manager) && vnCan(c, 'vn.bankd.support_pct_edit');
  const list = useMemo(() => (ban ? banProjects(c, ban) : []).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi')), [c.projects, ban]);
  const [def, setDef] = useState<string>(validPct(ban?.supportPct) ? String(ban.supportPct) : '');
  const [defMax, setDefMax] = useState<string>(validMax(ban?.supportMaxPerSale) ? String(ban.supportMaxPerSale) : '');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [hist, setHist] = useState(false);
  const [pol, setPol] = useState<any>(null);
  if (!ban) return <Card className="p-5 text-[13px]">Chưa chọn Ban KD.</Card>;
  const savePolicy = async () => {
    const p = pol.p; const base = toPct(pol.base);
    if (base === 'bad') return toast('Tỉ lệ phải từ 0 đến 100', 'err');
    if (!role.admin && p.banKdId !== ban.id) return toast('Dự án chưa gắn mã Ban (dữ liệu cũ) — nhờ Admin sửa', 'err');
    const max = pol.max === '' ? null : Number(pol.max);
    if (max != null && !(Number.isFinite(max) && max >= 0 && max < 1e11)) return toast(MAX_LABEL + ' không hợp lệ', 'err');
    const parsed = parseBonusTiers(pol.tiers);
    if ('error' in parsed) return toast(parsed.error, 'err');
    const tiers = parsed.tiers;
    if (!['', 'dai_ly', 'khong'].includes(pol.cdt || '')) return toast('CĐT hỗ trợ không hợp lệ', 'err');
    const old = policyOf(p, c.banKds);
    const oldT = fmtTiers(old.bonusTiers), newT = fmtTiers(tiers);
    const note = [`Base ${validPct(p.supportPct) ? fmtPct(p.supportPct) : 'theo Ban'}→${base == null ? 'theo Ban' : fmtPct(base)}`, oldT !== newT ? `Bonus ${oldT}→${newT}` : '',
      `CĐT ${CDT_LABEL[old.cdt]}→${CDT_LABEL[pol.cdt as SupportCdt]}`, JSON.stringify(old.bonusTiers) !== JSON.stringify(tiers) && oldT === newT ? 'Điều kiện Bonus: đổi' : ''].filter(Boolean).join(' · ');
    try {
      // Mức 1 ghi kèm vào supportBonusPct/supportBonusCond để màn hình cũ vẫn đọc được.
      await updateDoc(doc(c.db, 'projects', p.id), { supportPct: base, supportBonusTiers: tiers, supportBonusPct: tiers[0]?.pct ?? null, supportBonusCond: tiers[0] ? fmtTierCond(tiers[0]).slice(0, 1000) : '', supportMaxPerSale: max, supportCdt: pol.cdt,
        supportPctHistory: pushPctHistory(p.supportPctHistory, { ...h(p.supportPct, base, 'project'), note }), updatedAt: new Date().toISOString(), updatedBy: c.uid });
      setPol(null); toast('Đã lưu chính sách hỗ trợ'); banNotify(c, ban, `Chính sách hỗ trợ đổi: ${p.name}`, note);
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const h = (from: any, to: number | null, scope: 'ban' | 'project') => ({ at: new Date().toISOString(), byUid: c.uid, byName: c.name, from: validPct(from) ? from : null, to, scope });

  const saveDefault = async () => {
    const v = toPct(def); if (v === 'bad') return toast('Tỉ lệ phải từ 0 đến 100', 'err');
    try { await updateDoc(doc(c.db, 'ban_kd', ban.id), { supportPct: v, supportPctHistory: pushPctHistory(ban.supportPctHistory, h(ban.supportPct, v, 'ban')), updatedAt: new Date().toISOString() }); toast('Đã lưu tỉ lệ chung của Ban'); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const saveDefaultMax = async () => {
    const v = defMax === '' ? null : Number(defMax);
    if (v != null && !validMax(v)) return toast(MAX_LABEL + ' không hợp lệ', 'err');
    const fm = (x: any) => (validMax(x) ? x.toLocaleString('vi-VN') + ' đ' : '—');
    try { await updateDoc(doc(c.db, 'ban_kd', ban.id), { supportMaxPerSale: v, supportPctHistory: pushPctHistory(ban.supportPctHistory, { at: new Date().toISOString(), byUid: c.uid, byName: c.name, from: validMax(ban.supportMaxPerSale) ? ban.supportMaxPerSale : null, to: v, scope: 'ban', kind: 'max', note: `${MAX_LABEL} chung: ${fm(ban.supportMaxPerSale)}→${fm(v)}` }), updatedAt: new Date().toISOString() }); toast('Đã lưu mức Max chung của Ban'); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const saveProject = async (p: any, raw: string) => {
    const v = toPct(raw); if (v === 'bad') return toast('Tỉ lệ phải từ 0 đến 100', 'err');
    if (!role.admin && p.banKdId !== ban.id) return toast('Dự án chưa gắn mã Ban (dữ liệu cũ) — nhờ Admin sửa', 'err');
    try { await updateDoc(doc(c.db, 'projects', p.id), { supportPct: v, supportPctHistory: pushPctHistory(p.supportPctHistory, { ...h(p.supportPct, v, 'project') }), updatedAt: new Date().toISOString(), updatedBy: c.uid }); setEdit((e) => { const n = { ...e }; delete n[p.id]; return n; }); toast(v == null ? 'Đã bỏ tỉ lệ riêng (theo Ban)' : 'Đã lưu tỉ lệ riêng'); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const history = [
    ...(Array.isArray(ban.supportPctHistory) ? ban.supportPctHistory.map((x: any) => ({ ...x, what: x.kind === 'max' ? 'Max / 1 sale chung của Ban' : 'Tỉ lệ chung của Ban' })) : []),
    ...list.flatMap((p) => (Array.isArray(p.supportPctHistory) ? p.supportPctHistory.map((x: any) => ({ ...x, what: p.name })) : [])),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const show = (v: any) => (validPct(v) ? fmtPct(v) : '—');

  return (
    <div className="space-y-3" data-testid="vn-ban-pct">
      <Card className="p-4 space-y-2">
        <div className="font-semibold text-[14px]">Tỉ lệ hỗ trợ MKT · Ban {ban.name}</div>
        <div className="text-[12px] text-[var(--mh-text-2)]">Tỉ lệ chung áp cho mọi dự án của Ban; dự án có mức riêng thì dùng mức riêng. Tỉ lệ hiện cạnh tên dự án khi Đăng ký MKT. Để trống = chưa đặt.</div>
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[200px_auto_auto] gap-2 items-end">
          <Field label="Tỉ lệ chung (%)"><Input value={def} onChange={(e: any) => setDef(e.target.value)} disabled={!can} inputMode="decimal" placeholder="VD: 30" data-testid="vn-ban-pct-default" /></Field>
          {can && <Btn primary onClick={saveDefault}>Lưu tỉ lệ chung</Btn>}
          <Btn onClick={() => setHist(true)}>Lịch sử</Btn>
        </div>
        {!can && <div className="text-[12px] text-[var(--mh-text-3)]">Chỉ Trưởng Ban / Phó Ban / Admin được đặt tỉ lệ.</div>}
      </Card>
      <Card>
        <div className="px-4 py-3 font-semibold text-[14px] border-b border-[var(--mh-border)]">Chính sách hỗ trợ theo dự án</div>
        {!list.length ? <Empty>Ban chưa có dự án</Empty> : (
          <div className="overflow-x-auto"><table data-mh-responsive className="w-full" data-testid="vn-ban-policy-table"><thead><tr><Th>Dự án</Th><Th r>Base</Th><Th>Mức Bonus & điều kiện</Th><Th>CĐT hỗ trợ</Th><Th></Th></tr></thead><tbody>
            {list.map((p) => { const po = policyOf(p, c.banKds); return (
              <tr key={p.id} data-testid="vn-ban-policy-row">
                <Td className="font-medium">{p.name}</Td>
                <Td r>{po.base != null ? <b>{fmtPct(po.base)}</b> : '—'}{po.baseSource === 'ban' && <div className="text-[10px] text-[var(--mh-text-3)]">theo Ban</div>}</Td>
                <Td className="text-[12px] max-w-[320px]"><TierList tiers={po.bonusTiers} /></Td>
                <Td className="text-[12px]">{CDT_LABEL[po.cdt]}</Td>
                <Td r className="whitespace-nowrap">{can && <Btn small onClick={() => setPol({ p, base: validPct(p.supportPct) ? String(p.supportPct) : '', tiers: po.bonusTiers.length ? po.bonusTiers.map(tierRow) : [emptyTier()], max: validMax(p.supportMaxPerSale) ? String(p.supportMaxPerSale) : '', cdt: po.cdt })} data-testid="vn-ban-policy-edit">Sửa</Btn>}</Td>
              </tr>); })}
          </tbody></table></div>
        )}
      </Card>
      <Modal open={!!pol} onClose={() => setPol(null)} title={`Chính sách hỗ trợ · ${pol?.p?.name || ''}`} footer={<><Btn onClick={() => setPol(null)}>Huỷ</Btn><Btn primary onClick={savePolicy} data-testid="vn-ban-policy-save">Lưu</Btn></>}>
        {pol && <div className="space-y-3" data-testid="vn-ban-policy-form">
          <Field label="Mức hỗ trợ cơ bản Base (%) — để trống = theo tỉ lệ chung của Ban"><Input value={pol.base} onChange={(e: any) => setPol({ ...pol, base: e.target.value })} inputMode="decimal" placeholder="VD: 30" data-testid="vn-pol-base" /></Field>
          <div className="space-y-2" data-testid="vn-pol-tiers">
            <div className="flex items-center justify-between"><div className="text-[12px] font-semibold text-[#3B4A61]">Mức Bonus & điều kiện nhận ({pol.tiers.length}/{MAX_BONUS_TIERS})</div>
              {pol.tiers.length < MAX_BONUS_TIERS && <Btn small onClick={() => setPol({ ...pol, tiers: [...pol.tiers, emptyTier()] })} data-testid="vn-pol-tier-add">+ Thêm mức bonus</Btn>}</div>
            {!pol.tiers.length && <div className="text-[12px] text-[var(--mh-text-3)]">Chưa có mức Bonus.</div>}
            {pol.tiers.map((t: any, i: number) => { const set = (k: string, v: string) => setPol({ ...pol, tiers: pol.tiers.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)) });
              const move = (d: number) => { const a = [...pol.tiers]; [a[i], a[i + d]] = [a[i + d], a[i]]; setPol({ ...pol, tiers: a }); };
              return <div key={i} className="rounded-lg border border-[var(--mh-border)] p-2 space-y-2" data-testid="vn-pol-tier">
                <div className="flex items-center gap-1"><b className="text-[12px] flex-1">Mức {i + 1}</b>
                  <Btn small onClick={() => move(-1)} disabled={i === 0} aria-label="Lên">↑</Btn><Btn small onClick={() => move(1)} disabled={i === pol.tiers.length - 1} aria-label="Xuống">↓</Btn>
                  <Btn small onClick={() => setPol({ ...pol, tiers: pol.tiers.filter((_: any, j: number) => j !== i) })} data-testid="vn-pol-tier-del">Xoá</Btn></div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Bonus (%)"><Input value={t.pct} onChange={(e: any) => set('pct', e.target.value)} inputMode="decimal" placeholder="VD: 5" data-testid="vn-pol-tier-pct" /></Field>
                  <Field label="hoặc Số tiền (đ)"><Input value={t.amount} onChange={(e: any) => set('amount', e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="VD: 7000000" data-testid="vn-pol-tier-amount" /></Field>
                  <Field label="Từ số căn"><Input value={t.minUnits} onChange={(e: any) => set('minUnits', e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="VD: 10" data-testid="vn-pol-tier-units" /></Field>
                </div>
                <Field label="Điều kiện nhận (mô tả)"><textarea className="w-full min-h-[48px] rounded-lg border border-[var(--mh-border)] p-2 text-[13px]" maxLength={1000} value={t.cond} onChange={(e) => set('cond', e.target.value)} data-testid="vn-pol-tier-cond" /></Field>
              </div>; })}
          </div>
          <Field label="CĐT hỗ trợ"><select className="h-9 w-full rounded-lg border border-[var(--mh-border)] px-2 text-[13px]" value={pol.cdt} onChange={(e) => setPol({ ...pol, cdt: e.target.value as SupportCdt })} data-testid="vn-pol-cdt"><option value="">— Chưa chọn —</option><option value="dai_ly">Theo chính sách đại lý</option><option value="khong">Không</option></select></Field>
        </div>}
      </Modal>
      <Modal open={hist} onClose={() => setHist(false)} title="Lịch sử Tỉ lệ hỗ trợ MKT" wide>
        {!history.length ? <Empty>Chưa có thay đổi</Empty> : <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>Thời gian (VN)</Th><Th>Người sửa</Th><Th>Áp cho</Th><Th r>Từ</Th><Th r>Thành</Th></tr></thead><tbody>
          {history.map((x, i) => <tr key={i}><Td className="whitespace-nowrap">{vnTime(x.at)}</Td><Td>{x.byName}</Td><Td>{x.what}{x.note && <div className="text-[11px] text-[var(--mh-text-2)]">{x.note}</div>}</Td><Td r>{x.kind === 'max' ? (validMax(x.from) ? x.from.toLocaleString('vi-VN') + ' đ' : '—') : show(x.from)}</Td><Td r className="font-semibold">{x.kind === 'max' ? (validMax(x.to) ? x.to.toLocaleString('vi-VN') + ' đ' : '—') : show(x.to)}</Td></tr>)}
        </tbody></table></div>}
      </Modal>
      {node}
    </div>
  );
}

export const CDT_COLLECTION = 'investors';
/** Danh sách CĐT (Chủ đầu tư) — mọi người đã đăng nhập đọc được. */
export function useCdts(c: VCtx) {
  const [cdts, setCdts] = useState<any[]>([]);
  useEffect(() => onSnapshot(collection(c.db, CDT_COLLECTION), (s) => setCdts(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), 'vi'))), () => setCdts([])), [c.db]);
  return { cdts };
}
export const cdtNameOf = (p: any, cdts: any[]) => (p?.cdtId ? cdts.find((x) => x.id === p.cdtId)?.name || p.cdtName || '' : p?.cdtName || '');

/** Quản lý CĐT: danh sách Chủ đầu tư (tên, liên hệ, ghi chú); thêm / sửa / xoá mềm. */
export function CdtPanel({ c }: { c: VCtx }) {
  const { toast, node } = useToast();
  const { cdts } = useCdts(c);
  const can = isAdm(c) || vnCan(c, 'vn.cdt.manage');
  const [showDel, setShowDel] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; contact: string; note: string } | null>(null);
  const list = cdts.filter((x) => showDel || !x.deleted);
  const projCount = (id: string) => c.projects.filter((p) => p.cdtId === id).length;
  const save = async () => {
    if (!form) return; const name = form.name.trim(); if (!name) return toast('Nhập tên CĐT', 'err');
    if (cdts.some((x) => x.id !== form.id && !x.deleted && norm(x.name) === norm(name))) return toast('Đã có CĐT trùng tên', 'err');
    const now = new Date().toISOString(); const data = { name, contact: form.contact.trim(), note: form.note.trim(), deleted: false, updatedAt: now, updatedBy: c.uid };
    try { if (form.id) await updateDoc(doc(c.db, CDT_COLLECTION, form.id), data); else await addDoc(collection(c.db, CDT_COLLECTION), { ...data, createdAt: now, createdBy: c.uid }); toast('Đã lưu CĐT'); setForm(null); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const setDel = async (x: any, deleted: boolean) => {
    if (deleted && !window.confirm(`Xoá CĐT «${x.name}»?${projCount(x.id) ? ` ${projCount(x.id)} dự án đang gắn CĐT này vẫn giữ tên CĐT.` : ''}`)) return;
    try { await updateDoc(doc(c.db, CDT_COLLECTION, x.id), { deleted, updatedAt: new Date().toISOString(), updatedBy: c.uid }); toast(deleted ? 'Đã xoá' : 'Đã khôi phục'); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  return (
    <div className="space-y-3" data-testid="vn-cdt">
      <Card>
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-[var(--mh-border)]">
          <div className="font-semibold text-[14px] flex-1">Quản lý CĐT (Chủ đầu tư) · {cdts.filter((x) => !x.deleted).length}</div>
          <label className="text-[12px] flex items-center gap-1"><input type="checkbox" checked={showDel} onChange={(e) => setShowDel(e.target.checked)} /> Hiện đã xoá</label>
          {can && <Btn small primary onClick={() => setForm({ name: '', contact: '', note: '' })}>+ Thêm CĐT</Btn>}
        </div>
        {!can && <div className="px-4 py-2 text-[12px] text-[var(--mh-text-3)]">Chỉ Admin (hoặc vai trò được cấp quyền «Quản lý CĐT») được sửa danh sách.</div>}
        {!list.length ? <Empty>Chưa có CĐT</Empty> : (
          <div className="overflow-x-auto"><table data-mh-responsive className="w-full"><thead><tr><Th>CĐT</Th><Th className="hidden sm:table-cell">Liên hệ</Th><Th className="hidden sm:table-cell">Ghi chú</Th><Th r>Dự án</Th><Th></Th></tr></thead><tbody>
            {list.map((x) => <tr key={x.id} className={x.deleted ? 'opacity-50' : ''}>
              <Td><div className="font-medium">{x.name}{x.deleted && <Badge c="mute">đã xoá</Badge>}</div><div className="sm:hidden text-[11px] text-[var(--mh-text-3)]">{x.contact}</div></Td>
              <Td className="hidden sm:table-cell text-[12px]">{x.contact || '—'}</Td><Td className="hidden sm:table-cell text-[12px]">{x.note || '—'}</Td>
              <Td r>{projCount(x.id)}</Td>
              <Td r className="whitespace-nowrap">{can && (x.deleted ? <Btn small onClick={() => setDel(x, false)}>Khôi phục</Btn> : <><Btn small onClick={() => setForm({ id: x.id, name: x.name || '', contact: x.contact || '', note: x.note || '' })}>Sửa</Btn> <Btn small danger onClick={() => setDel(x, true)}>Xoá</Btn></>)}</Td>
            </tr>)}
          </tbody></table></div>)}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Sửa CĐT' : 'Thêm CĐT'} footer={<><Btn onClick={() => setForm(null)}>Huỷ</Btn><Btn primary onClick={save}>Lưu</Btn></>}>
        {form && <div className="space-y-3">
          <Field label="Tên CĐT *"><Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} data-testid="vn-cdt-name" /></Field>
          <Field label="Liên hệ (tuỳ chọn)"><Input value={form.contact} onChange={(e: any) => setForm({ ...form, contact: e.target.value })} placeholder="Người liên hệ, SĐT, email" /></Field>
          <Field label="Ghi chú (tuỳ chọn)"><Input value={form.note} onChange={(e: any) => setForm({ ...form, note: e.target.value })} /></Field>
        </div>}
      </Modal>
      {node}
    </div>
  );
}

export { banOfProject };
export default BanProjectsPanel;

/** Báo Trưởng / Phó Ban khi Ban mình có thay đổi (trừ chính người sửa). */
function banNotify(c: VCtx, ban: any, title: string, body: string) {
  for (const u of new Set(banManagers(c, ban?.id))) pushNotif(c, u, { type: 'ban_change', title, body: `${body ? body + ' · ' : ''}bởi ${c.name}`, link: '/quan-ly-ban-kd', refId: ban?.id });
}
