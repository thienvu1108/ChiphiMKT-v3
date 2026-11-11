/** Hồi quy 26/10/2026: Mod tạo «Nghiệm thu bổ sung» (Người phụ trách tự nhập) bị PERMISSION_DENIED vì vượt 1000 biểu thức/lượt
 * khi bật Khoá kỳ đã qua + Khoá mở cửa sổ (openWin/pastWin). Cấu hình giống live. Run via: npm run test:firestore-rules */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const vn = new Date(Date.now() + 7 * 3600e3);
const idx = vn.getUTCFullYear() * 12 + vn.getUTCMonth(); // 0-based tháng
const ym = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const CUR = ym(idx), PREV = ym(idx - 1), bucket = String(idx + 1); // rules: year*12 + month(1-based)
const T = (ms: number) => Timestamp.fromMillis(ms);
const win = (p: string) => ({ period: p, from: T(Date.now() - 3600e3), to: T(Date.now() + 3600e3) });
const LOCKS = {
  open: { nt: { on: true, fromDay: 1, toDay: 28, fromMin: 0, toMin: 0, apply: 0 } },
  openWin: { nt: { [bucket]: [win(CUR)] } },
  pastWin: { nt: { [bucket]: { m: CUR, at: T(Date.now() + 864e5) } } },
  pastLock: { nt: { on: true, day: 27, min: 0, offset: 1 } },
  updatedAt: T(Date.now()),
};
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const base = { projectId: 'P1', teamId: 'T1', month: CUR, status: 'Đã nghiệm thu', implementerName: 'X', ntRequired: true };
const supp = { supplementFor: PREV, supplementIn: CUR, supplementStatus: 'pending', supplementHistory: [{ from: '', to: 'pending', by: 'mod', at: 'x', note: 'Tạo bản bổ sung' }], kyPart: null };
const manual = { implementerUid: '', implementerManual: true, ntMonth: '2026-10', month: '2026-10' };
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-nt-supp-expr', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('vnLocks/current', LOCKS);
  await seed('settings/global', { budgetStartDay: 14, budgetEndDay: 4, ntImplementerRequiredFrom: T(Date.now() - 864e5) });
  await seed('rolePermissions/mod', { role: 'mod', permissions: [] });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
});
describe('Nghiệm thu bổ sung dưới giới hạn biểu thức (khoá mở cửa sổ + khoá kỳ đã qua)', () => {
  it('Mod: bổ sung kỳ trước, có Người phụ trách (+ ntKeys _bs)', async () => {
    const d = as('mod'); const b = writeBatch(d);
    b.set(doc(d, `ntKeys/${CUR}_u1_P1_bs`), { acceptanceId: 's1', month: CUR, uid: 'u1', projectId: 'P1', createdAt: 'x' });
    b.set(doc(d, 'acceptances/s1'), { ...base, ...supp, implementerUid: 'u1', implementerManual: false, ntMonth: CUR });
    await assertSucceeds(b.commit());
  });
  it('Mod: bổ sung kỳ trước, Người phụ trách tự nhập (lỗi 26/10)', async () => {
    if (CUR !== '2026-10') return; // tự nhập chỉ hợp lệ kỳ 2026-10
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptances/s2'), { ...base, ...supp, ...manual }));
  });
  it('Mod: bản thường kỳ hiện tại vẫn được tạo', async () => {
    const d = as('mod'); const b = writeBatch(d);
    b.set(doc(d, `ntKeys/${CUR}_u1_P1`), { acceptanceId: 'r1', month: CUR, uid: 'u1', projectId: 'P1', createdAt: 'x' });
    b.set(doc(d, 'acceptances/r1'), { ...base, implementerUid: 'u1', implementerManual: false, ntMonth: CUR });
    await assertSucceeds(b.commit());
  });
  it('vẫn chặn: supplementFor không phải kỳ trước / month sai định dạng / ntMonth khác kỳ đã khoá', async () => {
    await assertFails(setDoc(doc(as('mod'), 'acceptances/f1'), { ...base, ...supp, supplementFor: CUR, implementerUid: 'u1', ntMonth: CUR }));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/f2'), { ...base, ...supp, supplementFor: ym(idx - 13), implementerUid: 'u1', ntMonth: CUR }));
    await assertFails(setDoc(doc(as('mod'), 'acceptances/f3'), { ...base, ...supp, month: `${CUR.slice(5)}.${CUR.slice(0, 4)}`, implementerUid: 'u1', ntMonth: CUR }));
    await seed('vnLocks/current', { ...LOCKS, pastLock: { nt: { on: true, day: 1, min: 0, offset: 0 } } });
    await assertFails(setDoc(doc(as('mod'), 'acceptances/f4'), { ...base, implementerUid: '', ntMonth: PREV }));
  });
});
