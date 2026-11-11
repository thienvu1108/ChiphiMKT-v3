/**
 * v-next rules: Đăng ký tài khoản / duyệt chức vụ / xin chuyển (accessRequests), khoá Nghiệm thu (ntKeys),
 * quyền theo registry (vnPerm). Run via: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, updateDoc, where, writeBatch, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { approvalUserPatch, type AccessRequest } from '../lib/vnext/onboarding';
import { ntAttributionOps, ntDeleteOps, releaseOrphanNtKey } from '../src/vnext/ntAssign';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: true }).firestore();
const seed = (path: string, data: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path), data); });
const OK = { vnOnboarding: { status: 'approved' } };
const NOW = '2026-10-15T09:00:00.000Z';

const req = (uid: string, over: Partial<AccessRequest> = {}): AccessRequest => ({
  uid, email: `${uid}@x.com`, name: `Tên ${uid}`, kind: 'onboarding', dept: 'kd', position: 'nvkd',
  blockId: 'B1', blockCode: 'E01', teamId: 'T1', teamName: 'MAY-01', teamCode: 'E01.1', status: 'pending', createdAt: NOW, ...over,
});

/** Duyệt như UI: 1 batch = yêu cầu → approved + users patch (+ teams.gdkdUids khi GĐKD). */
async function approve(byUid: string, r: AccessRequest, opts: { team?: string[]; badTeam?: string; badName?: string } = {}) {
  const db = as(byUid);
  const b = writeBatch(db);
  b.update(doc(db, 'accessRequests', r.uid), { status: 'approved', decidedBy: byUid, decidedByName: byUid, decidedAt: NOW });
  const patch: any = approvalUserPatch(r, 'user', byUid, NOW);
  if (opts.badTeam) patch.teamId = opts.badTeam;
  if (opts.badName) patch.fullName = opts.badName;
  b.update(doc(db, 'users', r.uid), patch);
  if (opts.team) b.update(doc(db, 'teams', r.teamId!), { gdkdUids: [...opts.team, r.uid], gdkdApprovedUid: r.uid });
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-chiphi-onb', firestore: { rules: RULES, host: EMU_HOST, port: Number(EMU_PORT) } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
  await seed('users/gdk', { uid: 'gdk', role: 'gd_khoi', email: 'gdk@x.com', assignedBlock: 'E01' });
  await seed('users/gdk2', { uid: 'gdk2', role: 'gd_khoi', email: 'gdk2@x.com', assignedBlock: 'E02' });
  await seed('users/tlk', { uid: 'tlk', role: 'tro_ly_khoi', email: 'tlk@x.com', assignedBlock: 'E01' });
  await seed('users/g1', { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1', teamName: 'MAY-01' });
  await seed('users/g3', { ...OK, uid: 'g3', role: 'gdkd', email: 'g3@x.com', teamId: 'T3', teamName: 'MAY-03' });
  await seed('users/np', { uid: 'np', role: 'user', email: 'np@x.com' });              // mới, chưa đăng ký
  await seed('users/old', { uid: 'old', role: 'user', email: 'old@x.com', teamId: 'T1', teamName: 'MAY-01' }); // cũ, phải đăng ký lại
  await seed('users/u1', { ...OK, uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', teamName: 'MAY-01' });
  await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlk'] });
  await seed('blocks/B2', { name: 'Khối 2', blockCode: 'E02' });
  await seed('teams/T1', { name: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', gdkdUids: ['g1'] });
  await seed('teams/T2', { name: 'MAY-02', teamCode: 'E01.2', blockId: 'B1', gdkdUids: [] });
  await seed('teams/T3', { name: 'MAY-03', teamCode: 'E02.1', blockId: 'B2', gdkdUids: ['g3'] });
  await seed('teams/T4', { name: 'MAY-04', teamCode: 'E01.4', blockId: 'B1', gdkdUids: ['a', 'b', 'c', 'd'] });
  await seed('teams/TX', { name: 'MAY-X', teamCode: 'E01.9', blockId: 'B1', status: 'inactive' });
  await seed('settings/global', { nsUnlockedPeriods: ['2030-01'] });
});

describe('Đăng ký lần đầu — người dùng', () => {
  it('gửi yêu cầu của mình (pending); không tự duyệt; không cho người khác', async () => {
    await assertSucceeds(setDoc(doc(as('np'), 'accessRequests/np'), req('np')));
    await assertFails(setDoc(doc(as('np'), 'accessRequests/np'), { ...req('np'), status: 'approved' }));
    await assertFails(setDoc(doc(as('np'), 'accessRequests/u9'), req('u9')));
    await assertFails(updateDoc(doc(as('np'), 'accessRequests/np'), { status: 'approved', decidedBy: 'np', decidedAt: NOW }));
  });
  it('Phòng phải thuộc Khối đã chọn, đang hoạt động, tên/mã khớp', async () => {
    await assertFails(setDoc(doc(as('np'), 'accessRequests/np'), req('np', { teamId: 'T3', teamName: 'MAY-03', teamCode: 'E02.1' })));
    await assertFails(setDoc(doc(as('np'), 'accessRequests/np'), req('np', { teamId: 'TX', teamName: 'MAY-X', teamCode: 'E01.9' })));
    await assertFails(setDoc(doc(as('np'), 'accessRequests/np'), req('np', { teamName: 'Sai tên' })));
    await assertFails(setDoc(doc(as('np'), 'accessRequests/np'), req('np', { blockCode: 'E02' })));
  });
  it('BO: Ban KD / Phòng Digital, không cần Khối', async () => {
    await assertSucceeds(setDoc(doc(as('np'), 'accessRequests/np'), { uid: 'np', email: 'np@x.com', name: 'BO', kind: 'onboarding', dept: 'bo', position: 'bo_nhan_vien', boUnit: 'digital', status: 'pending', createdAt: NOW }));
    await assertFails(setDoc(doc(as('np'), 'accessRequests/np'), { uid: 'np', email: 'np@x.com', name: 'BO', kind: 'onboarding', dept: 'bo', position: 'bo_nhan_vien', boUnit: 'khac', status: 'pending', createdAt: NOW }));
  });
  it('không tự ghi role / Phòng / trạng thái duyệt', async () => {
    await assertFails(updateDoc(doc(as('np'), 'users/np'), { teamId: 'T1' }));
    await assertFails(updateDoc(doc(as('np'), 'users/np'), { role: 'gdkd' }));
    await assertFails(updateDoc(doc(as('np'), 'users/np'), { vnOnboarding: { status: 'approved' } }));
    await assertSucceeds(updateDoc(doc(as('np'), 'users/np'), { fullName: 'Tên mới' }));
  });
  it('người dùng cũ chưa đăng ký lại: không đăng ký NS / báo cáo tuần', async () => {
    await assertFails(setDoc(doc(as('old'), 'ns_lines/u_2030-01_T1_P1_old'), { period: '2030-01', kind: 'user', teamId: 'T1', projectId: 'P1', ownerUid: 'old', amount: 1, history: [] }));
    await assertFails(setDoc(doc(as('old'), 'weekly_reports/2030-01_1_old'), { period: '2030-01', dot: 1, uid: 'old', items: [] }));
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/u_2030-01_T1_P1_u1'), { period: '2030-01', kind: 'user', teamId: 'T1', projectId: 'P1', ownerUid: 'u1', amount: 1, history: [] }));
  });
});

describe('Duyệt — NVKD', () => {
  it('GĐKD của Phòng duyệt; GĐKD Phòng khác bị chặn; B5: GĐK của Khối duyệt được cả Phòng đã có GĐKD', async () => {
    await seed('accessRequests/np', req('np'));
    await assertFails(approve('g3', req('np')));
    await assertSucceeds(approve('g1', req('np')));
    await seed('accessRequests/np', req('np'));
    await assertSucceeds(approve('gdk', req('np')));
  });
  it('Phòng chưa có GĐKD: GĐK của Khối hoặc Admin duyệt', async () => {
    const r = req('np', { teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' });
    await seed('accessRequests/np', r);
    await assertFails(approve('gdk2', r));
    await assertSucceeds(approve('gdk', r));
  });
  it('người duyệt không được ghi Phòng khác với yêu cầu', async () => {
    await seed('accessRequests/np', req('np'));
    await assertFails(approve('g1', req('np'), { badTeam: 'T2' }));
  });
  it('Từ chối bắt buộc lý do', async () => {
    await seed('accessRequests/np', req('np'));
    await assertFails(updateDoc(doc(as('g1'), 'accessRequests/np'), { status: 'rejected', decidedBy: 'g1', decidedAt: NOW }));
    await assertSucceeds(updateDoc(doc(as('g1'), 'accessRequests/np'), { status: 'rejected', decidedBy: 'g1', decidedAt: NOW, reason: 'Không thuộc Phòng' }));
  });
  it('Không ghi users khi yêu cầu không chuyển sang approved trong cùng batch', async () => {
    await seed('accessRequests/np', req('np'));
    await assertFails(updateDoc(doc(as('g1'), 'users/np'), approvalUserPatch(req('np'), 'user', 'g1', NOW)));
  });
});

describe('Duyệt — GĐKD (tối đa 4/Phòng), Trợ lý Khối, GĐ Khối, BO', () => {
  it('GĐK của Khối duyệt GĐKD + thêm vào gdkdUids; GĐKD khác / GĐK khác bị chặn', async () => {
    const r = req('np', { position: 'gdkd' });
    await seed('accessRequests/np', r);
    await assertFails(approve('g1', r, { team: ['g1'] }));
    await assertFails(approve('gdk2', r, { team: ['g1'] }));
    await assertSucceeds(approve('gdk', r, { team: ['g1'] }));
  });
  it('GĐKD thứ 5 bị chặn (cả Admin)', async () => {
    const r = req('np', { position: 'gdkd', teamId: 'T4', teamName: 'MAY-04', teamCode: 'E01.4' });
    await seed('accessRequests/np', r);
    await assertFails(approve('gdk', r, { team: ['a', 'b', 'c', 'd'] }));
    await assertFails(approve('adm', r, { team: ['a', 'b', 'c', 'd'] }));
    await assertSucceeds(updateDoc(doc(as('gdk'), 'accessRequests/np'), { status: 'rejected', decidedBy: 'gdk', decidedAt: NOW, reason: 'Phòng đã đủ 4 GĐKD' }));
  });
  it('Trợ lý Khối: GĐK / Trợ lý cùng Khối duyệt; Khối khác không', async () => {
    const r = req('np', { position: 'tro_ly_khoi', teamId: undefined, teamName: undefined, teamCode: undefined });
    delete (r as any).teamId; delete (r as any).teamName; delete (r as any).teamCode;
    await seed('accessRequests/np', r);
    await seed('users/tlk2', { uid: 'tlk2', role: 'tro_ly_khoi', email: 'tlk2@x.com', assignedBlock: 'E02' });
    await assertFails(approve('tlk2', r));
    await assertSucceeds(approve('tlk', r));
  });
  it('GĐ Khối và BO: chỉ Admin', async () => {
    const r = req('np', { position: 'gd_khoi' }); delete (r as any).teamId; delete (r as any).teamName; delete (r as any).teamCode;
    await seed('accessRequests/np', r);
    await assertFails(approve('gdk', r));
    await assertSucceeds(approve('adm', r));
    const bo: any = { uid: 'old', email: 'old@x.com', name: 'BO', kind: 'onboarding', dept: 'bo', position: 'bo_truong_ban', boUnit: 'ban_kd', status: 'pending', createdAt: NOW };
    await seed('accessRequests/old', bo);
    await assertFails(updateDoc(doc(as('gdk'), 'accessRequests/old'), { status: 'approved', decidedBy: 'gdk', decidedAt: NOW }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'accessRequests/old'), { status: 'approved', decidedBy: 'adm', decidedAt: NOW }));
  });
  it('GĐK thấy danh sách chờ duyệt của Khối mình, không thấy Khối khác', async () => {
    await seed('accessRequests/np', req('np'));
    await assertSucceeds(getDocs(query(collection(as('gdk'), 'accessRequests'), where('blockId', '==', 'B1'), where('status', '==', 'pending'))));
    await assertFails(getDocs(query(collection(as('gdk'), 'accessRequests'), where('blockId', '==', 'B2'), where('status', '==', 'pending'))));
    await assertSucceeds(getDocs(query(collection(as('g1'), 'accessRequests'), where('teamId', '==', 'T1'), where('status', '==', 'pending'))));
    await assertFails(getDocs(query(collection(as('g1'), 'accessRequests'), where('teamId', '==', 'T2'), where('status', '==', 'pending'))));
  });
});

describe('Xin chuyển Phòng / Khối — đã bỏ (chỉ Admin chuyển Phòng)', () => {
  const tr = () => req('u1', { kind: 'transfer', teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2', fromTeamId: 'T1', fromBlockId: 'B1' });
  it('user đã duyệt không còn gửi được yêu cầu xin chuyển', async () => {
    await assertFails(setDoc(doc(as('u1'), 'accessRequests/u1'), tr()));
    await assertFails(setDoc(doc(as('old'), 'accessRequests/old'), req('old', { kind: 'transfer', fromTeamId: 'T1' })));
  });
  it('yêu cầu xin chuyển cũ còn treo: GĐK / GĐKD không duyệt được; người gửi huỷ được; Admin duyệt được', async () => {
    await seed('accessRequests/u1', tr());
    await assertFails(approve('gdk', tr()));
    await assertFails(updateDoc(doc(as('gdk'), 'accessRequests/u1'), { status: 'approved', decidedBy: 'gdk', decidedAt: NOW }));
    await assertSucceeds(approve('adm', tr()));
  });
  it('người gửi vẫn huỷ được yêu cầu xin chuyển cũ', async () => {
    await seed('accessRequests/u1', tr());
    await assertSucceeds(updateDoc(doc(as('u1'), 'accessRequests/u1'), { status: 'cancelled' }));
  });
});

describe('Nghiệm thu — 1 bản ghi / user / dự án / tháng (ntKeys)', () => {
  const rec = (impl: string) => ({ projectId: 'P1', teamId: 'T1', month: '2026-11', ntMonth: '2026-11', implementerUid: impl, implementerName: impl, status: 'Đã nghiệm thu' });
  it('Mod tạo bản ghi + khoá; bản ghi thứ 2 cùng khoá bị chặn', async () => {
    const db = as('mod');
    const b = writeBatch(db);
    b.set(doc(db, 'acceptances/A1'), rec('u1'));
    b.set(doc(db, 'ntKeys/2026-11_u1_P1'), { acceptanceId: 'A1', month: '2026-11', uid: 'u1', projectId: 'P1', createdAt: NOW });
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(db, 'acceptances/A2'), rec('u1')));
    const b2 = writeBatch(db);
    b2.set(doc(db, 'acceptances/A2'), rec('u1'));
    b2.set(doc(db, 'ntKeys/2026-11_u1_P1'), { acceptanceId: 'A2', month: '2026-11', uid: 'u1', projectId: 'P1', createdAt: NOW });
    await assertFails(b2.commit());
  });
  // Hồi quy 25/10/2026 (Mod «Lỗi khi lưu bản ghi nghiệm thu»): xoá bản ghi trước đây KHÔNG xoá ntKeys → khoá mồ côi
  // chặn tạo lại cùng người + dự án + tháng (set khoá = update → bị chặn → cả batch lỗi).
  const att = (id: string) => ({ uid: 'u1', name: 'u1', teamId: 'T1', blockId: 'B1', month: '2026-11', projectId: 'P1' });
  async function createLikeApp(db: any, id: string) {
    const b = writeBatch(db); const attr = ntAttributionOps(db as any, b, id, {}, att(id)); b.set(doc(db, 'acceptances/' + id), { ...rec('u1'), ...attr }); return b.commit();
  }
  it('khoá mồ côi (bản ghi đã xoá) → tạo lại bị chặn; releaseOrphanNtKey gỡ khoá → tạo được', async () => {
    await seed('ntKeys/2026-11_u1_P1', { acceptanceId: 'GONE', month: '2026-11', uid: 'u1', projectId: 'P1', createdAt: NOW });
    const db = as('mod');
    await assertFails(createLikeApp(db, 'A5'));
    expect(await releaseOrphanNtKey(db as any, 'A5', att('A5'))).toBe(true);
    await assertSucceeds(createLikeApp(db, 'A5'));
  });
  it('releaseOrphanNtKey KHÔNG gỡ khoá của bản ghi còn tồn tại', async () => {
    const db = as('mod');
    await assertSucceeds(createLikeApp(db, 'A6'));
    expect(await releaseOrphanNtKey(db as any, 'A7', att('A7'))).toBe(false);
    await assertFails(createLikeApp(db, 'A7'));
  });
  it('xoá bản ghi (ntDeleteOps) xoá luôn khoá → tạo lại được; bản ghi cũ không có khoá vẫn xoá được', async () => {
    const db = as('mod');
    await assertSucceeds(createLikeApp(db, 'A8'));
    const b = writeBatch(db); ntDeleteOps(db as any, b, { id: 'A8', ...rec('u1') }); await assertSucceeds(b.commit());
    let k = true; await env.withSecurityRulesDisabled(async (c) => { k = (await getDoc(doc(c.firestore(), 'ntKeys/2026-11_u1_P1'))).exists(); });
    expect(k).toBe(false);
    await assertSucceeds(createLikeApp(db, 'A9'));
    await seed('acceptances/OLD', rec('u2'));
    const b2 = writeBatch(db); ntDeleteOps(db as any, b2, { id: 'OLD', ...rec('u2') }); await assertSucceeds(b2.commit());
  });
  it('bản ghi không có người phụ trách (dữ liệu cũ) không cần khoá', async () => {
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/A3'), { projectId: 'P1', teamId: 'T1', month: '09.2026' }));
  });
});

describe('Quyền theo registry (vnPerm)', () => {
  const img = { acceptanceId: 'A1', provider: 'firestore', ref: 'x', name: 'n', order: 1 };
  it('Mod mặc định được tải ảnh; Admin tắt trong Phân quyền (knownKeys) → bị chặn', async () => {
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptanceImages/i1'), img));
    await seed('rolePermissions/mod', { role: 'mod', permissions: ['report_nt.view'], knownKeys: ['vn.nt_images.upload'] });
    await assertFails(setDoc(doc(as('mod'), 'acceptanceImages/i2'), img));
  });
  it('doc rolePermissions cũ (không knownKeys) → khoá mới theo mặc định registry', async () => {
    await seed('rolePermissions/mod', { role: 'mod', permissions: ['report_nt.view'] });
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptanceImages/i3'), img));
  });
  it('GĐK không tải ảnh (không phải Admin/Mod)', async () => {
    await assertFails(setDoc(doc(as('gdk'), 'acceptanceImages/i4'), img));
  });
});

describe('Kết nối Google Drive (driveOAuth/main)', () => {
  const d = { enc: 'v1.aaa.bbb.ccc', email: 'phong@x.com', rootUrl: '', connectedBy: 'adm', connectedAt: NOW, updatedAt: NOW };
  it('chỉ Admin ghi; chỉ chuỗi mã hoá v1; không list', async () => {
    await assertFails(setDoc(doc(as('mod'), 'driveOAuth/main'), d));
    await assertFails(setDoc(doc(as('adm'), 'driveOAuth/main'), { ...d, enc: 'plain-refresh-token' }));
    await assertFails(setDoc(doc(as('adm'), 'driveOAuth/main'), { ...d, refreshToken: 'x' }));
    await assertSucceeds(setDoc(doc(as('adm'), 'driveOAuth/main'), d));
    await assertFails(getDocs(collection(as('adm'), 'driveOAuth')));
  });
  it('yêu cầu đăng ký của chính mình đọc được kể cả khi chưa tồn tại', async () => {
    const { getDoc } = await import('firebase/firestore');
    await assertSucceeds(getDoc(doc(as('np'), 'accessRequests/np')));
    await assertFails(getDoc(doc(as('np'), 'accessRequests/u1')));
  });
});

describe('Tên đăng ký', () => {
  it('duyệt lưu fullName/displayName = tên nhập khi đăng ký; không cho đổi sang tên khác', async () => {
    await seed('accessRequests/np', req('np'));
    await assertFails(approve('g1', req('np'), { badName: 'Tên giả' }));
    await assertSucceeds(approve('g1', req('np')));
    let u: any; await env.withSecurityRulesDisabled(async (c) => { u = (await getDoc(doc(c.firestore(), 'users/np'))).data(); });
    expect(u?.fullName).toBe('Tên np'); expect(u?.displayName).toBe('Tên np');
  });
});

describe('GĐ Khối kiêm GĐKD', () => {
  beforeEach(async () => {
    // gdk2 (Khối B2) kiêm GĐKD Phòng T1 (Khối B1); gdkM: hồ sơ đã chuyển UID, UID cũ 'gdkOld' trong gdkdUids của T2.
    await seed('teams/T1', { name: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', gdkdUids: ['g1', 'gdk2'] });
    await seed('teams/T2', { name: 'MAY-02', teamCode: 'E01.2', blockId: 'B1', gdkdUids: ['g9', 'gdkOld'] });
    await seed('users/gdkM', { uid: 'gdkM', role: 'gd_khoi', email: 'gdkM@x.com', migratedFromUid: 'gdkOld' });
    await seed('users/n2', { uid: 'n2', role: 'user', email: 'n2@x.com' });
    await seed('accessRequests/n2', req('n2'));
    await seed('accessRequests/n3', req('n3', { teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' }));
    await seed('users/n3', { uid: 'n3', role: 'user', email: 'n3@x.com' });
  });
  it('duyệt NVKD của Phòng mình kiêm; B5: GĐK của Khối duyệt NVKD mọi Phòng trong Khối', async () => {
    await assertSucceeds(approve('gdk2', req('n2')));
    await assertSucceeds(approve('gdk', req('n3', { teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' })));
  });
  it('UID cũ (migratedFromUid) vẫn là GĐKD của Phòng', async () => {
    await assertSucceeds(approve('gdkM', req('n3', { teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' })));
  });
  it('live-shape: GĐK của chính Khối (UID cũ là director) + rolePermissions không knownKeys', async () => {
    await seed('blocks/B1', { name: 'K1', blockCode: 'E01', directorUid: 'gdkOld', assistantUids: [] });
    await seed('rolePermissions/gd_khoi', { permissions: ['block.view', 'block.approve'] });
    await assertSucceeds(approve('gdkM', req('n3', { teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' })));
  });
  it('đọc yêu cầu theo Phòng kiêm', async () => {
    await assertSucceeds(getDocs(query(collection(as('gdk2'), 'accessRequests'), where('teamId', '==', 'T1'))));
    await assertFails(getDocs(query(collection(as('gdk2'), 'accessRequests'), where('teamId', '==', 'T2'))));
  });

  it('GĐK kiêm GĐKD: tạo/sửa NS user của chính mình tại Phòng kiêm; không tại Phòng khác', async () => {
    const p = '2030-01';
    await seed('users/gdk2', { uid: 'gdk2', role: 'gd_khoi', email: 'gdk2@x.com', assignedBlock: 'E02', vnOnboarding: { status: 'approved' } });
    const id = `u_${p}_T1_P1_gdk2`;
    await assertSucceeds(setDoc(doc(as('gdk2'), 'ns_lines/' + id), { period: p, kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', ownerUid: 'gdk2', amount: 1000, history: [] }));
    await assertSucceeds(updateDoc(doc(as('gdk2'), 'ns_lines/' + id), { amount: 2000 }));
    await assertFails(setDoc(doc(as('gdk2'), `ns_lines/u_${p}_T2_P1_gdk2`), { period: p, kind: 'user', teamId: 'T2', blockId: 'B1', projectId: 'P1', ownerUid: 'gdk2', amount: 1000, history: [] }));
  });
  it('GĐK không kiêm: vẫn không tạo NS user', async () => {
    const p = '2030-01';
    await assertFails(setDoc(doc(as('gdk'), `ns_lines/u_${p}_T1_P1_gdk`), { period: p, kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', ownerUid: 'gdk', amount: 1000, history: [] }));
  });
  it('đã bỏ NS bổ sung GĐKD; vẫn đọc NS Phòng kiêm', async () => {
    const p = '2030-01';
    await assertFails(setDoc(doc(as('gdk2'), `ns_lines/p_${p}_T1_P1`), { period: p, kind: 'gdkd', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 1000, actingAs: 'gdkd', actingRole: 'gd_khoi', history: [] }));
    await assertFails(setDoc(doc(as('gdk2'), `ns_lines/p_${p}_T2_P1`), { period: p, kind: 'gdkd', teamId: 'T2', blockId: 'B1', projectId: 'P1', amount: 1000, history: [] }));
    await assertSucceeds(getDocs(query(collection(as('gdk2'), 'ns_lines'), where('teamId', '==', 'T1'))));
  });
});

describe('Trợ lý Khối = quyền GĐK trong Khối mình', () => {
  it('duyệt GĐKD (+gdkdUids) và NVKD Phòng chưa có GĐKD; Khối khác thì không', async () => {
    const r = req('np', { position: 'gdkd', teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' });
    await seed('accessRequests/np', r);
    await seed('users/tlk2', { uid: 'tlk2', role: 'tro_ly_khoi', email: 'tlk2@x.com', assignedBlock: 'E02' });
    await assertFails(approve('tlk2', r, { team: [] }));
    await assertSucceeds(approve('tlk', r, { team: [] }));
    const n = req('old', { teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' });
    await seed('teams/T2', { name: 'MAY-02', teamCode: 'E01.2', blockId: 'B1', gdkdUids: [] });
    await seed('accessRequests/old', n);
    await assertSucceeds(approve('tlk', n));
  });
  it('Trợ lý qua assistantUids (UID cũ đã chuyển) + đọc yêu cầu Khối mình', async () => {
    await seed('users/tlkM', { uid: 'tlkM', role: 'tro_ly_khoi', email: 'tlkM@x.com', migratedFromUid: 'tlkOld' });
    await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlkOld'] });
    const r = req('np', { position: 'gdkd', teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' });
    await seed('accessRequests/np', r);
    await assertSucceeds(getDocs(query(collection(as('tlkM'), 'accessRequests'), where('blockId', '==', 'B1'))));
    await assertSucceeds(approve('tlkM', r, { team: [] }));
  });
  it('rolePermissions tắt vn.approvals.review cho Trợ lý → không duyệt', async () => {
    await seed('rolePermissions/tro_ly_khoi', { permissions: [], knownKeys: ['vn.approvals.review'] });
    const r = req('np', { position: 'gdkd', teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' });
    await seed('accessRequests/np', r);
    await assertFails(approve('tlk', r, { team: [] }));
  });
  it('đã bỏ NS bổ sung GĐK (Trợ lý cũng không nhập)', async () => {
    const p = '2030-01';
    await assertFails(setDoc(doc(as('tlk'), `ns_lines/k_${p}_B1_P1`), { period: p, kind: 'gdk', blockId: 'B1', projectId: 'P1', amount: 1000, actingAs: 'gdk', history: [] }));
    await assertFails(setDoc(doc(as('tlk'), `ns_lines/k_${p}_B2_P1`), { period: p, kind: 'gdk', blockId: 'B2', projectId: 'P1', amount: 1000, history: [] }));
  });
});

describe('Duyệt lại GĐKD đã bị gỡ khỏi cùng Phòng', () => {
  it('GĐK và Trợ lý duyệt lại được (gdkdApprovedUid cũ = cùng uid)', async () => {
    for (const by of ['gdk', 'tlk']) {
      await seed('teams/T2', { name: 'MAY-02', teamCode: 'E01.2', blockId: 'B1', gdkdUids: [], gdkdApprovedUid: 'np' });
      await seed('users/np', { uid: 'np', role: 'user', email: 'np@x.com' });
      const r = req('np', { position: 'gdkd', teamId: 'T2', teamName: 'MAY-02', teamCode: 'E01.2' });
      await seed('accessRequests/np', r);
      await assertSucceeds(approve(by, r, { team: [] }));
    }
  });
});

it('BO submits and Admin approves complete onboarding without userKyc', async () => {
 const r: AccessRequest = {uid:'np',email:'np@x.com',name:'BO mẫu',kind:'onboarding',dept:'bo',position:'bo_nhan_vien',boUnit:'digital',status:'pending',createdAt:NOW};
 await assertSucceeds(setDoc(doc(as('np'),'accessRequests/np'),r));
 await assertSucceeds(approve('adm',r));
});
