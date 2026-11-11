/**
 * Tỉ lệ hỗ trợ MKT theo Ban KD (Quản lý Ban KD › Tỉ lệ hỗ trợ MKT).
 *  - ban_kd.supportPct: % mặc định cho mọi dự án của Ban
 *  - projects.supportPct: % riêng của dự án (ghi đè); null/không có = theo Ban
 * Mỗi lần đổi ghi thêm 1 phần tử vào supportPctHistory (tối đa 100).
 */
import { periodEndIso } from './period';

export type PctHistory = { at: string; byUid: string; byName: string; from: number | null; to: number | null; scope: 'ban' | 'project'; note?: string; kind?: 'pct' | 'max' };

export const MAX_LABEL = 'Max / 1 sale chấm đủ 30 công';
export const validMax = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e11;
/** Max / 1 sale hiệu lực: riêng dự án → mức chung của Ban → null. */
export function effectiveMaxPerSale(p: any, bans: any[]): { value: number; source: 'project' | 'ban' } | null {
  if (!p) return null;
  if (validMax(p.supportMaxPerSale)) return { value: p.supportMaxPerSale, source: 'project' };
  const b: any = banOfProject(p, bans);
  if (b && validMax(b.supportMaxPerSale)) return { value: b.supportMaxPerSale, source: 'ban' };
  return null;
}

/** Chính sách hỗ trợ MKT của dự án. Base = supportPct (dữ liệu tỉ lệ cũ giữ nguyên, coi là Base). */
export type SupportCdt = '' | 'dai_ly' | 'khong';
export const CDT_LABEL: Record<SupportCdt, string> = { '': '—', dai_ly: 'Theo chính sách đại lý', khong: 'Không' };
/** 1 mức Bonus: % (trên chi phí) HOẶC số tiền cố định (VNĐ); điều kiện = ngưỡng số căn tối thiểu (tuỳ chọn) + mô tả. */
export type BonusTier = { pct: number | null; amount: number | null; minUnits: number | null; cond: string };
export const MAX_BONUS_TIERS = 10;
const okAmt = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e11;
const okUnits = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100000;
/** Đọc các mức Bonus: supportBonusTiers (mới) → nếu không có, coi supportBonusPct/supportBonusCond cũ là Mức 1 (không ghi dữ liệu). */
export function bonusTiersOf(p: any): BonusTier[] {
  if (Array.isArray(p?.supportBonusTiers)) {
    return p.supportBonusTiers.slice(0, MAX_BONUS_TIERS).map((t: any) => ({
      pct: validPct(t?.pct) ? t.pct : null, amount: okAmt(t?.amount) ? t.amount : null,
      minUnits: okUnits(t?.minUnits) ? t.minUnits : null, cond: typeof t?.cond === 'string' ? t.cond.slice(0, 1000) : '',
    })).filter((t: BonusTier) => t.pct != null || t.amount != null || t.minUnits != null || t.cond);
  }
  const pct = validPct(p?.supportBonusPct) ? p.supportBonusPct : null;
  const cond = typeof p?.supportBonusCond === 'string' ? p.supportBonusCond : '';
  return pct != null || cond ? [{ pct, amount: null, minUnits: null, cond }] : [];
}
/** Kiểm tra/chuẩn hoá mức Bonus nhập từ form (chuỗi). Trả lỗi tiếng Việt nếu sai. */
export function parseBonusTiers(rows: { pct: string; amount: string; minUnits: string; cond: string }[]): { tiers: BonusTier[] } | { error: string } {
  const out: BonusTier[] = [];
  for (const [i, r] of rows.entries()) {
    const n = i + 1; const pt = (r.pct || '').trim().replace(',', '.'), at = (r.amount || '').replace(/[^0-9]/g, ''), ut = (r.minUnits || '').trim(), cond = (r.cond || '').trim();
    if (!pt && !at && !ut && !cond) continue;
    const pct = pt ? Number(pt) : null, amount = at ? Number(at) : null, minUnits = ut ? Number(ut) : null;
    if (pct != null && !validPct(pct)) return { error: `Mức ${n}: % Bonus phải từ 0 đến 100` };
    if (amount != null && !okAmt(amount)) return { error: `Mức ${n}: số tiền Bonus không hợp lệ` };
    if (pct != null && amount != null) return { error: `Mức ${n}: chỉ nhập % hoặc số tiền, không nhập cả hai` };
    if (pct == null && amount == null) return { error: `Mức ${n}: cần nhập % hoặc số tiền Bonus` };
    if (minUnits != null && !okUnits(minUnits)) return { error: `Mức ${n}: ngưỡng số căn phải là số nguyên ≥ 0` };
    if (cond.length > 1000) return { error: `Mức ${n}: điều kiện tối đa 1000 ký tự` };
    out.push({ pct, amount, minUnits, cond });
  }
  if (out.length > MAX_BONUS_TIERS) return { error: `Tối đa ${MAX_BONUS_TIERS} mức Bonus` };
  return { tiers: out };
}
export const fmtTierValue = (t: BonusTier) => (t.pct != null ? fmtPct(t.pct) : t.amount != null ? t.amount.toLocaleString('vi-VN') + ' đ' : '—');
export const fmtTierCond = (t: BonusTier) => [t.minUnits != null ? `Từ ${t.minUnits} căn` : '', t.cond].filter(Boolean).join(' · ');
/** Tóm tắt 1 dòng cho bảng / lịch sử. */
export const fmtTiers = (ts: BonusTier[]) => ts.map((t, i) => `M${i + 1}: ${fmtTierValue(t)}`).join(' · ') || '—';
export type SupportPolicy = { base: number | null; baseSource: 'project' | 'ban' | null; bonus: number | null; bonusCond: string; bonusTiers: BonusTier[]; maxPerSale: number | null; maxSource: 'project' | 'ban' | null; cdt: SupportCdt };
export function policyOf(p: any, bans: any[]): SupportPolicy {
  const e = effectiveSupportPct(p, bans);
  const tiers = bonusTiersOf(p);
  const em = effectiveMaxPerSale(p, bans);
  return {
    base: e ? e.pct : null, baseSource: e ? e.source : null,
    bonus: tiers[0]?.pct ?? null,
    bonusCond: tiers[0] ? fmtTierCond(tiers[0]) : '',
    bonusTiers: tiers,
    maxPerSale: em ? em.value : null, maxSource: em ? em.source : null,
    cdt: (['dai_ly', 'khong'].includes(p?.supportCdt) ? p.supportCdt : '') as SupportCdt,
  };
}

export const validPct = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

const norm = (s?: string) => (s || '').toLowerCase().trim();

/** Ban của dự án: theo banKdId, rơi về banKdName (dữ liệu cũ). */
export function banOfProject<B extends { id: string; name?: string }>(p: { banKdId?: string; banKdName?: string } | null | undefined, bans: B[]): B | undefined {
  if (!p) return undefined;
  if (p.banKdId) { const b = bans.find((x) => x.id === p.banKdId); if (b) return b; }
  if (p.banKdName) return bans.find((x) => norm(x.name) === norm(p.banKdName));
  return undefined;
}

/** % hiệu lực: riêng dự án → mặc định Ban → null (chưa đặt). */
export function effectiveSupportPct(p: { supportPct?: unknown; banKdId?: string; banKdName?: string } | null | undefined, bans: { id: string; name?: string; supportPct?: unknown }[]): { pct: number; source: 'project' | 'ban' } | null {
  if (!p) return null;
  if (validPct(p.supportPct)) return { pct: p.supportPct, source: 'project' };
  const b = banOfProject(p, bans);
  if (b && validPct(b.supportPct)) return { pct: b.supportPct as number, source: 'ban' };
  return null;
}


/**
 * Tái dựng % Base tại thời điểm cutoff từ supportPctHistory (bỏ kind:'max').
 * - Bản ghi cuối có at ≤ cutoff → `to` (null = bỏ tỉ lệ riêng / chưa đặt ở scope này)
 * - Không có bản ghi ≤ cutoff nhưng có bản sau → `from` của bản sớm nhất sau cutoff (giá trị trước khi đổi = kỳ trước)
 * - Không có lịch sử → current; đánh dấu usedCurrent
 */
export function pctAtCutoff(history: unknown, current: unknown, cutoffIso: string): { value: number | null; usedCurrent: boolean } {
  const rows = (Array.isArray(history) ? history : [])
    .filter((h: any) => h && typeof h.at === 'string' && h.kind !== 'max')
    .slice()
    .sort((a: any, b: any) => String(a.at).localeCompare(String(b.at)));
  let last: any = null;
  for (const h of rows) {
    if (String(h.at) <= cutoffIso) last = h;
    else break;
  }
  if (last) {
    if (validPct(last.to)) return { value: last.to, usedCurrent: false };
    if (last.to === null || last.to === undefined) return { value: null, usedCurrent: false };
    return { value: null, usedCurrent: false };
  }
  const next = rows.find((h: any) => String(h.at) > cutoffIso);
  if (next) {
    if (validPct(next.from)) return { value: next.from, usedCurrent: false };
    if (next.from === null || next.from === undefined) return { value: null, usedCurrent: false };
  }
  if (validPct(current)) return { value: current as number, usedCurrent: true };
  if (current === null || current === undefined) return { value: null, usedCurrent: !rows.length };
  return { value: null, usedCurrent: true };
}

/**
 * Base % của dự án theo kỳ (as-of cuối kỳ 20/M VN).
 * Riêng dự án tại kỳ → mặc định Ban tại kỳ → null.
 * Không có lịch sử bao phủ kỳ → dùng tỉ lệ hiện tại (fallback: 'current').
 */
export function baseSupportPctAtPeriod(
  p: { supportPct?: unknown; supportPctHistory?: unknown; banKdId?: string; banKdName?: string } | null | undefined,
  bans: { id: string; name?: string; supportPct?: unknown; supportPctHistory?: unknown }[],
  period: string,
): { pct: number; source: 'project' | 'ban'; fallback?: 'current' } | null {
  if (!p || !period) return effectiveSupportPct(p, bans);
  const cutoff = periodEndIso(period);
  const proj = pctAtCutoff(p.supportPctHistory, p.supportPct, cutoff);
  if (validPct(proj.value)) return { pct: proj.value as number, source: 'project', ...(proj.usedCurrent ? { fallback: 'current' as const } : {}) };
  const b = banOfProject(p, bans);
  if (!b) return null;
  const ban = pctAtCutoff(b.supportPctHistory, b.supportPct, cutoff);
  if (validPct(ban.value)) return { pct: ban.value as number, source: 'ban', ...(ban.usedCurrent ? { fallback: 'current' as const } : {}) };
  return null;
}

export const fmtPct = (n: number) => `${Math.round(n * 100) / 100}%`.replace('.', ',');

/** Cột Excel «Tỉ lệ hỗ trợ MKT (%)» — số % theo kỳ (projectId + cuối kỳ). Ghi chú khi fallback tỉ lệ hiện tại (*). */
export const EXCEL_PCT_COL = 'Tỉ lệ hỗ trợ MKT (%)';
export const EXCEL_PCT_NOTE_COL = 'Ghi chú tỉ lệ';
export const EXCEL_PCT_FALLBACK_NOTE = '* Không có lịch sử bao phủ kỳ — đang hiện tỉ lệ hiện tại';
export function excelSupportPctFields(
  p: { supportPct?: unknown; supportPctHistory?: unknown; banKdId?: string; banKdName?: string } | null | undefined,
  bans: { id: string; name?: string; supportPct?: unknown; supportPctHistory?: unknown }[],
  period: string,
): { [EXCEL_PCT_COL]: number | ''; [EXCEL_PCT_NOTE_COL]: string } {
  const e = baseSupportPctAtPeriod(p, bans, period);
  return {
    [EXCEL_PCT_COL]: e ? e.pct : '',
    [EXCEL_PCT_NOTE_COL]: e?.fallback === 'current' ? EXCEL_PCT_FALLBACK_NOTE : '',
  };
}


/** Nhãn dự án trong ô chọn khi Đăng ký MKT. */
export function projectLabelWithPct(p: any, bans: any[]): string {
  const e = effectiveSupportPct(p, bans);
  return e ? `${p.name} · Hỗ trợ MKT ${fmtPct(e.pct)}` : String(p?.name ?? '');
}

export function pushPctHistory(prev: unknown, h: PctHistory): PctHistory[] {
  return [...(Array.isArray(prev) ? prev : []), h].slice(-100);
}
