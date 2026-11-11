import { isSupplement, suppStatus, suppViewLabel } from '../../lib/vnext/ntSupplement';
import { pastBlock } from './locks';
import { useDirtyGuard } from '../lib/chunkReload';
import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where, getDoc, Timestamp } from 'firebase/firestore';
import { Shell, Card, Btn, Badge, Th, Td, Field, Select, Input, Tabs, Modal, Empty, Kpi, fmt, fmtM, vnTime, useToast , SearchSelect } from './ui';
import { type VCtx, isAdmOrMod, canViewAll, gdkdTeams, teamName, blockName, blockOfTeam, teamsOfBlock, projectName, vnCan, useNsLines, userName } from './ctx';
import { asArr } from './ctx';
import { writeBatch } from 'firebase/firestore';
import { ntFileName, ntDrivePath, ntKey, findDuplicate, implementerOptions } from '../../lib/vnext/onboarding';
import { assignImplementer, assignManualImplementer } from './ntAssign';
import { NT_MANUAL_FEATURE, NT_MANUAL_LABEL, NT_MANUAL_VALUE, ntManualAllowed, isManualImplementer, implementerLabel } from '../../lib/vnext/ntManual';
import { ManualAssigneeDialog } from '../components/acceptance/ManualAssigneeDialog';
import { buildReport, buildReconcile, normalizeMonth, isAccepted, GROUP_ORDER, GROUP_LABEL, GROUP_CHANNELS, groupCost, recordVat, channelValue, clampShareDays, newToken } from '../../lib/vnext/ntReport';
import { periodLabel, getPeriodOf, addPeriods } from '../../lib/vnext/period';
import { exportBaseName, printWithTitle, blockCodeOf, teamCodeOf } from '../../lib/vnext/exportName';
import { Deck, exportPptx, type DeckData, type DeckImage } from './ntDeck';
import { listenTeamScoped } from './teamScoped';
import { PhotoViewer } from './PhotoViewer';
import { storageFor, saveImageMeta, driveStatus, type ImgMeta } from './storage';
import { InvoiceSection, NtInvoiceModal, INVOICE_FEATURE, useInvoices, invoiceDeckImages, type Invoice } from './InvoiceViews';
import { extractImageFiles, readClipboardImages, pasteSummary } from '../../lib/vnext/pasteImages';

const shortCode = (id: string) => String(id || '').slice(-6).toUpperCase();

export function toDeck(c: VCtx, rep: ReturnType<typeof buildReport>, images: ImgMeta[], title: string, scopeLabel: string, month: string, invoices: Invoice[] = []): DeckData {
  const tn = (r: any) => r.teamName || teamName(c, r.teamId);
  return {
    title, scopeLabel, periodLabel: periodLabel(month), createdAt: new Date().toISOString(),
    groups: rep.groups.map((g) => ({ label: g.label, cost: g.cost, vat: g.vat, leads: g.leads, channels: g.channels, projects: g.projects.map((p) => ({ projectId: p.projectId, projectName: p.projectName, cost: p.cost, leads: p.leads, rows: p.rows.map((r) => ({ id: r.id, user: r.rec.implementerName || '—', team: tn(r.rec), code: shortCode(r.id), cost: r.cost, leads: r.leads, channels: r.channels })) })) })),
    projects: rep.projects, total: rep.total,
    records: rep.records.map((r: any) => ({
      id: r.id, code: shortCode(r.id), user: r.implementerName || '—', team: tn(r), block: r.blockName || blockName(c, r.blockId || blockOfTeam(c, r.teamId)), project: projectName(c, r.projectId, r.projectName), projectId: r.projectId,
      cost: GROUP_ORDER.reduce((s, g) => s + groupCost(r, g), 0), vat: recordVat(r), leads: Number(r.caNhanNopTien) || 0,
      groups: GROUP_ORDER.filter((g) => groupCost(r, g) > 0).map((g) => ({ label: GROUP_LABEL[g], cost: groupCost(r, g), channels: GROUP_CHANNELS[g].filter((ch) => channelValue(r, ch.key) > 0).map((ch) => ({ label: ch.label, v: channelValue(r, ch.key) })) })),
    })),
    images: images.filter((i) => rep.records.some((r: any) => r.id === i.acceptanceId)).map((i): DeckImage => ({ id: i.id, recordId: i.acceptanceId, caption: i.caption, order: i.order, provider: i.provider, ref: i.ref })).concat(invoiceDeckImages(invoices, rep.records)),
  };
}

/** Tên tệp + thư mục Drive theo quy ước: Tháng/Khối/Phòng/User/Dự án; 'MAYHOMES - Mã Phòng - Dự án - NV - Tháng M YYYY - NN'. */
export function ntNaming(c: VCtx, r: any, month: string, order: number) {
  const bid = r.blockId || blockOfTeam(c, r.teamId);
  const t = c.teams.find((x) => x.id === r.teamId);
  const b = c.blocks.find((x) => x.id === bid);
  const p = { teamCode: r.teamCode || t?.teamCode || r.teamName || teamName(c, r.teamId), projectName: projectName(c, r.projectId, r.projectName), implementerName: r.implementerName || 'Chưa có người phụ trách', month };
  return { name: ntFileName({ ...p, order }), path: ntDrivePath({ ...p, blockCode: b?.blockCode || b?.name || '' }) };
}

export default function NtReportPage({ c, fixedBlockIds, fixedTeamIds }: { c: VCtx; fixedBlockIds?: string[]; fixedTeamIds?: string[] }) {
  const { toast, node } = useToast();
  const months = useMemo(() => [...new Set(c.acceptances.filter((a) => isAccepted(a)).map((a) => normalizeMonth(a.month)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().reverse(), [c.acceptances]);
  const [month, setMonth] = useState(months[0] || addPeriods(getPeriodOf(), -1));
  const [monthTouched, setMonthTouched] = useState(false);
  // Dữ liệu nghiệm thu tải sau lần render đầu: tự chọn tháng mới nhất có dữ liệu cho tới khi người dùng tự đổi.
  useEffect(() => { if (!monthTouched && months.length && !months.includes(month)) setMonth(months[0]); }, [months, monthTouched, month]);
  const mgr = isAdmOrMod(c);
  const all = canViewAll(c);
  const allowedTeams = useMemo(() => {
    if (fixedTeamIds) return fixedTeamIds;
    if (fixedBlockIds) return fixedBlockIds.flatMap((b) => teamsOfBlock(c, b).map((t) => t.id));
    if (all) return null;
    return gdkdTeams(c);
  }, [fixedTeamIds, fixedBlockIds, all, c]);
  const [level, setLevel] = useState<'khoi' | 'phong' | 'user'>(allowedTeams && allowedTeams.length === 1 ? 'phong' : 'khoi');
  const [blockId, setBlockId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [userKey, setUserKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState('report');
  const [images, setImages] = useState<ImgMeta[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const store = storageFor(c.db, c.settings?.ntStorageProvider);

  useEffect(() => listenTeamScoped(c, 'acceptanceImages', [], setImages), [c.db, c.role, gdkdTeams(c).join(',')]);

  const base = c.acceptances.filter((a) => normalizeMonth(a.month) === month && (!allowedTeams || allowedTeams.includes(a.teamId)));
  const blockOpts = [...new Set(base.map((a) => a.blockId || blockOfTeam(c, a.teamId)).filter(Boolean))];
  const teamOpts = [...new Set(base.filter((a) => !blockId || (a.blockId || blockOfTeam(c, a.teamId)) === blockId).map((a) => a.teamId).filter(Boolean))];
  const userOpts = [...new Set(base.filter((a) => !teamId || a.teamId === teamId).map((a) => a.implementerName).filter(Boolean))].sort();
  const filtered = base.filter((a) => (!blockId || (a.blockId || blockOfTeam(c, a.teamId)) === blockId) && (level === 'khoi' || !teamId || a.teamId === teamId) && (level !== 'user' || !userKey || a.implementerName === userKey));
  const rep = useMemo(() => buildReport(filtered, { projectId: projectId || undefined }, c.projects), [filtered, projectId, c.projects]);
  const scopeLabel = level === 'user' && userKey ? `User: ${userKey}${teamId ? ' · ' + teamName(c, teamId) : ''}` : level !== 'khoi' && teamId ? `Phòng ${teamName(c, teamId)}` : blockId ? `Khối ${blockName(c, blockId)}` : allowedTeams ? 'Phạm vi được giao' : 'Toàn hệ thống';
  const invoices = useInvoices(c);
  const deck = useMemo(() => toDeck(c, rep, images, 'Báo cáo Nghiệm thu', scopeLabel, month, invoices), [rep, images, scopeLabel, month, invoices]);
  const resolve = (img: DeckImage) => storageFor(c.db, img.provider).url(img as any);
  const blkCodes = blockId ? [blockCodeOf(c.blocks.find((b) => b.id === blockId)) || blockId] : [...new Set(filtered.map((a) => a.blockId || blockOfTeam(c, a.teamId)).filter(Boolean))].map((b) => blockCodeOf(c.blocks.find((x) => x.id === b)) || b);
  const fname = exportBaseName({ blockCode: blkCodes, month, teamCode: level !== 'khoi' && teamId ? (teamCodeOf(c.teams.find((t) => t.id === teamId)) || teamName(c, teamId)) : '', projectName: projectId ? (rep.projects.find((p) => p.projectId === projectId)?.projectName || projectName(c, projectId)) : '' });

  return (
    <Shell title="Báo cáo Nghiệm thu" sub="Tự động từ bản ghi «Đã nghiệm thu» · Tổng → Nhóm → Dự án → bản ghi · Chi phí trước VAT, VAT và Tổng sau VAT (khớp mục Nghiệm thu MKT)"
      actions={<>
        <Btn onClick={() => printWithTitle(fname, () => document.body.classList.add('nt-print'), () => document.body.classList.remove('nt-print'))}>⬇ PDF</Btn>
        <Btn onClick={async () => { toast('Đang tạo PPTX…'); try { await exportPptx(deck, resolve, fname + '.pptx'); } catch (e: any) { toast('Lỗi xuất PPTX: ' + e.message, 'err'); } }}>⬇ PPTX</Btn>
        {mgr && vnCan(c, 'vn.share_links.manage') && <Btn primary onClick={() => setShareOpen(true)}>🔗 Link chia sẻ</Btn>}
      </>}>
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Tháng"><Select value={month} onChange={(v: string) => { setMonthTouched(true); setMonth(v); }} options={(months.length ? months : [month]).map((m) => ({ value: m, label: periodLabel(m) }))} /></Field>
        <Field label="Cấp báo cáo"><div className="flex rounded-lg border border-[var(--mh-border)] overflow-hidden h-9">{(['khoi', 'phong', 'user'] as const).map((l) => <button key={l} onClick={() => setLevel(l)} className={`px-3 text-[13px] ${level === l ? 'bg-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)]'}`}>{l === 'khoi' ? 'Khối' : l === 'phong' ? 'Phòng' : 'User'}</button>)}</div></Field>
        {blockOpts.length > 1 && <Field label="Khối"><SearchSelect value={blockId} onChange={(v: string) => { setBlockId(v); setTeamId(''); setUserKey(''); }} options={[{ value: '', label: 'Tất cả' }, ...blockOpts.map((b) => ({ value: b, label: blockName(c, b) }))]} /></Field>}
        {level !== 'khoi' && <Field label="Phòng"><SearchSelect value={teamId} onChange={(v: string) => { setTeamId(v); setUserKey(''); }} options={[{ value: '', label: 'Tất cả' }, ...teamOpts.map((t) => ({ value: t, label: teamName(c, t) }))]} /></Field>}
        {level === 'user' && <Field label="User"><SearchSelect value={userKey} onChange={setUserKey} options={[{ value: '', label: 'Tất cả' }, ...userOpts.map((u) => ({ value: u, label: u }))]} /></Field>}
        <Field label="Dự án"><SearchSelect value={projectId} onChange={setProjectId} options={[{ value: '', label: 'Tất cả' }, ...rep.projects.map((p) => ({ value: p.projectId, label: p.projectName }))]} /></Field>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 nt-noprint">
        <Kpi label="Bản ghi Đã nghiệm thu" value={rep.records.length} />
        <Kpi label="Chi phí (trước VAT)" value={fmtM(rep.total.cost)} hint={`VAT ${fmt(rep.total.vat)} đ`} />
        <Kpi label="Tổng sau VAT" value={fmtM(rep.total.withVat)} hint={`${fmt(rep.total.withVat)} đ`} />
        <Kpi label="Lead" value={fmt(rep.total.leads)} hint={rep.total.leads ? `Giá/lead ${fmt(rep.total.cost / rep.total.leads)} đ` : undefined} />
        <Kpi label="Bản ghi chưa có ảnh" value={rep.records.filter((r: any) => !images.some((i) => i.acceptanceId === r.id)).length} />
      </div>
      <div className="nt-noprint"><Tabs tabs={[{ id: 'report', label: 'Báo cáo (slide)' }, { id: 'reconcile', label: 'Đối chiếu NS / NT' }, { id: 'invoices', label: 'Hóa đơn' }, { id: 'images', label: 'Ảnh Nghiệm thu', hidden: !mgr }, { id: 'assign', label: 'Gán người phụ trách', hidden: !vnCan(c, 'vn.nt_records.assign') }]} value={tab} onChange={setTab} /></div>
      {tab === 'report' && (rep.records.length ? <><Deck d={deck} resolve={resolve} /><InvoiceSection c={c} records={rep.records} /></> : <Card><Empty>Không có bản ghi «Đã nghiệm thu» cho bộ lọc này</Empty></Card>)}
      {tab === 'invoices' && <InvoiceSection c={c} records={rep.records} />}
      {tab === 'reconcile' && <NtReconcile c={c} month={month} filtered={filtered} teamId={teamId} blockId={blockId} projectId={projectId} allowedTeams={allowedTeams} />}
      {tab === 'images' && mgr && <ImageManager c={c} records={rep.records} images={images} store={store} month={month} />}
      {tab === 'assign' && vnCan(c, 'vn.nt_records.assign') && <NtAssign c={c} month={month} allowedTeams={allowedTeams} images={images} store={store} />}
      {shareOpen && <ShareDialog c={c} onClose={() => setShareOpen(false)} deck={{ ...deck, fileName: fname }} month={month} scopeLabel={scopeLabel} images={images} />}
      {node}
    </Shell>
  );
}


function NtReconcile({ c, month, filtered, teamId, blockId, projectId, allowedTeams }: { c: VCtx; month: string; filtered: any[]; teamId: string; blockId: string; projectId: string; allowedTeams: string[] | null }) {
  const { lines } = useNsLines(c, [month], 'all');
  const rows = useMemo(() => buildReconcile(lines, filtered, { month, teamIds: teamId ? [teamId] : allowedTeams, blockId: blockId || undefined, projectId: projectId || undefined }, c.projects), [lines, filtered, month, teamId, blockId, projectId, allowedTeams, c.projects]);
  const totNs = rows.reduce((s, r) => s + r.ns, 0), totCost = rows.reduce((s, r) => s + r.cost, 0);
  return (
    <Card data-testid="vn-nt-reconcile">
      <div className="px-4 py-3 border-b border-[var(--mh-border)] flex flex-wrap gap-2 items-center">
        <div className="font-semibold text-[14px] flex-1">Đối chiếu NS MKT ↔ Nghiệm thu (trước VAT)</div>
        <Badge c="info">NS {fmtM(totNs)}</Badge>
        <Badge c="warn">NT {fmtM(totCost)}</Badge>
        <Badge c={totNs - totCost >= 0 ? 'ok' : 'err'}>Chênh {fmtM(totNs - totCost)}</Badge>
      </div>
      <div className="px-4 py-2 text-[12px] text-[var(--mh-text-2)]">Mỗi dòng = 1 người × 1 dự án trong {periodLabel(month)}. NS = đăng ký kind=user; Chi phí NT = tổng kênh trước VAT của bản ghi «Đã nghiệm thu» đã gán Người phụ trách. % = chi phí / NS.</div>
      {!rows.length ? <Empty>Chưa có NS hoặc bản ghi Nghiệm thu đã gán người trong phạm vi này</Empty> : (
        <>
        <div className="md:hidden p-2.5 grid gap-2" data-testid="vn-reconcile-cards">
          {rows.map((r) => (
            <div key={(r.manual ? 'm:' + r.name : r.uid) + r.projectId} className="rounded-xl border border-[var(--mh-border)] p-3 space-y-1" data-testid="vn-reconcile-row">
              <div className="font-semibold text-[14px]">{r.name || userName(c, r.uid)}{r.manual && <span className="ml-1 text-[11px] text-[var(--mh-text-3)]">(tự nhập)</span>}</div>
              <div className="text-[12px] text-[var(--mh-text-2)]">{teamName(c, r.teamId)} · {projectName(c, r.projectId, r.projectName)}</div>
              <div className="grid grid-cols-2 gap-1 text-[12px] tabular-nums">
                <div>NS: <b>{fmt(r.ns)}</b></div><div>NT: <b>{fmt(r.cost)}</b></div>
                <div className={r.diff < 0 ? 'text-[var(--mh-err)]' : 'text-[var(--mh-ok)]'}>Chênh: <b>{fmt(r.diff)}</b></div>
                <div>%: <b>{r.pct == null ? (r.cost > 0 ? '∞' : '—') : `${r.pct}%`}</b> · {r.records} bản ghi</div>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto"><table data-mh-responsive className="w-full text-[13px]"><thead><tr><Th>Người</Th><Th>Phòng</Th><Th>Dự án</Th><Th r>NS đăng ký</Th><Th r>Chi phí NT</Th><Th r>Chênh (NS−NT)</Th><Th r>%</Th><Th r>Bản ghi</Th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={(r.manual ? 'm:' + r.name : r.uid) + r.projectId} className="border-t border-[var(--mh-border)]" data-testid="vn-reconcile-row">
              <Td>{r.name || userName(c, r.uid)}{r.manual && <span className="ml-1 text-[11px] text-[var(--mh-text-3)]" data-testid="vn-reconcile-manual">(tự nhập)</span>}</Td>
              <Td>{teamName(c, r.teamId)}</Td>
              <Td>{projectName(c, r.projectId, r.projectName)}</Td>
              <Td r className="tabular-nums">{fmt(r.ns)}</Td>
              <Td r className="tabular-nums">{fmt(r.cost)}</Td>
              <Td r className={`tabular-nums font-medium ${r.diff < 0 ? 'text-[var(--mh-err)]' : 'text-[var(--mh-ok)]'}`}>{fmt(r.diff)}</Td>
              <Td r className="tabular-nums">{r.pct == null ? (r.cost > 0 ? '∞' : '—') : `${r.pct}%`}</Td>
              <Td r>{r.records}</Td>
            </tr>
          ))}</tbody>
          <tfoot><tr className="border-t-2 border-[var(--mh-border)] font-semibold"><Td colSpan={3}>Tổng</Td><Td r>{fmt(totNs)}</Td><Td r>{fmt(totCost)}</Td><Td r>{fmt(totNs - totCost)}</Td><Td r>{totNs > 0 ? `${Math.round(totCost / totNs * 1000) / 10}%` : '—'}</Td><Td r>{rows.reduce((s, r) => s + r.records, 0)}</Td></tr></tfoot>
        </table></div>
        </>
      )}
    </Card>
  );
}

export function ImageManager({ c, records, images, store, month }: any) {
  const { toast, node } = useToast();
  const [busy, setBusy] = useState('');
  const [view, setView] = useState<{ list: ImgMeta[]; i: number } | null>(null);
  const [prog, setProg] = useState<{ rid: string; items: { name: string; st: 'wait' | 'up' | 'ok' | 'err'; msg?: string }[] } | null>(null);
  const canUpload = vnCan(c, 'vn.nt_images.upload');
  // Bản ghi nhận ảnh dán (Ctrl+V / Cmd+V): bản ghi duy nhất, hoặc ô «Dán ảnh» vừa bấm/focus.
  const [active, setActive] = useState('');
  const [drag, setDrag] = useState('');
  const target = active && records.some((r: any) => r.id === active) ? active : (records.length === 1 ? records[0].id : '');
  const busyRef = React.useRef(''); busyRef.current = busy;
  useDirtyGuard(!!busy);
  const uploadRef = React.useRef<any>(null);
  const report = (res: any) => { const m = pasteSummary(res); if (m) toast(m.msg, m.err ? 'err' : undefined); };
  const takeFiles = (r: any, res: any) => { report(res); if (res.files.length) uploadRef.current?.(r, res.files); };
  useEffect(() => {
    if (!canUpload || !target) return;
    const onPaste = (e: ClipboardEvent) => {
      const r = records.find((x: any) => x.id === target); if (!r) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.closest?.('[data-vn-paste-zone]');
      const res = extractImageFiles(e.clipboardData);
      if (typing && !res.files.length && !res.tooLarge.length) return; // dán chữ vào ô chú thích → để mặc định
      e.preventDefault();
      if (busyRef.current) return toast('Đang upload ảnh — chờ xong rồi dán tiếp', 'err');
      takeFiles(r, res);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUpload, target, records]);
  const pasteBtn = async (r: any) => { setActive(r.id); if (busy) return; takeFiles(r, await readClipboardImages()); };
  const upload = async (r: any, files: FileList | File[] | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    { const pb = pastBlock(c.role, 'nt', r.month || month); if (pb) { toast(pb, 'err'); return; } }
    setBusy(r.id);
    const items = list.map((f) => ({ name: f.name, st: 'wait' as const, msg: '' as string | undefined }));
    const put = (k: number, st: any, msg?: string) => { (items as any)[k] = { ...items[k], st, msg }; setProg({ rid: r.id, items: [...items] }); };
    setProg({ rid: r.id, items: [...items] });
    const existing = images.filter((i: ImgMeta) => i.acceptanceId === r.id);
    let order = existing.reduce((m: number, i: ImgMeta) => Math.max(m, i.order), 0);
    let ok = 0;
    for (let k = 0; k < list.length; k++) {
      put(k, 'up');
      try {
        order += 1;
        const { name, path } = ntNaming(c, r, month, order);
        const { ref } = await store.upload(list[k], { name, path, teamId: r.teamId || '', acceptanceId: r.id });
        await saveImageMeta(c.db, { acceptanceId: r.id, teamId: r.teamId || '', provider: store.id, ref, name, caption: '', order, uploadedBy: c.uid, uploadedByName: c.name, uploadedAt: new Date().toISOString() });
        ok++; put(k, 'ok');
      } catch (e: any) { put(k, 'err', e?.message || e?.code || 'Lỗi'); }
    }
    if (ok === list.length) toast(`Đã tải ${ok} ảnh`); else toast(`Tải xong ${ok}/${list.length} ảnh — ${list.length - ok} ảnh lỗi`, 'err');
    setBusy('');
  };
  uploadRef.current = upload;
  const setCaption = async (i: ImgMeta, caption: string) => { try { await updateDoc(doc(c.db, 'acceptanceImages', i.id), { caption }); } catch (e: any) { toast('Lỗi: ' + e.code, 'err'); } };
  const move = async (i: ImgMeta, list: ImgMeta[], dir: number) => {
    const idx = list.findIndex((x) => x.id === i.id); const j = list[idx + dir]; if (!j) return;
    await updateDoc(doc(c.db, 'acceptanceImages', i.id), { order: j.order }); await updateDoc(doc(c.db, 'acceptanceImages', j.id), { order: i.order });
  };
  const remove = async (i: ImgMeta) => {
    if (!window.confirm(i.provider === 'drive' ? 'Xoá ảnh này? File trên Google Drive sẽ được chuyển vào Thùng rác (khôi phục được trong 30 ngày).' : 'Xoá ảnh này?')) return;
    try {
      // Drive trước: lỗi Drive → giữ bản ghi (không mồ côi file).
      if (i.provider === 'drive') await storageFor(c.db, 'drive').remove(i);
      await deleteDoc(doc(c.db, 'acceptanceImages', i.id));
      if (i.provider !== 'drive') await storageFor(c.db, i.provider).remove(i).catch(() => {});
      toast(i.provider === 'drive' ? 'Đã xoá · file Drive đã vào Thùng rác' : 'Đã xoá');
    } catch (e: any) { toast('Không xoá được: ' + (e?.message || e?.code) + ' — ảnh vẫn được giữ', 'err'); }
  };
  return (
    <Card>
      <div className="px-4 py-3 text-[13px] border-b border-[var(--mh-border)] flex flex-wrap gap-2 items-center"><b className="flex-1">Ảnh theo bản ghi (chỉ Admin/Mod)</b><Badge c="info">Lưu trữ: {store.label}</Badge></div>
      <div className="divide-y divide-[var(--mh-border)]">
        {records.map((r: any) => {
          const list = images.filter((i: ImgMeta) => i.acceptanceId === r.id).sort((a: ImgMeta, b: ImgMeta) => a.order - b.order);
          return (
            <div key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="flex-1 min-w-0"><div className="font-semibold text-[13px]">{projectName(c, r.projectId, r.projectName)} › {r.implementerName}</div><div className="text-[11px] text-[var(--mh-text-3)]">#{shortCode(r.id)} · {r.teamName || teamName(c, r.teamId)}</div>
                  <div className="text-[11px] text-[var(--mh-text-2)]" data-testid="vn-nt-path">Drive: {ntNaming(c, r, month, list.length + 1).path.join(' / ')} · Tên: {ntNaming(c, r, month, list.length + 1).name}</div></div>
                {!list.length && <Badge c="warn">Chưa có ảnh Nghiệm thu</Badge>}
                {vnCan(c, 'vn.nt_images.upload') && <label data-testid="vn-nt-upload" className={`h-8 px-2.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer bg-[var(--mh-navy)] text-white ${busy ? 'opacity-50 pointer-events-none' : ''}`}>{busy === r.id ? <><span className="inline-block w-3 h-3 border-2 border-white/60 border-t-transparent rounded-full animate-spin" /> Đang upload ảnh...</> : '⬆ Tải ảnh'}<input type="file" accept="image/*" multiple className="hidden" disabled={!!busy} onChange={(e) => upload(r, e.target.files)} /></label>}
              </div>
              {canUpload && <div className="mb-2 flex items-stretch gap-2">
                <div data-vn-paste-zone data-testid="vn-nt-paste" data-active={target === r.id ? '1' : '0'} tabIndex={0} contentEditable suppressContentEditableWarning inputMode="none" spellCheck={false}
                  aria-label="Dán ảnh (Ctrl+V)" onFocus={() => setActive(r.id)} onClick={() => setActive(r.id)}
                  onBeforeInput={(e) => e.preventDefault()} onKeyDown={(e) => { if (!(e.ctrlKey || e.metaKey) && e.key.length === 1) e.preventDefault(); }}
                  onDragOver={(e) => { e.preventDefault(); setDrag(r.id); }} onDragLeave={() => setDrag('')}
                  onDrop={(e) => { e.preventDefault(); setDrag(''); setActive(r.id); if (busy) return; takeFiles(r, extractImageFiles(e.dataTransfer)); }}
                  className={`flex-1 min-h-[40px] rounded-lg border-2 border-dashed px-3 py-2 text-[12px] text-[var(--mh-text-2)] outline-none cursor-text select-none caret-transparent ${drag === r.id ? 'border-[var(--mh-navy)] bg-[var(--mh-navy-50)]' : target === r.id ? 'border-[#9DB4E3] bg-[#F7F9FD]' : 'border-[#D5DCE6]'} focus:border-[var(--mh-navy)]`}>
                  <span contentEditable={false}><span className="hidden md:inline">📋 <b>Dán ảnh (Ctrl+V / ⌘V)</b> hoặc kéo-thả ảnh vào đây{target === r.id ? '' : ' — bấm vào ô này trước khi dán'}</span><span className="md:hidden">📋 <b>Dán ảnh</b>: nhấn giữ ô này → Dán, hoặc bấm nút bên cạnh</span></span>
                </div>
                <button type="button" className="md:hidden h-10 px-3 rounded-lg border border-[var(--mh-navy)] text-[var(--mh-navy)] text-[12px] font-semibold disabled:opacity-50" disabled={!!busy} onClick={() => pasteBtn(r)} data-testid="vn-nt-paste-btn">📋 Dán ảnh</button>
              </div>}
              {prog?.rid === r.id && <div className="mb-2 rounded-lg border border-[var(--mh-border)] bg-[var(--mh-bg)] p-2 text-[12px]" data-testid="vn-nt-upload-progress">
                <div className="font-semibold mb-1">{busy === r.id ? `Đang upload ảnh... (${prog.items.filter((x) => x.st === 'ok' || x.st === 'err').length}/${prog.items.length})` : `Hoàn tất: ${prog.items.filter((x) => x.st === 'ok').length}/${prog.items.length} ảnh thành công`}
                  {busy !== r.id && <button className="ml-2 text-[var(--mh-text-2)] underline" onClick={() => setProg(null)}>Ẩn</button>}</div>
                <div className="h-1.5 rounded bg-[var(--mh-border)] overflow-hidden mb-1"><div className="h-full bg-[var(--mh-navy)] transition-all" style={{ width: `${Math.round(prog.items.filter((x) => x.st === 'ok' || x.st === 'err').length / prog.items.length * 100)}%` }} /></div>
                {prog.items.map((x, k) => <div key={k} className="flex items-center gap-2 py-0.5" data-testid="vn-nt-upload-item" data-st={x.st}>
                  <span className="w-4 text-center">{x.st === 'up' ? <span className="inline-block w-3 h-3 border-2 border-[var(--mh-navy)] border-t-transparent rounded-full animate-spin" /> : x.st === 'ok' ? <span className="text-[var(--mh-ok)]">✓</span> : x.st === 'err' ? <span className="text-[var(--mh-err)]">✗</span> : <span className="text-[var(--mh-text-3)]">•</span>}</span>
                  <span className="truncate flex-1">{x.name}</span><span className={x.st === 'err' ? 'text-[var(--mh-err)]' : 'text-[var(--mh-text-2)]'}>{x.st === 'wait' ? 'Chờ' : x.st === 'up' ? 'Đang tải…' : x.st === 'ok' ? 'Xong' : x.msg}</span></div>)}
              </div>}
              {!!list.length && <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {list.map((i: ImgMeta, k: number) => <Thumb key={i.id} c={c} i={i} onOpen={() => setView({ list, i: k })} onCaption={(v: string) => setCaption(i, v)} onLeft={() => move(i, list, -1)} onRight={() => move(i, list, 1)} onDelete={() => remove(i)} />)}
              </div>}
            </div>
          );
        })}
        {!records.length && <Empty>Không có bản ghi</Empty>}
      </div>
      {view && <PhotoViewer items={view.list.map((m) => ({ id: m.id, caption: m.caption, load: () => storageFor(c.db, m.provider).url(m) }))} index={view.i} onIndex={(i) => setView({ ...view, i })} onClose={() => setView(null)} />}
      {node}
    </Card>
  );
}

function Thumb({ c, i, onOpen, onCaption, onLeft, onRight, onDelete }: any) {
  const [src, setSrc] = useState('');
  const [cap, setCap] = useState(i.caption || '');
  useEffect(() => { storageFor(c.db, i.provider).url(i).then(setSrc).catch(() => {}); }, [i.ref]);
  return (
    <div className="border border-[var(--mh-border)] rounded-lg p-1.5 space-y-1">
      <div className="aspect-[4/3] bg-[var(--mh-bg)] rounded grid place-items-center overflow-hidden">{src ? <button type="button" onClick={onOpen} title="Xem ảnh đầy đủ" data-testid="vn-nt-thumb-open" className="w-full h-full grid place-items-center cursor-zoom-in"><img src={src} className="max-w-full max-h-full object-contain" alt="" /></button> : '…'}</div>
      <input className="w-full h-7 px-1.5 text-[11px] border border-[var(--mh-border)] rounded" placeholder="Chú thích ảnh" value={cap} onChange={(e) => setCap(e.target.value)} onBlur={() => cap !== (i.caption || '') && onCaption(cap)} />
      <div className="flex gap-1 text-[11px]"><button onClick={onLeft} className="px-1.5 border rounded">◀</button><button onClick={onRight} className="px-1.5 border rounded">▶</button><div className="flex-1" /><button onClick={onDelete} className="px-1.5 border rounded text-[var(--mh-err)]">Xoá</button></div>
    </div>
  );
}

function ShareDialog({ c, onClose, deck, month, scopeLabel, images }: any) {
  const { toast, node } = useToast();
  const maxDays = Number(c.settings?.ntShareMaxDays || 30);
  const [days, setDays] = useState(Math.min(7, maxDays));
  const [links, setLinks] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  useEffect(() => onSnapshot(query(collection(c.db, 'shareLinks'), where('kind', '==', 'nt-report')), (s) => setLinks(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => String(b.createdAtIso).localeCompare(String(a.createdAtIso)))), () => {}), [c.db]);
  const create = async () => {
    setCreating(true);
    try {
      const token = newToken();
      const d = clampShareDays(days, maxDays);
      const snap = JSON.stringify(deck);
      if (snap.length > 900_000) throw new Error('Báo cáo quá lớn để chia sẻ — hãy lọc hẹp hơn');
      const refs = deck.images.map((i: DeckImage) => i.ref);
      await setDoc(doc(c.db, 'shareLinks', token), { kind: 'nt-report', month, scopeLabel, snapshot: snap, imageRefs: refs, createdBy: c.uid, createdByName: c.name, createdAtIso: new Date().toISOString(), expiresAt: Timestamp.fromMillis(Date.now() + d * 86400e3), revokedAt: null });
      for (const img of deck.images.filter((i: DeckImage) => i.provider === 'firestore')) {
        const src = await getDoc(doc(c.db, 'acceptanceImageData', img.ref));
        const dataUrl = (src.data() as any)?.dataUrl;
        if (dataUrl) await setDoc(doc(c.db, `shareLinks/${token}/images/${img.ref}`), { dataUrl });
      }
      await navigator.clipboard?.writeText(`${location.origin}/chia-se/${token}`).catch(() => {});
      toast(`Đã tạo link (${d} ngày) và sao chép`);
    } catch (e: any) { toast('Không tạo được: ' + (e?.message || e?.code), 'err'); }
    setCreating(false);
  };
  const revoke = async (l: any) => { if (!window.confirm('Thu hồi link này?')) return; try { await updateDoc(doc(c.db, 'shareLinks', l.id), { revokedAt: new Date().toISOString(), revokedBy: c.uid }); toast('Đã thu hồi'); } catch (e: any) { toast('Lỗi: ' + e.code, 'err'); } };
  return (
    <Modal open onClose={onClose} title="Link chia sẻ công khai (không cần đăng nhập)" wide>
      <div className="space-y-3">
        <div className="text-[13px]">Phạm vi: <b>{scopeLabel}</b> · {periodLabel(month)}. Link là bản chụp số liệu tại thời điểm tạo, chỉ xem & tải PDF.</div>
        <div className="flex gap-2 items-end"><Field label={`Hiệu lực (ngày, tối đa ${maxDays})`}><Input type="number" min={1} max={maxDays} value={days} onChange={(e: any) => setDays(Number(e.target.value))} className="w-28" /></Field><Btn primary onClick={create} disabled={creating}>{creating ? 'Đang tạo…' : 'Tạo link'}</Btn></div>
        <table data-mh-responsive className="w-full"><thead><tr><Th>Link</Th><Th>Phạm vi</Th><Th>Hết hạn (VN)</Th><Th>Trạng thái</Th><Th></Th></tr></thead><tbody>
          {links.map((l) => { const exp = l.expiresAt?.toDate?.() as Date | undefined; const expired = exp && exp.getTime() < Date.now(); return (
            <tr key={l.id}><Td className="text-[11px] break-all"><a className="text-[var(--mh-navy)] underline" href={`/chia-se/${l.id}`} target="_blank" rel="noreferrer">/chia-se/{l.id.slice(0, 8)}…</a></Td><Td className="text-[12px]">{l.scopeLabel}<div className="text-[11px] text-[var(--mh-text-3)]">{periodLabel(l.month)} · {l.createdByName}</div></Td><Td className="text-[12px]">{exp ? vnTime(exp.toISOString()) : ''}</Td><Td>{l.revokedAt ? <Badge c="mute">Đã thu hồi</Badge> : expired ? <Badge c="warn">Hết hạn</Badge> : <Badge c="ok">Hiệu lực</Badge>}</Td><Td r>{!l.revokedAt && !expired && <Btn small danger onClick={() => revoke(l)}>Thu hồi</Btn>}</Td></tr>
          ); })}
          {!links.length && <tr><Td colSpan={5}><Empty>Chưa có link</Empty></Td></tr>}
        </tbody></table>
      </div>
      {node}
    </Modal>
  );
}

/** Gán Phòng → Người phụ trách (lọc theo Phòng) cho bản ghi Nghiệm thu; khoá 1 bản ghi / user / dự án / tháng (ntKeys). */
function NtAssign({ c, month, allowedTeams, images, store }: { c: VCtx; month: string; allowedTeams: string[] | null; images: ImgMeta[]; store: any }) {
  const { toast, node } = useToast();
  const [teamF, setTeamF] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [imgFor, setImgFor] = useState<any>(null);
  const [invFor, setInvFor] = useState<any>(null);
  const [manualFor, setManualFor] = useState<any>(null);
  const canManual = ntManualAllowed(month) && vnCan(c, NT_MANUAL_FEATURE);
  const recs = (c.acceptancesAll || c.acceptances).filter((a) => normalizeMonth(a.month) === month && (!allowedTeams || allowedTeams.includes(a.teamId)) && (!teamF || a.teamId === teamF));
  const teamOpts = [...new Set((c.acceptancesAll || c.acceptances).filter((a) => normalizeMonth(a.month) === month).map((a) => a.teamId).filter(Boolean))];
  const monthRecs = (c.acceptancesAll || c.acceptances).map((a) => ({ ...a, month: normalizeMonth(a.month) }));

  async function saveManual(a: any, name: string) {
    if (!a.teamId) throw new Error('Chọn Phòng trước');
    try { await assignManualImplementer(c.db, a, name, { uid: c.uid, email: c.email }); }
    catch (e: any) { throw new Error('Không lưu được: ' + (e?.code || e?.message)); }
    setPick((p) => { const q = { ...p }; delete q[a.id]; return q; });
    toast('Đã ghi Người phụ trách (tự nhập)');
  }

  async function save(a: any) {
    const uid = pick[a.id] ?? a.implementerUid ?? '';
    if (uid === NT_MANUAL_VALUE) return setManualFor(a);
    const u = c.users.find((x) => (x.uid || x.id) === uid);
    if (!uid || !u) return toast('Chọn người phụ trách');
    if (!a.teamId) return toast('Chọn Phòng trước', 'err');
    if (!a.projectId) return toast('Bản ghi chưa có Dự án', 'err');
    setBusy(a.id);
    try {
      const name = u.fullName || u.displayName || u.email || uid;
      await assignImplementer(c.db, c.acceptancesAll || c.acceptances, a, { uid, name, teamId: a.teamId, blockId: a.blockId || blockOfTeam(c, a.teamId) || '', month, projectId: a.projectId }, { uid: c.uid, email: c.email });
      toast('Đã gán người phụ trách');
    } catch (e: any) {
      if (e?.code === 'dup') toast(`Trùng: ${u.fullName || u.email} đã có bản ghi dự án này trong tháng (#${shortCode(e.dup.id)})`, 'err');
      else toast('Không lưu được: ' + (e?.code || e?.message), 'err');
    }
    setBusy('');
  }

  return (
    <Card data-testid="vn-nt-assign">
      <div className="px-4 py-3 border-b border-[var(--mh-border)] flex flex-wrap gap-2 items-end">
        <b className="flex-1 text-[13px]">Gán người phụ trách — {periodLabel(month)} (1 bản ghi / người / dự án / tháng)</b>
        <Field label="Phòng"><SearchSelect value={teamF} onChange={setTeamF} data-testid="vn-nt-team" options={[{ value: '', label: 'Tất cả' }, ...teamOpts.map((t) => ({ value: t, label: teamName(c, t) }))]} /></Field>
      </div>
      {!recs.length ? <Empty>Không có bản ghi trong tháng</Empty> : (
      <>
      <div className="md:hidden p-2.5 grid gap-2" data-testid="vn-nt-assign-cards">
        {recs.map((a) => {
          const opts = implementerOptions(c.users, a.teamId, c.teams.find((t) => t.id === a.teamId));
          const n = images.filter((i) => i.acceptanceId === a.id).length;
          return (
            <div key={a.id} className="rounded-xl border border-[var(--mh-border)] p-3 space-y-2" data-testid="vn-nt-row">
              <div className="font-semibold text-[14px]">{projectName(c, a.projectId, a.projectName)}</div>
              <div className="text-[11px] text-[var(--mh-text-3)]">#{shortCode(a.id)} · {a.teamName || teamName(c, a.teamId)} · {a.status || ''}</div>
              {isSupplement(a) && <div data-testid="vn-nt-supp" className={`text-[11px] font-bold ${suppStatus(a) === 'rejected' ? 'text-red-600' : 'text-orange-700'}`}>{suppViewLabel(a)}</div>}
              <Field label="Người phụ trách"><SearchSelect value={pick[a.id] ?? a.implementerUid ?? ''} onChange={(v: string) => { if (v === NT_MANUAL_VALUE) { setManualFor(a); return; } setPick((p) => ({ ...p, [a.id]: v })); }} data-testid="vn-nt-implementer"
                options={[{ value: '', label: !a.teamId ? 'Chọn Phòng trước' : (isManualImplementer(a) ? implementerLabel(a) : opts.length ? (a.implementerName && !a.implementerUid ? `(cũ) ${a.implementerName}` : '— Chọn —') : 'Phòng chưa có thành viên') },
                  ...(canManual && a.teamId ? [{ value: NT_MANUAL_VALUE, label: NT_MANUAL_LABEL }] : []),
                  ...opts.map((o) => ({ value: o.uid, label: o.name + (o.role === 'gdkd' ? ' · GĐKD' : '') }))]} /></Field>
              <div className="flex flex-wrap items-center gap-1.5">
                {n ? <Badge c="ok">{n} ảnh</Badge> : <Badge c="warn">Chưa có</Badge>}
                <Btn small primary disabled={busy === a.id} onClick={() => save(a)}>Lưu</Btn>
                {vnCan(c, 'vn.nt_images.upload') && <Btn small onClick={() => setImgFor(a)} data-testid="vn-nt-row-upload">⬆ Tải ảnh</Btn>}
                {vnCan(c, INVOICE_FEATURE) && <Btn small onClick={() => setInvFor(a)} data-testid="vn-nt-row-invoice">🧾 Tải Hóa Đơn</Btn>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden md:block overflow-x-auto"><table data-mh-responsive className="w-full">
        <thead><tr><Th>Dự án</Th><Th>Phòng</Th><Th>Người phụ trách</Th><Th>Ảnh</Th><Th></Th></tr></thead>
        <tbody>{recs.map((a) => {
          const opts = implementerOptions(c.users, a.teamId, c.teams.find((t) => t.id === a.teamId));
          const n = images.filter((i) => i.acceptanceId === a.id).length;
          return (
            <tr key={a.id} data-testid="vn-nt-row">
              <Td>{projectName(c, a.projectId, a.projectName)}<div className="text-[11px] text-[var(--mh-text-3)]">#{shortCode(a.id)} · {a.status || ''}</div>{isSupplement(a) && <div data-testid="vn-nt-supp" className={`text-[11px] font-bold ${suppStatus(a) === 'rejected' ? 'text-red-600' : 'text-orange-700'}`}>{suppViewLabel(a)}</div>}</Td>
              <Td>{a.teamName || teamName(c, a.teamId)}</Td>
              <Td><SearchSelect value={pick[a.id] ?? a.implementerUid ?? ''} onChange={(v: string) => { if (v === NT_MANUAL_VALUE) { setManualFor(a); return; } setPick((p) => ({ ...p, [a.id]: v })); }} data-testid="vn-nt-implementer"
                options={[{ value: '', label: !a.teamId ? 'Chọn Phòng trước' : (isManualImplementer(a) ? implementerLabel(a) : opts.length ? (a.implementerName && !a.implementerUid ? `(cũ) ${a.implementerName}` : '— Chọn —') : 'Phòng chưa có thành viên') },
                  ...(canManual && a.teamId ? [{ value: NT_MANUAL_VALUE, label: NT_MANUAL_LABEL }] : []),
                  ...opts.map((o) => ({ value: o.uid, label: o.name + (o.role === 'gdkd' ? ' · GĐKD' : '') }))]} />
                {isManualImplementer(a) && <div className="text-[11px] text-[var(--mh-text-3)] mt-0.5" data-testid="vn-nt-manual-tag">Tự nhập: {a.implementerName}</div>}</Td>
              <Td>{n ? <Badge c="ok">{n} ảnh</Badge> : <Badge c="warn">Chưa có</Badge>}</Td>
              <Td><div className="flex gap-1">
                <Btn small primary disabled={busy === a.id} onClick={() => save(a)}>Lưu</Btn>
                {vnCan(c, 'vn.nt_images.upload') && <Btn small onClick={() => setImgFor(a)} data-testid="vn-nt-row-upload">⬆ Tải ảnh</Btn>}
                {vnCan(c, INVOICE_FEATURE) && <Btn small onClick={() => setInvFor(a)} data-testid="vn-nt-row-invoice">🧾 Tải Hóa Đơn</Btn>}
              </div></Td>
            </tr>);
        })}</tbody>
      </table></div>
      </>
      )}
      <ManualAssigneeDialog open={!!manualFor} initial={manualFor && isManualImplementer(manualFor) ? manualFor.implementerName : ''} onClose={() => setManualFor(null)} onSave={(n) => saveManual(manualFor, n)} />
      {invFor && <NtInvoiceModal c={c} record={invFor} onClose={() => setInvFor(null)} />}
      <Modal open={!!imgFor} onClose={() => setImgFor(null)} title="Tải ảnh Nghiệm thu" wide>
        {imgFor && <ImageManager c={c} records={[imgFor]} images={images} store={store} month={month} />}
      </Modal>
      {node}
    </Card>
  );
}

/** Tải ảnh Nghiệm thu cho 1 bản ghi — dùng trực tiếp trong bảng Nghiệm thu MKT chính (Admin/Mod). */
export function NtUploadModal({ c, record, onClose }: { c: VCtx; record: any; onClose: () => void }) {
  const [images, setImages] = useState<ImgMeta[]>([]);
  const store = storageFor(c.db, c.settings?.ntStorageProvider);
  useEffect(() => listenTeamScoped(c, 'acceptanceImages', [where('acceptanceId', '==', record.id)], setImages), [c.db, record.id, c.role, gdkdTeams(c).join(',')]);
  const month = normalizeMonth(record.ntMonth || record.month) || addPeriods(getPeriodOf(), -1);
  return (
    <Modal open onClose={onClose} title="Tải ảnh Nghiệm thu" wide>
      <ImageManager c={c} records={[record]} images={images} store={store} month={month} />
    </Modal>
  );
}
