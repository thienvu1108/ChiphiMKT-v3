import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc, startAfter, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { Card, Btn, Badge, Th, Td, Field, Select, Input, Modal } from './ui';
import { isAdm, type VCtx } from './ctx';
import { CHANGELOG, KEY_COLS, diffKeys, changeLogEnabledFor } from '../../lib/vnext/changeLog';

const PAGE = 300;
const OPL: any = { create: ['Tạo', 'ok'], set: ['Ghi', 'info'], update: ['Sửa', 'warn'], delete: ['Xoá', 'err'] };
const show = (v: any) => { if (v == null) return '—'; if (v?.toDate) return v.toDate().toLocaleString('vi-VN'); const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 140 ? s.slice(0, 140) + '…' : s; };
const atMs = (r: any) => (r.at?.toMillis ? r.at.toMillis() : 0);

/** Cài đặt → Lịch sử thay đổi (Admin, chỉ đọc) + Khôi phục bản này. */
export default function ChangeLogPanel({ c }: { c: VCtx }) {
  const adm = isAdm(c);
  const [rows, setRows] = useState<any[]>([]);
  const [last, setLast] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ col: '', q: '', from: '', to: '', op: '' });
  const [pick, setPick] = useState<any>(null);
  const [confirm, setConfirm] = useState('');
  const load = async (more = false) => {
    setBusy(true);
    try {
      const qq = more && last ? query(collection(c.db, CHANGELOG), orderBy('at', 'desc'), startAfter(last), limit(PAGE)) : query(collection(c.db, CHANGELOG), orderBy('at', 'desc'), limit(PAGE));
      const s = await getDocs(qq);
      const r = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRows(more ? [...rows, ...r] : r); setLast(s.docs[s.docs.length - 1] || null);
    } catch (e: any) { toast.error('Không tải được: ' + (e?.code || e?.message)); } finally { setBusy(false); }
  };
  useEffect(() => { if (adm) load(); }, [adm]);
  const list = useMemo(() => {
    const q = f.q.trim().toLowerCase(); const from = f.from ? new Date(f.from + 'T00:00:00+07:00').getTime() : 0; const to = f.to ? new Date(f.to + 'T23:59:59+07:00').getTime() : Infinity;
    return rows.filter((r) => (!f.col || r.col === f.col) && (!f.op || r.op === f.op) && atMs(r) >= from && atMs(r) <= to
      && (!q || [r.docId, r.actorName, r.actor].some((x) => String(x || '').toLowerCase().includes(q))));
  }, [rows, f]);
  if (!adm) return null;
  const restore = async () => {
    const r = pick; setBusy(true);
    try {
      const ref = doc(c.db, r.col, r.docId);
      if (r.before == null) await deleteDoc(ref); else await setDoc(ref, r.before);
      await addDoc(collection(c.db, 'auditLogs'), { action: 'RESTORE_CHANGE', collection: r.col, docId: r.docId, userId: c.uid, userEmail: (c.email || '').toLowerCase(), timestamp: serverTimestamp(), data: JSON.stringify({ changeLogId: r.id, op: r.before == null ? 'delete' : 'set' }) });
      toast.success(`Đã khôi phục ${r.col}/${r.docId} về trạng thái trước thay đổi`); setPick(null); setConfirm(''); load();
    } catch (e: any) { toast.error('Khôi phục lỗi: ' + (e?.code || e?.message)); } finally { setBusy(false); }
  };
  return (
    <Card className="p-4 sm:p-5 space-y-3" data-testid="vn-changelog-panel">
      <div>
        <div className="text-[16px] font-bold">Lịch sử thay đổi</div>
        <div className="text-[12.5px] text-[var(--mh-text-2)]">Mỗi lần tạo/sửa/xoá dữ liệu quan trọng được ghi lại (trước khi đổi, người thực hiện, thời gian máy chủ). Giữ 12 tháng trong hệ thống; cũ hơn được lưu trữ lên Google Drive. {changeLogEnabledFor((c.db as any)?._databaseId?.database) ? '' : <Badge c="warn">Chưa bật trên môi trường này</Badge>}</div>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Dữ liệu"><Select value={f.col} onChange={(v: string) => setF({ ...f, col: v })} options={[{ value: '', label: 'Tất cả' }, ...KEY_COLS.map((k) => ({ value: k, label: k }))]} data-testid="vn-cl-col" /></Field>
        <Field label="Thao tác"><Select value={f.op} onChange={(v: string) => setF({ ...f, op: v })} options={[{ value: '', label: 'Tất cả' }, ...Object.keys(OPL).map((k) => ({ value: k, label: OPL[k][0] }))]} /></Field>
        <Field label="Mã bản ghi / người"><Input value={f.q} onChange={(e: any) => setF({ ...f, q: e.target.value })} placeholder="docId, tên, uid" data-testid="vn-cl-q" /></Field>
        <Field label="Từ ngày"><Input type="date" value={f.from} onChange={(e: any) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Đến ngày"><Input type="date" value={f.to} onChange={(e: any) => setF({ ...f, to: e.target.value })} /></Field>
        <Btn onClick={() => load()} disabled={busy}>Làm mới</Btn>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]"><thead><tr><Th>Thời gian</Th><Th>Người</Th><Th>Thao tác</Th><Th>Dữ liệu</Th><Th>Trường thay đổi</Th><Th></Th></tr></thead>
          <tbody data-testid="vn-cl-rows">
            {list.map((r) => (
              <tr key={r.id} className={r.status === 'failed' ? 'opacity-50' : ''}>
                <Td className="whitespace-nowrap text-[12px]">{r.at?.toDate ? r.at.toDate().toLocaleString('vi-VN') : '…'}</Td>
                <Td className="text-[12.5px]">{r.actorName || r.actor}</Td>
                <Td><Badge c={OPL[r.op]?.[1] || 'mute'}>{OPL[r.op]?.[0] || r.op}</Badge>{r.status === 'failed' && <Badge c="mute">Không thành công</Badge>}</Td>
                <Td className="text-[12.5px]"><b>{r.col}</b><div className="text-[11px] text-[var(--mh-text-3)] break-all">{r.docId}</div></Td>
                <Td className="text-[12px] text-[var(--mh-text-2)] max-w-[260px]">{r.op === 'delete' ? '(xoá tài liệu)' : diffKeys(r.before, r.patch).slice(0, 6).join(', ') || '—'}</Td>
                <Td r><Btn small onClick={() => { setPick(r); setConfirm(''); }} disabled={r.status === 'failed'} data-testid="vn-cl-restore">Khôi phục bản này</Btn></Td>
              </tr>))}
            {!list.length && <tr><Td colSpan={6}>{busy ? 'Đang tải…' : 'Không có thay đổi phù hợp.'}</Td></tr>}
          </tbody></table>
      </div>
      {last && rows.length % PAGE === 0 && <Btn small onClick={() => load(true)} disabled={busy}>Tải thêm</Btn>}
      <Modal open={!!pick} onClose={() => setPick(null)} title={`Khôi phục ${pick?.col}/${pick?.docId}`} wide
        footer={<><Btn onClick={() => setPick(null)}>Huỷ</Btn><Btn danger disabled={confirm !== 'KHOI PHUC' || busy} onClick={restore} data-testid="vn-cl-restore-go">Khôi phục</Btn></>}>
        {pick && <div className="space-y-2 text-[13px]" data-testid="vn-cl-restore-modal">
          <div>Đưa tài liệu về trạng thái <b>trước</b> thay đổi lúc {pick.at?.toDate?.().toLocaleString('vi-VN')} của {pick.actorName || pick.actor}. {pick.before == null ? <b className="text-[var(--mh-err)]">Tài liệu chưa tồn tại trước đó → sẽ bị xoá.</b> : 'Toàn bộ tài liệu được ghi đè bằng bản trước.'} Thao tác khôi phục cũng được ghi vào lịch sử và nhật ký kiểm toán.</div>
          <div className="max-h-[260px] overflow-auto border border-[var(--mh-border)] rounded-lg">
            <table data-mh-responsive className="w-full"><thead><tr><Th>Trường</Th><Th>Trước (sẽ khôi phục)</Th><Th>Thay đổi khi đó</Th></tr></thead><tbody>
              {[...new Set([...Object.keys(pick.before || {}), ...Object.keys(pick.patch || {})])].sort().map((k) => (
                <tr key={k} className={diffKeys(pick.before, pick.patch).includes(k) ? 'bg-amber-50' : ''}><Td className="text-[12px]">{k}</Td><Td className="text-[12px] break-all">{show(pick.before?.[k])}</Td><Td className="text-[12px] break-all">{pick.patch && k in pick.patch ? show(pick.patch[k]) : ''}</Td></tr>))}
            </tbody></table></div>
          <Field label="Gõ KHOI PHUC để xác nhận"><Input value={confirm} onChange={(e: any) => setConfirm(e.target.value)} data-testid="vn-cl-confirm" /></Field>
        </div>}
      </Modal>
    </Card>
  );
}
