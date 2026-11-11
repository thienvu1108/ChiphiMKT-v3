/** Tab Nghiệm thu MKT (Quản lý Phòng KD): NVKD chỉ đọc bản ghi mình phụ trách. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-team-nt', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/nv', { uid: 'nv', role: 'user', email: 'nv@x.com', teamId: 't1' });
  await seed('users/nv2', { uid: 'nv2', role: 'user', email: 'nv2@x.com', teamId: 't1' });
  await seed('rolePermissions/user', { role: 'user', permissions: [] });
  await seed('acceptances/mine', { teamId: 't1', month: '2026-11', implementerUid: 'nv' });
  await seed('acceptances/other', { teamId: 't1', month: '2026-11', implementerUid: 'x' });
});
describe('acceptances: NVKD own records', () => {
  it('reads own record + own query', async () => {
    await assertSucceeds(getDoc(doc(as('nv'), 'acceptances/mine')));
    await assertSucceeds(getDocs(query(collection(as('nv'), 'acceptances'), where('implementerUid', '==', 'nv'))));
  });
  it('cannot read others / list all', async () => {
    await assertFails(getDoc(doc(as('nv'), 'acceptances/other')));
    await assertFails(getDocs(collection(as('nv'), 'acceptances')));
    await assertFails(getDocs(query(collection(as('nv2'), 'acceptances'), where('implementerUid', '==', 'nv'))));
  });
  it('key turned off → no read', async () => {
    await seed('rolePermissions/user', { role: 'user', permissions: [], knownKeys: ['vn.team_nt.view'] });
    await assertFails(getDoc(doc(as('nv'), 'acceptances/mine')));
  });
});
