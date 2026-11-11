/** NT bổ sung v2: không sửa bản kỳ đã khoá; bản bổ sung MỚI riêng (khoá _bs) + duyệt ghi về kỳ gốc. Run via: npm run test:firestore-rules */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
// Kỳ 2026-09 đã khoá (kỳ đã qua: mọi kỳ trước kỳ hiện tại), kỳ hiện tại mở.
const now = new Date(Date.now() + 7 * 3600e3);
const ym = (k: number) => { const i = now.getUTCFullYear() * 12 + now.getUTCMonth() + k; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
const M = ym(0), OLD = ym(-1), OLD2 = ym(-3);
const orig = { projectId: 'P1', teamId: 'T1', month: OLD, ntMonth: OLD, status: 'Đã nghiệm thu', implementerUid: 'u1', implementerName: 'X', implementerManual: false, totalCost: 100 };
const req = (extra: any = {}) => ({ projectId: 'P1', teamId: 'T1', month: M, ntMonth: M, status: 'Đã nghiệm thu', implementerUid: 'u1', implementerName: 'X', implementerManual: false, totalCost: 150,
  supplementFor: OLD, supplementIn: M, supplementStatus: 'pending', supplementHistory: [], ...extra });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-nt-supp2', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('settings/global', { ntImplementerRequiredFrom: new Date('2026-01-01') });
  await seed('vnLocks/current', { pastLock: { nt: { on: true, day: 1, min: 0, offset: 1 } } });
  await seed('users/sa', { uid: 'sa', role: 'super_admin', email: 'sa@x.com' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('acceptances/o1', orig);
  await seed(`ntKeys/${OLD}_u1_P1`, { acceptanceId: 'o1', month: OLD, uid: 'u1', projectId: 'P1' });
});
describe('NT bổ sung v3', () => {
  it('mod cannot edit/delete locked original', async () => {
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/o1'), { totalCost: 150 }));
    await assertFails(deleteDoc(doc(as('mod'), 'acceptances/o1')));
  });
  it('mod files NEW supplement for same person+dự án+kỳ (separate _bs key); SA approves into original kỳ without collision', async () => {
    const m = as('mod'); let b = writeBatch(m);
    b.set(doc(m, `ntKeys/${M}_u1_P1_bs`), { acceptanceId: 'n1', month: M, uid: 'u1', projectId: 'P1' });
    b.set(doc(m, 'acceptances/n1'), req({ ntRequired: true }));
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(m, 'acceptances/r4'), req({ supplementIn: OLD })));
    await assertFails(setDoc(doc(m, 'acceptances/r5'), req({ month: OLD, ntMonth: OLD })));
    await assertFails(setDoc(doc(m, 'acceptances/r6'), req({ supplementStatus: 'approved' })));
    await assertFails(updateDoc(doc(m, 'acceptances/n1'), { supplementStatus: 'approved' }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/n1'), { supplementStatus: 'approved' }));
    await assertFails(updateDoc(doc(m, 'acceptances/n1'), { month: OLD }));
    await assertFails(updateDoc(doc(as('sa'), 'acceptances/n1'), { supplementStatus: 'approved', month: OLD2 }));
    await seed('acceptanceImages/img_n1', { acceptanceId: 'n1', provider: 'drive' }); await seed('acceptanceInvoices/inv_n1', { acceptanceId: 'n1', fileId: 'abcdefghijkl' });
    const db = as('sa'); b = writeBatch(db);
    b.delete(doc(db, `ntKeys/${M}_u1_P1_bs`));
    b.set(doc(db, `ntKeys/${OLD}_u1_P1_bs`), { acceptanceId: 'n1', month: OLD, uid: 'u1', projectId: 'P1', createdAt: 'x' });
    b.update(doc(db, 'acceptances/n1'), { supplementStatus: 'approved', month: OLD, ntMonth: OLD, supplementHistory: [{ to: 'approved' }], supplementProof: { img: 'img_n1', inv: 'inv_n1' } });
    await assertSucceeds(b.commit());
    await assertFails(updateDoc(doc(m, 'acceptances/n1'), { notes: 'x' }));
    await assertFails(deleteDoc(doc(m, 'acceptances/n1')));
    b = writeBatch(db);
    b.delete(doc(db, `ntKeys/${OLD}_u1_P1_bs`));
    b.set(doc(db, `ntKeys/${M}_u1_P1_bs`), { acceptanceId: 'n1', month: M, uid: 'u1', projectId: 'P1', createdAt: 'x' });
    b.update(doc(db, 'acceptances/n1'), { supplementStatus: 'pending', month: M, ntMonth: M });
    await assertSucceeds(b.commit());
  });
});
