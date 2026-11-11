import React, { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { toast } from 'sonner';
import { auth } from '../firebase';
import { Card, Btn, Badge, Th, Td, Field, Select, Modal, Input, vnTime } from './ui';
import { isAdm, type VCtx } from './ctx';
import { asArr } from './ctx';
import { BACKUP_COLLECTIONS, RESTORE_EXCLUDED } from '../../lib/vnext/backup';

async function api(action: string, body?: any) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`/api/backup-drive/${action}`, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!j) throw new Error('Máy chủ sao lưu không phản hồi (API chưa sẵn sàng)');
  if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
  return j;
}
const mb = (n: number) => (n / 1048576).toFixed(2) + ' MB';
const RESTORABLE = BACKUP_COLLECTIONS.filter((c) => !RESTORE_EXCLUDED.includes(c));

/** Cài đặt → Sao lưu (Google Drive). Chỉ Admin. */
export default function BackupPanel({ c }: { c: VCtx }) {
  const [files, setFiles] = useState<any[] | null>(null);
  const [busy, setBusy] = useState('');
  const [runs, setRuns] = useState<any[]>([]);
  const [pick, setPick] = useState<any>(null);
  const [mode, setMode] = useState<'full' | 'collection' | 'month' | 'team'>('collection');
  const [cols, setCols] = useState<string[]>(['acceptances']);
  const [month, setMonth] = useState('');
  const [teamId, setTeamId] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [confirmText, setConfirmText] = useState('');
  const load = () => api('list').then((j) => setFiles(Array.isArray(j.files) ? j.files : [])).catch((e) => { setFiles([]); toast.error(e.message); });
  const adm = isAdm(c);
  useEffect(() => { if (adm) load(); }, [adm]);
  useEffect(() => {
    if (!adm) return;
    return onSnapshot(query(collection(c.db, 'backupRuns'), orderBy('at', 'desc'), limit(8)), (s) => setRuns(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.warn('backupRuns', e.message));
  }, [adm, c.db]);
  if (!isAdm(c)) return null;
  const scope = () => (mode === 'full' ? {} : mode === 'collection' ? { collections: cols } : mode === 'month' ? { collections: cols, month } : { collections: cols, teamId });
  const runNow = async () => {
    setBusy('run');
    try { const j = await api('run', {}); toast.success(`Đã sao lưu ${j.total.toLocaleString('vi-VN')} bản ghi → ${j.name}`); load(); }
    catch (e: any) { toast.error('Sao lưu lỗi: ' + e.message); } finally { setBusy(''); }
  };
  const doPreview = async () => {
    if (mode === 'month' && !/^\d{4}-\d{2}$/.test(month)) return toast.error('Nhập tháng dạng YYYY-MM');
    if (mode === 'team' && !teamId) return toast.error('Chọn Phòng');
    setBusy('preview'); setPreview(null);
    try { setPreview(await api('preview', { fileId: pick.id, scope: scope() })); } catch (e: any) { toast.error(e.message); } finally { setBusy(''); }
  };
  const doRestore = async () => {
    setBusy('restore');
    try { const j = await api('restore', { fileId: pick.id, name: pick.name, scope: scope(), confirm: 'KHOI PHUC' }); toast.success(`Đã khôi phục ${j.writes} thay đổi. Bản sao lưu trước khi khôi phục: ${j.preBackup}`); setPick(null); setPreview(null); setConfirmText(''); load(); }
    catch (e: any) { toast.error('Khôi phục lỗi: ' + e.message); } finally { setBusy(''); }
  };
  const tot = (k: string) => (preview?.rows || []).reduce((a: number, r: any) => a + r[k], 0);
  return (
    <Card className="p-4 sm:p-5 space-y-4" data-testid="vn-backup-panel">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="text-[16px] font-bold">Sao lưu (Google Drive)</div>
          <div className="text-[12.5px] text-[var(--mh-text-2)]">Tự động 02:13 hằng đêm (giờ VN) · thư mục «Sao lưu ChiphiMKT» · giữ bản hằng ngày 30 ngày, bản đầu mỗi tháng 12 tháng · bản cũ hơn chuyển vào Thùng rác Drive.</div>
        </div>
        <Btn primary onClick={runNow} disabled={!!busy} data-testid="vn-backup-run">{busy === 'run' ? 'Đang sao lưu…' : 'Sao lưu ngay'}</Btn>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]"><thead><tr><Th>Bản sao lưu</Th><Th r>Dung lượng</Th><Th>Tạo lúc</Th><Th></Th></tr></thead>
          <tbody data-testid="vn-backup-list">
            {files === null ? <tr><Td colSpan={4}>Đang tải…</Td></tr> : files.length === 0 ? <tr><Td colSpan={4}>Chưa có bản sao lưu nào.</Td></tr> :
              files.slice(0, 30).map((f) => (
                <tr key={f.id}><Td className="font-medium">{f.name}</Td><Td r>{mb(f.size)}</Td><Td>{vnTime(f.createdTime)}</Td>
                  <Td r><Btn small onClick={() => { setPick(f); setPreview(null); setConfirmText(''); }} data-testid="vn-backup-pick">Khôi phục…</Btn></Td></tr>))}
          </tbody></table>
      </div>
      <div>
        <div className="text-[13px] font-semibold mb-1">Nhật ký sao lưu</div>
        <div className="space-y-1" data-testid="vn-backup-runs">
          {runs.map((r) => (
            <div key={r.id} className="text-[12.5px] flex flex-wrap gap-2 items-center">
              <Badge c={r.ok ? 'ok' : 'err'}>{r.ok ? 'OK' : 'Lỗi'}</Badge><b>{({ nightly: 'Tự động', manual: 'Thủ công', 'pre-restore': 'Trước khôi phục', restore: 'Khôi phục' } as any)[r.kind] || r.kind}</b>
              <span>{r.at?.toDate ? r.at.toDate().toLocaleString('vi-VN') : ''}</span><span className="text-[var(--mh-text-2)]">{r.name || r.error || ''}{r.total ? ` · ${Number(r.total).toLocaleString('vi-VN')} bản ghi` : ''}</span>
            </div>))}
          {!runs.length && <div className="text-[12.5px] text-[var(--mh-text-2)]">Chưa có lượt chạy.</div>}
        </div>
      </div>
      <Modal open={!!pick} onClose={() => setPick(null)} title={`Khôi phục từ ${pick?.name || ''}`} wide
        footer={<>
          <Btn onClick={() => setPick(null)}>Huỷ</Btn>
          <Btn onClick={doPreview} disabled={!!busy} data-testid="vn-restore-preview">{busy === 'preview' ? 'Đang so sánh…' : 'Xem trước thay đổi'}</Btn>
          <Btn danger onClick={doRestore} disabled={!preview || confirmText !== 'KHOI PHUC' || !!busy} data-testid="vn-restore-go">{busy === 'restore' ? 'Đang khôi phục…' : 'Khôi phục'}</Btn>
        </>}>
        <div className="space-y-3 text-[13px]">
          <Field label="Phạm vi"><Select value={mode} onChange={(v: any) => { setMode(v); setPreview(null); }} data-testid="vn-restore-mode"
            options={[{ value: 'full', label: 'Toàn bộ' }, { value: 'collection', label: 'Theo collection' }, { value: 'month', label: 'Theo tháng' }, { value: 'team', label: 'Theo Phòng' }]} /></Field>
          {mode !== 'full' && <div className="flex flex-wrap gap-1.5" data-testid="vn-restore-cols">{RESTORABLE.map((k) => (
            <label key={k} className={`px-2 py-1 rounded-lg border text-[12px] cursor-pointer ${cols.includes(k) ? 'bg-[var(--mh-navy)] text-white border-[var(--mh-navy)]' : 'border-[var(--mh-border)]'}`}>
              <input type="checkbox" className="hidden" checked={cols.includes(k)} onChange={() => { setCols(cols.includes(k) ? cols.filter((x) => x !== k) : [...cols, k]); setPreview(null); }} />{k}</label>))}</div>}
          {mode === 'month' && <Field label="Tháng (YYYY-MM)"><Input value={month} onChange={(e: any) => { setMonth(e.target.value); setPreview(null); }} placeholder="2026-10" /></Field>}
          {mode === 'team' && <Field label="Phòng"><Select value={teamId} onChange={(v: any) => { setTeamId(v); setPreview(null); }} options={[{ value: '', label: '— Chọn Phòng —' }, ...asArr(c.teams).map((t: any) => ({ value: t.id, label: t.name }))]} /></Field>}
          {preview && <div data-testid="vn-restore-diff">
            <div className="mb-1">Thêm <b className="text-[var(--mh-ok)]">{tot('add')}</b> · Sửa <b className="text-[var(--mh-warn)]">{tot('update')}</b> · Xoá <b className="text-[var(--mh-err)]">{tot('delete')}</b> · Giữ nguyên {tot('same')}</div>
            <table data-mh-responsive className="w-full"><thead><tr><Th>Collection</Th><Th r>Thêm</Th><Th r>Sửa</Th><Th r>Xoá</Th><Th r>Giữ</Th></tr></thead><tbody>
              {preview.rows.map((r: any) => <tr key={r.col}><Td>{r.col}</Td><Td r>{r.add}</Td><Td r>{r.update}</Td><Td r>{r.delete}</Td><Td r>{r.same}</Td></tr>)}</tbody></table>
            <div className="mt-2 text-[12px] text-[var(--mh-text-2)]">Hệ thống tự sao lưu trạng thái hiện tại trước khi ghi. Xoá chỉ áp dụng khi khôi phục theo collection/toàn bộ.</div>
            <Field label="Gõ KHOI PHUC để xác nhận"><Input value={confirmText} onChange={(e: any) => setConfirmText(e.target.value)} data-testid="vn-restore-confirm" /></Field>
          </div>}
        </div>
      </Modal>
    </Card>
  );
}
