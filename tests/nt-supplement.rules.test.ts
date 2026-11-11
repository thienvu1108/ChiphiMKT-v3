/** Nghiệm thu bổ sung (supplementFor = tháng trước, chỉ Super Admin duyệt). Run via: npm run test:firestore-rules */
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
const base = { projectId: 'P1', teamId: 'T1', month: '2026-11', status: 'Đã nghiệm thu', implementerUid: '', implementerName: 'X', implementerManual: false };
const supp = (extra: any = {}) => ({ ...base, supplementFor: '2026-10', supplementStatus: 'pending', supplementHistory: [], ...extra });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-nt-supp', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('settings/global', { budgetStartDay: 21, budgetEndDay: 20 });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/sa', { uid: 'sa', role: 'super_admin', email: 'sa@x.com' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
  await seed('users/gk', { uid: 'gk', role: 'gd_khoi', email: 'gk@x.com' });
});
const proofFor = async (id: string) => { await seed(`acceptanceImages/img_${id}`, { acceptanceId: id, provider: 'drive' }); await seed(`acceptanceInvoices/inv_${id}`, { acceptanceId: id, fileId: 'abcdefghijkl' }); };
describe('acceptances: Nghiệm thu bổ sung', () => {
  it('create: earlier month (≤12 kỳ), status pending', async () => {
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/a1'), supp()));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/a0'), supp({ month: '2027-01', supplementFor: '2026-12' })));
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/a2'), supp({ supplementFor: '2026-09' })));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/a2b'), supp({ supplementFor: '2025-10' })));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/a3'), supp({ supplementFor: '2026-11' })));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/a4'), supp({ supplementStatus: 'approved' })));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/a5'), supp({ supplementStatus: 'approved' })));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/a6'), { ...base, supplementStatus: 'pending' }));
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/a7'), base));
  });
  it('status: only Super Admin decides; Admin/Mod/GĐ Khối cannot', async () => {
    await seed('acceptances/b1', supp());
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/b1'), { supplementStatus: 'approved' }));
    await assertFails(updateDoc(doc(as('gk'), 'acceptances/b1'), { supplementStatus: 'approved' }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/b1'), { supplementStatus: 'approved', supplementHistory: [{ to: 'approved' }], supplementDecidedBy: 'adm', supplementDecidedAt: 'x', supplementNote: '' }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/b1'), { supplementStatus: 'rejected', supplementNote: 'x' }));
    await await proofFor('b1');
    assertSucceeds(updateDoc(doc(as('sa'), 'acceptances/b1'), { supplementStatus: 'approved', supplementProof: { img: 'img_b1', inv: 'inv_b1' }, supplementHistory: [{ to: 'approved' }], supplementDecidedBy: 'sa', supplementDecidedAt: 'x', supplementNote: '' }));
    await assertSucceeds(updateDoc(doc(as('sa'), 'acceptances/b1'), { supplementStatus: 'rejected', supplementNote: 'thiếu HĐ' }));
    await assertFails(updateDoc(doc(as('sa'), 'acceptances/b1'), { supplementStatus: 'done' }));
    // Admin sửa nội dung bản đã từ chối → chỉ được đưa về Chờ duyệt
    await assertSucceeds(updateDoc(doc(as('adm'), 'acceptances/b1'), { notes: 'bổ sung HĐ', supplementStatus: 'pending' }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/b1'), { notes: 'y', supplementStatus: 'approved' }));
  });
  it('decision cannot touch supplementFor or money', async () => {
    await seed('acceptances/c1', supp());
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/c1'), { supplementFor: '2026-09' }));
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/c1'), { supplementFor: '2026-09' }));
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/c1'), { month: '2026-12' }));
  });
  it('Mod edit approved → may only reset to pending', async () => {
    await seed('acceptances/d1', supp({ supplementStatus: 'approved' }));
    await assertSucceeds(updateDoc(doc(as('mod'), 'acceptances/d1'), { totalCost: 5, supplementStatus: 'pending', supplementHistory: [{ to: 'pending' }] }));
    await assertSucceeds(updateDoc(doc(as('mod'), 'acceptances/d1'), { notes: 'x' }));
  });
  it('Super Admin approves even when NT period is past-locked; Admin cannot; Mod edit blocked', async () => {
    await seed('vnLocks/current', { pastLock: { nt: { on: true, day: 1, min: 0, offset: 0 } } });
    await seed('acceptances/e1', supp({ month: '2026-09', supplementFor: '2026-08' }));
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/e1'), { notes: 'x' }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/e1'), { notes: 'x' }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/e1'), { supplementStatus: 'approved' }));
    await await proofFor('e1');
    assertSucceeds(updateDoc(doc(as('sa'), 'acceptances/e1'), { supplementStatus: 'approved', supplementProof: { img: 'img_e1', inv: 'inv_e1' } }));
    await seed('acceptances/e2', { ...base, month: '2026-09' });
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/e2'), { supplementStatus: 'approved' }));
  });
  it('budget: supplement edit with past-lock ON (not hit) + ntKey stays under limits', async () => {
    await seed('vnLocks/current', { pastLock: { nt: { on: true, day: 27, min: 0, offset: 3 } } });
    await seed('ntKeys/2026-11_u1_P1_bs', { acceptanceId: 'k1', month: '2026-11', uid: 'u1', projectId: 'P1' });
    await seed('acceptances/k1', supp({ implementerUid: 'u1', ntMonth: '2026-11', supplementStatus: 'approved' }));
    await assertSucceeds(updateDoc(doc(as('mod'), 'acceptances/k1'), { totalCost: 9, supplementStatus: 'pending', supplementHistory: [{ to: 'pending' }], supplementDecidedBy: 'mod', supplementDecidedAt: 'x', supplementNote: 'sửa' }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/k1'), { supplementStatus: 'approved' }));
    await await proofFor('k1');
    assertSucceeds(updateDoc(doc(as('sa'), 'acceptances/k1'), { supplementStatus: 'approved', supplementProof: { img: 'img_k1', inv: 'inv_k1' } }));
  });
  it('ntKeys: supplement uses _bs suffix, coexists with regular key', async () => {
    const db = as('mod');
    let b = writeBatch(db);
    b.set(doc(db, 'ntKeys/2026-11_u1_P1'), { acceptanceId: 'r1', month: '2026-11', uid: 'u1', projectId: 'P1', createdAt: 'x' });
    b.set(doc(db, 'acceptances/r1'), { ...base, implementerUid: 'u1', ntMonth: '2026-11' });
    await assertSucceeds(b.commit());
    b = writeBatch(db);
    b.set(doc(db, 'ntKeys/2026-11_u1_P1_bs'), { acceptanceId: 's1', month: '2026-11', uid: 'u1', projectId: 'P1', createdAt: 'x' });
    b.set(doc(db, 'acceptances/s1'), supp({ implementerUid: 'u1', ntMonth: '2026-11' }));
    await assertSucceeds(b.commit());
    b = writeBatch(db);
    b.set(doc(db, 'acceptances/s2'), supp({ implementerUid: 'u1', ntMonth: '2026-11' }));
    await assertFails(b.commit());
  });
  it('Cách 2: Duyệt cần ảnh + hoá đơn của chính bản ghi (cả nhánh sửa thường)', async () => {
    await seed('acceptances/p1', supp());
    const ok = { supplementStatus: 'approved', supplementHistory: [{ to: 'approved' }], supplementDecidedBy: 'sa', supplementDecidedAt: 'x', supplementNote: '' };
    await assertFails(updateDoc(doc(as('sa'), 'acceptances/p1'), ok));
    await assertFails(updateDoc(doc(as('sa'), 'acceptances/p1'), { ...ok, notes: 'z' }));
    await seed('acceptanceImages/i1', { acceptanceId: 'p1', provider: 'drive' });
    await assertFails(updateDoc(doc(as('sa'), 'acceptances/p1'), { ...ok, supplementProof: { img: 'i1', inv: 'nope' } }));
    await seed('acceptanceInvoices/v_other', { acceptanceId: 'OTHER', fileId: 'abcdefghijkl' });
    await assertFails(updateDoc(doc(as('sa'), 'acceptances/p1'), { ...ok, supplementProof: { img: 'i1', inv: 'v_other' } }));
    await seed('acceptanceInvoices/v1', { acceptanceId: 'p1', fileId: 'abcdefghijkl' });
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/p1'), { ...ok, supplementProof: { img: 'i1', inv: 'v1' } }));
    await assertSucceeds(updateDoc(doc(as('sa'), 'acceptances/p1'), { ...ok, supplementProof: { img: 'i1', inv: 'v1' } }));
    // Từ chối / Đặt lại không cần tệp
    await seed('acceptances/p2', supp());
    await assertSucceeds(updateDoc(doc(as('sa'), 'acceptances/p2'), { supplementStatus: 'rejected', supplementNote: 'x' }));
    // Bản thường không được mang supplementProof
    await seed('acceptances/p3', base);
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/p3'), { supplementProof: { img: 'i1', inv: 'v1' } }));
  });
  it('Cách 2: Mod tải ảnh / hoá đơn cho bản Chờ duyệt (kỳ nộp đang mở, khoá kỳ đã qua bật)', async () => {
    await seed('vnLocks/current', { pastLock: { nt: { on: true, day: 27, min: 0, offset: 3 } } });
    await seed('acceptances/q1', supp());
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptanceImages/qi'), { acceptanceId: 'q1', provider: 'drive' }));
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptanceInvoices/qv'), { acceptanceId: 'q1', fileId: 'abcdefghijkl', mime: 'application/pdf', uploadedBy: 'mod' }));
  });
});
