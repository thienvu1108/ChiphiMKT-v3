import { createPortal } from 'react-dom';
import React, { useEffect, useState } from 'react';
import { GUIDE_HTML, GUIDE_TITLE, GUIDE_SOURCE } from './guideContent';

const GPKD_URL = 'https://drive.google.com/file/d/12vM39sip5iRlh31QQNsCXf63FKKAQm4v/view?usp=sharing';
export const MST_INFO = {
  name: 'CÔNG TY CỔ PHẦN KINH DOANH BẤT ĐỘNG SẢN MAYHOMES',
  address: 'SB24-30, Sao Biển 24, KĐT Vinhomes Ocean Park, Xã Gia Lâm, Thành phố Hà Nội, Việt Nam',
  taxCode: '0110347195',
};

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" aria-label={`Sao chép ${label}`} data-testid={`vn-mst-copy-${label}`}
      onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* ignore */ } }}
      className="shrink-0 px-2.5 py-1 rounded-lg border border-[var(--mh-border)] text-[12px] font-semibold text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]">
      {ok ? 'Đã chép' : 'Sao chép'}
    </button>
  );
}

function MstModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const rows: [string, string, string][] = [['Tên Công ty', MST_INFO.name, 'ten'], ['Địa chỉ', MST_INFO.address, 'diachi'], ['Mã số thuế', MST_INFO.taxCode, 'mst']];
  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4 overflow-hidden" onClick={onClose} data-testid="vn-mst-modal">
      <div role="dialog" aria-modal="true" aria-labelledby="vn-mst-title" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[100vw] sm:max-w-lg max-h-[min(92dvh,100%)] overflow-y-auto overscroll-contain bg-[var(--mh-surface)] rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id="vn-mst-title" className="text-base sm:text-lg font-black text-[var(--mh-text)]">Thông tin Mã số thuế Mayhomes</h2>
          <button type="button" aria-label="Đóng" onClick={onClose} className="-mt-1 -mr-1 w-8 h-8 rounded-lg text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)] text-xl leading-none">×</button>
        </div>
        <dl className="space-y-3">
          {rows.map(([k, v, id]) => (
            <div key={id} className="rounded-xl border border-[var(--mh-border)] bg-[var(--mh-surface-2)] p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mh-text-2)]">{k}</dt>
              <dd className="mt-1 flex items-start justify-between gap-2">
                <span className={`text-sm text-[var(--mh-text)] font-bold ${id === 'mst' ? 'text-lg tracking-wider' : ''}`} style={{ overflowWrap: 'anywhere' }}>{v}</span>
                <CopyBtn text={v} label={id} />
              </dd>
            </div>
          ))}
        </dl>
        <button type="button" onClick={onClose} className="mt-5 w-full px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold">Đóng</button>
      </div>
    </div>,
    document.body,
  );
}

/** «Hướng dẫn» — trang tĩnh cho mọi vai trò (không đọc Firestore). */
export default function GuidePage() {
  const [mstOpen, setMstOpen] = useState(false);
  return (
    <div className="max-w-3xl mx-auto bg-[var(--mh-surface)] rounded-2xl border border-[var(--mh-border)] shadow-sm p-4 sm:p-8" data-testid="vn-guide">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-5">
        <a href={GPKD_URL} target="_blank" rel="noopener noreferrer" data-testid="vn-guide-gpkd"
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm no-underline">⬇ Tải Giấy Phép Kinh Doanh</a>
        <button type="button" onClick={() => setMstOpen(true)} data-testid="vn-guide-mst"
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm">🧾 Thông tin Mã số thuế Mayhomes</button>
      </div>
      <h1 className="text-base sm:text-xl font-black text-[var(--mh-text)] leading-snug mb-4">{GUIDE_TITLE}</h1>
      <style>{`.vn-guide-body p{margin:0 0 .75rem;line-height:1.6;font-size:14px;color:#1e293b;overflow-wrap:anywhere}
.vn-guide-body img{max-width:100%;height:auto;display:block;margin:.5rem 0;border:1px solid #e2e8f0;border-radius:8px}
.vn-guide-body a{color:#4f46e5;text-decoration:underline;word-break:break-all}`}</style>
      <div className="vn-guide-body" dangerouslySetInnerHTML={{ __html: GUIDE_HTML }} />
      <p className="mt-6 text-[11px] text-[var(--mh-text-3)]">Nguồn: <a className="underline" href={GUIDE_SOURCE} target="_blank" rel="noopener noreferrer">Google Docs</a></p>
      {mstOpen && <MstModal onClose={() => setMstOpen(false)} />}
    </div>
  );
}
