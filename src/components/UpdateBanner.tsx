import React from 'react';
import { hasPendingUpdate, onPendingChange, isDirty, hardReload } from '@/src/lib/chunkReload';

export function UpdateBanner() {
  const [show, setShow] = React.useState(hasPendingUpdate());
  React.useEffect(() => onPendingChange(() => setShow(true)), []);
  if (!show) return null;
  return (
    <div role="status" data-testid="vn-update-banner" className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[9999] max-w-[95vw] flex flex-wrap items-center gap-2 px-4 py-2 rounded-xl shadow-lg bg-[var(--mh-navy)] text-white text-[13px]">
      <span>Web vừa có bản cập nhật. {isDirty() ? 'Chờ thao tác đang làm (vd upload ảnh) xong rồi' : 'Vui lòng'} tải lại trang.</span>
      <button type="button" data-testid="vn-update-reload" className="h-7 px-3 rounded-lg bg-[var(--mh-surface)] text-[var(--mh-navy)] font-semibold" onClick={() => { if (!isDirty() || confirm('Đang có thao tác chưa xong. Vẫn tải lại?')) hardReload(); }}>Tải lại</button>
    </div>
  );
}
