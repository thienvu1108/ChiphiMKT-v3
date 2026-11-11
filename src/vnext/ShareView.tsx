import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Deck, type DeckData, type DeckImage } from './ntDeck';
import { storageFor } from './storage';
import { printWithTitle, safeFilePart } from '../../lib/vnext/exportName';

/** Trang công khai /chia-se/<token>: chỉ đọc, không cần đăng nhập. Rules chỉ cho GET khi còn hạn & chưa thu hồi. */
export default function ShareView({ token }: { token: string }) {
  const [d, setD] = useState<DeckData | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    getDoc(doc(db, 'shareLinks', token)).then((s) => {
      if (!s.exists()) return setErr('Link không tồn tại');
      const data: any = s.data();
      try { setD(JSON.parse(data.snapshot)); } catch { setErr('Dữ liệu link lỗi'); }
    }).catch(() => setErr('Link đã hết hạn, bị thu hồi hoặc không tồn tại'));
  }, [token]);
  const resolve = (img: DeckImage) => storageFor(db, img.provider).url(img as any, token);
  return (
    <div className="min-h-screen bg-[var(--mh-bg)] font-['Be_Vietnam_Pro',sans-serif]">
      <header className="h-14 bg-[var(--mh-surface)] border-b border-[var(--mh-border)] flex items-center px-4 gap-3 nt-noprint">
        <div className="font-extrabold text-[var(--mh-navy)]">MAY<span className="text-[var(--mh-accent)]">HOMES</span></div>
        <div className="text-[13px] text-[var(--mh-text-2)] flex-1 truncate">{d ? `${d.title} · ${d.periodLabel} · ${d.scopeLabel}` : 'Báo cáo Nghiệm thu'}</div>
        {d && <button className="h-9 px-3 rounded-lg bg-[var(--mh-navy)] text-white text-[13px]" onClick={() => printWithTitle(d.fileName || safeFilePart(`Báo cáo - ${d.periodLabel} - ${d.scopeLabel}`), () => document.body.classList.add('nt-print'), () => document.body.classList.remove('nt-print'))}>⬇ Tải PDF</button>}
      </header>
      <main className="max-w-5xl mx-auto p-3 md:p-6">
        {err ? <div className="bg-[var(--mh-surface)] rounded-xl border border-[var(--mh-border)] p-10 text-center text-[var(--mh-text-2)]">{err}</div> : !d ? <div className="text-center text-[var(--mh-text-2)] p-10">Đang tải…</div> : <Deck d={d} resolve={resolve} />}
      </main>
    </div>
  );
}
