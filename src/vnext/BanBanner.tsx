import { createPortal } from 'react-dom';
/** Banner ekip của Ban KD — ảnh webp nén lưu trong ban_kd_banner/{banId}.dataUrl (≤ ~700KB). */
import React, { useEffect, useRef, useState } from 'react';
// Dùng SDK trực tiếp (không qua proxy) để không cache data URL lớn vào localStorage.
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { ImageIcon, Upload, X } from 'lucide-react';

export const BAN_BANNER_COLLECTION = 'ban_kd_banner';

async function toWebp(file: Blob, maxBytes = 700_000, maxDim = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  for (let a = 0; a < 6; a++) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
    for (const q of [0.85, 0.75, 0.65]) {
      const url = cv.toDataURL('image/webp', q);
      if (url.startsWith('data:image/webp') && url.length <= maxBytes) return url;
    }
    scale *= 0.75;
  }
  throw new Error('Ảnh quá lớn, không nén được');
}

export const BanBanner: React.FC<{ banId: string; banName?: string; canEdit: boolean; uid?: string }> = ({ banId, banName, canEdit, uid }) => {
  const [url, setUrl] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setUrl('');
    if (!banId) return;
    return onSnapshot(doc(db, BAN_BANNER_COLLECTION, banId), (s: any) => setUrl(s.exists() ? (s.data()?.dataUrl || '') : ''), (e: any) => { console.warn('[BanBanner]', e?.code || e); setUrl(''); });
  }, [banId]);
  const onFile = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    try {
      const dataUrl = await toWebp(f);
      await setDoc(doc(db, BAN_BANNER_COLLECTION, banId), { dataUrl, banName: banName || '', updatedAt: new Date().toISOString(), updatedBy: uid || '' });
      toast.success('Đã cập nhật banner Ban');
    } catch (e: any) { toast.error('Không lưu được banner: ' + (e?.message || e)); }
    finally { setBusy(false); if (inp.current) inp.current.value = ''; }
  };
  if (!url && !canEdit) return null;
  return (
    <div className="rounded-2xl border border-[var(--mh-border)] shadow-md bg-[var(--mh-surface)] overflow-hidden" data-testid="ban-banner">
      {url ? (
        <button type="button" onClick={() => setOpen(true)} className="block w-full bg-slate-900/95" title="Bấm để xem lớn">
          <img src={url} alt={`Banner ${banName || ''}`} className="mx-auto w-full sm:w-auto max-h-[70vh] sm:max-h-[440px] object-contain" />
        </button>
      ) : (
        <div className="p-6 text-center text-[var(--mh-text-3)] text-xs flex flex-col items-center gap-2"><ImageIcon className="w-8 h-8" />Chưa có banner ekip</div>
      )}
      {canEdit && (
        <div className="flex justify-end p-2 border-t border-[var(--mh-border)]">
          <input ref={inp} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" disabled={busy} onClick={() => inp.current?.click()} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:bg-blue-50 rounded-lg px-3 py-1.5 disabled:opacity-50">
            <Upload className="w-3.5 h-3.5" />{busy ? 'Đang tải…' : url ? 'Thay banner' : 'Tải banner'}
          </button>
        </div>
      )}
      {open && url && createPortal(
        <div className="fixed inset-0 z-[1200] bg-black/90 flex items-center justify-center p-2" onClick={() => setOpen(false)} role="dialog">
          <button type="button" className="absolute top-3 right-3 text-white p-2 z-10" onClick={() => setOpen(false)} aria-label="Đóng"><X className="w-6 h-6" /></button>
          <img src={url} alt="" className="max-w-full max-h-[min(92dvh,100%)] object-contain" />
        </div>,
        document.body,
      )}
    </div>
  );
};
