/** Slide deck Báo cáo Nghiệm thu (dùng chung cho trang trong app và link công khai). Nhận diện MAYHOMES. */
import React, { useEffect, useState } from 'react';
import { GROUP_CHANNELS, cpl } from '../../lib/vnext/ntReport';
import { fmt } from './ui';
import { fitContain, jpegOrientation } from '../../lib/vnext/fitImage';

export type DeckRecord = { id: string; code: string; user: string; team: string; block: string; project: string; projectId: string; cost: number; vat?: number; leads: number; groups: { label: string; cost: number; channels: { label: string; v: number }[] }[] };
export type DeckImage = { id: string; recordId: string; caption?: string; order: number; provider: string; ref: string; inv?: string; link?: string };
export type DeckData = {
  title: string; scopeLabel: string; periodLabel: string; createdAt?: string;
  /** Tên tệp xuất (exportBaseName) — có từ 26/10/2026. */
  fileName?: string;
  groups: { label: string; cost: number; vat?: number; leads: number; channels: string[]; projects: { projectId: string; projectName: string; cost: number; leads: number; rows: { id: string; user: string; team: string; code: string; cost: number; leads: number | null; channels: Record<string, number> }[] }[] }[];
  projects: { projectId: string; projectName: string; cost: number; vat?: number; leads: number }[];
  /** vat / withVat: có từ 26/10/2026 (link chia sẻ cũ không có → chỉ hiện trước VAT). */
  total: { cost: number; vat?: number; withVat?: number; leads: number };
  records: DeckRecord[];
  images: DeckImage[];
};

export const hasVat = (d: DeckData) => d.total.vat != null;
export const withVat = (d: DeckData) => d.total.withVat ?? d.total.cost + (d.total.vat || 0);

/** Thông tin bìa theo bộ lọc hiện tại (suy ra từ các bản ghi trong báo cáo → áp dụng cả link công khai cũ). */
export function coverInfo(d: DeckData) {
  const uniq = (a: string[]) => [...new Set(a.map((x) => String(x || '').trim()).filter((x) => x && x !== '—'))].sort((x, y) => x.localeCompare(y, 'vi'));
  const r = d.records || [];
  const list = (a: string[], n = 8) => (a.length ? (a.length > n ? `${a.slice(0, n).join(', ')} +${a.length - n}` : a.join(', ')) : '—');
  const blocks = uniq(r.map((x) => x.block)), teams = uniq(r.map((x) => x.team)), users = uniq(r.map((x) => x.user)), projects = uniq(r.map((x) => x.project));
  return { blocks, teams, users, projects, lines: [['Khối', list(blocks)], ['Phòng', list(teams)], ['Người triển khai', list(users)], [`Dự án triển khai (${projects.length})`, list(projects, 12)]] as [string, string][] };
}

const chLabel = (k: string) => Object.values(GROUP_CHANNELS).flat().find((c) => c.key === k)?.label || k;

function Slide({ children, dark, className = '' }: any) {
  return (
    <section className={`nt-slide relative w-full aspect-[16/9] rounded-xl overflow-hidden shadow-sm border border-[var(--mh-border)] ${dark ? 'bg-[var(--mh-navy)] text-white' : 'bg-[var(--mh-surface)] text-[var(--mh-text)]'} ${className}`}>
      <div className="absolute inset-0 p-[3.2%] flex flex-col">{children}</div>
      {!dark && <div className="absolute left-0 right-0 bottom-0 h-[3%] bg-[var(--mh-navy)]"><div className="h-full w-[22%] bg-[var(--mh-accent)]" /></div>}
    </section>
  );
}
const Logo = ({ light }: any) => <div className={`font-extrabold tracking-wide text-[clamp(10px,1.6vw,18px)] ${light ? 'text-white' : 'text-[var(--mh-navy)]'}`}>MAY<span className="text-[var(--mh-accent)]">HOMES</span></div>;
const H = ({ children }: any) => <div className="flex items-center gap-3 mb-[1.5%]"><div className="w-1.5 self-stretch bg-[var(--mh-accent)] rounded" /><div className="font-bold text-[clamp(11px,2vw,24px)] text-[var(--mh-navy)] flex-1 truncate">{children}</div><Logo /></div>;

function ImageView({ img, resolve }: { img: DeckImage; resolve: (img: DeckImage) => Promise<string>; key?: React.Key }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let on = true; resolve(img).then((u) => on && setSrc(u)).catch(() => {}); return () => { on = false; }; }, [img.id]);
  return (
    <figure className="flex-1 min-w-0 flex flex-col">
      <div className="flex-1 min-h-0 bg-[var(--mh-bg)] rounded-lg grid place-items-center overflow-hidden">{src ? (img.link ? <a href={img.link} target="_blank" rel="noreferrer" className="contents" data-testid="vn-deck-invoice"><img src={src} alt={img.caption || ''} className="max-w-full max-h-full object-contain" /></a> : <img src={src} alt={img.caption || ''} className="max-w-full max-h-full object-contain" />) : <span className="text-[11px] text-[var(--mh-text-3)]">Đang tải ảnh…</span>}</div>
      {img.caption && <figcaption className="text-[clamp(8px,1.1vw,13px)] text-[var(--mh-text-2)] mt-1 text-center truncate">{img.caption}</figcaption>}
    </figure>
  );
}

/** Mỗi ảnh Nghiệm thu 1 slide (perSlide = 1), giữ nguyên tỉ lệ ảnh. */
export function buildSlides(d: DeckData, perSlide = 1) {
  const slides: { kind: 'cover' | 'summary' | 'group' | 'record' | 'end'; group?: any; rows?: any[]; part?: number; parts?: number; record?: DeckRecord; images?: DeckImage[] }[] = [{ kind: 'cover' }, { kind: 'summary' }];
  for (const g of d.groups) {
    const flat = g.projects.flatMap((p) => [{ type: 'p', p }, ...p.rows.map((r) => ({ type: 'r', r, p }))]);
    const pages = Math.max(1, Math.ceil(flat.length / 12));
    for (let i = 0; i < pages; i++) slides.push({ kind: 'group', group: g, rows: flat.slice(i * 12, i * 12 + 12), part: i + 1, parts: pages });
  }
  for (const r of d.records) {
    const imgs = d.images.filter((i) => i.recordId === r.id).sort((a, b) => a.order - b.order);
    if (!imgs.length) slides.push({ kind: 'record', record: r, images: [], part: 1, parts: 1 });
    const parts = Math.ceil(imgs.length / perSlide);
    for (let i = 0; i < parts; i++) slides.push({ kind: 'record', record: r, images: imgs.slice(i * perSlide, i * perSlide + perSlide), part: i + 1, parts });
  }
  slides.push({ kind: 'end' });
  return slides;
}

export function Deck({ d, resolve }: { d: DeckData; resolve: (img: DeckImage) => Promise<string> }) {
  const slides = buildSlides(d);
  return (
    <div className="nt-deck space-y-4">
      {slides.map((s, i) => {
        if (s.kind === 'cover') return (
          <Slide key={i} dark>
            <Logo light />
            <div className="flex-1 flex flex-col justify-center">
              <div className="text-[clamp(10px,1.4vw,16px)] text-white/70 tracking-[0.2em]">BÁO CÁO</div>
              <div className="text-[clamp(18px,4vw,48px)] font-extrabold leading-tight">NGHIỆM THU MARKETING</div>
              <div className="mt-[2%] h-1 w-[12%] bg-[var(--mh-accent)]" />
              <div className="mt-[2%] text-[clamp(11px,1.8vw,22px)] font-semibold">{d.periodLabel}</div>
              <div className="text-[clamp(10px,1.5vw,18px)] text-white/80">{d.scopeLabel}</div>
              <div className="mt-[2%] grid gap-[0.4em] text-[clamp(8px,1.15vw,14px)] max-w-[92%]" data-testid="vn-deck-cover-info">
                {coverInfo(d).lines.map(([k, v]) => <div key={k} className="flex gap-2"><span className="text-white/60 shrink-0 w-[11em]">{k}</span><span className="font-medium line-clamp-2">{v}</span></div>)}
              </div>
            </div>
            <div className={`grid ${hasVat(d) ? 'grid-cols-5' : 'grid-cols-3'} gap-[2%] text-[clamp(9px,1.3vw,16px)]`}>
              <div><div className="text-white/60">Chi phí (trước VAT)</div><div className="font-bold text-[clamp(11px,2vw,24px)]">{fmt(d.total.cost)} đ</div></div>
              {hasVat(d) && <div><div className="text-white/60">VAT</div><div className="font-bold text-[clamp(11px,2vw,24px)]">{fmt(d.total.vat!)} đ</div></div>}
              {hasVat(d) && <div data-testid="vn-deck-total-vat"><div className="text-white/60">Tổng (sau VAT)</div><div className="font-bold text-[clamp(11px,2vw,24px)] text-[#FFB98A]">{fmt(withVat(d))} đ</div></div>}
              <div><div className="text-white/60">Tổng lead</div><div className="font-bold text-[clamp(11px,2vw,24px)]">{fmt(d.total.leads)}</div></div>
              <div><div className="text-white/60">Giá / lead</div><div className="font-bold text-[clamp(11px,2vw,24px)]">{cpl(d.total.cost, d.total.leads) ? fmt(cpl(d.total.cost, d.total.leads)) + ' đ' : '—'}</div></div>
            </div>
          </Slide>
        );
        if (s.kind === 'summary') return (
          <Slide key={i}>
            <H>Tổng hợp theo Nhóm & Dự án</H>
            <div className="grid grid-cols-2 gap-[2%] flex-1 min-h-0 text-[clamp(7px,1.05vw,13px)]">
              <table className="w-full self-start"><thead><tr className="bg-[var(--mh-navy)] text-white"><th className="text-left p-1">Nhóm</th><th className="text-right p-1">Chi phí (trước VAT)</th>{hasVat(d) && <><th className="text-right p-1">VAT</th><th className="text-right p-1">Sau VAT</th></>}<th className="text-right p-1">Lead*</th></tr></thead><tbody>
                {d.groups.map((g) => <tr key={g.label} className="border-b border-[var(--mh-surface-2)]"><td className="p-1 font-semibold">{g.label}</td><td className="p-1 text-right tabular-nums">{fmt(g.cost)}</td>{hasVat(d) && <><td className="p-1 text-right tabular-nums">{fmt(g.vat || 0)}</td><td className="p-1 text-right tabular-nums">{fmt(g.cost + (g.vat || 0))}</td></>}<td className="p-1 text-right">{fmt(g.leads)}</td></tr>)}
                <tr className="bg-[#FFF3EB] font-bold"><td className="p-1">TỔNG CỘNG</td><td className="p-1 text-right tabular-nums">{fmt(d.total.cost)}</td>{hasVat(d) && <><td className="p-1 text-right tabular-nums">{fmt(d.total.vat!)}</td><td className="p-1 text-right tabular-nums" data-testid="vn-deck-sum-withvat">{fmt(withVat(d))}</td></>}<td className="p-1 text-right">{fmt(d.total.leads)}</td></tr>
              </tbody></table>
              <table className="w-full self-start"><thead><tr className="bg-[var(--mh-navy)] text-white"><th className="text-left p-1">Dự án</th><th className="text-right p-1">Chi phí</th>{hasVat(d) && <th className="text-right p-1">Sau VAT</th>}<th className="text-right p-1">Lead</th><th className="text-right p-1">Giá/lead</th></tr></thead><tbody>
                {d.projects.slice(0, 14).map((p) => <tr key={p.projectId} className="border-b border-[var(--mh-surface-2)]"><td className="p-1 truncate max-w-0 w-1/2">{p.projectName}</td><td className="p-1 text-right tabular-nums">{fmt(p.cost)}</td>{hasVat(d) && <td className="p-1 text-right tabular-nums">{fmt(p.cost + (p.vat || 0))}</td>}<td className="p-1 text-right">{fmt(p.leads)}</td><td className="p-1 text-right tabular-nums">{cpl(p.cost, p.leads) ? fmt(cpl(p.cost, p.leads)) : '—'}</td></tr>)}
              </tbody></table>
            </div>
            <div className="text-[clamp(6px,0.85vw,11px)] text-[var(--mh-text-3)]">* Lead là số của bản ghi (user × dự án), cộng theo dự án; ở bảng Nhóm, lead của bản ghi tính vào nhóm có chi phí lớn nhất.</div>
          </Slide>
        );
        if (s.kind === 'group') { const g = s.group; return (
          <Slide key={i}>
            <H>{g.label}{s.parts! > 1 ? ` (${s.part}/${s.parts})` : ''}</H>
            <div className="flex-1 min-h-0 overflow-hidden text-[clamp(6px,0.95vw,12px)]">
              <table className="w-full"><thead><tr className="bg-[var(--mh-navy)] text-white"><th className="text-left p-1">Dự án / User</th><th className="text-left p-1">Phòng</th>{g.channels.map((k: string) => <th key={k} className="text-right p-1">{chLabel(k)}</th>)}<th className="text-right p-1">Chi phí</th><th className="text-right p-1">Lead</th><th className="text-right p-1">Giá/lead</th></tr></thead><tbody>
                {s.rows!.map((x: any, j: number) => x.type === 'p'
                  ? <tr key={j} className="bg-[var(--mh-navy-50)] font-semibold"><td className="p-1" colSpan={2 + g.channels.length}>{x.p.projectName}</td><td className="p-1 text-right tabular-nums">{fmt(x.p.cost)}</td><td className="p-1 text-right">{fmt(x.p.leads)}</td><td className="p-1 text-right tabular-nums">{cpl(x.p.cost, x.p.leads) ? fmt(cpl(x.p.cost, x.p.leads)) : '—'}</td></tr>
                  : <tr key={j} className="border-b border-[var(--mh-surface-2)]"><td className="p-1 pl-3">{x.r.user} <span className="text-[var(--mh-text-3)]">#{x.r.code}</span></td><td className="p-1">{x.r.team}</td>{g.channels.map((k: string) => <td key={k} className="p-1 text-right tabular-nums">{x.r.channels[k] ? fmt(x.r.channels[k]) : ''}</td>)}<td className="p-1 text-right tabular-nums">{fmt(x.r.cost)}</td><td className="p-1 text-right">{x.r.leads == null ? '—' : fmt(x.r.leads)}</td><td className="p-1 text-right tabular-nums">{x.r.leads ? fmt(x.r.cost / x.r.leads) : '—'}</td></tr>)}
                {s.part === s.parts && <tr className="bg-[#FFF3EB] font-bold"><td className="p-1" colSpan={2 + g.channels.length}>CỘNG {g.label.toUpperCase()}</td><td className="p-1 text-right tabular-nums">{fmt(g.cost)}</td><td className="p-1 text-right">{fmt(g.leads)}</td><td className="p-1 text-right tabular-nums">{cpl(g.cost, g.leads) ? fmt(cpl(g.cost, g.leads)) : '—'}</td></tr>}
              </tbody></table>
            </div>
          </Slide>
        ); }
        if (s.kind === 'record') { const r = s.record!; return (
          <Slide key={i}>
            <H>{r.project} › {r.user}{s.parts! > 1 ? ` (${s.part}/${s.parts})` : ''}</H>
            <div className="flex flex-wrap gap-x-[3%] gap-y-1 text-[clamp(7px,1.05vw,13px)] mb-[1.2%]">
              <span>Mã: <b>#{r.code}</b></span><span>Phòng: <b>{r.team}</b></span><span>Chi phí (trước VAT): <b>{fmt(r.cost)} đ</b></span>{r.vat != null && <><span>VAT: <b>{fmt(r.vat)} đ</b></span><span>Sau VAT: <b>{fmt(r.cost + r.vat)} đ</b></span></>}<span>Lead: <b>{fmt(r.leads)}</b></span><span>Giá/lead: <b>{r.leads ? fmt(r.cost / r.leads) + ' đ' : '—'}</b></span>
              <span className="text-[var(--mh-text-2)]">{r.groups.map((g) => `${g.label}: ${g.channels.map((c) => c.label).join(', ')}`).join(' · ')}</span>
            </div>
            <div className="flex-1 min-h-0 flex gap-[1.5%]">
              {s.images!.length ? s.images!.map((img) => <ImageView key={img.id} img={img} resolve={resolve} />)
                : <div className="flex-1 rounded-lg border-2 border-dashed border-[var(--mh-border)] grid place-items-center text-[clamp(9px,1.4vw,18px)] text-[var(--mh-text-3)]">Chưa có ảnh Nghiệm thu</div>}
            </div>
          </Slide>
        ); }
        return (
          <Slide key={i} dark>
            <div className="flex-1 grid place-items-center text-center">
              <div><div className="text-[clamp(20px,5vw,60px)] font-extrabold">MAY<span className="text-[var(--mh-accent)]">HOMES</span></div><div className="text-[clamp(10px,1.6vw,20px)] text-white/80 mt-2">Cảm ơn!</div></div>
            </div>
          </Slide>
        );
      })}
    </div>
  );
}

/** Xuất PPTX bằng pptxgenjs (import động). */
export async function exportPptx(d: DeckData, resolve: (img: DeckImage) => Promise<string>, fileName: string) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  const NAVY = '1A4BAC', OR = 'F26A21';
  const font = 'Be Vietnam Pro';
  const head = (s: any, t: string) => { s.addShape('rect', { x: 0.4, y: 0.35, w: 0.08, h: 0.45, fill: { color: OR } }); s.addText(t, { x: 0.6, y: 0.3, w: 7.8, h: 0.55, fontFace: font, fontSize: 20, bold: true, color: NAVY }); s.addText([{ text: 'MAY', options: { color: NAVY } }, { text: 'HOMES', options: { color: OR } }], { x: 8.2, y: 0.3, w: 1.6, h: 0.55, fontFace: font, fontSize: 14, bold: true, align: 'right' }); s.addShape('rect', { x: 0, y: 5.47, w: 10, h: 0.16, fill: { color: NAVY } }); s.addShape('rect', { x: 0, y: 5.47, w: 2.2, h: 0.16, fill: { color: OR } }); };
  const cpl2 = (c: number, l: number) => (l > 0 ? fmt(c / l) : '—');
  for (const sl of buildSlides(d)) {
    const s = pptx.addSlide();
    if (sl.kind === 'cover' || sl.kind === 'end') {
      s.background = { color: NAVY };
      if (sl.kind === 'cover') {
        s.addText('BÁO CÁO', { x: 0.6, y: 1.2, w: 8, h: 0.4, fontFace: font, fontSize: 14, color: 'C9D6F0', charSpacing: 6 });
        s.addText('NGHIỆM THU MARKETING', { x: 0.6, y: 1.6, w: 9, h: 0.8, fontFace: font, fontSize: 36, bold: true, color: 'FFFFFF' });
        s.addShape('rect', { x: 0.6, y: 2.5, w: 1.2, h: 0.08, fill: { color: OR } });
        s.addText(d.periodLabel, { x: 0.6, y: 2.7, w: 9, h: 0.5, fontFace: font, fontSize: 18, bold: true, color: 'FFFFFF' });
        s.addText(d.scopeLabel, { x: 0.6, y: 3.15, w: 9, h: 0.4, fontFace: font, fontSize: 14, color: 'DDE6F7' });
        s.addText(coverInfo(d).lines.map(([k, v], i, a) => ({ text: `${k}: ${v}`, options: { breakLine: i < a.length - 1 } })), { x: 0.6, y: 3.55, w: 8.8, h: 0.85, fontFace: font, fontSize: 10, color: 'FFFFFF', valign: 'top', fit: 'shrink' });
        s.addText(`Chi phí (trước VAT): ${fmt(d.total.cost)} đ${hasVat(d) ? `   ·   VAT: ${fmt(d.total.vat!)} đ   ·   Tổng sau VAT: ${fmt(withVat(d))} đ` : ''}   ·   Lead: ${fmt(d.total.leads)}   ·   Giá/lead: ${cpl2(d.total.cost, d.total.leads)}`, { x: 0.6, y: 4.6, w: 9, h: 0.4, fontFace: font, fontSize: 13, color: 'FFFFFF' });
      } else {
        s.addText([{ text: 'MAY', options: { color: 'FFFFFF' } }, { text: 'HOMES', options: { color: OR } }], { x: 0, y: 2, w: 10, h: 1, fontFace: font, fontSize: 48, bold: true, align: 'center' });
        s.addText('Cảm ơn!', { x: 0, y: 3, w: 10, h: 0.5, fontFace: font, fontSize: 18, color: 'DDE6F7', align: 'center' });
      }
      continue;
    }
    const hdr = (cells: string[]) => cells.map((t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } }));
    if (sl.kind === 'summary') {
      head(s, 'Tổng hợp theo Nhóm & Dự án');
      s.addTable((hasVat(d) ? [hdr(['Nhóm', 'Trước VAT', 'VAT', 'Sau VAT', 'Lead']), ...d.groups.map((g) => [g.label, fmt(g.cost), fmt(g.vat || 0), fmt(g.cost + (g.vat || 0)), fmt(g.leads)]), ['TỔNG CỘNG', fmt(d.total.cost), fmt(d.total.vat!), fmt(withVat(d)), fmt(d.total.leads)].map((t) => ({ text: t, options: { bold: true } }))] : [hdr(['Nhóm', 'Chi phí (trước VAT)', 'Lead']), ...d.groups.map((g) => [g.label, fmt(g.cost), fmt(g.leads)]), [{ text: 'TỔNG CỘNG', options: { bold: true } }, { text: fmt(d.total.cost), options: { bold: true } }, { text: fmt(d.total.leads), options: { bold: true } }]]) as any, { x: 0.4, y: 1.0, w: 4.4, fontFace: font, fontSize: 10, border: { type: 'solid', color: 'E3E8EF', pt: 0.5 } });
      s.addTable((hasVat(d) ? [hdr(['Dự án', 'Chi phí', 'Sau VAT', 'Lead', 'Giá/lead']), ...d.projects.slice(0, 14).map((p) => [p.projectName, fmt(p.cost), fmt(p.cost + (p.vat || 0)), fmt(p.leads), cpl2(p.cost, p.leads)])] : [hdr(['Dự án', 'Chi phí', 'Lead', 'Giá/lead']), ...d.projects.slice(0, 14).map((p) => [p.projectName, fmt(p.cost), fmt(p.leads), cpl2(p.cost, p.leads)])]) as any, { x: 5.0, y: 1.0, w: 4.6, fontFace: font, fontSize: 9, border: { type: 'solid', color: 'E3E8EF', pt: 0.5 } });
      continue;
    }
    if (sl.kind === 'group') {
      const g = sl.group;
      head(s, g.label + (sl.parts! > 1 ? ` (${sl.part}/${sl.parts})` : ''));
      const rows: any[] = [hdr(['Dự án / User', 'Phòng', ...g.channels.map(chLabel), 'Chi phí', 'Lead', 'Giá/lead'])];
      for (const x of sl.rows!) rows.push(x.type === 'p'
        ? [{ text: x.p.projectName, options: { bold: true, fill: { color: 'EEF3FC' }, colspan: 2 + g.channels.length } }, { text: fmt(x.p.cost), options: { bold: true, fill: { color: 'EEF3FC' } } }, { text: fmt(x.p.leads), options: { bold: true, fill: { color: 'EEF3FC' } } }, { text: cpl2(x.p.cost, x.p.leads), options: { bold: true, fill: { color: 'EEF3FC' } } }]
        : [`${x.r.user} #${x.r.code}`, x.r.team, ...g.channels.map((k: string) => (x.r.channels[k] ? fmt(x.r.channels[k]) : '')), fmt(x.r.cost), x.r.leads == null ? '—' : fmt(x.r.leads), x.r.leads ? fmt(x.r.cost / x.r.leads) : '—']);
      if (sl.part === sl.parts) rows.push([{ text: `CỘNG ${g.label.toUpperCase()}`, options: { bold: true, fill: { color: 'FFF3EB' }, colspan: 2 + g.channels.length } }, { text: fmt(g.cost), options: { bold: true, fill: { color: 'FFF3EB' } } }, { text: fmt(g.leads), options: { bold: true, fill: { color: 'FFF3EB' } } }, { text: cpl2(g.cost, g.leads), options: { bold: true, fill: { color: 'FFF3EB' } } }]);
      s.addTable(rows, { x: 0.4, y: 1.0, w: 9.2, fontFace: font, fontSize: 8, border: { type: 'solid', color: 'E3E8EF', pt: 0.5 } });
      continue;
    }
    const r = sl.record!;
    head(s, `${r.project} › ${r.user}` + (sl.parts! > 1 ? ` (${sl.part}/${sl.parts})` : ''));
    s.addText(`Mã #${r.code} · Phòng ${r.team} · Chi phí (trước VAT) ${fmt(r.cost)} đ${r.vat != null ? ` · VAT ${fmt(r.vat)} đ · Sau VAT ${fmt(r.cost + r.vat)} đ` : ''} · Lead ${fmt(r.leads)} · Giá/lead ${cpl2(r.cost, r.leads)}`, { x: 0.4, y: 0.9, w: 9.2, h: 0.35, fontFace: font, fontSize: 10, color: '0F1B2D' });
    const imgs = sl.images || [];
    if (!imgs.length) { s.addText('Chưa có ảnh Nghiệm thu', { x: 0.4, y: 1.4, w: 9.2, h: 3.8, fontFace: font, fontSize: 18, color: '8A97AB', align: 'center', valign: 'middle', line: { color: 'E3E8EF', dashType: 'dash' } } as any); continue; }
    // Mỗi slide 1 ảnh: giữ nguyên ảnh gốc (không nén lại), đặt vừa khung theo tỉ lệ thật, căn giữa.
    for (let k = 0; k < imgs.length; k++) {
      // Giữ tỉ lệ thật: ảnh có EXIF xoay (ảnh dọc chụp điện thoại) được xoay sẵn vì PowerPoint bỏ qua EXIF (nếu không sẽ bị bóp méo).
      const prep = await pptxImage(await resolve(imgs[k]).catch(() => ''));
      if (!prep) continue;
      const cap = !!imgs[k].caption;
      const box = { x: 0.4, y: 1.3, w: 9.2, h: cap ? 3.75 : 4.1 };
      if (prep.w > 0 && prep.h > 0) { const f = fitContain(prep.w, prep.h, box); s.addImage({ data: prep.data, x: f.x, y: f.y, w: f.w, h: f.h }); }
      else s.addImage({ data: prep.data, x: box.x, y: box.y, w: box.w, h: box.h, sizing: { type: 'contain', w: box.w, h: box.h } } as any);
      if (cap) s.addText(imgs[k].caption!, { x: 0.4, y: 5.07, w: 9.2, h: 0.35, fontFace: font, fontSize: 9, color: '5B6B82', align: 'center' });
    }
  }
  await pptx.writeFile({ fileName });
}

/** Ảnh cho PPTX: giữ nguyên tệp gốc nếu không cần xoay; nếu EXIF xoay ≠ 1 → vẽ lại đúng chiều (JPEG 0.92). Trả kích thước hiển thị thật. */
export async function pptxImage(src: string): Promise<{ data: string; w: number; h: number } | null> {
  if (!src) return null;
  let blob: Blob;
  try { blob = await (await fetch(src)).blob(); } catch { return null; }
  const ori = /jpe?g/i.test(blob.type) || src.startsWith('data:image/jpeg') ? jpegOrientation(await blob.arrayBuffer()) : 1;
  let bmp: ImageBitmap | null = null;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as any); } catch { bmp = null; }
  const w = bmp?.width || 0, h = bmp?.height || 0;
  if (ori !== 1 && bmp) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d')!.drawImage(bmp, 0, 0);
    return { data: cv.toDataURL('image/jpeg', 0.92), w, h };
  }
  const data = await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => ok(''); fr.readAsDataURL(blob); });
  if (!data) return null;
  if (w && h) return { data, w, h };
  const nat = await naturalSize(data);
  return { data, w: nat.w, h: nat.h };
}

async function toDataUrl(src: string): Promise<string> {
  if (!src) return '';
  if (src.startsWith('data:')) return src;
  try {
    const b = await (await fetch(src)).blob();
    return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => ok(''); fr.readAsDataURL(b); });
  } catch { return ''; }
}

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((ok) => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => ok({ w: 0, h: 0 }); im.src = src; });
}
