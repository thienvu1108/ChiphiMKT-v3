/** Đã bỏ chuyển Phòng ở Quản lý Khối / Phòng KD: GĐ Khối / Trợ lý / GĐKD không sửa Phòng (teamId/teamName/teamCode) của user có sẵn;
 *  chỉ còn ghi Phòng khi duyệt ĐĂNG KÝ lần đầu vào đúng Phòng đã chọn. Chỉ Admin / Super Admin chuyển Phòng. Run via: npm run test:firestore-rules */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const OK = { vnOnboarding: { status: 'approved' } };
const OB = (uid: string, over: any = {}) => ({ uid, email: uid + '@x.com', name: 'Tên ' + uid, kind: 'onboarding', dept: 'kd', status: 'pending', position: 'nvkd', teamId: 'T1', teamName: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', blockCode: 'E01', createdAt: 'x', ...over });
const decide = (by: string, uid: string, patch: any) => { const db = as(by); const b = writeBatch(db);
  b.update(doc(db, 'accessRequests', uid), { status: 'approved', decidedBy: by, decidedAt: 'x' });
  b.update(doc(db, 'users', uid), { updatedAt: 'x', ...patch }); return b.commit(); };
const nvkdPatch = (over: any = {}) => ({ role: 'user', teamId: 'T1', teamName: 'MAY-01', teamCode: 'E01.1', vnOnboarding: { status: 'approved', position: 'nvkd', teamId: 'T1', blockId: 'B1' }, ...over });
const mv = (by: string, uid: string, t: string, name: string, code = '') => updateDoc(doc(as(by), 'users', uid), { teamId: t, teamName: name, teamCode: code, updatedAt: 'x' });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-khoi-team', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlk'] });
  await seed('blocks/B2', { name: 'Khối 2', blockCode: 'E02', directorUid: 'gdk2', assistantUids: [] });
  await seed('blocks/B3', { name: 'Khối 3 (chưa có GĐ)', blockCode: 'E03' });
  await seed('teams/T1', { name: 'MAY-01', teamCode: 'E01.1', blockId: 'B1' });
  await seed('teams/T1b', { name: 'MAY-01B', teamCode: 'E01.2', blockId: 'B1' });
  await seed('teams/T2', { name: 'MAY-02', teamCode: 'E02.1', blockId: 'B2' });
  await seed('teams/T3', { name: 'MAY-03', teamCode: 'E03.1', blockId: 'B3' });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
  await seed('users/kt', { uid: 'kt', role: 'accountant', email: 'kt@x.com' });
  await seed('users/gdk', { uid: 'gdk', role: 'gd_khoi', email: 'gdk@x.com', assignedBlock: 'E01' });
  await seed('users/tlk', { uid: 'tlk', role: 'tro_ly_khoi', email: 'tlk@x.com', assignedBlock: 'E01' });
  await seed('users/gdk3', { uid: 'gdk3', role: 'gd_khoi', email: 'gdk3@x.com', assignedBlock: 'E03' });
  await seed('users/g1', { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1', teamName: 'MAY-01' });
  await seed('users/u1', { ...OK, uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', teamName: 'MAY-01', teamCode: 'E01.1' });
  await seed('users/u2', { ...OK, uid: 'u2', role: 'user', email: 'u2@x.com', teamId: 'T2', teamName: 'MAY-02', teamCode: 'E02.1' });
  await seed('users/u3', { ...OK, uid: 'u3', role: 'user', email: 'u3@x.com', teamId: 'T3', teamName: 'MAY-03' });
  await seed('users/uob', { uid: 'uob', role: 'user', email: 'uob@x.com', vnOnboarding: { status: 'pending', blockId: 'B1' } });
  await seed('users/unone', { uid: 'unone', role: 'user', email: 'unone@x.com' });
  await seed('users/gx', { ...OK, uid: 'gx', role: 'gdkd', email: 'gx@x.com', teamId: 'T1', teamName: 'MAY-01' });
});
describe('users team fields — chỉ Admin / Super Admin; Mod / Kế toán / GĐ Khối / Trợ lý / GĐKD không chuyển Phòng', () => {
  it('GĐ Khối / Trợ lý: không chuyển, không bỏ Phòng, không gán Phòng — kể cả user Khối mình', async () => {
    for (const by of ['gdk', 'tlk']) {
      await assertFails(mv(by, 'u1', 'T1b', 'MAY-01B', 'E01.2'));
      await assertFails(mv(by, 'u1', '', '', ''));
      await assertFails(mv(by, 'uob', 'T1', 'MAY-01', 'E01.1'));
      await assertFails(mv(by, 'u2', 'T1', 'MAY-01', 'E01.1'));
      await assertFails(updateDoc(doc(as(by), 'users', 'u1'), { teamName: 'MAY-01B' }));
      await assertFails(updateDoc(doc(as(by), 'users', 'u1'), { teamCode: 'E01.2' }));
    }
    await assertFails(mv('gdk3', 'u3', '', '', ''));
  });
  it('GĐKD: không chuyển / bỏ Phòng user cùng Phòng hay Phòng khác', async () => {
    await assertFails(mv('gx', 'u1', 'T1', 'MAY-01', 'E01.1'));
    await assertFails(mv('gx', 'u1', 'T1b', 'MAY-01B', 'E01.2'));
    await assertFails(mv('g1', 'u1', '', '', ''));
    await assertFails(mv('gx', 'u2', 'T1', 'MAY-01', 'E01.1'));
  });
  it('Mod / Kế toán: không chuyển / bỏ Phòng / sửa tên-mã Phòng của ai', async () => {
    for (const by of ['mod', 'kt']) {
      await assertFails(mv(by, 'u2', 'T3', 'MAY-03', 'E03.1'));
      await assertFails(mv(by, 'u1', '', '', ''));
      await assertFails(mv(by, 'g1', 'T1b', 'MAY-01B', 'E01.2'));
      await assertFails(mv(by, 'adm', 'T1', 'MAY-01', 'E01.1'));
      await assertFails(updateDoc(doc(as(by), 'users', 'u1'), { teamName: 'MAY-01B' }));
      await assertFails(updateDoc(doc(as(by), 'users', 'u1'), { teamCode: 'E01.2' }));
    }
  });
  it('Admin / Super Admin chuyển được (user, GĐKD, bỏ Phòng)', async () => {
    await seed('users/sup', { uid: 'sup', role: 'super_admin', email: 'sup@x.com' });
    await assertSucceeds(mv('adm', 'u2', 'T1', 'MAY-01', 'E01.1'));
    await assertSucceeds(mv('adm', 'g1', 'T1b', 'MAY-01B', 'E01.2'));
    await assertSucceeds(mv('sup', 'u3', 'T2', 'MAY-02', 'E02.1'));
    await assertSucceeds(mv('sup', 'u1', '', '', ''));
  });
  it('Mod / Kế toán vẫn làm được việc khác: Kế toán xoá user thường; đổi tên khi được cấp quyền', async () => {
    await assertSucceeds(deleteDoc(doc(as('kt'), 'users', 'unone')));
    await assertFails(deleteDoc(doc(as('mod'), 'users', 'u3')));
  });
  it('vẫn duyệt được ĐĂNG KÝ lần đầu vào đúng Phòng đã chọn (GĐ Khối, Trợ lý; GĐKD: NVKD Phòng mình)', async () => {
    await seed('accessRequests/unone', OB('unone'));
    await assertSucceeds(decide('gdk', 'unone', nvkdPatch()));
    await seed('users/un2', { uid: 'un2', role: 'user', email: 'un2@x.com' });
    await seed('accessRequests/un2', OB('un2'));
    await assertSucceeds(decide('tlk', 'un2', nvkdPatch()));
    await seed('teams/T1', { name: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', gdkdUids: ['g1'] });
    await seed('users/un3', { uid: 'un3', role: 'user', email: 'un3@x.com' });
    await seed('accessRequests/un3', OB('un3'));
    await assertSucceeds(decide('g1', 'un3', nvkdPatch()));
  });
  it('duyệt nhưng ghi khác Phòng / mã / Khối đã chọn → bị chặn', async () => {
    await seed('accessRequests/unone', OB('unone'));
    await assertFails(decide('gdk', 'unone', nvkdPatch({ teamId: 'T1b', teamName: 'MAY-01B', teamCode: 'E01.2' })));
    await assertFails(decide('gdk', 'unone', nvkdPatch({ teamCode: 'E01.9' })));
    await assertFails(decide('gdk', 'unone', nvkdPatch({ vnOnboarding: { status: 'approved', position: 'nvkd', teamId: 'T1', blockId: 'B2' } })));
    await assertFails(decide('gdk', 'unone', nvkdPatch({ assignedBlock: 'E01' })));
  });
  it('không duyệt đăng ký của Khối khác; yêu cầu xin chuyển cũ chỉ Admin', async () => {
    await seed('accessRequests/unone', OB('unone', { teamId: 'T2', teamName: 'MAY-02', teamCode: 'E02.1', blockId: 'B2', blockCode: 'E02' }));
    await assertFails(decide('gdk', 'unone', nvkdPatch({ teamId: 'T2', teamName: 'MAY-02', teamCode: 'E02.1', vnOnboarding: { status: 'approved', position: 'nvkd', teamId: 'T2', blockId: 'B2' } })));
    await seed('accessRequests/u1', OB('u1', { kind: 'transfer', teamId: 'T1b', teamName: 'MAY-01B', teamCode: 'E01.2', fromTeamId: 'T1' }));
    const p = nvkdPatch({ teamId: 'T1b', teamName: 'MAY-01B', teamCode: 'E01.2', vnOnboarding: { status: 'approved', position: 'nvkd', teamId: 'T1b', blockId: 'B1' } });
    await assertFails(decide('gdk', 'u1', p));
    await assertSucceeds(decide('adm', 'u1', p));
  });
});
