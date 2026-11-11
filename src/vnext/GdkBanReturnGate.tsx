/**
 * Popup GĐK / Trợ lý Khối (mỗi phiên đăng nhập): NS chờ Khối duyệt + cần duyệt lại + Ban trả về.
 * Gộp một cửa (tránh chồng GdkBanReturnGate cũ với KhoiTodo NS). Đếm theo dự án / NVKD.
 * Truy vấn scoped theo blockId (useNsLines + useSupport). Không thêm get() rules.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { effectiveBanStatus, banReasonText } from '../../lib/vnext/banSupport';
import { effectiveStatus, supportable, type Support } from '../../lib/vnext/support';
import type { NsLine } from '../../lib/vnext/budget';
import { VNEXT_PERIOD_CUTOVER } from '../../lib/vnext/period';
import { type VCtx, projectName, userName, vnCan, useNsLines } from './ctx';
import { useSupport, dismissPopup, popupDismissed } from './SupportViews';
import { Card, Btn, Overlay } from './ui';

const SS_KEY = 'vn-gdk-ban-return-dismissed';
/** Support panel / GĐK đọc khoá này khi đi tới Duyệt hỗ trợ. */
export const GDK_BAN_RETURN_FILTER_SS = 'vn-gdk-ban-return-filter';
export const GDK_NS_PENDING_FILTER_SS = 'vn-gdk-ns-pending-filter';

type Kind = 'pending' | 'reapproval' | 'banRejected';
type Row = { line: NsLine; s?: Support; kind: Kind };

type Group = {
  key: string;
  label: string;
  pending: number;
  reapproval: number;
  banRejected: number;
};

function addGroup(map: Map<string, Group>, key: string, label: string, kind: Kind) {
  let g = map.get(key);
  if (!g) {
    g = { key, label, pending: 0, reapproval: 0, banRejected: 0 };
    map.set(key, g);
  }
  g[kind]++;
}

export function GdkBanReturnGate({ c, onGo }: { c: VCtx; onGo: (period?: string) => void }) {
  const eligible =
    (c.role === 'gd_khoi' || c.role === 'tro_ly_khoi') &&
    vnCan(c, 'vn.ns.support_approve');
  const blockIds = c.myBlockIds || [];
  const periods = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    for (let i = 0; i < 6; i++) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }, []);
  const enabled = eligible && blockIds.length > 0;
  const { lines } = useNsLines(c, enabled ? periods : [], 'all');
  const sup = useSupport(c, enabled ? periods : [], { blockIds });

  const rows = useMemo(() => {
    if (!enabled) return [] as Row[];
    const bidSet = new Set(blockIds);
    const out: Row[] = [];
    for (const line of lines) {
      if (!supportable(line) || !line.period || line.period < VNEXT_PERIOD_CUTOVER) continue;
      if (line.blockId && !bidSet.has(line.blockId)) continue;
      // Không đếm NS của chính GĐK/Trợ lý (khớp useKhoiTodo).
      if (line.ownerUid === c.uid) continue;
      const s = sup[line.id];
      const st = effectiveStatus(line, s);
      if (st === 'pending' || st === 'reapproval') {
        out.push({ line, s, kind: st });
        continue;
      }
      if (effectiveBanStatus(line, s) === 'rejected') {
        out.push({ line, s, kind: 'banRejected' });
      }
    }
    return out;
  }, [enabled, lines, sup, blockIds, c.uid]);

  const totals = useMemo(() => {
    let pending = 0, reapproval = 0, banRejected = 0;
    for (const r of rows) {
      if (r.kind === 'pending') pending++;
      else if (r.kind === 'reapproval') reapproval++;
      else banRejected++;
    }
    return { pending, reapproval, banRejected, total: pending + reapproval + banRejected };
  }, [rows]);

  const byProject = useMemo(() => {
    const map = new Map<string, Group>();
    for (const r of rows) {
      const pid = r.line.projectId || '_none';
      addGroup(map, pid, pid === '_none' ? '(Chưa gắn dự án)' : projectName(c, pid), r.kind);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [rows, c]);

  const byOwner = useMemo(() => {
    const map = new Map<string, Group>();
    for (const r of rows) {
      const uid = r.line.ownerUid || '_none';
      const label = uid === '_none' ? '(Không rõ NVKD)' : (r.line.ownerName || userName(c, uid));
      addGroup(map, uid, label, r.kind);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [rows, c]);

  const [tab, setTab] = useState<'project' | 'owner'>('project');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled || totals.total <= 0) { setOpen(false); return; }
    const tryOpen = () => {
      try {
        if (sessionStorage.getItem(SS_KEY) === '1') { setOpen(false); return; }
      } catch { /* ignore */ }
      if (popupDismissed(SS_KEY)) { setOpen(false); return; }
      // Tránh chồng popup Việc cần xử lý (thành viên) / KYC / đổi tên
      if (typeof document !== 'undefined' && document.querySelector('[data-testid="vn-todo-popup"],[data-testid="vn-kyc-form"],[data-testid="vn-namereq-gate"]')) {
        setOpen(false);
        return;
      }
      setOpen(true);
    };
    tryOpen();
    // Poll ngắn: mở sau khi popup thành viên / KYC đóng trong cùng phiên.
    const i = setInterval(tryOpen, 1200);
    return () => clearInterval(i);
  }, [enabled, totals.total]);

  const markNotifsRead = async (refIds: string[]) => {
    if (!refIds.length || !c.uid) return;
    try {
      const qy = query(collection(c.db, 'userNotifs'), where('toUid', '==', c.uid), where('read', '==', false));
      const snap = await getDocs(qy);
      const batch = writeBatch(c.db);
      let n = 0;
      const idSet = new Set(refIds);
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        if (data.refId && idSet.has(data.refId) && (data.type === 'rejected' || data.type === 'reapproval')) {
          batch.update(d.ref, { read: true, readAt: new Date().toISOString() });
          n++;
        }
      });
      if (n) await batch.commit();
    } catch { /* ignore */ }
  };

  if (!open || !enabled || totals.total <= 0) return null;

  const dismiss = async (mark: boolean) => {
    try { sessionStorage.setItem(SS_KEY, '1'); } catch { /* ignore */ }
    dismissPopup(SS_KEY);
    setOpen(false);
    if (mark) {
      const banIds = rows.filter((r) => r.kind === 'banRejected').map((r) => r.line.id);
      await markNotifsRead(banIds);
    }
  };

  const groups = tab === 'project' ? byProject : byOwner;
  const tip = (g: Group) => {
    const parts: string[] = [];
    if (g.pending) parts.push(`Chờ ${g.pending}`);
    if (g.reapproval) parts.push(`Duyệt lại ${g.reapproval}`);
    if (g.banRejected) parts.push(`Ban trả ${g.banRejected}`);
    return parts.join(' · ');
  };

  return (
    <Overlay
      className="bg-[var(--mh-text)]/55 flex items-center justify-center p-3"
      testId="vn-gdk-ban-return-gate"
      zClass="z-[1200]"
    >
      <div role="dialog" aria-modal="true" className="w-full max-w-[480px] max-h-[min(90dvh,100%)] flex">
        <Card className="p-4 sm:p-5 w-full max-h-[min(90dvh,100%)] overflow-y-auto shadow-2xl border-l-4 border-l-amber-500 overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="text-[15px] font-bold text-[var(--mh-text)]">Ngân sách Khối cần xử lý</div>
          <div className="text-[13px] text-[var(--mh-text-2)] mt-1.5 mb-3" data-testid="vn-gdk-pending-summary">
            {totals.pending > 0 && <b className="text-[var(--mh-pending,#7C3AED)]">{totals.pending} chờ duyệt</b>}
            {totals.pending > 0 && (totals.reapproval > 0 || totals.banRejected > 0) ? ' · ' : ''}
            {totals.reapproval > 0 && <b className="text-orange-700">{totals.reapproval} cần duyệt lại</b>}
            {totals.reapproval > 0 && totals.banRejected > 0 ? ' · ' : ''}
            {totals.banRejected > 0 && <b className="text-red-700">{totals.banRejected} Ban trả về</b>}
            {' '}trong Khối bạn phụ trách.
          </div>

          <div className="flex gap-1 mb-2" data-testid="vn-gdk-pending-tabs">
            <Btn small primary={tab === 'project'} onClick={() => setTab('project')} data-testid="vn-gdk-pending-tab-project">Theo dự án</Btn>
            <Btn small primary={tab === 'owner'} onClick={() => setTab('owner')} data-testid="vn-gdk-pending-tab-owner">Theo NVKD</Btn>
          </div>

          <ul className="text-[13px] space-y-2 mb-4" data-testid="vn-gdk-pending-list">
            {groups.slice(0, 12).map((g) => (
              <li key={g.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="font-semibold text-[var(--mh-text)] truncate">{g.label}</div>
                  <div className="text-[12px] text-[var(--mh-text-2)]">{tip(g)}</div>
                </div>
              </li>
            ))}
            {groups.length > 12 && (
              <li className="text-[11px] text-[var(--mh-text-3)]">… và {groups.length - 12} nhóm khác</li>
            )}
          </ul>

          {totals.banRejected > 0 && (
            <div className="text-[12px] text-[var(--mh-err)] mb-3" data-testid="vn-gdk-ban-return-hint">
              Có dòng Ban từ chối kèm lý do — mở Duyệt hỗ trợ để xem chi tiết
              {rows.filter((r) => r.kind === 'banRejected' && banReasonText(r.s)).slice(0, 1).map((r) => (
                <span key={r.line.id}> (vd: {banReasonText(r.s)})</span>
              ))}
              .
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Btn onClick={() => dismiss(false)} data-testid="vn-gdk-ban-return-later">Để sau</Btn>
            <Btn primary onClick={async () => {
              try {
                sessionStorage.setItem(GDK_NS_PENDING_FILTER_SS, 'todo');
                if (totals.banRejected > 0) sessionStorage.setItem(GDK_BAN_RETURN_FILTER_SS, '1');
              } catch { /* ignore */ }
              await dismiss(true);
              const first = rows.find((r) => r.kind === 'banRejected') || rows[0];
              onGo(first?.line.period);
            }} data-testid="vn-gdk-ban-return-go">Đến Duyệt hỗ trợ</Btn>
          </div>
        </Card>
      </div>
    </Overlay>
  );
}
