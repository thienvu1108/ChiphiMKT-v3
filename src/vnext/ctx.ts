import { setKhoiManagers } from '../../lib/vnext/support';
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, addDoc, type Firestore } from 'firebase/firestore';
import { normalizeLegacyFieldValues } from '../lib/legacyFieldValues';
import { normalizeRoleKey, type RoleKey } from '../lib/rolePermissions';
import { NS_COLLECTION, type NsLine, gdkdTeamIdsFor } from '../../lib/vnext/budget';
import { displayProjectName } from '../../lib/vnext/projectRef';
import { WEEKLY_COLLECTION, type WeeklyReport } from '../../lib/vnext/weekly';

export type VCtx = {
  db: Firestore;
  uid: string;
  email: string;
  name: string;
  role: RoleKey;
  profile?: any; // Current profile, independent of permission-scoped users listener.
  teamId: string;
  teams: any[];
  blocks: any[];
  projects: any[];
  users: any[];
  banKds: any[];
  settings: any;
  myBlockIds: string[];   // Khối phụ trách (GĐK / Trợ lý)
  myBanKdIds: string[];
  acceptances: any[];
  /** Mọi bản ghi kể cả bản bổ sung chưa duyệt / bị từ chối (chỉ để XEM, không tính tổng). */
  acceptancesAll?: any[];
  perms?: string[];
  aliasUids?: string[];   // UID cũ của chính user (tài khoản đã chuyển UID)       // quyền v-next hiệu lực (registry + rolePermissions)
};

const normName = (s: any) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/** Phòng của user: users.teamId, hoặc khớp users.teamName với teams.name / teamCode (dữ liệu cũ chỉ có teamName). */
export function resolveTeamId(teams: any[], teamId?: string, teamName?: string): string {
  if (teamId && teams.some((t) => t.id === teamId)) return teamId;
  const n = normName(teamName);
  if (!n) return teamId || '';
  const hit = teams.find((t) => normName(t.name) === n) || teams.find((t) => t.teamCode && normName(t.teamCode) === n);
  return hit?.id || teamId || '';
}

export function buildCtx(p: Omit<VCtx, 'role'> & { rawRole: unknown; teamName?: string }): VCtx {
  const { rawRole, teamName: tn, ...rest } = p;
  const N = (xs: any) => (Array.isArray(xs) ? xs.map((x: any) => normalizeLegacyFieldValues(x)) : []);
  rest.teams = N(rest.teams); rest.blocks = N(rest.blocks); rest.banKds = N(rest.banKds); rest.users = N(rest.users); rest.acceptances = N(rest.acceptances);
  const users = asArr(rest.users).map((u: any) => (u.teamId && rest.teams.some((t: any) => t.id === u.teamId) ? u : { ...u, teamId: resolveTeamId(rest.teams, u.teamId, u.teamName) }));
  setKhoiManagers(rest.blocks);
  return { ...rest, users, teamId: resolveTeamId(rest.teams, rest.teamId, tn), role: normalizeRoleKey(rawRole) };
}

/** Quyền v-next theo registry (Cài đặt → Phân quyền). */
export const vnCan = (c: VCtx, key: string) => c.role === 'super_admin' || asArr(c.perms).includes(key);
export const isAdm = (c: VCtx) => c.role === 'admin' || c.role === 'super_admin';
export const isAdmOrMod = (c: VCtx) => isAdm(c) || c.role === 'mod';
export const canViewAll = (c: VCtx) => isAdmOrMod(c) || c.role === 'accountant';
export const gdkdTeams = (c: VCtx) => gdkdTeamIdsFor(c.uid, c.role, c.teamId, c.teams, c.aliasUids || []);
/** GĐ Khối đồng thời là GĐKD của ít nhất 1 Phòng. */
export const isDualGdk = (c: VCtx) => c.role === 'gd_khoi' && gdkdTeams(c).length > 0;

export const teamName = (c: VCtx, id?: string) => {
  const t = c.teams.find((x) => x.id === id);
  return t ? (t.teamCode && t.teamCode !== t.name ? `${t.name}` : t.name) : id || '—';
};
export const blockName = (c: VCtx, id?: string) => {
  const b = c.blocks.find((x) => x.id === id);
  return b ? (b.name || b.blockCode) : id === 'unassigned' || !id ? 'Chưa gán Khối' : id;
};
export const projectName = (c: VCtx, id?: string, stored?: string) => displayProjectName(c.projects, id, stored);
export const userName = (c: VCtx, uid?: string) => {
  const u = c.users.find((x) => x.id === uid || x.uid === uid);
  return u?.fullName || u?.displayName || u?.email || uid || '—';
};
export const uidOf = (u: any) => u.uid || u.id;

/** Team thuộc Khối (teams.blockId hoặc blockCode). */
export const teamsOfBlock = (c: VCtx, blockId: string) => {
  const b = c.blocks.find((x) => x.id === blockId);
  return c.teams.filter((t) => t.blockId === blockId || (b?.blockCode && t.blockCode === b.blockCode));
};
export const blockOfTeam = (c: VCtx, teamId?: string) => {
  const t = c.teams.find((x) => x.id === teamId);
  if (!t) return '';
  if (t.blockId) return t.blockId;
  return c.blocks.find((b) => b.blockCode && b.blockCode === t.blockCode)?.id || '';
};

export const isKhoiMgr = (c: VCtx) => c.role === 'gd_khoi' || c.role === 'tro_ly_khoi';
/** Listener theo từng Khối (blockId ==) + dòng của chính mình, gộp lại. */
/** GĐKD (fix/gdkd-scope): rules chỉ cho đọc Phòng mình → mỗi Phòng một listener teamId ==. */
export const isGdkdOnly = (c: VCtx) => c.role === 'gdkd';
function scopedByTeam(c: VCtx, base: any, emit: (rows: any[]) => void, onErr: (m: string) => void) {
  const tids = gdkdTeams(c);
  if (!tids.length) { emit([]); return () => {}; }
  const parts: Record<string, any[]> = {};
  const push = () => emit(Object.values(parts).flat());
  const unsubs = tids.map((t) => onSnapshot(query(base, where('teamId', '==', t)),
    (snap: any) => { parts[t] = snap.docs.map((d: any) => ({ id: d.id, ...(normalizeLegacyFieldValues(d.data()) as any) })); push(); },
    (e: any) => { parts[t] = []; push(); onErr(e.message); }));
  return () => unsubs.forEach((u) => u());
}
function scopedByBlock(c: VCtx, base: any, emit: (rows: any[]) => void, onErr: (m: string) => void) {
  const parts: Record<string, any[]> = {};
  const push = () => { const m = new Map<string, any>(); Object.values(parts).flat().forEach((r) => m.set(r.id, r)); emit([...m.values()]); };
  const ownerField = base.id === NS_COLLECTION ? 'ownerUid' : 'uid';
  const qs = [...c.myBlockIds.map((b) => ['b:' + b, query(base, where('blockId', '==', b))] as const), ...gdkdTeams(c).map((t) => ['t:' + t, query(base, where('teamId', '==', t))] as const), ['me', query(base, where(ownerField, '==', c.uid))] as const];
  const unsubs = qs.map(([k, q]) => onSnapshot(q, (s: any) => { parts[k] = s.docs.map((d: any) => ({ id: d.id, ...(normalizeLegacyFieldValues(d.data()) as any) })); push(); }, (e: any) => { parts[k] = []; push(); onErr(e.message); }));
  return () => unsubs.forEach((u) => u());
}

/** Chỉ nghe ns_lines trong phạm vi được đọc (khớp firestore.rules). */
export function useNsLines(c: VCtx, periods: string[], scope: 'mine' | 'all') {
  const [lines, setLines] = useState<NsLine[]>([]);
  const [err, setErr] = useState<string>('');
  const key = periods.join(',') + scope + c.uid;
  useEffect(() => {
    if (!periods.length) return;
    const base = collection(c.db, NS_COLLECTION);
    // GĐK / Trợ lý Khối: chỉ đọc dòng thuộc Khối mình (rules chặn phần còn lại) → mỗi Khối một listener blockId ==.
    if (scope === 'all' && isKhoiMgr(c)) return scopedByBlock(c, base, (rows) => setLines(rows.filter((l) => periods.includes(l.period))), setErr);
    if (scope === 'all' && isGdkdOnly(c)) return scopedByTeam(c, base, (rows) => setLines(rows.filter((l) => periods.includes(l.period))), setErr);
    const q = scope === 'mine'
      ? query(base, where('ownerUid', '==', c.uid))
      : query(base, where('period', 'in', periods.slice(0, 10)));
    return onSnapshot(q, (s) => setLines(s.docs.map((d) => ({ id: d.id, ...(normalizeLegacyFieldValues(d.data()) as any) })).filter((l) => periods.includes(l.period))), (e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, c.myBlockIds.join(','), c.role === 'gdkd' ? gdkdTeams(c).join(',') : '']);
  return { lines, err };
}

/** blockIds (Báo cáo Khối): chỉ tải báo cáo nộp cho các Khối đó (where blockId ==), không tải toàn hệ thống. */
export function useWeekly(c: VCtx, period: string, scope: 'mine' | 'all', blockIds?: string[]) {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [err, setErr] = useState('');
  const bkey = blockIds ? blockIds.join(',') : '';
  useEffect(() => {
    if (!period) return;
    const base = collection(c.db, WEEKLY_COLLECTION);
    if (scope === 'all' && isGdkdOnly(c)) return scopedByTeam(c, base, (rows) => setReports(rows.filter((r: any) => !r.deleted && r.period === period && (!blockIds || blockIds.includes(r.blockId)))), setErr);
    if (scope === 'all' && blockIds) {
      const inB = new Set(blockIds);
      const ids = isKhoiMgr(c) ? blockIds.filter((b) => c.myBlockIds.includes(b)) : blockIds;
      const parts: Record<string, WeeklyReport[]> = {};
      const push = () => setReports(Object.values(parts).flat().filter((r) => !(r as any).deleted && r.period === period && !!r.blockId && inB.has(r.blockId)));
      if (!ids.length) { setReports([]); return; }
      const unsubs = ids.map((b) => onSnapshot(query(base, where('blockId', '==', b), where('period', '==', period)),
        (s) => { parts[b] = s.docs.map((d) => ({ id: d.id, ...(normalizeLegacyFieldValues(d.data()) as any) })); push(); },
        (e) => { parts[b] = []; push(); setErr(e.message); }));
      return () => unsubs.forEach((u) => u());
    }
    if (scope === 'all' && isKhoiMgr(c)) return scopedByBlock(c, base, (rows) => setReports(rows.filter((r: any) => !r.deleted && r.period === period)), setErr);
    const q = scope === 'mine' ? query(base, where('uid', '==', c.uid)) : query(base, where('period', '==', period));
    return onSnapshot(q, (s) => setReports(s.docs.map((d) => ({ id: d.id, ...(normalizeLegacyFieldValues(d.data()) as any) })).filter((r) => !(r as any).deleted && r.period === period)), (e) => setErr(e.message));
    // Báo cáo Admin đã xoá (deleted=true) không tính vào số Đã nộp / tổng hợp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, scope, c.uid, c.db, c.myBlockIds.join(','), bkey, c.role === 'gdkd' ? gdkdTeams(c).join(',') : '']);
  return { reports, err };
}

/** Thông báo cho user (teamNotifications, đọc theo targetEmails). */
export async function notifyUser(c: VCtx, target: { email?: string; uid?: string }, title: string, message: string, extra: any = {}) {
  if (!target.email) return;
  await addDoc(collection(c.db, 'teamNotifications'), {
    type: 'ns_edit', title, message, targetEmails: [target.email.toLowerCase()], targetUid: target.uid || '',
    createdBy: c.uid, creatorEmail: c.email, createdAt: new Date().toISOString(), readBy: [], ...extra,
  });
}

export function useMyNotifications(c: VCtx) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    if (!c.email) return;
    const q = query(collection(c.db, 'teamNotifications'), where('targetEmails', 'array-contains', c.email.toLowerCase()));
    return onSnapshot(q, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(normalizeLegacyFieldValues(d.data()) as any) })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))), () => {});
  }, [c.email, c.db]);
  return useMemo(() => items, [items]);
}

/** Mảng an toàn: dữ liệu cũ có thể là map {_type:'arrayUnion', value:[...]}, chuỗi, null… */
export const asArr = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray(v.value) ? v.value : []);
