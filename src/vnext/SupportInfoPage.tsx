/** Menu «Thông tin Hỗ trợ» (mọi người đăng nhập, chỉ xem): chính sách hỗ trợ Marketing mới & Core team theo dự án. */
import React, { useEffect, useState } from 'react';
import { type VCtx } from './ctx';
import { Shell, Modal } from './ui';
import { MktPolicyInfo } from './MktPolicyInfo';

export const SUPPORT_TEMPLATES = [
  { label: 'Tải xuống Mẫu Bảng kê tạm ứng', href: 'https://docs.google.com/spreadsheets/d/1leRfdw3wDYmC2iCKDtkGkGz6C3BmtDNHqjv1es5rOXU/edit?usp=drivesdk' },
  { label: 'Tải xuống Mẫu Giấy Đề nghị Thanh toán', href: 'https://docs.google.com/document/d/1eY79yghYg-2rI39DMMI7B--0VRCVVzk2/edit?usp=drivesdk&ouid=114611711078767109658&rtpof=true&sd=true' },
  { label: 'Tải xuống Mẫu Bảng kê thanh toán', href: 'https://docs.google.com/spreadsheets/d/12jvapmz5XirbTIXjfCp9JEDr_56dvO4-AHfb4gbRlMA/edit?usp=drivesdk' },
];

export default function SupportInfoPage({ c }: { c: VCtx }) {
  const [tpl, setTpl] = useState(false);
  useEffect(() => { if (!tpl) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setTpl(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [tpl]);
  return (
    <Shell title="Thông tin Hỗ trợ" sub="Chính sách hỗ trợ Marketing mới & Core team theo dự án (chỉ xem).">
      <div className="flex justify-center sm:justify-start"><button type="button" onClick={() => setTpl(true)} data-testid="vn-support-templates-btn"
        className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-[#1E40AF]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Tải Các File Biểu Mẫu thanh toán</button></div>
      <Modal open={tpl} onClose={() => setTpl(false)} title="Tải Các File Biểu Mẫu thanh toán">
        <div className="grid grid-cols-1 gap-2" data-testid="vn-support-templates">
          {SUPPORT_TEMPLATES.map((t) => <a key={t.href} href={t.href} target="_blank" rel="noopener noreferrer" data-testid="vn-support-template"
            className="flex items-center justify-center gap-2 rounded-xl border border-[#CFE0F7] bg-[var(--mh-surface)] px-3 py-3 text-[14px] font-semibold text-[#1D4ED8] shadow-sm hover:bg-[#EEF4FF] text-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>{t.label}</a>)}
        </div>
      </Modal>
      <MktPolicyInfo />
    </Shell>
  );
}
