/** Menu «Thông tin Hỗ trợ» (mọi người đăng nhập, chỉ xem): chính sách hỗ trợ MKT của mọi dự án, mọi Ban KD. */
import React, { useEffect, useMemo, useState } from 'react';
import { type VCtx } from './ctx';
import { Shell, Card, Field, Input, Th, Td, Empty, Badge, SearchSelect, Modal } from './ui';
import { policyOf, banOfProject, fmtPct, CDT_LABEL } from '../../lib/vnext/supportPct';
import { TierList } from './BanKdPanels';
import { BanBanner } from './BanBanner';
import { isAdm } from './ctx';

export const SUPPORT_POLICY_BANNER_ID = 'support_policy';
export const SUPPORT_TEMPLATES = [
  { label: 'Tải xuống Mẫu Bảng kê tạm ứng', href: 'https://docs.google.com/spreadsheets/d/1leRfdw3wDYmC2iCKDtkGkGz6C3BmtDNHqjv1es5rOXU/edit?usp=drivesdk' },
  { label: 'Tải xuống Mẫu Giấy Đề nghị Thanh toán', href: 'https://docs.google.com/document/d/1eY79yghYg-2rI39DMMI7B--0VRCVVzk2/edit?usp=drivesdk&ouid=114611711078767109658&rtpof=true&sd=true' },
  { label: 'Tải xuống Mẫu Bảng kê thanh toán', href: 'https://docs.google.com/spreadsheets/d/12jvapmz5XirbTIXjfCp9JEDr_56dvO4-AHfb4gbRlMA/edit?usp=drivesdk' },
];

const n = (s: any) => String(s || '').normalize('NFC').toLowerCase();

export default function SupportInfoPage({ c }: { c: VCtx }) {
  const [q, setQ] = useState(() => { try { const v = sessionStorage.getItem('vnSupportInfoQ') || ''; sessionStorage.removeItem('vnSupportInfoQ'); return v; } catch { return ''; } });
  const [ban, setBan] = useState('');
  const [tpl, setTpl] = useState(false);
  useEffect(() => { if (!tpl) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setTpl(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [tpl]);
  const rows = useMemo(() => c.projects.filter((p: any) => !p.deleted && (p.banKdId || p.banKdName)).map((p: any) => {
    const b: any = banOfProject(p, c.banKds);
    return { p, banKey: b?.id || 'n:' + n(p.banKdName), banName: b?.name || p.banKdName || '—', po: policyOf(p, c.banKds) };
  }).sort((a, b) => a.banName.localeCompare(b.banName, 'vi') || String(a.p.name).localeCompare(String(b.p.name), 'vi')), [c.projects, c.banKds]);
  const bans = [...new Map(rows.map((r) => [r.banKey, r.banName])).entries()];
  const list = rows.filter((r) => (!ban || r.banKey === ban) && (!q || n(`${r.p.name} ${r.p.projectCode || ''}`).includes(n(q))));
  const pct = (v: number | null) => (v != null ? fmtPct(v) : '—');
  return (
    <Shell title="Thông tin Hỗ trợ" sub="Chính sách hỗ trợ MKT theo dự án (chỉ xem). Ban KD cập nhật ở Quản lý Ban KD › Tỉ lệ hỗ trợ MKT.">
      <div data-testid="vn-support-policy-banner"><BanBanner banId={SUPPORT_POLICY_BANNER_ID} banName="Chính sách hỗ trợ Marketing" canEdit={isAdm(c) || c.role === 'accountant'} uid={c.uid} /></div>
      <div className="flex justify-center sm:justify-start"><button type="button" onClick={() => setTpl(true)} data-testid="vn-support-templates-btn"
        className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-[#1E40AF]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Tải Các File Biểu Mẫu thanh toán</button></div>
      <Modal open={tpl} onClose={() => setTpl(false)} title="Tải Các File Biểu Mẫu thanh toán">
        <div className="grid grid-cols-1 gap-2" data-testid="vn-support-templates">
          {SUPPORT_TEMPLATES.map((t) => <a key={t.href} href={t.href} target="_blank" rel="noopener noreferrer" data-testid="vn-support-template"
            className="flex items-center justify-center gap-2 rounded-xl border border-[#CFE0F7] bg-[var(--mh-surface)] px-3 py-3 text-[14px] font-semibold text-[#1D4ED8] shadow-sm hover:bg-[#EEF4FF] text-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>{t.label}</a>)}
        </div>
      </Modal>
      <div className="flex flex-wrap gap-2 items-end" data-testid="vn-info-filters">
        <Field label="Tìm dự án"><Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="Tên hoặc mã dự án" className="w-full sm:w-72" data-testid="vn-info-search" /></Field>
        <Field label="Ban KD"><SearchSelect value={ban} onChange={setBan} options={[{ value: '', label: 'Tất cả' }, ...bans.map(([k, v]) => ({ value: k, label: v }))]} data-testid="vn-info-ban" /></Field>
        <Badge c="info">{list.length} dự án</Badge>
      </div>
      {!list.length ? <Card><Empty>Không có dự án phù hợp</Empty></Card> : <>
        {/* Desktop: bảng */}
        <Card className="hidden md:block"><div className="overflow-x-auto"><table data-mh-responsive className="w-full" data-testid="vn-info-table"><thead><tr><Th>Ban</Th><Th>Dự án</Th><Th r>Base</Th><Th>Mức Bonus & điều kiện</Th><Th>CĐT hỗ trợ</Th></tr></thead><tbody>
          {list.map((r) => <tr key={r.p.id} data-testid="vn-info-row"><Td className="text-[12px]">{r.banName}</Td><Td className="font-medium">{r.p.name}</Td>
            <Td r><b>{pct(r.po.base)}</b>{r.po.baseSource === 'ban' && <div className="text-[10px] text-[var(--mh-text-3)]">theo Ban</div>}</Td>
            <Td className="text-[12px] max-w-[320px]"><TierList tiers={r.po.bonusTiers} /></Td><Td className="text-[12px]">{CDT_LABEL[r.po.cdt]}</Td></tr>)}
        </tbody></table></div></Card>
        {/* Mobile: thẻ */}
        <div className="md:hidden space-y-2" data-testid="vn-info-cards">
          {list.map((r) => <Card key={r.p.id} className="p-3 text-[13px]" data-testid="vn-info-card">
            <div className="font-semibold">{r.p.name}</div><div className="text-[11px] text-[var(--mh-text-3)] mb-2">Ban {r.banName}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="text-[var(--mh-text-2)]">Base</div><div className="text-right font-semibold">{pct(r.po.base)}{r.po.baseSource === 'ban' ? ' (theo Ban)' : ''}</div>
              <div className="text-[var(--mh-text-2)]">CĐT hỗ trợ</div><div className="text-right">{CDT_LABEL[r.po.cdt]}</div>
            </div>
            <div className="mt-2 text-[12px] text-[#3B4A61]"><div className="text-[var(--mh-text-2)]">Mức Bonus & điều kiện</div><TierList tiers={r.po.bonusTiers} /></div>
          </Card>)}
        </div>
      </>}
    </Shell>
  );
}
