import React, { Component } from 'react';
import { isChunkLoadError, hardReload } from '../lib/chunkReload';
type P = { name?: string; children?: React.ReactNode }; type S = { err: Error | null };

/** Một màn lỗi chỉ hiện thông báo trong khung, không làm trắng cả trang. */
export class VnErrorBoundary extends Component<P, S> {
  declare props: Readonly<P>;
  declare setState: Component<P, S>['setState'];
  state: S = { err: null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: any) { console.error('[VnErrorBoundary]', this.props.name || '', err, info?.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div role="alert" data-testid="vn-error-boundary" className="m-4 p-4 rounded-xl border border-red-200 bg-red-50 text-[13px] text-[#7A1F17]">
        <div className="font-semibold mb-1">{isChunkLoadError(this.state.err) ? 'Web vừa được cập nhật bản mới.' : 'Màn hình này gặp lỗi hiển thị.'}</div>
        <div className="mb-2">Dữ liệu không bị ảnh hưởng. Vui lòng tải lại trang; nếu vẫn lỗi, gửi ảnh chụp này cho bộ phận kỹ thuật.</div>
        <code className="block text-[11px] opacity-70 break-all">{String(this.state.err?.message || this.state.err)}</code>
        <button type="button" className="mt-3 h-8 px-3 rounded-lg bg-[var(--mh-surface)] border border-red-200" onClick={() => (isChunkLoadError(this.state.err) ? hardReload() : this.setState({ err: null }))}>{isChunkLoadError(this.state.err) ? 'Tải lại trang' : 'Thử lại'}</button>
      </div>
    );
  }
}
