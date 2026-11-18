/** Popup thông báo khi đăng nhập: Chính sách hỗ trợ MKT mới (từ kỳ T12/2026) & Core team theo dự án.
 * Hiển thị 1 lần mỗi phiên đăng nhập (sessionStorage). Có nút X đóng và nút «Xem chi tiết». */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SEEN_KEY = 'vn-mkt-popup-v1';

export const MktAnnouncementPopup: React.FC<{ onDetail: () => void }> = ({ onDetail }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch { /* ignore */ }
    if (!seen) setOpen(true);
  }, []);

  const close = () => {
    setOpen(false);
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1300] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Thông báo chính sách hỗ trợ Marketing" onClick={close} data-testid="vn-mkt-popup">
      <div className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Nút đóng */}
        <button type="button" onClick={close} aria-label="Đóng" data-testid="vn-mkt-popup-close"
          className="absolute top-3 right-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Ảnh banner (nội dung text) */}
        <div className="bg-gradient-to-br from-[#0F2A4A] via-[#143560] to-[#0B2038] text-white px-6 py-8 sm:px-10 sm:py-10 text-center">
          <div className="text-[11px] font-bold tracking-[0.25em] text-white/70">MAYHOMES · THÔNG BÁO</div>
          <h2 className="mt-3 text-[22px] sm:text-[27px] font-black leading-snug">
            Chính sách hỗ trợ <span className="text-[#FFB347]">MKT mới nhất</span>
          </h2>
          <div className="mt-1 text-[15px] sm:text-[17px] font-semibold text-white/90">áp dụng từ kì tháng 12/2026</div>
          <div className="my-4 mx-auto h-px w-16 bg-white/25" />
          <div className="text-[18px] sm:text-[21px] font-extrabold leading-snug">
            và Thành lập <span className="text-[#FFB347]">Core team</span> theo từng Dự án
          </div>
        </div>

        {/* Hành động */}
        <div className="bg-[var(--mh-surface)] px-6 py-4 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button type="button" onClick={() => { close(); onDetail(); }} data-testid="vn-mkt-popup-detail"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-6 py-2.5 text-[14px] font-bold text-white shadow-sm hover:bg-[#1E40AF] transition-colors">
            Xem chi tiết
          </button>
          <button type="button" onClick={close}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-[var(--mh-border)] px-6 py-2.5 text-[14px] font-semibold text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)] transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
