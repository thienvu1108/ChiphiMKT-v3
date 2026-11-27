import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Deck, printDeck, type DeckData } from './ntDeck';
import { useInvoicePages } from './invoicePages';
import { safeFilePart } from '../../lib/vnext/exportName';

/** Trang công khai /chia-se/<token>: chỉ đọc, không cần đăng nhập. Rules chỉ cho GET khi còn hạn & chưa thu hồi. */
export default function ShareView({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<{ token: string; data: DeckData }>();
  const [err, setErr] = useState('');
  useEffect(() => {
    let active = true;
    setErr('');
    getDoc(doc(db, 'shareLinks', token)).then((s) => {
      if (!active) return;
      if (!s.exists()) return setErr('Link không tồn tại');
      const data: any = s.data();
      try { setSnapshot({ token, data: JSON.parse(data.snapshot) }); } catch { setErr('Dữ liệu link lỗi'); }
    }).catch(() => { if (active) setErr('Link đã hết hạn, bị thu hồi hoặc không tồn tại'); });
    return () => { active = false; };
  }, [token]);
  const base = snapshot?.token === token ? snapshot.data : undefined;
  const { images, pending, resolve } = useInvoicePages(base?.images ?? [], db, token);
  const d = base && { ...base, images };
  const [printError, setPrintError] = useState('');
  return (
    <div className="min-h-screen bg-[var(--mh-bg)] font-['Be_Vietnam_Pro',sans-serif]">
      <header className="h-14 bg-[var(--mh-surface)] border-b border-[var(--mh-border)] flex items-center px-4 gap-3 nt-noprint">
        <div className="font-extrabold text-[var(--mh-navy)]">MAY<span className="text-[var(--mh-accent)]">HOMES</span></div>
        <div className="text-[13px] text-[var(--mh-text-2)] flex-1 truncate">{d ? `${d.title} · ${d.periodLabel} · ${d.scopeLabel}` : 'Báo cáo Nghiệm thu'}</div>
        {d && <button disabled={pending} className="h-9 px-3 rounded-lg bg-[var(--mh-navy)] text-white text-[13px]" onClick={async () => {
          setPrintError('');
          try { await printDeck(d.fileName || safeFilePart(`Báo cáo - ${d.periodLabel} - ${d.scopeLabel}`)); }
          catch (error) { setPrintError((error as Error).message); }
        }}>⬇ Tải PDF</button>}
      </header>
      <main className="max-w-5xl mx-auto p-3 md:p-6">
        {printError && <p className="nt-noprint" role="alert">{printError}</p>}
        {err ? <div className="bg-[var(--mh-surface)] rounded-xl border border-[var(--mh-border)] p-10 text-center text-[var(--mh-text-2)]">{err}</div> : !d ? <div className="text-center text-[var(--mh-text-2)] p-10">Đang tải…</div> : pending ? <div className="text-center p-10">Đang chuẩn bị các trang PDF hóa đơn…</div> : <Deck key={token} d={d} resolve={resolve} />}
      </main>
    </div>
  );
}
