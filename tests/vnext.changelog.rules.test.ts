import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const entry = (actor: string, before: any, over: any = {}) => ({ col: 'projects', docId: 'P1', op: 'update', before, patch: { name: 'Mới' }, options: null, actor, actorName: actor, at: serverTimestamp(), ...over });

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-chiphi-cl', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/u1', { uid: 'u1', role: 'user', email: 'u1@x.com' });
  await seed('projects/P1', { name: 'Cũ' });
});
describe('changeLog', () => {
  it('ghi đúng: actor = mình, before = dữ liệu thật', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'changeLog/a'), entry('u1', { name: 'Cũ' })));
    await assertSucceeds(setDoc(doc(as('u1'), 'changeLog/b'), entry('u1', null, { docId: 'NEW', op: 'create' })));
  });
  it('không giả mạo actor / before / thời gian / collection', async () => {
    await assertFails(setDoc(doc(as('u1'), 'changeLog/a'), entry('adm', { name: 'Cũ' })));
    await assertFails(setDoc(doc(as('u1'), 'changeLog/a'), entry('u1', { name: 'Giả' })));
    await assertFails(setDoc(doc(as('u1'), 'changeLog/a'), entry('u1', { name: 'Cũ' }, { at: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(doc(as('u1'), 'changeLog/a'), entry('u1', null, { col: 'changeLog', docId: 'x' })));
  });
  it('chỉ Admin đọc; không sửa/xoá (trừ đánh dấu failed của mình)', async () => {
    await seed('changeLog/a', { ...entry('u1', { name: 'Cũ' }), at: Timestamp.now() });
    await assertFails(getDoc(doc(as('u1'), 'changeLog/a')));
    await assertSucceeds(getDoc(doc(as('adm'), 'changeLog/a')));
    await assertFails(updateDoc(doc(as('u1'), 'changeLog/a'), { before: null }));
    await assertSucceeds(updateDoc(doc(as('u1'), 'changeLog/a'), { status: 'failed' }));
    await assertFails(updateDoc(doc(as('adm'), 'changeLog/a'), { status: 'failed' }));
    await assertFails(deleteDoc(doc(as('adm'), 'changeLog/a')));
    await seed('changeLog/old', { ...entry('u1', null), at: Timestamp.fromMillis(Date.now() - 400 * 864e5) });
    await assertFails(deleteDoc(doc(as('u1'), 'changeLog/old')));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'changeLog/old')));
  });
});
