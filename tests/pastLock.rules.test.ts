/** Khoá KỲ ĐÃ QUA (pastLock) — chỉ Super Admin sửa / xoá bản ghi kỳ đã khoá. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const vn = new Date(Date.now() + 7 * 3600e3); const Y = vn.getUTCFullYear(), M = vn.getUTCMonth() + 1;
const ym = (y: number, m: number) => { const i = y * 12 + m - 1; return `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`; };
const CUR = ym(Y, M), PREV = ym(Y, M - 1), OLD = ym(Y, M - 3);
// Bản ghi tháng X khoá từ ngày 1 00:00 tháng X+1 → mọi tháng < tháng hiện tại bị khoá.
const ON = { pastLock: { ns: { on: true, day: 1, min: 0, offset: 1 }, nt: { on: true, day: 1, min: 0, offset: 1 } }, nsCreate: [], nsEdit: [], nt: [] };
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-past', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
  await seed('users/sup', { uid: 'sup', role: 'super_admin', email: 'sup@x.com' });
  for (const [id, m] of [['old', OLD], ['prev', PREV], ['cur', CUR]]) {
    await seed(`block_budgets/${id}`, { month: m, amount: 1, blockId: 'B1', projectId: 'P1' });
    await seed(`budgets/${id}`, { month: m, amount: 1, projectId: 'P1', createdBy: 'adm' });
    await seed(`costs/${id}`, { month: m, amount: 1, projectId: 'P1', createdBy: 'adm' });
    await seed(`acceptances/${id}`, { month: m, projectId: 'P1', teamId: 'T1', status: 'Đã nghiệm thu' });
    await seed(`finalAcceptances/${id}`, { month: m, projectId: 'P1' });
  }
  await seed('acceptances/ki', { month: 'Kì 1 - Tháng 8', projectId: 'P1', teamId: 'T1', status: 'Đã nghiệm thu' });
  await seed('acceptances/dot', { month: `${String(OLD.slice(5))}.${OLD.slice(0, 4)}`, projectId: 'P1', teamId: 'T1', status: 'Đã nghiệm thu' });
});
describe('Khoá kỳ đã qua', () => {
  it('Tắt cấu hình → Admin sửa / xoá kỳ cũ như trước', async () => {
    await assertSucceeds(updateDoc(doc(as('adm'), 'block_budgets/old'), { amount: 2 }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'acceptances/old'), { notes: 'x' }));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'costs/old')));
  });
  it('Bật: NS / chi phí kỳ đã qua — Admin bị chặn, Super Admin được; kỳ hiện tại vẫn sửa được', async () => {
    await seed('vnLocks/current', ON);
    for (const c of ['block_budgets', 'budgets', 'costs']) {
      await assertFails(updateDoc(doc(as('adm'), `${c}/prev`), { amount: 2 }));
      await assertFails(deleteDoc(doc(as('adm'), `${c}/old`)));
      await assertSucceeds(updateDoc(doc(as('sup'), `${c}/prev`), { amount: 3 }));
      await assertSucceeds(updateDoc(doc(as('adm'), `${c}/cur`), { amount: 4 }));
    }
    // Không được "dời" bản ghi hiện tại về kỳ đã khoá / tạo mới vào kỳ đã khoá.
    await assertFails(updateDoc(doc(as('adm'), 'block_budgets/cur'), { month: PREV }));
    await assertFails(setDoc(doc(as('adm'), 'costs/new'), { month: PREV, amount: 1, projectId: 'P1', createdBy: 'adm' }));
    await assertSucceeds(deleteDoc(doc(as('sup'), 'budgets/old')));
  });
  it('Bật: Nghiệm thu (YYYY-MM, MM.YYYY, «Kì 1 - Tháng 8») + bản chốt — Admin / Mod bị chặn, Super Admin được', async () => {
    await seed('vnLocks/current', ON);
    for (const id of ['prev', 'old', 'ki', 'dot']) {
      await assertFails(updateDoc(doc(as('adm'), `acceptances/${id}`), { notes: 'x' }));
      await assertFails(updateDoc(doc(as('mod'), `acceptances/${id}`), { notes: 'x' }));
    }
    await assertFails(deleteDoc(doc(as('adm'), 'acceptances/prev')));
    await assertSucceeds(updateDoc(doc(as('sup'), 'acceptances/prev'), { notes: 'sup' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'acceptances/cur'), { notes: 'ok' }));
    await assertFails(updateDoc(doc(as('adm'), 'finalAcceptances/prev'), { x: 1 }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'finalAcceptances/cur'), { x: 1 }));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/n1'), { month: PREV, projectId: 'P1', teamId: 'T1', status: 'Đã nghiệm thu' }));
  });
  it('offset 2 (ân hạn thêm 1 tháng): tháng trước còn sửa được, 3 tháng trước bị khoá', async () => {
    await seed('vnLocks/current', { ...ON, pastLock: { nt: { on: true, day: 1, min: 0, offset: 2 } } });
    await assertSucceeds(updateDoc(doc(as('adm'), 'acceptances/prev'), { notes: 'x' }));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/old'), { notes: 'x' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'block_budgets/old'), { amount: 9 })); // ns chưa bật
  });
  it('Ảnh / hoá đơn của Nghiệm thu kỳ đã khoá: chặn xoá', async () => {
    await seed('acceptanceImages/i1', { acceptanceId: 'prev', provider: 'drive' });
    await seed('acceptanceImages/i2', { acceptanceId: 'cur', provider: 'drive' });
    await seed('vnLocks/current', ON);
    await assertFails(deleteDoc(doc(as('adm'), 'acceptanceImages/i1')));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'acceptanceImages/i2')));
    await assertSucceeds(deleteDoc(doc(as('sup'), 'acceptanceImages/i1')));
  });
  it('Chi phí đã nghiệm thu (trường tiền trên bản Nghiệm thu) + ntMonth + ntKeys + ảnh lưu tạm: chặn khi kỳ khoá', async () => {
    await seed('acceptances/nm', { month: CUR, ntMonth: PREV, projectId: 'P1', teamId: 'T1', status: 'Đã nghiệm thu', grandTotal: 1000, dangTinCtyChuaVat: 500 });
    await seed('ntKeys/k1', { acceptanceId: 'prev', month: PREV, uid: 'u1', projectId: 'P1' });
    await seed('acceptanceImageData/d1', { dataUrl: 'x', acceptanceId: 'prev' });
    await seed('acceptanceImageData/d2', { dataUrl: 'x' });
    await seed('vnLocks/current', ON);
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/prev'), { grandTotal: 1, dangTinCtyChuaVat: 2, caNhanNapTienQuaCty: 3 }));
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/nm'), { grandTotal: 2 }));      // ntMonth kỳ đã khoá
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/cur'), { ntMonth: PREV }));     // dời sang kỳ đã khoá
    await assertSucceeds(updateDoc(doc(as('sup'), 'acceptances/nm'), { grandTotal: 3 }));
    await assertFails(deleteDoc(doc(as('adm'), 'ntKeys/k1')));
    await assertFails(setDoc(doc(as('adm'), `ntKeys/${PREV}_u2_P1`), { acceptanceId: 'x', month: PREV, uid: 'u2', projectId: 'P1' }));
    await assertSucceeds(setDoc(doc(as('adm'), `ntKeys/${CUR}_u2_P1`), { acceptanceId: 'x', month: CUR, uid: 'u2', projectId: 'P1' }));
    await assertFails(deleteDoc(doc(as('adm'), 'acceptanceImageData/d1')));
    await assertFails(setDoc(doc(as('adm'), 'acceptanceImageData/d3'), { dataUrl: 'x', acceptanceId: 'prev' }));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptanceImageData/d4'), { dataUrl: 'x', acceptanceId: 'cur' }));
    await assertSucceeds(deleteDoc(doc(as('sup'), 'acceptanceImageData/d1')));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'acceptanceImageData/d2'))); // ảnh cũ chưa gắn acceptanceId: không khoá theo kỳ (đã báo gap)
  });
  it('Cài đặt pastLock: chỉ Super Admin, đúng dạng', async () => {
    const d = { nsCreate: [], nsEdit: [], nt: [], updatedAt: 'x', updatedBy: 'sup' };
    await assertSucceeds(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, pastLock: { ns: { on: true, day: 21, min: 0, offset: 0 }, nt: { on: true, day: 10, min: 600, offset: 1 } } }));
    await assertFails(setDoc(doc(as('adm'), 'vnLocks/current'), { ...d, pastLock: { ns: { on: false, day: 1, min: 0, offset: 1 } } }));
    await assertFails(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, pastLock: { ns: { on: true, day: 29, min: 0, offset: 1 } } }));
    await assertFails(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, pastLock: { ns: { on: true, day: 1, min: 0, offset: 4 } } }));
    await assertFails(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, pastLock: { x: { on: true, day: 1, min: 0, offset: 1 } } }));
  });
});
