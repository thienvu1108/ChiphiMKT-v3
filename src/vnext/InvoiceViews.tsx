/** B4 — Hóa đơn Nghiệm thu: nhiều ảnh / PDF, không giới hạn dung lượng (Drive resumable, trình duyệt PUT thẳng lên Google). */
import React, { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { auth } from '../firebase';
import { type VCtx, vnCan, gdkdTeams, projectName} from './ctx';
import { listenTeamScoped } from './teamScoped';
import { Btn, Badge, Card, Empty, Modal, useToast, vnTime } from './ui';
import { ntNaming } from './NtReportPage';
import { normalizeMonth } from '../../lib/vnext/ntReport';
import { addPeriods, getPeriodOf } from '../../lib/vnext/period';
import { storageFor } from './storage';
import { PhotoViewer, type ViewerItem } from './PhotoViewer';
import type { DeckImage } from './ntDeck';

export { invoiceDeckImages } from '../../lib/vnext/invoiceDeck';

export type Invoice = { id: string; acceptanceId: string; fileId: string; name: string; origName?: string; mime: string; size: number; webViewLink: string; path?: string; order: number; uploadedBy: string; uploadedByName?: string; uploadedAt: string };

/** Ảnh xem trước hóa đơn: giữ tỉ lệ gốc (object-contain), trình duyệt tự xoay theo EXIF; bấm mở Drive. */
const isPreviewableInv = (i: Invoice) => (i.mime || '').startsWith('image/') || i.mime === 'application/pdf';
const isZipOrExcel = (i: Invoice) => /zip|excel|spreadsheet|sheet/i.test(i.mime || '') || /\.(zip|xlsx?)$/i.test(i.name || '');

export function InvoiceThumb({ c, i, onOpen }: { c: VCtx; i: Invoice; onOpen?: () => void; key?: React.Key }) {
  const [src, setSrc] = useState(''); const [err, setErr] = useState(false);
  useEffect(() => { let on = true; setErr(false);
    if (!isPreviewableInv(i)) { setSrc(''); return; }
    storageFor(c.db, 'drive').url({ id: 'inv_' + i.id, ref: i.fileId, inv: i.id } as any).then((u) => { if (on) { u ? setSrc(u) : setErr(true); } }).catch(() => on && setErr(true));
    return () => { on = false; }; }, [i.id, i.fileId, i.mime]);
  const body = (
    <>
      <div className="aspect-[3/4] relative grid place-items-center">
        {src ? <img src={src} alt={i.name} className="absolute inset-0 w-full h-full object-contain" style={{ imageOrientation: 'from-image' } as any} data-testid="vn-invoice-thumb-img" />
          : <span className="text-[11px] text-[var(--mh-text-3)] p-2 text-center">{isZipOrExcel(i) ? '📦 ZIP/Excel — bấm tải' : err ? (i.mime === 'application/pdf' ? '📄 PDF — bấm để mở' : '🖼️ Bấm để mở') : 'Đang tải…'}</span>}
      </div>
      <div className="px-2 py-1 text-[11px] truncate text-[var(--mh-navy)]">{i.mime === 'application/pdf' ? '📄 ' : isZipOrExcel(i) ? '📦 ' : ''}{i.name}</div>
    </>
  );
  if (isPreviewableInv(i) && onOpen) {
    return <button type="button" onClick={onOpen} className="block w-full text-left rounded-lg border border-[var(--mh-border)] bg-[var(--mh-bg)] overflow-hidden cursor-zoom-in" data-testid="vn-invoice-thumb" title={i.name}>{body}</button>;
  }
  return (
    <button type="button" onClick={() => openInvoice(i)} className="block w-full text-left rounded-lg border border-[var(--mh-border)] bg-[var(--mh-bg)] overflow-hidden" data-testid="vn-invoice-thumb" title={i.name}>{body}</button>
  );
}


export const INVOICE_FEATURE = 'vn.nt_invoices.upload';
export const INVOICE_COLLECTION = 'acceptanceInvoices';

const OK_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/zip', 'application/x-zip-compressed', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const extOf = (f: File) => (f.type === 'application/pdf' ? 'pdf' : (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg');
export const fmtSize = (n: number) => (n >= 1 << 30 ? (n / (1 << 30)).toFixed(2) + ' GB' : n >= 1 << 20 ? (n / (1 << 20)).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export function useInvoices(c: VCtx, acceptanceId?: string) {
  const [rows, setRows] = useState<Invoice[]>([]);
  useEffect(() => {
    return listenTeamScoped(c, INVOICE_COLLECTION, acceptanceId ? [where('acceptanceId', '==', acceptanceId)] : [], setRows);
  }, [c.db, acceptanceId, c.role, gdkdTeams(c).join(',')]);
  return rows;
}

/** Tên hóa đơn: «MAYHOMES - HD - Mã Phòng - Dự án - NV - Tháng M YYYY - NN.ext»; thư mục giống ảnh (trong gốc Hóa đơn riêng). */
export function invoiceNaming(c: VCtx, r: any, month: string, order: number, ext: string) {
  const n = ntNaming(c, r, month, order);
  return { name: n.name.replace(/^MAYHOMES - /, 'MAYHOMES - HD - ').replace(/\.[a-z0-9]+$/i, '.' + ext), path: n.path };
}

async function api(action: string, body: any) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`/api/nt-images/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Lỗi máy chủ (${r.status})`);
  return j;
}

function putFile(url: string, f: File, onProg: (p: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('content-type', f.type);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProg(e.loaded / e.total); };
    x.onload = () => { if (x.status >= 200 && x.status < 300) { try { resolve(JSON.parse(x.responseText)); } catch { resolve({}); } } else reject(new Error(`Drive từ chối (${x.status})`)); };
    x.onerror = () => reject(new Error('Mất kết nối khi tải lên Drive'));
    x.send(f);
  });
}

export async function uploadInvoice(c: VCtx, r: any, month: string, f: File, order: number, onProg: (p: number) => void): Promise<Invoice> {
  const inferInvMime = (f: File) => {
    let m = f.type === 'image/jpg' ? 'image/jpeg' : f.type;
    if (!m || m === 'application/octet-stream') {
      const n = f.name.toLowerCase();
      if (n.endsWith('.pdf')) m = 'application/pdf';
      else if (n.endsWith('.zip')) m = 'application/zip';
      else if (n.endsWith('.xls')) m = 'application/vnd.ms-excel';
      else if (n.endsWith('.xlsx')) m = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (n.endsWith('.png')) m = 'image/png';
      else if (n.endsWith('.webp')) m = 'image/webp';
      else if (/\.jpe?g$/.test(n)) m = 'image/jpeg';
    }
    return m;
  };
  const mime = inferInvMime(f);
  if (!OK_MIME.includes(mime) && !/\.(zip|xlsx?|pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name)) throw new Error('Chỉ nhận ảnh, PDF, ZIP hoặc Excel');
  const { name, path } = invoiceNaming(c, r, month, order, extOf(f));
  const s = await api('invoice-session', { name, path, mime, size: f.size });
  const up = await putFile(s.uploadUrl, f, onProg);
  if (!up?.id) throw new Error('Drive không trả mã file');
  const fin = await api('invoice-finalize', { fileId: up.id });
  const ref = doc(collection(c.db, INVOICE_COLLECTION));
  const m = { acceptanceId: r.id, fileId: fin.fileId, name: fin.name || name, origName: f.name.slice(0, 200), mime, size: f.size, webViewLink: fin.webViewLink, path: path.join('/'), order, teamId: r.teamId || '', uploadedBy: c.uid, uploadedByName: c.name, uploadedAt: new Date().toISOString() };
  await setDoc(ref, m);
  return { id: ref.id, ...m };
}

/** Mở/tải hóa đơn qua máy chủ của app (đăng nhập app là đủ, không cần quyền Drive). Tệp > 4 MB → mở Drive. */
export async function openInvoice(i: Invoice): Promise<void> {
  const w = window.open('', '_blank');
  try {
    const token = await auth.currentUser?.getIdToken();
    const r = await fetch(`/api/nt-images/file?id=${encodeURIComponent(i.fileId)}&inv=${encodeURIComponent(i.id)}&dl=1`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) { if (w) w.location.href = i.webViewLink; else window.open(i.webViewLink, '_blank'); return; }
    const u = URL.createObjectURL(new Blob([await r.blob()], { type: i.mime || 'application/octet-stream' }));
    if (isPreviewableInv(i) && w) { w.location.href = u; }
    else { w?.close(); const a = document.createElement('a'); a.href = u; a.download = i.name; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  } catch { if (w) w.location.href = i.webViewLink; }
}

export function InvoiceList({ list, canDelete, onDelete }: { list: Invoice[]; canDelete?: boolean; onDelete?: (i: Invoice) => void }) {
  if (!list.length) return <div className="text-[12px] text-[var(--mh-text-3)]">Chưa có hóa đơn</div>;
  return (
    <ul className="divide-y divide-[var(--mh-surface-2)]" data-testid="vn-invoice-list">
      {list.slice().sort((a, b) => a.order - b.order).map((i) => (
        <li key={i.id} className="py-1.5 flex flex-wrap items-center gap-2 text-[12.5px]" data-testid="vn-invoice-item">
          <span>{i.mime === 'application/pdf' ? '📄' : isZipOrExcel(i) ? '📦' : '🖼️'}</span>
          <button type="button" onClick={() => openInvoice(i)} className="text-left text-[var(--mh-navy)] underline break-all flex-1 min-w-0" data-testid="vn-invoice-link">{i.name}</button>
          <a href={i.webViewLink} target="_blank" rel="noreferrer" className="text-[11px] text-[var(--mh-text-3)] underline" data-testid="vn-invoice-drive">Drive</a>
          <span className="text-[11px] text-[var(--mh-text-3)]">{fmtSize(i.size)} · {i.uploadedByName} · {vnTime(i.uploadedAt)}</span>
          {canDelete && onDelete && <button className="text-[11px] text-[var(--mh-err)] underline" onClick={() => onDelete(i)}>Gỡ</button>}
        </li>))}
    </ul>
  );
}

export function NtInvoiceModal({ c, record, onClose }: { c: VCtx; record: any; onClose: () => void }) {
  const list = useInvoices(c, record.id);
  const month = normalizeMonth(record.ntMonth || record.month) || addPeriods(getPeriodOf(), -1);
  const [prog, setProg] = useState<{ name: string; p: number; st: 'wait' | 'up' | 'ok' | 'err'; msg?: string; link?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  const can = vnCan(c, INVOICE_FEATURE);
  const upload = async (files: FileList | null) => {
    const fs = Array.from(files || []);
    if (!fs.length) return;
    const items = fs.map((f) => ({ name: f.name, p: 0, st: 'wait' as const, msg: '', link: '' })) as any[];
    setProg([...items]); setBusy(true);
    let order = list.reduce((m, i) => Math.max(m, i.order || 0), 0); let ok = 0;
    for (let k = 0; k < fs.length; k++) {
      items[k] = { ...items[k], st: 'up' }; setProg([...items]);
      try {
        order += 1;
        const inv = await uploadInvoice(c, record, month, fs[k], order, (p) => { items[k] = { ...items[k], p }; setProg([...items]); });
        items[k] = { ...items[k], st: 'ok', p: 1, link: inv.webViewLink }; ok++;
      } catch (e: any) { items[k] = { ...items[k], st: 'err', msg: e?.message || 'Lỗi' }; }
      setProg([...items]);
    }
    setBusy(false);
    toast(ok === fs.length ? `Đã tải ${ok} hóa đơn` : `Xong ${ok}/${fs.length} — ${fs.length - ok} lỗi`, ok === fs.length ? 'ok' : 'err');
  };
  const del = async (i: Invoice) => { if (!window.confirm('Gỡ hóa đơn khỏi bản ghi? (File trên Drive được giữ nguyên)')) return; try { await deleteDoc(doc(c.db, INVOICE_COLLECTION, i.id)); } catch (e: any) { toast('Lỗi: ' + (e?.code || e?.message), 'err'); } };
  const n = invoiceNaming(c, record, month, list.length + 1, 'pdf');
  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Tải Hóa đơn Nghiệm thu" wide>
      <div className="space-y-3" data-testid="vn-invoice-modal">
        <div className="text-[12px] text-[var(--mh-text-2)]"><b>{projectName(c, record.projectId, record.projectName)} › {record.implementerName || '—'}</b><div data-testid="vn-invoice-path">Drive (thư mục Hóa đơn riêng): {n.path.join(' / ')}</div><div>Tên: {n.name}</div></div>
        {can && <label data-testid="vn-invoice-pick" className={`h-9 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1 cursor-pointer bg-[#0E7C66] text-white ${busy ? 'opacity-50 pointer-events-none' : ''}`}>{busy ? 'Đang tải hóa đơn…' : '🧾 Chọn ảnh / PDF / ZIP / Excel (nhiều tệp)'}<input type="file" accept="image/*,application/pdf,application/zip,.zip,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,.xlsx" multiple className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} /></label>}
        <div className="text-[11px] text-[var(--mh-text-3)]">Không giới hạn dung lượng — tệp được tải thẳng lên Google Drive. Giữ trang mở đến khi xong.</div>
        {!!prog.length && <Card className="p-2 text-[12px]" data-testid="vn-invoice-progress">{prog.map((x, k) => (
          <div key={k} className="py-1" data-testid="vn-invoice-prog-item" data-st={x.st}>
            <div className="flex gap-2 items-center"><span className="truncate flex-1">{x.name}</span><span className={x.st === 'err' ? 'text-[var(--mh-err)]' : 'text-[var(--mh-text-2)]'}>{x.st === 'wait' ? 'Chờ' : x.st === 'up' ? `${Math.round(x.p * 100)}%` : x.st === 'ok' ? 'Xong' : x.msg}</span></div>
            {x.st === 'up' && <div className="h-1 rounded bg-[var(--mh-border)] overflow-hidden"><div className="h-full bg-[#0E7C66]" style={{ width: `${Math.round(x.p * 100)}%` }} /></div>}
            {x.st === 'ok' && <span className="text-[11px] text-[var(--mh-text-3)]">Đã lưu — bấm tên tệp trong danh sách bên dưới để mở</span>}
          </div>))}</Card>}
        <div><div className="text-[13px] font-semibold mb-1">Hóa đơn của bản ghi ({list.length})</div><InvoiceList list={list} canDelete={can} onDelete={del} /></div>
      </div>
      {node}
    </Modal>
  );
}

/** Báo cáo Nghiệm thu › mục Hóa đơn (riêng): theo bản ghi trong bộ lọc. */
export function InvoiceSection({ c, records }: { c: VCtx; records: any[] }) {
  const all = useInvoices(c);
  const [view, setView] = useState<{ list: Invoice[]; i: number } | null>(null);
  const ids = new Set(records.map((r) => r.id));
  const by = new Map<string, Invoice[]>();
  for (const i of all) if (ids.has(i.acceptanceId)) { if (!by.has(i.acceptanceId)) by.set(i.acceptanceId, []); by.get(i.acceptanceId)!.push(i); }
  const recs = records.filter((r) => by.has(r.id));
  return (
    <Card data-testid="vn-nt-invoices">
      <div className="px-4 py-3 border-b border-[var(--mh-border)] flex items-center gap-2"><div className="font-semibold text-[14px] flex-1">Hóa đơn</div><Badge c="info">{[...by.values()].flat().length} tệp · {recs.length}/{records.length} bản ghi</Badge></div>
      {!recs.length ? <Empty>Chưa có hóa đơn cho bộ lọc này</Empty> : <div className="divide-y divide-[var(--mh-border)]">{recs.map((r) => (
        <div key={r.id} className="p-3"><div className="text-[13px] font-semibold">{projectName(c, r.projectId, r.projectName)} › {r.implementerName || '—'} <span className="text-[11px] text-[var(--mh-text-3)] font-normal">{r.teamName}</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 my-2" data-testid="vn-invoice-thumbs">{by.get(r.id)!.slice().sort((a, b) => a.order - b.order).map((i, k, arr) => <InvoiceThumb key={i.id} c={c} i={i} onOpen={isPreviewableInv(i) ? () => setView({ list: arr.filter(isPreviewableInv), i: Math.max(0, arr.filter(isPreviewableInv).findIndex((x) => x.id === i.id)) }) : undefined} />)}</div>
          <InvoiceList list={by.get(r.id)!} /></div>))}</div>}
      {view && <PhotoViewer items={view.list.map((m) => ({ id: m.id, caption: m.name, load: () => storageFor(c.db, 'drive').url({ id: 'inv_' + m.id, ref: m.fileId, inv: m.id } as any) }))} index={view.i} onIndex={(i) => setView({ ...view, i })} onClose={() => setView(null)} />}
    </Card>
  );
}
