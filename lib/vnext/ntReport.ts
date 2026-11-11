import { ntCountsInTotals } from './ntSupplement';
import { displayProjectName } from './projectRef';
/**
 * Báo cáo Nghiệm thu MKT tự động.
 * Chỉ bản ghi "Đã nghiệm thu". Tổng → Nhóm → Dự án → bản ghi user. Chi phí TRƯỚC VAT.
 * Nhóm: Cá nhân | Visa công ty | Digital | Công ty (= Đăng tin công ty + Cá nhân nạp qua công ty).
 * Lead (caNhanNopTien) là 1 số / bản ghi (= user × dự án): cộng theo Dự án; trong bảng Nhóm,
 * lead của bản ghi tính vào nhóm có chi phí lớn nhất của bản ghi đó (nhóm khác hiện "—").
 */
export type GroupKey = 'caNhan' | 'visa' | 'digital' | 'congTy';
export const GROUP_LABEL: Record<GroupKey, string> = { caNhan: 'Cá nhân', visa: 'Visa công ty', digital: 'Digital', congTy: 'Công ty' };
export const GROUP_ORDER: GroupKey[] = ['caNhan', 'visa', 'digital', 'congTy'];

export const GROUP_CHANNELS: Record<GroupKey, { key: string; label: string }[]> = {
  caNhan: [{ key: 'caNhanFb', label: 'Facebook' }, { key: 'caNhanZalo', label: 'Zalo' }, { key: 'caNhanTiktok', label: 'TikTok' }, { key: 'caNhanGoogle', label: 'Google' }, { key: 'caNhanNativeAds', label: 'Native Ads' }, { key: 'caNhanUCall', label: 'UCall' }, { key: 'caNhanDangTin', label: 'Đăng tin' }],
  visa: [{ key: 'visaFb', label: 'Facebook' }, { key: 'visaZalo', label: 'Zalo' }, { key: 'visaTiktok', label: 'TikTok' }, { key: 'visaDangTin', label: 'Đăng tin' }],
  digital: [{ key: 'digitalFb', label: 'Facebook' }, { key: 'digitalZalo', label: 'Zalo' }, { key: 'digitalTiktok', label: 'TikTok' }, { key: 'digitalKhac', label: 'Khác' }],
  congTy: [{ key: 'dangTinCtyChuaVat', label: 'Đăng tin công ty' }, { key: 'caNhanNapTienQuaCty', label: 'Cá nhân nạp qua công ty' }, { key: 'hoaDonTien', label: 'Tiền trên Hóa đơn' }, { key: 'hoaDonNo', label: 'Tiền Hóa đơn Nợ' }],
};

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const norm = (s: any) => String(s || '').normalize('NFC').toLowerCase().trim();

/** Chuẩn hoá trường month của Nghiệm thu: '2026-09' | '09.2026' | 'Kì 1 - Tháng 8' (năm mặc định theo bản ghi/2026) → 'YYYY-MM'. */
export function normalizeMonth(m: any, fallbackYear = 2026): string {
  const s = String(m || '').trim();
  let x = s.match(/^(\d{4})-(\d{1,2})$/); if (x) return `${x[1]}-${x[2].padStart(2, '0')}`;
  x = s.match(/^(\d{1,2})[./-](\d{4})$/); if (x) return `${x[2]}-${x[1].padStart(2, '0')}`;
  x = s.match(/th[áa]ng\s*(\d{1,2})(?:\D+(\d{4}))?/i); if (x) return `${x[2] || fallbackYear}-${x[1].padStart(2, '0')}`;
  return s;
}

export function isAccepted(r: any) {
  const s = norm(r?.status || 'Đã nghiệm thu');
  // Bản Nghiệm thu bổ sung chỉ tính khi đã duyệt.
  return s === norm('Đã nghiệm thu') && !r?.isDraft && ntCountsInTotals(r);
}

export function channelValue(r: any, key: string): number {
  if (key === 'caNhanNapTienQuaCty') return num(r.caNhanNapTienQuaCty ?? r.caNhanNapTienCty);
  if (key === 'dangTinCtyChuaVat') return num(r.dangTinCtyChuaVat ?? r.dangTinCongTyChuaVat);
  if (key === 'hoaDonTien') {
    if (Array.isArray(r.hoaDonLines) && r.hoaDonLines.length) return r.hoaDonLines.reduce((s: number, x: any) => s + (Number(x?.amount) || 0), 0);
    return num(r.hoaDonTien);
  }
  if (key === 'hoaDonNo') {
    const inv = channelValue(r, 'hoaDonTien');
    // báo cáo: trước VAT — dùng totalCost/grandTotal nếu có, không thì sum kênh
    const tong = num(r.grandTotal ?? r.totalCost);
    return inv - tong;
  }
  return num(r[key]);
}

export function groupCost(r: any, g: GroupKey): number {
  return GROUP_CHANNELS[g].reduce((s, c) => s + (c.key === 'hoaDonTien' || c.key === 'hoaDonNo' ? 0 : channelValue(r, c.key)), 0);
}

/** VAT của 1 nhóm — cùng công thức với màn Nghiệm thu MKT (getRowComputed): Digital FB/TikTok/Khác 10%, Zalo 8%; Visa FB/TikTok 10%, Zalo/Đăng tin 8%;
 *  Đăng tin công ty 8%; Cá nhân & nạp qua công ty không VAT. Làm tròn theo nhóm như màn hình. */
export function groupVat(r: any, g: GroupKey): number {
  const v = (k: string) => channelValue(r, k);
  if (g === 'digital') { const pre = v('digitalFb') + v('digitalZalo') + v('digitalTiktok') + v('digitalKhac'); return Math.round(v('digitalFb') * 1.1 + v('digitalZalo') * 1.08 + v('digitalTiktok') * 1.1 + v('digitalKhac') * 1.1) - pre; }
  if (g === 'visa') { const pre = v('visaFb') + v('visaZalo') + v('visaTiktok') + v('visaDangTin'); return Math.round(v('visaFb') * 1.1 + v('visaZalo') * 1.08 + v('visaTiktok') * 1.1 + v('visaDangTin') * 1.08) - pre; }
  if (g === 'congTy') return Math.round(v('dangTinCtyChuaVat') * 1.08) - v('dangTinCtyChuaVat');
  return 0;
}
export function recordVat(r: any): number { return GROUP_ORDER.reduce((s, g) => s + groupVat(r, g), 0); }

export function leadGroup(r: any): GroupKey | null {
  let best: GroupKey | null = null, bv = 0;
  for (const g of GROUP_ORDER) { const v = groupCost(r, g); if (v > bv) { bv = v; best = g; } }
  return best;
}

export type RecRow = { id: string; rec: any; cost: number; leads: number | null; channels: Record<string, number> };
export type ProjNode = { projectId: string; projectName: string; cost: number; leads: number; rows: RecRow[] };
export type GroupNode = { group: GroupKey; label: string; cost: number; vat: number; leads: number; projects: ProjNode[]; channels: string[] };

export function buildReport(records: any[], filter: { month?: string; teamIds?: string[]; blockId?: string; uidOrName?: string; projectId?: string } = {}, projectCatalog?: any[]) {
  const recs = records.filter((r) => isAccepted(r)
    && (!filter.month || normalizeMonth(r.month) === filter.month)
    && (!filter.teamIds || filter.teamIds.includes(r.teamId))
    && (!filter.blockId || r.blockId === filter.blockId)
    && (!filter.projectId || r.projectId === filter.projectId)
    && (!filter.uidOrName || norm(r.implementerName) === norm(filter.uidOrName) || r.createdForUid === filter.uidOrName));
  const pname = (r: any) => displayProjectName(projectCatalog, r.projectId, r.projectName);
  const groups: GroupNode[] = [];
  for (const g of GROUP_ORDER) {
    const byProj = new Map<string, ProjNode>();
    const usedCh = new Set<string>();
    let gVat = 0;
    for (const r of recs) {
      const cost = groupCost(r, g);
      if (cost <= 0) continue;
      const lg = leadGroup(r) === g;
      gVat += groupVat(r, g);
      const channels: Record<string, number> = {};
      for (const c of GROUP_CHANNELS[g]) { const v = channelValue(r, c.key); if (v > 0) { channels[c.key] = v; usedCh.add(c.key); } }
      const pid = r.projectId || r.projectName || '—';
      if (!byProj.has(pid)) byProj.set(pid, { projectId: pid, projectName: pname(r), cost: 0, leads: 0, rows: [] });
      const p = byProj.get(pid)!;
      p.rows.push({ id: r.id, rec: r, cost, leads: lg ? num(r.caNhanNopTien) : null, channels });
      p.cost += cost; if (lg) p.leads += num(r.caNhanNopTien);
    }
    const list = [...byProj.values()].sort((a, b) => b.cost - a.cost);
    if (!list.length) continue;
    groups.push({ group: g, label: GROUP_LABEL[g], projects: list, vat: gVat, cost: list.reduce((s, p) => s + p.cost, 0), leads: list.reduce((s, p) => s + p.leads, 0), channels: GROUP_CHANNELS[g].map((c) => c.key).filter((k) => usedCh.has(k)) });
  }
  // Lead cộng theo dự án (mỗi bản ghi 1 lần)
  const byProject = new Map<string, { projectId: string; projectName: string; cost: number; vat: number; leads: number }>();
  for (const r of recs) {
    const pid = r.projectId || r.projectName || '—';
    if (!byProject.has(pid)) byProject.set(pid, { projectId: pid, projectName: pname(r), cost: 0, vat: 0, leads: 0 });
    const x = byProject.get(pid)!;
    x.cost += GROUP_ORDER.reduce((s, g) => s + groupCost(r, g), 0);
    x.vat += recordVat(r);
    x.leads += num(r.caNhanNopTien);
  }
  const projects = [...byProject.values()].sort((a, b) => b.cost - a.cost);
  const cost = projects.reduce((s, p) => s + p.cost, 0), vat = projects.reduce((s, p) => s + p.vat, 0);
  const total = { cost, vat, withVat: cost + vat, leads: projects.reduce((s, p) => s + p.leads, 0) };
  return { records: recs, groups, projects, total };
}

export const cpl = (cost: number, leads: number) => (leads > 0 ? Math.round(cost / leads) : null);

/** Slide ảnh: mỗi bản ghi ≥ 1 slide, tối đa 3 ảnh/slide; bản ghi không có ảnh → 1 slide "Chưa có ảnh Nghiệm thu". */
export function imageSlides<T extends { acceptanceId: string; order?: number }>(records: { id: string }[], images: T[], perSlide = 3) {
  const out: { recordId: string; images: T[]; part: number; parts: number }[] = [];
  for (const r of records) {
    const imgs = images.filter((i) => i.acceptanceId === r.id).sort((a, b) => num(a.order) - num(b.order));
    if (!imgs.length) { out.push({ recordId: r.id, images: [], part: 1, parts: 1 }); continue; }
    const parts = Math.ceil(imgs.length / perSlide);
    for (let i = 0; i < parts; i++) out.push({ recordId: r.id, images: imgs.slice(i * perSlide, i * perSlide + perSlide), part: i + 1, parts });
  }
  return out;
}

// ---------------------------------------------------------------- Share links
export type ShareLink = { token: string; scope: 'user' | 'phong' | 'khoi' | 'all'; month: string; teamIds?: string[]; blockId?: string; uidOrName?: string; expiresAt: string; createdBy: string; createdAt: string; revokedAt?: string | null };

export function shareLinkValid(l: ShareLink | null | undefined, now: Date = new Date()): { ok: boolean; reason?: string } {
  if (!l) return { ok: false, reason: 'Link không tồn tại' };
  if (l.revokedAt) return { ok: false, reason: 'Link đã bị thu hồi' };
  if (!l.expiresAt || new Date(l.expiresAt).getTime() < now.getTime()) return { ok: false, reason: 'Link đã hết hạn' };
  return { ok: true };
}

export function clampShareDays(days: number, maxDays = 30) {
  const d = Math.round(Number(days) || 7);
  return Math.max(1, Math.min(maxDays, d));
}

export function newToken(rand: () => number = Math.random): string {
  const a = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const c = (globalThis as any).crypto;
  if (c?.getRandomValues) { const b = new Uint8Array(32); c.getRandomValues(b); for (const x of b) s += a[x % a.length]; return s; }
  for (let i = 0; i < 32; i++) s += a[Math.floor(rand() * a.length)];
  return s;
}

/** Chi phí trước VAT của 1 bản ghi (= tổng 4 nhóm). */
export function recordCostBeforeVat(r: any): number {
  return GROUP_ORDER.reduce((s, g) => s + groupCost(r, g), 0);
}

export type ReconcileRow = {
  uid: string; name: string; teamId: string; blockId: string; projectId: string; projectName: string;
  ns: number; cost: number; diff: number; pct: number | null; records: number;
  /** Người phụ trách tự nhập (Tháng 10/2026) — không có uid, không có NS đăng ký. */
  manual?: boolean;
};

/**
 * Đối chiếu NS MKT đã đăng ký (kind=user, theo kỳ + dự án + user) với chi phí Nghiệm thu trước VAT.
 * month = 'YYYY-MM' (= period key NS). Bản ghi Đã nghiệm thu có implementerUid, hoặc tên tự nhập (implementerManual, Tháng 10/2026).
 */
export function buildReconcile(nsLines: any[], acceptances: any[], filter: { month?: string; teamIds?: string[] | null; blockId?: string; projectId?: string } = {}, projectCatalog?: any[]): ReconcileRow[] {
  const month = filter.month;
  const recs = acceptances.filter((r) => isAccepted(r) && (r.implementerUid || (r.implementerManual === true && String(r.implementerName || '').trim()))
    && (!month || normalizeMonth(r.month) === month)
    && (!filter.teamIds || filter.teamIds.includes(r.teamId))
    && (!filter.blockId || r.blockId === filter.blockId)
    && (!filter.projectId || r.projectId === filter.projectId));
  const ns = (nsLines || []).filter((l) => l && !l.deleted && l.kind === 'user'
    && (!month || l.period === month)
    && (!filter.teamIds || filter.teamIds.includes(l.teamId))
    && (!filter.blockId || l.blockId === filter.blockId)
    && (!filter.projectId || l.projectId === filter.projectId));
  const map = new Map<string, ReconcileRow>();
  const key = (uid: string, pid: string) => `${uid}__${pid}`;
  for (const l of ns) {
    const uid = l.ownerUid; if (!uid) continue;
    const pid = l.projectId || '—';
    const k = key(uid, pid);
    const liveName = displayProjectName(projectCatalog, pid, undefined);
    if (!map.has(k)) map.set(k, { uid, name: l.ownerName || uid, teamId: l.teamId || '', blockId: l.blockId || '', projectId: pid, projectName: liveName, ns: 0, cost: 0, diff: 0, pct: null, records: 0 });
    const row = map.get(k)!; row.ns += num(l.amount); if (l.teamId) row.teamId = l.teamId; if (l.blockId) row.blockId = l.blockId;
    row.projectName = displayProjectName(projectCatalog, pid, row.projectName);
  }
  for (const r of recs) {
    const manual = !r.implementerUid;
    const uid = r.implementerUid || ''; const pid = r.projectId || r.projectName || '—';
    const k = manual ? key('manual:' + norm(r.implementerName), pid) : key(uid, pid);
    const liveName = displayProjectName(projectCatalog, r.projectId, r.projectName);
    if (!map.has(k)) map.set(k, { uid, name: r.implementerName || uid, teamId: r.teamId || '', blockId: r.blockId || '', projectId: pid, projectName: liveName, ns: 0, cost: 0, diff: 0, pct: null, records: 0, ...(manual ? { manual: true } : {}) });
    const row = map.get(k)!;
    row.cost += recordCostBeforeVat(r); row.records += 1;
    row.name = r.implementerName || row.name;
    row.projectName = displayProjectName(projectCatalog, r.projectId, r.projectName || row.projectName);
    if (r.teamId) row.teamId = r.teamId; if (r.blockId) row.blockId = r.blockId;
  }
  return [...map.values()].map((r) => {
    r.diff = r.ns - r.cost;
    r.pct = r.ns > 0 ? Math.round((r.cost / r.ns) * 1000) / 10 : (r.cost > 0 ? null : 0);
    return r;
  }).sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }) || a.projectName.localeCompare(b.projectName, 'vi', { sensitivity: 'base' }));
}
