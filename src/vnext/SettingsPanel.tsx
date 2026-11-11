import React, { useEffect, useState } from 'react';
import { doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { auth } from '../firebase';
import { Card, Btn, Badge, Field, Input, Select, useToast } from './ui';
import { type VCtx, isAdm } from './ctx';
import { openNsPeriods } from '../../lib/vnext/platform';
import { currentLocks } from './locks';
import { periodLabel, getPeriodOf, addPeriods } from '../../lib/vnext/period';
import { driveStatus, migrateFirestoreImagesToDrive, rollbackDriveMigration } from './storage';

/** Cài đặt v-next (Admin): hạn đăng ký (áp dụng mọi cấp), mở khoá tháng, Drive gốc, link chia sẻ. */
export default function VNextSettings({ c }: { c: VCtx }) {
  const { toast, node } = useToast();
  const s = c.settings || {};
  const [drive, setDrive] = useState(s.ntDriveRootUrl || '');
  const [maxDays, setMaxDays] = useState(Number(s.ntShareMaxDays || 30));
  const [provider, setProvider] = useState(s.ntStorageProvider || 'firestore');
  const [status, setStatus] = useState<any>(null);
  useEffect(() => { driveStatus().then(setStatus); }, []);
  const [conn, setConn] = useState<any>(undefined);
  const [rootUrl, setRootUrl] = useState('');
  useEffect(() => onSnapshot(doc(c.db, 'driveOAuth', 'main'), (d) => { const v = d.exists() ? d.data() : null; setConn(v); if (v?.rootUrl) setRootUrl(v.rootUrl); }, () => setConn(null)), [c.db]);
  // Quay về từ Google (/api/drive/callback → #driveRt=<mã hoá>): lưu chuỗi mã hoá vào driveOAuth/main rồi xoá khỏi URL.
  useEffect(() => {
    if (!isAdm(c)) return;
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const enc = h.get('driveRt'); const err = h.get('driveErr');
    if (!enc && !err) return;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (err) { toast('Kết nối Google Drive thất bại: ' + err, 'err'); return; }
    setDoc(doc(c.db, 'driveOAuth', 'main'), { enc, email: h.get('driveEmail') || '', rootUrl: conn?.rootUrl || s.ntDriveRootUrl || '', connectedBy: c.uid, connectedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .then(() => { toast('Đã kết nối Google Drive'); setProvider('drive'); setDoc(doc(c.db, 'settings', 'global'), { ntStorageProvider: 'drive' }, { merge: true }).catch(() => {}); })
      .catch((e: any) => toast('Không lưu được kết nối: ' + (e?.code || e?.message), 'err'));
  }, []);
  if (!isAdm(c)) return null;
  const connectDrive = async () => {
    try {
      const t = await auth.currentUser?.getIdToken();
      const r = await fetch('/api/drive/start', { headers: { authorization: `Bearer ${t}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) return toast(j.error || 'Không bắt đầu được kết nối', 'err');
      window.location.href = j.url;
    } catch (e: any) { toast('Lỗi: ' + (e?.message || e), 'err'); }
  };
  const saveRoot = async () => {
    if (!conn) return toast('Chưa kết nối Google Drive', 'err');
    if (rootUrl.trim() && !/folders\/[a-zA-Z0-9_-]+/.test(rootUrl)) return toast('Dán link thư mục dạng https://drive.google.com/drive/folders/…', 'err');
    try { await setDoc(doc(c.db, 'driveOAuth', 'main'), { ...conn, rootUrl: rootUrl.trim(), updatedAt: new Date().toISOString() }); toast('Đã lưu thư mục gốc'); }
    catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  const cur = getPeriodOf();
  const save = async () => {
    if (provider === 'drive' && !conn && !status?.serviceAccount) return toast('Chưa kết nối Google Drive — bấm «Kết nối Google Drive» trước', 'err');
    try {
      await setDoc(doc(c.db, 'settings', 'global'), { ntDriveRootUrl: drive.trim(), ntShareMaxDays: Math.max(1, Math.min(30, maxDays)), ntStorageProvider: provider }, { merge: true });
      toast('Đã lưu cài đặt');
    } catch (e: any) { toast('Không lưu được: ' + (e?.code || e?.message), 'err'); }
  };
  return (
    <Card className="p-4 space-y-4 font-['Be_Vietnam_Pro',sans-serif]">
      <div className="font-semibold">Ngân sách MKT & Báo cáo (v-next)</div>
      <div className="text-[12px] text-[var(--mh-text-2)] rounded-lg bg-[var(--mh-bg)] p-2" data-testid="vn-settings-window-moved">Khung đăng ký / sửa NS và Nghiệm thu: cài ở <b>Khoá theo ngày → Thời gian MỞ</b> (nơi duy nhất). Kỳ đang mở đăng ký mới: {openNsPeriods(currentLocks(), 'nsCreate').map(periodLabel).join(', ') || 'không có'}.</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="(Cũ) Thư mục gốc cho service account" className="md:col-span-2"><Input value={drive} onChange={(e: any) => setDrive(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" /></Field>
        <Field label="Link chia sẻ: tối đa (ngày)"><Input type="number" min={1} max={30} value={maxDays} onChange={(e: any) => setMaxDays(Number(e.target.value))} /></Field>
        <Field label="Nơi lưu ảnh"><Select value={provider} onChange={setProvider} options={[{ value: 'firestore', label: 'Lưu tạm trong hệ thống' }, { value: 'drive', label: 'Google Drive (đã kết nối)' }]} /></Field>
        <div className="md:col-span-2 text-[12px] self-end">Máy chủ: {status == null ? <Badge c="mute">Không kiểm tra được</Badge> : status.oauth ? <Badge c="ok">OAuth Google Drive sẵn sàng</Badge> : <Badge c="warn">Chưa có OAuth client</Badge>}</div>
      </div>
      <div className="rounded-xl border border-[var(--mh-border)] p-3 space-y-2" data-testid="vn-drive-connect">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[13px] flex-1">Google Drive (ảnh Nghiệm thu) — tài khoản Admin</b>
          {conn === undefined ? <Badge c="mute">Đang kiểm tra…</Badge> : conn ? <Badge c="ok">Đã kết nối{conn.email ? `: ${conn.email}` : ''}</Badge> : <Badge c="warn">Chưa kết nối</Badge>}
          <Btn primary={!conn} onClick={connectDrive} disabled={status && !status.oauth}>{conn ? 'Kết nối lại' : 'Kết nối Google Drive'}</Btn>
          {conn && <Btn danger onClick={async () => { if (window.confirm('Ngắt kết nối Google Drive?')) await deleteDoc(doc(c.db, 'driveOAuth', 'main')); }}>Ngắt</Btn>}
        </div>
        <div className="text-[12px] text-[var(--mh-text-2)]">Ảnh tải lên lưu vào Drive của tài khoản kết nối (tính dung lượng của tài khoản đó), thư mục Tháng / Khối / Phòng / User / Dự án, tên «MAYHOMES - Mã Phòng - Dự án - NV - Tháng M YYYY - NN». Chỉ Admin/Mod tải ảnh.{status && !status.oauth ? ' Máy chủ chưa có OAuth client.' : ''}</div>
        <div className="flex flex-wrap gap-2 items-end">
          <Field label="Link thư mục gốc trên Drive" className="flex-1 min-w-[240px]"><Input value={rootUrl} onChange={(e: any) => setRootUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" /></Field>
          <Btn onClick={saveRoot} disabled={!conn}>Lưu thư mục gốc</Btn>
        </div>
      </div>
      {conn && <div className="rounded-xl border border-[var(--mh-border)] p-3 flex flex-wrap items-center gap-2" data-testid="vn-nt-migrate">
        <b className="text-[13px] flex-1">Chuyển ảnh Nghiệm thu cũ (lưu tạm trong hệ thống) sang Drive</b>
        <Btn onClick={async () => {
          const pre = await migrateFirestoreImagesToDrive(c.db, { dryRun: true });
          if (!pre.total) return toast('Không còn ảnh nào cần chuyển');
          if (!window.confirm(`Có ${pre.total} ảnh sẽ được tải lên Drive. Dữ liệu cũ vẫn giữ để khôi phục. Tiếp tục?`)) return;
          const r = await migrateFirestoreImagesToDrive(c.db, { dryRun: false, onProgress: (d, t, e) => toast(`Đã chuyển ${d}/${t}${e ? `, lỗi ${e}` : ''}`) });
          toast(`Xong: ${r.done}/${r.total} ảnh${r.errors.length ? `, lỗi ${r.errors.length}` : ''}`, r.errors.length ? 'err' : undefined);
          if (r.errors.length) console.warn('NT migrate errors', r.errors);
        }}>Chuyển ảnh cũ</Btn>
        <Btn danger onClick={async () => { if (!window.confirm('Khôi phục ảnh đã chuyển về bản lưu cũ?')) return; toast(`Đã khôi phục ${await rollbackDriveMigration(c.db)} ảnh`); }}>Khôi phục</Btn>
      </div>}
      <div className="flex justify-end"><Btn primary onClick={save}>Lưu cài đặt</Btn></div>
      {node}
    </Card>
  );
}
