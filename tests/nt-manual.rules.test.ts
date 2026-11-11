/** Nghiệm thu MKT — «Người phụ trách» tự nhập (chỉ Tháng 10/2026). Run via: npm run test:firestore-rules */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const base = { projectId: 'P1', teamId: 'T1', month: '10.2026', status: 'Đã nghiệm thu' };
const man = (name = 'Nguyễn Văn Ngoài') => ({ implementerUid: '', implementerName: name, implementerManual: true, ntMonth: '2026-10' });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-nt-manual', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('settings/global', { budgetStartDay: 21, budgetEndDay: 20, ntImplementerRequiredFrom: new Date('2020-01-01T00:00:00+07:00') });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
  await seed('users/u1', { uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
  await seed('users/g1', { uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
});
describe('acceptances: manual assignee (Tháng 10/2026)', () => {
  it('Admin/Mod create manual on 10.2026 (satisfies ntRequired)', async () => {
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/a1'), { ...base, ...man(), ntRequired: true }));
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/a2'), { ...base, month: '2026-10', ...man(), ntRequired: true }));
  });
  it('denied for Tháng 11 / other months', async () => {
    await assertFails(setDoc(doc(as('adm'), 'acceptances/b1'), { ...base, month: '11.2026', ...man(), ntRequired: true }));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/b2'), { ...base, month: '11.2026', ...man(), ntMonth: '2026-11', ntRequired: true }));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/b3'), { ...base, month: '09.2026', ...man(), ntRequired: true }));
  });
  it('shape: uid must be empty, name 1–120, ntMonth 2026-10', async () => {
    await assertFails(setDoc(doc(as('adm'), 'acceptances/c1'), { ...base, ...man(), implementerUid: 'u1', ntRequired: true }));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/c2'), { ...base, ...man(''), ntRequired: true }));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/c3'), { ...base, ...man('x'.repeat(121)), ntRequired: true }));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/c4'), { ...base, ...man(), ntMonth: '', ntRequired: true }));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/c5'), { ...base, ...man('x'.repeat(120)), ntRequired: true }));
  });
  it('after cutoff, no implementer and no manual → still denied', async () => {
    await assertFails(setDoc(doc(as('adm'), 'acceptances/d1'), { ...base, ntRequired: true }));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/d2'), { ...base, implementerName: 'X', implementerManual: false, ntRequired: true }));
  });
  it('non-writers (user/gdkd) cannot write manual', async () => {
    await assertFails(setDoc(doc(as('u1'), 'acceptances/e1'), { ...base, ...man(), ntRequired: true }));
    await assertFails(setDoc(doc(as('g1'), 'acceptances/e2'), { ...base, ...man(), ntRequired: true }));
  });
  it('switch uid record → manual releases ntKey; manual → uid works', async () => {
    const db = as('adm'); let b = writeBatch(db);
    b.set(doc(db, 'ntKeys/2026-10_u1_P1'), { acceptanceId: 'f1', month: '2026-10', uid: 'u1', projectId: 'P1' });
    b.set(doc(db, 'acceptances/f1'), { ...base, implementerUid: 'u1', implementerName: 'U1', ntMonth: '2026-10', ntRequired: true });
    await assertSucceeds(b.commit());
    b = writeBatch(db); b.delete(doc(db, 'ntKeys/2026-10_u1_P1')); b.update(doc(db, 'acceptances/f1'), man());
    await assertSucceeds(b.commit());
    b = writeBatch(db);
    b.set(doc(db, 'ntKeys/2026-10_u1_P1'), { acceptanceId: 'f1', month: '2026-10', uid: 'u1', projectId: 'P1' });
    b.update(doc(db, 'acceptances/f1'), { implementerUid: 'u1', implementerName: 'U1', implementerManual: false, ntMonth: '2026-10' });
    await assertSucceeds(b.commit());
  });
  it('manual record cannot be moved to Tháng 11 without picking a user', async () => {
    await seed('acceptances/g1', { ...base, ...man(), ntRequired: true });
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/g1'), { month: '11.2026' }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/g1'), { implementerManual: false }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'acceptances/g1'), { notes: 'ok', totalCost: 5 }));
  });
  it('perm off (Phân quyền) → Mod cannot create/change manual, but can edit other fields', async () => {
    await seed('acceptances/h1', { ...base, ...man(), ntRequired: true });
    await seed('rolePermissions/mod', { role: 'mod', permissions: [], knownKeys: ['vn.nt_records.manual_assignee'] });
    // khi tắt quyền, mod chỉ còn quyền mặc định nếu permissions rỗng → kiểm tra riêng phần manual
    await assertFails(setDoc(doc(as('mod'), 'acceptances/h2'), { ...base, ...man(), ntRequired: true }));
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/h1'), { implementerName: 'Tên khác' }));
    await assertSucceeds(updateDoc(doc(as('mod'), 'acceptances/h1'), { notes: 'cost edit' }));
    await assertSucceeds(getDoc(doc(as('adm'), 'acceptances/h1')));
  });
});
