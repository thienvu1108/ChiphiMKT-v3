/** Nghiệm thu MKT — «Link QC» (adLinks). Run via: npm run test:firestore-rules */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const base = { projectId: 'P1', teamId: 'T1', month: '10.2026', status: 'Đã nghiệm thu' };
const links = (n: number) => Array.from({ length: n }, (_, i) => `https://fb.com/ads/${i}`);
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-nt-adlinks', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('settings/global', { budgetStartDay: 21, budgetEndDay: 20 });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
  await seed('users/u1', { uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
  await seed('acceptances/a1', { ...base });
});
describe('acceptances: adLinks (Link QC)', () => {
  it('Admin/Mod add, edit, clear links on open kỳ', async () => {
    await assertSucceeds(updateDoc(doc(as('mod'), 'acceptances/a1'), { adLinks: links(3) }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'acceptances/a1'), { adLinks: links(20) }));
    await assertSucceeds(updateDoc(doc(as('mod'), 'acceptances/a1'), { adLinks: [] }));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/a2'), { ...base, adLinks: links(2) }));
  });
  it('shape: >20 or non-list denied', async () => {
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/a1'), { adLinks: links(21) }));
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/a1'), { adLinks: 'https://x.com' }));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/a3'), { ...base, adLinks: links(21) }));
  });
  it('user without edit right denied', async () => {
    await assertFails(updateDoc(doc(as('u1'), 'acceptances/a1'), { adLinks: links(1) }));
  });
  it('locked kỳ (past) denied for Mod', async () => {
    await seed('acceptances/old', { ...base, month: '2026-01' });
    await seed('vnLocks/current', { pastLock: { ns: { on: true, day: 1, min: 0, offset: 1 }, nt: { on: true, day: 1, min: 0, offset: 1 } }, nsCreate: [], nsEdit: [], nt: [] });
    await assertSucceeds(updateDoc(doc(as('mod'), 'acceptances/a1'), { notes: 'x' }).catch(() => undefined));
    await assertFails(updateDoc(doc(as('mod'), 'acceptances/old'), { adLinks: links(1) }));
  });
});
