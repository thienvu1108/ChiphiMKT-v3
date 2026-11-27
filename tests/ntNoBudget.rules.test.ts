/** Nghiệm thu bổ sung «Không có đăng ký NS» (+ người phụ trách tự nhập) — chỉ trong Nghiệm thu bổ sung. Run via: npm run test:firestore-rules */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
// Kỳ nộp 2026-12, kỳ gốc 2026-11 (≥ 2026-11).
const base = { projectId: 'P1', teamId: 'T1', month: '2026-12', status: 'Đã nghiệm thu', implementerUid: '', implementerName: 'X', implementerManual: false };
const supp = (extra: any = {}) => ({ ...base, supplementFor: '2026-11', supplementIn: '2026-12', supplementStatus: 'pending', supplementHistory: [], ...extra });
const noBudget = { ntNoBudget: true, ntNoBudgetReason: 'Dự án phát sinh chưa kịp đăng ký', ntNoBudgetBy: 'mod@x.com', ntNoBudgetAt: '2026-12-05T00:00:00.000Z' };
const manual = (name = 'Nguyễn Văn Ngoài', ntMonth = '2026-12') => ({ implementerUid: '', implementerName: name, implementerManual: true, ntMonth });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-nt-nobudget', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('settings/global', { budgetStartDay: 21, budgetEndDay: 20 });
  await seed('users/sa', { uid: 'sa', role: 'super_admin', email: 'sa@x.com' });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
  await seed('users/u1', { uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
});
const proofFor = async (id: string) => { await seed(`acceptanceImages/img_${id}`, { acceptanceId: id, provider: 'drive' }); await seed(`acceptanceInvoices/inv_${id}`, { acceptanceId: id, fileId: 'abcdefghijkl' }); };
describe('acceptances: bổ sung «Không có đăng ký NS»', () => {
  it('(1) Mod tạo bổ sung ntNoBudget + uid, có lý do → OK', async () => {
    const db = as('mod'); const b = writeBatch(db);
    b.set(doc(db, 'ntKeys/2026-12_u1_P1_bs'), { acceptanceId: 'a1', month: '2026-12', uid: 'u1', projectId: 'P1', createdAt: 'x' });
    b.set(doc(db, 'acceptances/a1'), supp({ implementerUid: 'u1', implementerName: 'U1', ntMonth: '2026-12', ...noBudget }));
    await assertSucceeds(b.commit());
  });
  it('(2) thiếu / quá ngắn lý do → DENY', async () => {
    await assertFails(setDoc(doc(as('mod'), 'acceptances/b1'), supp({ ntNoBudget: true })));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/b2'), supp({ ntNoBudget: true, ntNoBudgetReason: 'ab' })));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/b3'), supp({ ntNoBudget: true, ntNoBudgetReason: 'x'.repeat(501) })));
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/b4'), supp({ ntNoBudget: true, ntNoBudgetReason: 'abc' })));
  });
  it('(3) ntNoBudget trên bản thường (không supplementFor) → DENY', async () => {
    await assertFails(setDoc(doc(as('mod'), 'acceptances/c1'), { ...base, ...noBudget }));
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/c2'), base));
  });
  it('(4) bổ sung tự nhập (uid rỗng, supplementFor 2026-11, month = ntMonth = 2026-12) → OK', async () => {
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/d1'), supp({ ...manual(), ...noBudget })));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/d2'), supp({ ...manual('Trần Thị B'), ...noBudget })));
    // ntMonth lệch month → DENY
    await assertFails(setDoc(doc(as('mod'), 'acceptances/d3'), supp({ ...manual('Trần Thị C', '2026-11'), ...noBudget })));
    // tên rỗng / > 120 → DENY
    await assertFails(setDoc(doc(as('mod'), 'acceptances/d4'), supp({ ...manual(''), ...noBudget })));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/d5'), supp({ ...manual('x'.repeat(121)), ...noBudget })));
  });
  it('(4b) tự nhập bổ sung KHÔNG có ntNoBudget, hoặc kỳ gốc 2026-10 → DENY', async () => {
    await assertFails(setDoc(doc(as('mod'), 'acceptances/e1'), supp({ ...manual() })));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/e2'), supp({ ...manual(), supplementFor: '2026-10', ...noBudget })));
  });
  it('Mod tạo bổ sung cùng kỳ 2026-11, có ntNoBudget, lý do và tên tự nhập → OK', async () => {
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/same1'), supp({
      month: '2026-11', supplementIn: '2026-11', ...manual('Nguyễn Văn Ngoài', '2026-11'), ...noBudget,
    })));
  });
  it('Mod tạo bổ sung cùng kỳ 2026-11 thiếu ntNoBudget → DENY', async () => {
    await assertFails(setDoc(doc(as('mod'), 'acceptances/same2'), supp({ month: '2026-11', supplementIn: '2026-11' })));
  });
  it('Mod tạo bổ sung có ntNoBudget nhưng kỳ gốc sai định dạng → DENY', async () => {
    await assertFails(setDoc(doc(as('mod'), 'acceptances/same3'), supp({ supplementFor: 'sai', ...noBudget })));
  });
  it('(5) tự nhập bản thường kỳ 12 → DENY', async () => {
    await assertFails(setDoc(doc(as('mod'), 'acceptances/f1'), { ...base, ...manual() }));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/f2'), { ...base, ...manual(), ...noBudget }));
  });
  it('(6) tự nhập kỳ 10 cũ vẫn OK', async () => {
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/g1'), { projectId: 'P1', teamId: 'T1', month: '10.2026', status: 'Đã nghiệm thu', ...manual('Lê Cũ', '2026-10') }));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/g2'), { projectId: 'P1', teamId: 'T1', month: '2026-10', status: 'Đã nghiệm thu', ...manual('Lê Cũ 2', '2026-10') }));
  });
  it('(7) Mod tự đặt supplementStatus approved → DENY', async () => {
    await assertFails(setDoc(doc(as('mod'), 'acceptances/h1'), supp({ ...manual(), ...noBudget, supplementStatus: 'approved' })));
    await seed('acceptances/h2', supp({ ...manual(), ...noBudget }));
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/h2'), { supplementStatus: 'approved', supplementProof: { img: 'x', inv: 'y' } }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/h2'), { supplementStatus: 'approved' }));
  });
  it('(8) Super Admin duyệt (đủ ảnh + hoá đơn) bản tự nhập → OK; sau đó Mod sửa số tiền (về pending) vẫn qua', async () => {
    await seed('acceptances/i1', supp({ ...manual(), ...noBudget }));
    await proofFor('i1');
    // thiếu proof → DENY
    await assertFails(updateDoc(doc(as('sa'), 'acceptances/i1'), { supplementStatus: 'approved', month: '2026-11', ntMonth: '2026-11' }));
    await assertSucceeds(updateDoc(doc(as('sa'), 'acceptances/i1'), {
      supplementStatus: 'approved', supplementProof: { img: 'img_i1', inv: 'inv_i1' }, month: '2026-11', ntMonth: '2026-11',
      supplementHistory: [{ to: 'approved' }], supplementDecidedBy: 'sa', supplementDecidedAt: 'x', supplementNote: '',
    }));
    // Mod sửa số tiền bản đã duyệt → về pending; month = ntMonth = 2026-11 vẫn đúng hình dạng tự nhập
    await assertSucceeds(updateDoc(doc(as('mod'), 'acceptances/i1'), { totalCost: 123456, supplementStatus: 'pending', supplementHistory: [{ to: 'pending' }] }));
    // vẫn không bỏ được lý do
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/i1'), { ntNoBudgetReason: 'a' }));
  });
});
