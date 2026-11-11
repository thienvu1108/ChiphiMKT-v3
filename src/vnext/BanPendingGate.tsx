/**
 * Popup Trưởng Ban (mỗi phiên): NS Chờ Ban duyệt / từ chối — gộp theo Khối (mọi Ban đang lead).
 * Hiện cho Trưởng Ban và Phó Ban (Phó Ban duyệt được; Trưởng Ban ưu tiên). Dismissible (sessionStorage).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { effectiveBanStatus } from '../../lib/vnext/banSupport';
import { supportable, type Support } from '../../lib/vnext/support';
import type { NsLine } from '../../lib/vnext/budget';
import { VNEXT_PERIOD_CUTOVER } from '../../lib/vnext/period';
import { Card, Btn, Overlay } from './ui';

const SS_KEY = 'vn-ban-pending-gate-dismissed';
/** BanNsApprovePanel đọc khoá này khi mount để mở lọc «Chờ Ban duyệt». */
export const BAN_NS_FILTER_SS = 'vn-ban-ns-initial-filter';
/** Mở nhóm Khối tương ứng trong panel. */
export const BAN_NS_FOCUS_BLOCK_SS = 'vn-ban-ns-focus-block';

type KhoiCount = { blockId: string; label: string; pending: number; rejected: number };

export function BanPendingGate({
  enabled,
  lines,
  sup,
  blockLabel,
  allowedProjectIds,
  onGoApprove,
}: {
  enabled: boolean;
  lines: NsLine[];
  sup: Record<string, Support | undefined>;
  /** Tên Khối hiển thị (blockId → name). */
  blockLabel: (blockId: string) => string;
  /** Chỉ đếm dòng thuộc dự án Ban (project.banKdId). */
  allowedProjectIds?: Set<string>;
  onGoApprove: (blockId?: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const { byKhoi, pending, rejected, total } = useMemo(() => {
    const map = new Map<string, KhoiCount>();
    let pending = 0;
    let rejected = 0;
    for (const line of lines) {
      if (!supportable(line) || !line.period || line.period < VNEXT_PERIOD_CUTOVER) continue;
      if (allowedProjectIds && !allowedProjectIds.has(line.projectId)) continue;
      const ban = effectiveBanStatus(line, sup[line.id]);
      if (ban !== 'pending' && ban !== 'rejected') continue;
      const blockId = line.blockId || '_none';
      let g = map.get(blockId);
      if (!g) {
        g = {
          blockId,
          label: blockId === '_none' ? '(Chưa gắn Khối)' : blockLabel(blockId),
          pending: 0,
          rejected: 0,
        };
        map.set(blockId, g);
      }
      if (ban === 'pending') { g.pending++; pending++; }
      else { g.rejected++; rejected++; }
    }
    const byKhoi = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
    return { byKhoi, pending, rejected, total: pending + rejected };
  }, [lines, sup, blockLabel, allowedProjectIds]);

  useEffect(() => {
    if (!enabled) { setOpen(false); return; }
    if (total <= 0) { setOpen(false); return; }
    try {
      if (sessionStorage.getItem(SS_KEY) === '1') { setOpen(false); return; }
    } catch { /* ignore */ }
    setOpen(true);
  }, [enabled, total]);

  if (!open || !enabled || total <= 0) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(SS_KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  };

  const go = (blockId?: string) => {
    try {
      sessionStorage.setItem(BAN_NS_FILTER_SS, 'todo');
      if (blockId && blockId !== '_none') sessionStorage.setItem(BAN_NS_FOCUS_BLOCK_SS, blockId);
      sessionStorage.setItem(SS_KEY, '1');
    } catch { /* ignore */ }
    setOpen(false);
    onGoApprove(blockId);
  };

  return (
    <Overlay
      className="bg-[var(--mh-text)]/55 flex items-center justify-center p-3"
      testId="vn-ban-pending-gate"
      zClass="z-[1200]"
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-[480px] max-h-[min(90dvh,100%)] flex">
      <Card className="p-4 sm:p-5 w-full max-h-[min(90dvh,100%)] overflow-y-auto shadow-2xl border-l-4 border-l-amber-500 overscroll-contain">
        <div className="text-[15px] font-bold text-[var(--mh-text)]">Ngân sách Ban cần xử lý theo Khối</div>
        <div className="text-[13px] text-[var(--mh-text-2)] mt-1.5 mb-3">
          Chỉ dự án thuộc Ban bạn lead. Tổng: {pending > 0 ? <b className="text-[var(--mh-pending,#7C3AED)]">{pending} chờ duyệt</b> : null}
          {pending > 0 && rejected > 0 ? ' · ' : ''}
          {rejected > 0 ? <b className="text-red-700">{rejected} từ chối</b> : null}
          {' '}(mọi Ban bạn đang làm Trưởng).
        </div>
        <ul className="text-[13px] space-y-2 mb-4" data-testid="vn-ban-pending-khoi-list">
          {byKhoi.map((g) => (
            <li key={g.blockId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-2.5 py-2">
              <div className="min-w-0">
                <div className="font-semibold text-[var(--mh-text)] truncate">{g.label}</div>
                <div className="text-[12px] text-[var(--mh-text-2)]">
                  {g.pending > 0 && <span data-testid="vn-ban-pending-count">Chờ {g.pending}</span>}
                  {g.pending > 0 && g.rejected > 0 && ' · '}
                  {g.rejected > 0 && <span data-testid="vn-ban-rejected-count">Từ chối {g.rejected}</span>}
                </div>
              </div>
              <Btn small primary onClick={() => go(g.blockId)} data-testid="vn-ban-pending-go-khoi">Xem Khối</Btn>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Btn onClick={dismiss} data-testid="vn-ban-pending-dismiss">Để sau</Btn>
          <Btn primary onClick={() => go()} data-testid="vn-ban-pending-go">Đến Ngân sách Ban</Btn>
        </div>
      </Card>
      </div>
    </Overlay>
  );
}
