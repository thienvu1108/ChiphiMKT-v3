/**
 * Báo cáo tuần v-next + liên kết Ngân sách.
 * Doc weekly_reports/{period}_{dot}_{uid}. Chi phí nhập là LUỸ KẾ cả kỳ.
 */
import './banSupport'; // WEEKLY_REQUIRES_BAN_APPROVAL gate

export const WEEKLY_COLLECTION = 'weekly_reports';

export type WeeklyItem = {
  projectId: string;
  cumCost: number;      // chi phí luỹ kế kỳ (đ)
  leads: number;
  interested: number;   // khách quan tâm
  closedUnits?: number; // Số căn chốt (số nguyên ≥ 0; báo cáo cũ không có → 0)
  difficulty?: string;
  nsAtSubmit?: number;  // NS chốt lúc nộp (đợt đã nộp giữ nguyên số)
  noBudget?: boolean;   // dự án đã bị gỡ NS nhưng đã có báo cáo
};

export type WeeklyReport = {
  id?: string;
  period: string;
  dot: number;
  uid: string;
  userName?: string;
  teamId?: string;
  blockId?: string;
  items: WeeklyItem[];
  submittedAt?: string;
  updatedAt?: string;
};

export function weeklyId(period: string, dot: number, uid: string) {
  return `${period}_${dot}_${uid}`;
}

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Dự án hiện trong form: mọi dự án user đã đăng ký NS (NS > 0) + dự án đã có báo cáo trong kỳ
 * nhưng NS bị gỡ (gắn "Không còn ngân sách"). Dự án không có NS → không báo cáo được.
 */
export function formProjects(ns: Map<string, number>, reportsOfPeriod: WeeklyReport[], opts?: { includeOrphans?: boolean }): { projectId: string; ns: number; noBudget: boolean }[] {
  const out = new Map<string, { projectId: string; ns: number; noBudget: boolean }>();
  for (const [pid, v] of ns) if (v > 0) out.set(pid, { projectId: pid, ns: v, noBudget: false });
  // Mặc định bỏ item báo cáo không còn dòng NS (xoá NS → không hiện ghost). includeOrphans=true chỉ để audit/dry-run.
  if (opts?.includeOrphans) {
    for (const r of reportsOfPeriod) for (const it of r.items || []) {
      if (!out.has(it.projectId)) out.set(it.projectId, { projectId: it.projectId, ns: 0, noBudget: true });
    }
  }
  return [...out.values()];
}

export function canReportProject(ns: Map<string, number>, reportsOfPeriod: WeeklyReport[], projectId: string) {
  return formProjects(ns, reportsOfPeriod).some((p) => p.projectId === projectId);
}

/** Luỹ kế đợt trước gần nhất (< dot) của user cho dự án. */
export function prevCum(reportsOfPeriod: WeeklyReport[], dot: number, projectId: string): number {
  let best = -1, val = 0;
  for (const r of reportsOfPeriod) {
    if (r.dot >= dot || r.dot <= best) continue;
    const it = (r.items || []).find((i) => i.projectId === projectId);
    if (it) { best = r.dot; val = num(it.cumCost); }
  }
  return val;
}

export type ItemMetrics = { ns: number; cum: number; dotCost: number; remaining: number; pct: number | null; over: boolean; cpl: number | null };

/** NS luôn lấy theo bản đăng ký hiện hành (liveNs). nsAtSubmit chỉ lưu lịch sử lúc nộp, không dùng để hiển thị. */
export function itemMetrics(item: WeeklyItem, opts: { liveNs: number; prevCum: number; submitted?: boolean }): ItemMetrics {
  const ns = num(opts.liveNs);
  const cum = num(item.cumCost);
  const remaining = ns - cum;
  return {
    ns, cum,
    dotCost: cum - num(opts.prevCum),
    remaining,
    pct: ns > 0 ? Math.round((cum / ns) * 1000) / 10 : null,
    over: cum > ns,
    cpl: num(item.leads) > 0 ? Math.round(cum / num(item.leads)) : null,
  };
}

export function validateItem(item: WeeklyItem, prev: number): string | null {
  if (num(item.cumCost) < 0 || num(item.leads) < 0 || num(item.interested) < 0 || num(item.closedUnits) < 0) return 'Số liệu không được âm';
  if (!Number.isInteger(num(item.closedUnits))) return 'Số căn chốt phải là số nguyên';
  if (num(item.cumCost) < prev) return 'Chi phí luỹ kế không được nhỏ hơn đợt trước';
  if (num(item.interested) > num(item.leads)) return 'Khách quan tâm không vượt quá số lead';
  return null;
}

/** Chốt NS lúc nộp. */
export function freezeOnSubmit(items: WeeklyItem[], ns: Map<string, number>): WeeklyItem[] {
  return items.map((it) => ({ ...it, nsAtSubmit: ns.get(it.projectId) || 0, noBudget: !(ns.get(it.projectId) > 0) }));
}

// ---------------------------------------------------------------- Rollup (Quản lý Báo cáo / Phòng / Khối / Ban)
export type RollUser = { uid: string; name: string; teamId: string; blockId: string };
export type Agg = { cum: number; dotCost: number; leads: number; interested: number; closedUnits: number; ns: number; over: number };
const zero = (): Agg => ({ cum: 0, dotCost: 0, leads: 0, interested: 0, closedUnits: 0, ns: 0, over: 0 });
const addAgg = (a: Agg, b: Agg) => { a.cum += b.cum; a.dotCost += b.dotCost; a.leads += b.leads; a.interested += b.interested; a.closedUnits += b.closedUnits; a.ns += b.ns; a.over += b.over; };

export type UserRow = Agg & { uid: string; name: string; submitted: boolean; projects: (ItemMetrics & WeeklyItem)[]; missing: { projectId: string; ns: number; noBudget: boolean }[] };
export type TeamNode = Agg & { teamId: string; users: UserRow[]; submitted: number; expected: number };
export type BlockNode = Agg & { blockId: string; teams: TeamNode[]; submitted: number; expected: number };

/**
 * Khối → Phòng → User, có subtotal. `expected` = user có NS trong kỳ (phải nộp).
 * filter.projectId: chỉ tính dự án đó.
 */
export function rollup(opts: {
  period: string; dot: number; users: RollUser[]; reports: WeeklyReport[];
  nsByUser: Map<string, Map<string, number>>; projectId?: string;
}): { blocks: BlockNode[]; total: Agg & { submitted: number; expected: number } } {
  const { period, dot, users, reports, nsByUser, projectId } = opts;
  const byUser = new Map<string, WeeklyReport[]>();
  for (const r of reports) if (r.period === period) {
    if (!byUser.has(r.uid)) byUser.set(r.uid, []);
    byUser.get(r.uid)!.push(r);
  }
  const blocks = new Map<string, BlockNode>();
  const total = { ...zero(), submitted: 0, expected: 0 };
  for (const u of users) {
    const ns = nsByUser.get(u.uid) || new Map();
    const rs = byUser.get(u.uid) || [];
    // Chỉ dự án còn NS > 0 (bỏ orphan / noBudget). Lọc projectId không được kéo user nộp đợt khác vào mẫu số.
    const projs = formProjects(ns, rs).filter((p) => !projectId || p.projectId === projectId);
    const cur = rs.find((r) => r.dot === dot);
    if (!projs.length) continue; // không còn NS khớp bộ lọc → không tính Đã nộp / expected
    const row: UserRow = { ...zero(), uid: u.uid, name: u.name, submitted: !!cur?.submittedAt, projects: [], missing: [] };
    for (const p of projs) {
      const it = (cur?.items || []).find((i) => i.projectId === p.projectId);
      if (!it) { row.ns += p.ns; row.missing.push(p); continue; }
      const m = itemMetrics(it, { liveNs: p.ns, prevCum: prevCum(rs, dot, p.projectId), submitted: !!cur?.submittedAt });
      row.projects.push({ ...it, ...m });
      addAgg(row, { cum: m.cum, dotCost: m.dotCost, leads: num(it.leads), interested: num(it.interested), closedUnits: num(it.closedUnits), ns: m.ns, over: m.over ? 1 : 0 });
    }
    const bid = u.blockId || 'unassigned';
    if (!blocks.has(bid)) blocks.set(bid, { ...zero(), blockId: bid, teams: [], submitted: 0, expected: 0 });
    const b = blocks.get(bid)!;
    let t = b.teams.find((x) => x.teamId === u.teamId);
    if (!t) { t = { ...zero(), teamId: u.teamId, users: [], submitted: 0, expected: 0 }; b.teams.push(t); }
    t.users.push(row); addAgg(t, row); addAgg(b, row); addAgg(total, row);
    t.expected++; b.expected++; total.expected++;
    if (row.submitted) { t.submitted++; b.submitted++; total.submitted++; }
  }
  return { blocks: [...blocks.values()], total };
}

/** Tổng hợp theo dự án (cho bảng dự án / Ban KD). */
export function byProject(blocks: BlockNode[]) {
  const m = new Map<string, Agg & { projectId: string; reporters: number }>();
  for (const b of blocks) for (const t of b.teams) for (const u of t.users) for (const p of u.projects) {
    if (!m.has(p.projectId)) m.set(p.projectId, { ...zero(), projectId: p.projectId, reporters: 0 });
    const x = m.get(p.projectId)!;
    addAgg(x, { cum: p.cum, dotCost: p.dotCost, leads: num(p.leads), interested: num(p.interested), closedUnits: num(p.closedUnits), ns: p.ns, over: p.over ? 1 : 0 });
    x.reporters++;
  }
  return [...m.values()].sort((a, b) => b.cum - a.cum);
}

/** Vai trò không nộp Báo cáo tuần (khớp isNonRegisteringRole trong firestore.rules). */
export const NON_REPORTING_ROLES = ['gd_khoi', 'tro_ly_khoi', 'mod', 'admin', 'super_admin', 'accountant', 'truong_ban_kd'];

/**
 * Báo cáo Khối: chỉ nhân sự thuộc Khối (Phòng hiện tại thuộc Khối; bỏ hồ sơ trùng đã gộp/liên kết và vai trò không nộp)
 * và chỉ báo cáo nộp cho Khối đó (report.blockId; báo cáo cũ không có blockId → theo Khối hiện tại của người nộp).
 */
export function scopeKhoiReports<U extends { uid: string; blockId: string }>(
  users: U[], reports: WeeklyReport[], blockIds: string[] | undefined,
): { users: U[]; reports: WeeklyReport[] } {
  if (!blockIds) return { users, reports };
  const inB = new Set(blockIds);
  const us = users.filter((u) => inB.has(u.blockId));
  const byUid = new Map(us.map((u) => [u.uid, u]));
  const reps = reports.filter((r) => { const u = byUid.get(r.uid); return !!u && (r.blockId ? inB.has(r.blockId) : true); });
  return { users: us, reports: reps };
}

/** Nhóm hiển thị (cột Phòng) cho GĐ Khối tự Đăng ký MKT trong Báo cáo Khối / Quản lý Báo cáo. */
export const KHOI_REG_TEAM = 'GĐ Khối (Đăng ký MKT)';

/**
 * GĐ Khối đã Đăng ký MKT (dòng kind 'khoi' còn hiệu lực) trong kỳ → phải nộp Báo cáo tuần.
 * Trả 1 phần tử / uid (Khối = Khối của dòng đầu tiên trong phạm vi blockIds nếu có).
 */
export function khoiRegistrants(lines: { kind: string; period: string; ownerUid?: string; ownerName?: string; blockId?: string; amount: number; deleted?: boolean }[], period: string, blockIds?: string[]) {
  const out = new Map<string, { uid: string; name: string; blockId: string; teamId: string }>();
  for (const l of lines) {
    if (l.kind !== 'khoi' || l.period !== period || l.deleted || !(Number(l.amount) > 0) || !l.ownerUid || !l.blockId) continue;
    if (blockIds && !blockIds.includes(l.blockId)) continue;
    if (!out.has(l.ownerUid)) out.set(l.ownerUid, { uid: l.ownerUid, name: l.ownerName || l.ownerUid, blockId: l.blockId, teamId: KHOI_REG_TEAM });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- Bảng phẳng User × Dự án (Quản lý Báo cáo / Phòng / Khối)
export type ProjectRow = {
  key: string; blockId: string; teamId: string; uid: string; userName: string; projectId: string;
  status: 'submitted' | 'missing'; ns: number; cum: number; dotCost: number; pct: number | null; leads: number; interested: number;
  closedUnits: number; cpl: number | null; over: boolean; noBudget: boolean; difficulty?: string;
};

/** Mỗi dòng = 1 user × 1 dự án đăng ký (khớp projectId). Đã nộp = đợt đã nộp và có dòng dự án đó. */
export function projectRows(blocks: BlockNode[], names: { block: (id: string) => string; team: (id: string) => string; project: (id: string) => string }): ProjectRow[] {
  const out: ProjectRow[] = [];
  for (const b of blocks) for (const t of b.teams) for (const u of t.users) {
    const base = { blockId: b.blockId, teamId: t.teamId, uid: u.uid, userName: u.name };
    for (const p of u.projects) out.push({ ...base, key: `${u.uid}|${p.projectId}`, projectId: p.projectId, status: u.submitted ? 'submitted' : 'missing', ns: p.ns, cum: p.cum, dotCost: p.dotCost, pct: p.pct, leads: num(p.leads), interested: num(p.interested), closedUnits: num(p.closedUnits), cpl: p.cpl, over: p.over, noBudget: !!p.noBudget, difficulty: p.difficulty });
    for (const p of u.missing || []) out.push({ ...base, key: `${u.uid}|${p.projectId}`, projectId: p.projectId, status: 'missing', ns: p.ns, cum: 0, dotCost: 0, pct: null, leads: 0, interested: 0, closedUnits: 0, cpl: null, over: false, noBudget: p.noBudget });
  }
  const cmp = (a: string, b: string) => a.localeCompare(b, 'vi');
  const un = (id: string) => (id === 'unassigned' || !id ? '\uffff' : '');
  return out.sort((a, b) =>
    cmp(un(a.blockId) + names.block(a.blockId), un(b.blockId) + names.block(b.blockId))
    || cmp(names.team(a.teamId), names.team(b.teamId))
    || cmp(a.userName, b.userName)
    || cmp(names.project(a.projectId), names.project(b.projectId)));
}

/** Cộng KPI từ các dòng User×Dự án (sau mọi bộ lọc). Đã nộp = số dòng status submitted. */
export function sumProjectRowKpis(rows: ProjectRow[]) {
  const out = { submitted: 0, expected: rows.length, ns: 0, cum: 0, dotCost: 0, leads: 0, interested: 0, closedUnits: 0, over: 0 };
  for (const r of rows) {
    out.ns += num(r.ns);
    if (r.status === 'submitted') {
      out.submitted++;
      out.cum += num(r.cum);
      out.dotCost += num(r.dotCost);
      out.leads += num(r.leads);
      out.interested += num(r.interested);
      out.closedUnits += num(r.closedUnits);
      if (r.over) out.over++;
    }
  }
  return out;
}

/** Bỏ item projectId khỏi danh sách; trả items còn lại (dùng khi xoá dòng NS). */
export function stripItemsForProject(items: WeeklyItem[] | undefined, projectId: string): WeeklyItem[] {
  return (items || []).filter((i) => i.projectId !== projectId);
}

/** Đếm item báo cáo mà projectId không còn trong map NS được phép báo cáo (Từ chối / chờ duyệt / đã xoá NS). Không PII. */
export function countHiddenNonReportableItems(reports: WeeklyReport[], nsByUser: Map<string, Map<string, number>>): { items: number; docs: number } {
  let items = 0, docs = 0;
  for (const r of reports) {
    const ns = nsByUser.get(r.uid) || new Map();
    let hit = 0;
    for (const it of r.items || []) {
      if (!(ns.get(it.projectId) > 0)) { items++; hit++; }
    }
    if (hit) docs++;
  }
  return { items, docs };
}
