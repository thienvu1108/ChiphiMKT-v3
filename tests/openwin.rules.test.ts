// Chế độ Thời gian MỞ: ngoài cửa sổ mở = khoá; Áp dụng cho kỳ; SA bỏ qua; doc như LocksPage.save.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { compileOpenWin, type OpenCfg } from '../lib/vnext/platform';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const now = Date.now();
const rg = (a: number, b: number, period: string) => ({ from: now + a * 3600e3, to: now + b * 3600e3, period });
const TS = (r: any) => ({ from: Timestamp.fromMillis(r.from), to: Timestamp.fromMillis(r.to), period: r.period });
const off = { on: false, fromDay: 1, fromMin: 0, toDay: 1, toMin: 0, apply: null, exceptions: [] };
function openDoc(nt: OpenCfg['ranges']) {
  const o: OpenCfg = { on: true, rec: off, ranges: nt };
  const w = compileOpenWin(o).win;
  return { open: { nt: { on: true, rec: off, ranges: nt.map(TS) } }, openWin: { nt: Object.fromEntries(Object.entries(w).map(([i, ws]) => [i, ws.map(TS)])) }, updatedAt: 'x', updatedBy: 'sup' };
}
const A = (month: string) => ({ projectId: 'P1', teamId: 'T1', month, status: 'Đã nghiệm thu' });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-openwin', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/sup', { uid: 'sup', role: 'super_admin', email: 'sup@x.com' });
});
describe('Thời gian MỞ Nghiệm thu', () => {
  it('SA lưu được doc open/openWin; Admin không', async () => {
    const d = openDoc([rg(-1, 5, '2026-09')]);
    await assertFails(setDoc(doc(as('adm'), 'vnLocks/current'), d));
    await assertSucceeds(setDoc(doc(as('sup'), 'vnLocks/current'), d));
  });
  it('Đang mở cho 2026-09: NT 2026-09 được, 2026-10 bị khoá; SA được', async () => {
    await seed('acceptances/a10', A('2026-10'));
    await seed('vnLocks/current', openDoc([rg(-1, 5, '2026-09')]));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/n9'), A('2026-09')));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/n10'), A('2026-10')));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/a10'), { notes: 'x' }));
    await assertSucceeds(setDoc(doc(as('sup'), 'acceptances/s10'), A('2026-10')));
  });
  it('Ngoài khoảng mở (chưa tới / đã qua) → khoá; mở mọi kỳ → được', async () => {
    await seed('vnLocks/current', openDoc([rg(2, 30, ''), rg(-30, -1, '')]));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/n9'), A('2026-09')));
    await seed('vnLocks/current', openDoc([rg(-2, 30, '')]));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/n9'), A('2026-09')));
  });
});
