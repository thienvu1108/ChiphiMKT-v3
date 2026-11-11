/** GĐKD chỉ xem dữ liệu cũ (users/budgets/costs/acceptances/efficiencyReports) của Phòng mình + dữ liệu cá nhân. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const OK = { vnOnboarding: { status: 'approved' } };
const OLD = ['budgets', 'costs', 'acceptances', 'efficiencyReports'];
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-gdkd-scope', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'K1', blockCode: 'E01', directorUid: 'gdk', assistantUids: [] });
  await seed('teams/T1', { name: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', gdkdUids: ['g1'] });
  await seed('teams/T2', { name: 'MAY-02', teamCode: 'E01.2', blockId: 'B1', gdkdUids: ['g2'] });
  for (const [u, r] of [['adm', 'admin'], ['kt', 'accountant'], ['gdk', 'gd_khoi']]) await seed('users/' + u, { uid: u, role: r, email: u + '@x.com' });
  await seed('users/g1', { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1' });
  await seed('users/g2', { ...OK, uid: 'g2', role: 'gdkd', email: 'g2@x.com', teamId: 'T2' });
  await seed('users/u1', { ...OK, uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1' });
  await seed('users/u2', { ...OK, uid: 'u2', role: 'user', email: 'u2@x.com', teamId: 'T2' });
  for (const c of OLD) { await seed(`${c}/a1`, { teamId: 'T1', createdBy: 'u1', implementerUid: 'u1', month: '2026-10' }); await seed(`${c}/a2`, { teamId: 'T2', createdBy: 'u2', implementerUid: 'u2', month: '2026-10' }); await seed(`${c}/own`, { teamId: 'T2', createdBy: 'g1', month: '2026-10' }); }
});
describe('GĐKD scope', () => {
  it('users: GĐKD đọc mình + thành viên Phòng mình; không người Phòng khác, không cả danh sách', async () => {
    for (const u of ['g1', 'u1']) await assertSucceeds(getDoc(doc(as('g1'), 'users/' + u)));
    for (const u of ['u2', 'g2', 'adm']) await assertFails(getDoc(doc(as('g1'), 'users/' + u)));
    await assertFails(getDocs(collection(as('g1'), 'users')));
    await assertSucceeds(getDocs(query(collection(as('g1'), 'users'), where('teamId', '==', 'T1'))));
    await assertFails(getDocs(query(collection(as('g1'), 'users'), where('teamId', '==', 'T2'))));
  });
  it('dữ liệu cũ: chỉ Phòng mình (truy vấn theo teamId) + bản ghi của chính mình', async () => {
    for (const c of OLD) {
      await assertSucceeds(getDoc(doc(as('g1'), `${c}/a1`)));
      await assertFails(getDoc(doc(as('g1'), `${c}/a2`)));
      await assertFails(getDocs(collection(as('g1'), c)));
      await assertSucceeds(getDocs(query(collection(as('g1'), c), where('teamId', '==', 'T1'))));
      await assertFails(getDocs(query(collection(as('g1'), c), where('teamId', '==', 'T2'))));
      if (c !== 'acceptances') { await assertSucceeds(getDoc(doc(as('g1'), `${c}/own`))); await assertSucceeds(getDocs(query(collection(as('g1'), c), where('createdBy', '==', 'g1')))); }
    }
  });
  it('vai trò khác không đổi: Admin / Kế toán / GĐK đọc cả danh sách users; user vẫn đọc NT của mình', async () => {
    for (const u of ['adm', 'kt', 'gdk']) await assertSucceeds(getDocs(collection(as(u), 'users')));
    await assertSucceeds(getDocs(collection(as('adm'), 'budgets')));
    await assertSucceeds(getDocs(query(collection(as('u1'), 'acceptances'), where('implementerUid', '==', 'u1'))));
  });
  it('GĐKD tự sửa hồ sơ mình vẫn được (không leo quyền)', async () => {
    await assertSucceeds(setDoc(doc(as('g1'), 'users/g1'), { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1', phone: '0900000000' }, { merge: true }));
  });
});
