/** nsLineHistory (lịch sử bản đăng ký NS MKT, append-only) + nsSupport đọc cho Trưởng Ban. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const OK = { vnOnboarding: { status: 'approved' } };
const K = (uid: string, by = uid) => ({ uid, cccd: '001099012345', bankAccount: '0123456789', bankName: 'Vietcombank', accountHolder: 'NGUYỄN VĂN ' + uid.toUpperCase(), fullName: 'N ' + uid, updatedAt: 'x', updatedBy: by });
const LID = 'u_2026-11_T1_P1_u1', LID2 = 'u_2026-11_T2_P1_u2';
const SUP = (by: string, over: any = {}) => ({ lineId: LID, period: '2026-11', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 5000000, status: 'approved', decidedBy: by, decidedByName: by, decidedAt: 'x', history: [], ...over });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-hist', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlk'] });
  await seed('blocks/B2', { name: 'Khối 2', blockCode: 'E02', directorUid: 'gdk2', assistantUids: [] });
  await seed('teams/T1', { name: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', gdkdUids: ['g1'] });
  await seed('teams/T2', { name: 'MAY-02', teamCode: 'E02.1', blockId: 'B2', gdkdUids: [] });
  for (const [u, r] of [['adm', 'admin'], ['mod', 'mod'], ['kt', 'accountant'], ['gdk', 'gd_khoi'], ['tlk', 'tro_ly_khoi'], ['gdk2', 'gd_khoi']]) await seed('users/' + u, { uid: u, role: r, email: u + '@x.com' });
  await seed('users/g1', { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1', teamName: 'MAY-01' });
  await seed('users/u1', { ...OK, uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', teamName: 'MAY-01' });
  await seed('users/u2', { ...OK, uid: 'u2', role: 'user', email: 'u2@x.com', teamId: 'T2', teamName: 'MAY-02' });
  await seed('userKyc/u1', K('u1'));
  await seed('userKyc/u2', K('u2'));
  await seed('ns_lines/' + LID, { period: '2026-11', kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', ownerUid: 'u1', ownerName: 'U1', amount: 5000000 });
  await seed('ns_lines/' + LID2, { period: '2026-11', kind: 'user', teamId: 'T2', blockId: 'B2', projectId: 'P1', ownerUid: 'u2', ownerName: 'U2', amount: 3000000 });
});
const HI = (by: string, over: any = {}) => ({ lineId: LID, period: '2026-11', kind: 'user', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', projectId: 'P1', action: 'update', changes: [{ field: 'amount', from: '5000000', to: '6000000' }], byUid: by, byName: by, byRole: 'x', at: '2026-11-03T00:00:00Z', ...over });
describe('nsLineHistory — chỉ ghi thêm', () => {
  it('người đăng ký ghi create/update/delete dòng của mình; không dòng người khác', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'nsLineHistory/h1'), HI('u1', { action: 'create' })));
    await assertSucceeds(setDoc(doc(as('u1'), 'nsLineHistory/h2'), HI('u1')));
    await assertFails(setDoc(doc(as('u2'), 'nsLineHistory/h3'), HI('u2')));
    await assertFails(setDoc(doc(as('u1'), 'nsLineHistory/h4'), HI('u2')));
  });
  it('người đăng ký KHÔNG tự ghi quyết định duyệt', async () => {
    await assertFails(setDoc(doc(as('u1'), 'nsLineHistory/h5'), HI('u1', { action: 'approved' })));
  });
  it('GĐK / Trợ lý Khối ghi quyết định Khối mình; GĐK Khối khác / GĐKD không', async () => {
    await assertSucceeds(setDoc(doc(as('gdk'), 'nsLineHistory/h6'), HI('gdk', { action: 'approved', changes: [] })));
    await assertSucceeds(setDoc(doc(as('tlk'), 'nsLineHistory/h7'), HI('tlk', { action: 'rejected', reason: 'Thiếu chứng từ', changes: [] })));
    await assertFails(setDoc(doc(as('gdk2'), 'nsLineHistory/h8'), HI('gdk2', { action: 'approved' })));
    await assertFails(setDoc(doc(as('g1'), 'nsLineHistory/h9'), HI('g1', { action: 'approved' })));
    await assertSucceeds(setDoc(doc(as('g1'), 'nsLineHistory/h10'), HI('g1', { reason: 'GĐKD chỉnh' })));
  });
  it('định danh phải khớp dòng NS; byUid = người ghi; không trường lạ', async () => {
    await assertFails(setDoc(doc(as('u1'), 'nsLineHistory/x1'), HI('u1', { blockId: 'B2' })));
    await assertFails(setDoc(doc(as('u1'), 'nsLineHistory/x2'), HI('u1', { ownerUid: 'u2' })));
    await assertFails(setDoc(doc(as('u1'), 'nsLineHistory/x3'), HI('u1', { lineId: 'khong_co' })));
    await assertFails(setDoc(doc(as('u1'), 'nsLineHistory/x4'), HI('u1', { extra: 1 })));
    await assertFails(setDoc(doc(as('u1'), 'nsLineHistory/x5'), HI('u1', { action: 'hack' })));
    await assertFails(setDoc(doc(as('gdk'), 'nsLineHistory/x6'), HI('u1', { action: 'approved' })));
  });
  it('KHÔNG ai sửa / xoá — kể cả Admin, kể cả chính người ghi', async () => {
    await seed('nsLineHistory/h1', HI('u1'));
    for (const u of ['u1', 'gdk', 'adm']) {
      await assertFails(setDoc(doc(as(u), 'nsLineHistory/h1'), HI(u, { at: 'z' })));
      await assertFails(deleteDoc(doc(as(u), 'nsLineHistory/h1')));
    }
  });
  it('đọc: chủ dòng, GĐK/Trợ lý Khối của Khối, GĐKD Phòng, Admin; không user khác / Khối khác', async () => {
    await seed('nsLineHistory/h1', HI('u1'));
    await assertSucceeds(getDocs(query(collection(as('u1'), 'nsLineHistory'), where('lineId', '==', LID), where('ownerUid', '==', 'u1'))));
    await assertSucceeds(getDocs(query(collection(as('gdk'), 'nsLineHistory'), where('lineId', '==', LID), where('blockId', '==', 'B1'))));
    await assertSucceeds(getDocs(query(collection(as('tlk'), 'nsLineHistory'), where('lineId', '==', LID), where('blockId', '==', 'B1'))));
    await assertSucceeds(getDocs(query(collection(as('g1'), 'nsLineHistory'), where('lineId', '==', LID), where('teamId', '==', 'T1'))));
    await assertSucceeds(getDocs(query(collection(as('adm'), 'nsLineHistory'), where('lineId', '==', LID))));
    await assertFails(getDoc(doc(as('u2'), 'nsLineHistory/h1')));
    await assertFails(getDocs(query(collection(as('gdk2'), 'nsLineHistory'), where('lineId', '==', LID), where('blockId', '==', 'B1'))));
  });
});
describe('nsSupport — Trưởng Ban đọc trạng thái (Ngân sách Ban)', () => {
  it('truong_ban_kd đọc; user khác không', async () => {
    await seed('users/tb', { uid: 'tb', role: 'truong_ban_kd', email: 'tb@x.com' });
    await seed('projects/P1', { name: 'DA1', banKdId: 'BAN1', banKdName: 'Ban 1' });
    await seed('ban_kd/BAN1', { name: 'Ban 1', leaderUid: 'tb', deputyUids: [] });
    await seed('nsSupport/' + LID, { lineId: LID, period: '2026-11', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 5000000, status: 'approved', decidedBy: 'gdk', decidedByName: 'g', decidedAt: 'x' });
    await assertSucceeds(getDocs(query(collection(as('tb'), 'nsSupport'), where('projectId', 'in', ['P1']))));
    await assertFails(getDoc(doc(as('u2'), 'nsSupport/' + LID)));
  });
});
describe('userKyc nhiều tài khoản (tối đa 3)', () => {
  const A = (id: string, acc: string) => ({ id, bankName: 'ACB', bankAccount: acc, accountHolder: 'NGUYỄN VĂN U1' });
  const base = { ...K('u1'), defaultAccountId: 'a1' };
  it('lưu 1–3 tài khoản hợp lệ; 4 TK / trùng id / STK sai / chữ thường bị chặn', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'userKyc/u1'), { ...base, accounts: [A('a1', '0123456789')] }));
    await assertSucceeds(setDoc(doc(as('u1'), 'userKyc/u1'), { ...base, accounts: [A('a1', '0123456789'), A('a2', '99887766'), A('a3', '11223344')] }));
    await assertFails(setDoc(doc(as('u1'), 'userKyc/u1'), { ...base, accounts: [A('a1', '0123456789'), A('a2', '99887766'), A('a3', '11223344'), A('a4', '55667788')] }));
    await assertFails(setDoc(doc(as('u1'), 'userKyc/u1'), { ...base, accounts: [A('a1', '0123456789'), A('a1', '99887766')] }));
    await assertFails(setDoc(doc(as('u1'), 'userKyc/u1'), { ...base, accounts: [A('a1', '12a')] }));
    await assertFails(setDoc(doc(as('u1'), 'userKyc/u1'), { ...base, accounts: [{ ...A('a1', '0123456789'), accountHolder: 'Nguyễn' }] }));
    await assertFails(setDoc(doc(as('u1'), 'userKyc/u1'), { ...base, accounts: [] }));
  });
  it('dữ liệu cũ 1 tài khoản (không có accounts) vẫn lưu được', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'userKyc/u1'), K('u1')));
  });
});
