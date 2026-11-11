import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { keyAction, stepIndex, swipeAction, openableUrl } from '../lib/photoViewer';

export type ViewerItem = { id: string; caption?: string; name?: string; load: () => Promise<string> };

/** Xem ảnh gốc toàn màn hình: Esc / ✕ / bấm nền để đóng, ◀ ▶ / phím mũi tên / vuốt để chuyển, bấm ảnh hoặc pinch để phóng to. */
export function PhotoViewer({ items, index, onIndex, onClose }: { items: ViewerItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const it = items[index];
  const [src, setSrc] = useState(''); const [err, setErr] = useState(false); const [zoom, setZoom] = useState(false);
  const touch = useRef<{ x: number; y: number; n: number } | null>(null);
  const n = items.length;
  const go = (d: number) => { setZoom(false); onIndex(stepIndex(index, d, n)); };
  useEffect(() => { let alive = true; setSrc(''); setErr(false); it?.load().then((u) => { if (alive) { setSrc(u); setErr(!u); } }).catch(() => alive && setErr(true)); return () => { alive = false; }; }, [it?.id]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { const a = keyAction(e.key); if (!a) return; e.preventDefault(); e.stopPropagation(); if (a === 'close') onClose(); else if (a === 'zoom') setZoom((z) => !z); else if (n > 1) go(a === 'next' ? 1 : -1); };
    window.addEventListener('keydown', h, true); const ov = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h, true); document.body.style.overflow = ov; };
  });
  if (!it) return null;
  const btn = 'h-10 min-w-10 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-[14px] grid place-items-center backdrop-blur';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Xem ảnh" data-testid="vn-photo-viewer" className="fixed inset-0 z-[1300] bg-black/90 flex flex-col select-none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex items-center gap-2 p-2 text-white text-[13px]" onClick={(e) => e.stopPropagation()}>
        <span className="tabular-nums opacity-80">{index + 1}/{n}</span>
        <span className="flex-1 truncate">{it.caption || ''}</span>
        {src && <button type="button" className={btn} title="Mở ảnh gốc ở tab mới" data-testid="vn-photo-open" onClick={() => window.open(openableUrl(src), '_blank', 'noopener')}>↗ <span className="hidden sm:inline ml-1">Ảnh gốc</span></button>}
        <button type="button" className={btn} title="Phóng to / thu nhỏ" onClick={() => setZoom((z) => !z)}>{zoom ? '−' : '+'}</button>
        <button type="button" className={btn} title="Đóng (Esc)" aria-label="Đóng" data-testid="vn-photo-close" onClick={onClose}>✕</button>
      </div>
      <div className={`relative flex-1 min-h-0 ${zoom ? 'overflow-auto' : 'overflow-hidden grid place-items-center'}`} style={{ touchAction: zoom ? 'pan-x pan-y pinch-zoom' : 'pinch-zoom' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onTouchStart={(e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, n: e.touches.length }; }}
        onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (!s || s.n > 1 || zoom || n < 2) return; const t = e.changedTouches[0]; const a = swipeAction(t.clientX - s.x, t.clientY - s.y); if (a) go(a === 'next' ? 1 : -1); }}>
        {src ? <img src={src} alt={it.caption || ''} draggable={false} data-testid="vn-photo-full" onClick={() => setZoom((z) => !z)}
          className={zoom ? 'max-w-none cursor-zoom-out' : 'max-w-full max-h-full object-contain cursor-zoom-in'} />
          : <div className="text-white/80 text-[13px]">{err ? 'Không tải được ảnh' : <span className="inline-block w-6 h-6 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />}</div>}
        {n > 1 && <>
          <button type="button" aria-label="Ảnh trước" className={`${btn} absolute left-2 top-1/2 -translate-y-1/2`} onClick={(e) => { e.stopPropagation(); go(-1); }}>◀</button>
          <button type="button" aria-label="Ảnh sau" className={`${btn} absolute right-2 top-1/2 -translate-y-1/2`} onClick={(e) => { e.stopPropagation(); go(1); }}>▶</button>
        </>}
      </div>
    </div>, document.body);
}
