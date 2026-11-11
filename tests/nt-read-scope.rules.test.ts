/** Quyền đọc Nghiệm thu (acceptances / finalAcceptances / ntKeys) khớp màn hình theo vai trò. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, where, orderBy } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const OK = { vnOnboarding: { status: 'approved' } };
const COLS = ['acceptances', 'finalAcceptances'];
const q = (u: string, c: string, f: string, op: any, v: any) => getDocs(query(collection(as(u), c), where(f, op, v)));
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-nt-read', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'K1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlk'] });
  await seed('blocks/B2', { name: 'K2', blockCode: 'E02', directorUid: 'other' });
  await seed('blocks/B3', { name: 'K3', blockCode: 'E03' }); // Khối chưa có GĐ: assignedBlock cũ
  await seed('teams/T1', { name: 'MAY-01', blockId: 'B1', gdkdUids: ['g1'] });
  await seed('teams/T2', { name: 'MAY-02', blockId: 'B2', gdkdUids: ['g2'] });
  await seed('teams/T3', { name: 'MAY-03', blockCode: 'E03' }); // Phòng cũ chưa có blockId
  for (const [u, r] of [['sa', 'super_admin'], ['adm', 'admin'], ['mod', 'mod'], ['kt', 'accountant'], ['gdk', 'gd_khoi'], ['tlk', 'tro_ly_khoi'], ['tbk', 'truong_ban_kd'], ['u2', 'user']])
    await seed('users/' + u, { ...OK, uid: u, role: r, email: u + '@x.com' });
  await seed('users/g1', { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1' });
  await seed('users/gda', { ...OK, uid: 'gda', role: 'gdda', email: 'gda@x.com', assignedProjects: ['P1'] });
  await seed('users/gda0', { ...OK, uid: 'gda0', role: 'gdda', email: 'gda0@x.com' });
  await seed('users/ast', { ...OK, uid: 'ast', role: 'assistant', email: 'ast@x.com', assignedProjects: ['P2'], assignedBlock: 'E03' });
  await seed('users/u1', { ...OK, uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1' });
  // rolePermissions cho user có home.view: trước đây đọc toàn công ty, nay chỉ bản mình phụ trách.
  await seed('rolePermissions/user', { permissions: ['home.view', 'report_nt.view'] });
  for (const c of COLS) {
    await seed(`${c}/a1`, { teamId: 'T1', projectId: 'P1', implementerUid: 'u1', month: '2026-10', finalizedAt: 1 });
    await seed(`${c}/a2`, { teamId: 'T2', projectId: 'P2', implementerUid: 'u2', month: '2026-10', finalizedAt: 2 });
    await seed(`${c}/a3`, { teamId: 'T3', projectId: 'P3', month: '2026-09', finalizedAt: 3 });
  }
  await seed('ban_kd/BA', { name: 'Ban A', leaderUid: 'tbk', deputyUids: ['pb'] });
  await seed('ban_kd/BB', { name: 'Ban B', leaderUid: 'other' });
  await seed('projects/P1', { name: 'DA1', projectCode: 'X', banKdId: 'BA' });
  await seed('projects/P2', { name: 'DA2', projectCode: 'X', banKdId: 'BB' });
  await seed('projects/P3', { name: 'DA3', projectCode: 'X', banKdName: 'Ban A' }); // chỉ khớp tên/mã → không tính
  await seed('users/pb', { ...OK, uid: 'pb', role: 'truong_ban_kd', email: 'pb@x.com' });
  await seed('users/tbk0', { ...OK, uid: 'tbk0', role: 'truong_ban_kd', email: 'tbk0@x.com' });
  await seed('ntKeys/k1', { acceptanceId: 'a1', month: '2026-10', uid: 'u1', projectId: 'P1' });
});
describe('NT read scope', () => {
  it('Super Admin / Admin / Mod / Kế toán: toàn bộ', async () => {
    for (const u of ['sa', 'adm', 'mod', 'kt']) for (const c of COLS) {
      await assertSucceeds(getDocs(collection(as(u), c)));
      await assertSucceeds(getDoc(doc(as(u), `${c}/a2`)));
    }
    await assertSucceeds(getDocs(query(collection(as('adm'), 'acceptances'), orderBy('month', 'desc'))));
  });
  it('Trưởng ban KD: chỉ dự án thuộc Ban mình (projectId → banKdId)', async () => {
    for (const u of ['tbk', 'pb']) for (const c of COLS) {
      await assertSucceeds(getDoc(doc(as(u), `${c}/a1`)));
      await assertFails(getDoc(doc(as(u), `${c}/a2`)));
      await assertFails(getDoc(doc(as(u), `${c}/a3`)));
      await assertSucceeds(q(u, c, 'projectId', '==', 'P1'));
      await assertSucceeds(q(u, c, 'projectId', 'in', ['P1']));
      await assertFails(q(u, c, 'projectId', 'in', ['P1', 'P2']));
      await assertFails(q(u, c, 'projectId', '==', 'P3'));
      await assertFails(q(u, c, 'teamId', '==', 'T1'));
      await assertFails(getDocs(collection(as(u), c)));
    }
    // Ban nhiều dự án: truy vấn in tối đa 5 projectId (giới hạn 10 lần đọc tài liệu / truy vấn; 8 đã vượt).
    const many = Array.from({ length: 5 }, (_, i) => 'Q' + i);
    for (const id of many) await seed('projects/' + id, { name: id, projectCode: 'X', banKdId: 'BA' });
    for (const c of COLS) await assertSucceeds(q('tbk', c, 'projectId', 'in', many));
    for (const c of COLS) await assertFails(getDoc(doc(as('tbk0'), `${c}/a1`)));
  });
  it('GĐ Khối / Trợ lý Khối: chỉ Phòng thuộc Khối mình', async () => {
    for (const u of ['gdk', 'tlk']) for (const c of COLS) {
      await assertSucceeds(getDoc(doc(as(u), `${c}/a1`)));
      await assertFails(getDoc(doc(as(u), `${c}/a2`)));
      await assertFails(getDoc(doc(as(u), `${c}/a3`)));
      await assertFails(getDocs(collection(as(u), c)));
      await assertSucceeds(q(u, c, 'teamId', '==', 'T1'));
      await assertFails(q(u, c, 'teamId', '==', 'T2'));
    }
  });
  it('GĐKD: chỉ Phòng mình', async () => {
    for (const c of COLS) {
      await assertSucceeds(q('g1', c, 'teamId', '==', 'T1'));
      await assertFails(q('g1', c, 'teamId', '==', 'T2'));
      await assertFails(getDocs(collection(as('g1'), c)));
    }
  });
  it('GĐDA: chỉ dự án được gán (projectId); không gán dự án → không đọc', async () => {
    for (const c of COLS) {
      await assertSucceeds(getDoc(doc(as('gda'), `${c}/a1`)));
      await assertFails(getDoc(doc(as('gda'), `${c}/a2`)));
      await assertSucceeds(q('gda', c, 'projectId', 'in', ['P1']));
      await assertFails(q('gda', c, 'projectId', 'in', ['P1', 'P2']));
      await assertFails(getDocs(collection(as('gda'), c)));
      await assertFails(getDoc(doc(as('gda0'), `${c}/a1`)));
    }
  });
  it('Trợ lý BGĐ (assistant): dự án được gán hoặc Phòng thuộc Khối được gán', async () => {
    for (const c of COLS) {
      await assertSucceeds(q('ast', c, 'projectId', 'in', ['P2']));
      await assertSucceeds(q('ast', c, 'teamId', '==', 'T3'));
      await assertFails(getDoc(doc(as('ast'), `${c}/a1`)));
      await assertFails(getDocs(collection(as('ast'), c)));
    }
  });
  it('User: chỉ acceptances mình phụ trách, không finalAcceptances', async () => {
    await assertSucceeds(q('u1', 'acceptances', 'implementerUid', '==', 'u1'));
    await assertFails(q('u1', 'acceptances', 'implementerUid', '==', 'u2'));
    await assertFails(getDoc(doc(as('u1'), 'acceptances/a2')));
    await assertFails(getDocs(collection(as('u1'), 'acceptances')));
    await assertFails(getDocs(collection(as('u1'), 'finalAcceptances')));
  });
  it('ntKeys: chỉ Admin / Mod / Kế toán', async () => {
    for (const u of ['sa', 'adm', 'mod', 'kt']) await assertSucceeds(getDoc(doc(as(u), 'ntKeys/k1')));
    for (const u of ['gdk', 'tlk', 'g1', 'gda', 'ast', 'u1', 'tbk']) await assertFails(getDoc(doc(as(u), 'ntKeys/k1')));
  });
});
