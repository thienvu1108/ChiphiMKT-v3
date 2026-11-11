/**
 * Lớp lưu ảnh Nghiệm thu có thể thay thế (pluggable):
 *  - 'drive'     : Google Shared Drive qua /api/nt-images (cần service account — xem api/nt-images/[action].ts)
 *  - 'firestore' : dự phòng khi chưa có Drive (staging): ảnh nén ≤ ~850KB lưu trong acceptanceImageData
 * Chọn provider ở Cài đặt (settings/global.ntStorageProvider); mặc định 'firestore' nếu Drive chưa cấu hình.
 */
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { auth } from '../firebase';

export type ImgMeta = { id: string; acceptanceId: string; provider: 'drive' | 'firestore'; ref: string; name: string; caption?: string; order: number; uploadedBy: string; uploadedByName?: string; uploadedAt: string; teamId?: string };

export interface ImageStorage {
  id: 'drive' | 'firestore';
  label: string;
  upload(file: File | Blob, meta: { name: string; path: string[]; teamId?: string; acceptanceId?: string }): Promise<{ ref: string }>;
  url(img: ImgMeta, share?: string): Promise<string>;
  remove(img: ImgMeta): Promise<void>;
}

export async function compressImage(file: Blob, maxBytes = 850_000, maxDim = 1800): Promise<string> {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const url = cv.toDataURL('image/jpeg', q);
      if (url.length <= maxBytes) return url;
    }
    scale *= 0.75;
  }
  throw new Error('Ảnh quá lớn, không nén được');
}

const urlCache = new Map<string, string>();

export function firestoreStorage(db: Firestore): ImageStorage {
  return {
    id: 'firestore', label: 'Lưu tạm trong hệ thống (chưa có Drive)',
    async upload(file, meta) {
      const dataUrl = await compressImage(file);
      const ref = await addDoc(collection(db, 'acceptanceImageData'), { dataUrl, name: meta.name, path: meta.path.join('/'), teamId: meta.teamId || '', ...(meta.acceptanceId ? { acceptanceId: meta.acceptanceId } : {}), createdAt: new Date().toISOString() });
      return { ref: ref.id };
    },
    async url(img, share) {
      const k = (share || '') + img.ref;
      if (urlCache.has(k)) return urlCache.get(k)!;
      const snap = await getDoc(doc(db, share ? `shareLinks/${share}/images/${img.ref}` : `acceptanceImageData/${img.ref}`));
      const u = (snap.data() as any)?.dataUrl || '';
      urlCache.set(k, u);
      return u;
    },
    async remove(img) { await deleteDoc(doc(db, 'acceptanceImageData', img.ref)); },
  };
}

export function driveStorage(): ImageStorage {
  return {
    id: 'drive', label: 'Google Shared Drive',
    async upload(file, meta) {
      // Giữ nguyên ảnh gốc (độ phân giải, tỉ lệ) nếu vừa giới hạn body Vercel (~4.5MB sau base64); quá lớn mới nén.
      const ORIGINAL_MAX = 3_200_000;
      const okType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      let mime = 'image/jpeg', b64: string;
      if (okType && file.size <= ORIGINAL_MAX) {
        mime = file.type;
        const buf = new Uint8Array(await file.arrayBuffer()); let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        b64 = btoa(bin);
      } else {
        b64 = (await compressImage(file, 4_200_000, 4000)).split(',')[1];
      }
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch('/api/nt-images/upload', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: meta.name, path: meta.path, mime, dataBase64: b64 }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Tải ảnh lên Drive thất bại');
      return { ref: j.fileId };
    },
    async url(img, share) {
      const inv = (img as any).inv as string | undefined; // hóa đơn: ảnh xem trước (PDF → trang 1)
      if (share) return `/api/nt-images/file?id=${encodeURIComponent(img.ref)}&share=${encodeURIComponent(share)}${inv ? '&preview=1' : ''}`;
      const k = 'd' + img.ref;
      if (urlCache.has(k)) return urlCache.get(k)!;
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch(`/api/nt-images/file?id=${encodeURIComponent(img.ref)}${inv ? `&inv=${encodeURIComponent(inv)}&preview=1` : `&img=${encodeURIComponent(img.id)}`}`, { headers: { authorization: `Bearer ${token}` } });
      if (!r.ok) return '';
      const u = URL.createObjectURL(await r.blob());
      urlCache.set(k, u);
      return u;
    },
    /** Chuyển file vào Thùng rác Drive (khôi phục được 30 ngày) qua server; lỗi → ném để giữ bản ghi. */
    async remove(img) {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch('/api/nt-images/delete', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ imgId: img.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'Không xoá được file trên Drive'), { code: 'drive' });
      urlCache.delete('d' + img.ref);
    },
  };
}

export function storageFor(db: Firestore, provider: string | undefined): ImageStorage {
  return provider === 'drive' ? driveStorage() : firestoreStorage(db);
}

export async function driveStatus(): Promise<{ driveConfigured: boolean; oauth?: boolean; serviceAccount?: boolean; database?: string } | null> {
  try { const r = await fetch('/api/nt-images/status'); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

export async function saveImageMeta(db: Firestore, m: Omit<ImgMeta, 'id'>) {
  const ref = doc(collection(db, 'acceptanceImages'));
  await setDoc(ref, m);
  return ref.id;
}

/** Chuyển ảnh cũ Firestore → Drive. Giữ nguyên acceptanceImageData (để khôi phục); chỉ đổi provider/ref trên acceptanceImages, lưu legacyRef. */
export async function migrateFirestoreImagesToDrive(db: Firestore, opts: { dryRun: boolean; onProgress?: (done: number, total: number, err: number) => void }) {
  const { getDocs, query, where, updateDoc } = await import('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'acceptanceImages'), where('provider', '==', 'firestore')));
  const items = snap.docs;
  if (opts.dryRun) return { total: items.length, done: 0, errors: [] as string[] };
  const drive = driveStorage(); const errors: string[] = []; let done = 0;
  for (const d of items) {
    try {
      const m: any = d.data();
      const src = await getDoc(doc(db, 'acceptanceImageData', m.ref));
      const s: any = src.data();
      if (!s?.dataUrl) throw new Error('thiếu dữ liệu ảnh');
      const blob = await (await fetch(s.dataUrl)).blob();
      const name = /^MAYHOMES - /.test(s.name || m.name || '') ? (s.name || m.name) : `MAYHOMES - ${m.name || d.id}`;
      const { ref } = await drive.upload(blob, { name, path: String(s.path || '').split('/').filter(Boolean) });
      await updateDoc(d.ref, { provider: 'drive', ref, legacyProvider: 'firestore', legacyRef: m.ref, migratedAt: new Date().toISOString() });
      done++;
    } catch (e: any) { errors.push(`${d.id}: ${e?.message || e}`); }
    opts.onProgress?.(done, items.length, errors.length);
  }
  return { total: items.length, done, errors };
}

/** Khôi phục: trả các ảnh đã chuyển về Firestore (dữ liệu cũ vẫn còn). File Drive giữ nguyên. */
export async function rollbackDriveMigration(db: Firestore) {
  const { getDocs, query, where, updateDoc } = await import('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'acceptanceImages'), where('legacyProvider', '==', 'firestore')));
  let n = 0;
  for (const d of snap.docs) { const m: any = d.data(); if (m.provider !== 'drive' || !m.legacyRef) continue;
    await updateDoc(d.ref, { provider: 'firestore', ref: m.legacyRef, driveRefAfterRollback: m.ref }); n++; }
  return n;
}
