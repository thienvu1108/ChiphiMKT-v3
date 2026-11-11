/** Chặn duyệt khi người đăng ký chưa có STK; payStatus chỉ ghi đúng sự thật. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const K = (uid: string) => ({ uid, cccd: '001099012345', bankAccount: '0123456789', bankName: 'Vietcombank', accountHolder: 'NGUYEN VAN A', fullName: 'N', updatedAt: 'x', updatedBy: uid });
const LID = 'u_2026-11_T1_P1_u1';
const SUP = (over: any = {}) => {
  const status = over.status ?? 'approved';
  const { banStatus: _b, ...rest } = over;
  return { lineId: LID, period: '2026-11', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 5000000, status: 'approved', decidedBy: 'gdk', decidedByName: 'gdk', decidedAt: 'x', history: [], ...(status === 'approved' ? { banStatus: 'pending' } : {}), ...rest, status };
};
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-kycgate', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'Khối 1', directorUid: 'gdk', assistantUids: [] });
  await seed('teams/T1', { name: 'T1', blockId: 'B1', gdkdUids: [] });
  await seed('users/gdk', { uid: 'gdk', role: 'gd_khoi', email: 'gdk@x.com' });
  await seed('users/u1', { uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
  await seed('users/u2', { uid: 'u2', role: 'user', email: 'u2@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
  await seed('ns_lines/' + LID, { period: '2026-11', kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', ownerUid: 'u1', ownerName: 'U1', amount: 5000000 });
});
describe('Duyệt cần STK của người đăng ký', () => {
  it('Chưa có userKyc → GĐK không duyệt được; vẫn từ chối / đặt lại được', async () => {
    await assertFails(setDoc(doc(as('gdk'), 'nsSupport/' + LID), SUP()));
    await assertSucceeds(setDoc(doc(as('gdk'), 'nsSupport/' + LID), SUP({ status: 'rejected', reason: 'Thiếu STK' })));
    await assertSucceeds(setDoc(doc(as('gdk'), 'nsSupport/' + LID), SUP({ status: 'pending' })));
  });
  it('Có STK → duyệt được', async () => {
    await seed('userKyc/u1', K('u1'));
    await assertSucceeds(setDoc(doc(as('gdk'), 'nsSupport/' + LID), SUP()));
  });
});
describe('payStatus', () => {
  it('Mọi người đăng nhập đọc được', async () => {
    await seed('payStatus/u1', { uid: 'u1', hasPay: true, updatedAt: 'x' });
    await assertSucceeds(getDoc(doc(as('u2'), 'payStatus/u1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'payStatus/u1')));
  });
  it('Chỉ ghi đúng sự thật; ghi cùng batch với userKyc được', async () => {
    await assertFails(setDoc(doc(as('u1'), 'payStatus/u1'), { uid: 'u1', hasPay: true, updatedAt: 'x' }));
    await assertSucceeds(setDoc(doc(as('u1'), 'payStatus/u1'), { uid: 'u1', hasPay: false, updatedAt: 'x' }));
    const d1 = as('u1'); const b = writeBatch(d1);
    b.set(doc(d1, 'userKyc/u1'), K('u1')); b.set(doc(d1, 'payStatus/u1'), { uid: 'u1', hasPay: true, updatedAt: 'y' });
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(as('u2'), 'payStatus/u1'), { uid: 'u1', hasPay: false, updatedAt: 'z' }));
    await assertFails(setDoc(doc(as('u1'), 'payStatus/u1'), { uid: 'u1', hasPay: true, updatedAt: 'z', extra: 1 }));
    await assertSucceeds(setDoc(doc(as('u1'), 'payStatus/u1'), { uid: 'u1', hasPay: true, since: '2026-10-23T00:00:00Z', updatedAt: 'z' }));
    await assertFails(setDoc(doc(as('u1'), 'payStatus/u1'), { uid: 'u1', hasPay: true, since: 5, updatedAt: 'z' }));
    await assertFails(deleteDoc(doc(as('u1'), 'payStatus/u1')));
  });
});
