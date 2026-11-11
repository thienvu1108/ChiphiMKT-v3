/**
 * link-on-login executor against the Firestore emulator (Admin SDK, rules bypassed like prod) +
 * rules: clients can neither read the archive nor delete / re-point the old profile themselves.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { linkOnLogin } from '../api/_lib/linkOnLoginExec';

const PROJECT = 'demo-chiphi-linkonlogin';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const app = initializeApp({ projectId: PROJECT }, 'emu-link');
const db = getFirestore(app);
const EMAIL = 'imported.user@example.com', IDX = 'imported_dot_user_at_example_dot_com', OLD = 'OLD_IMPORTED', NEW = 'NEW_AUTH';

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); await deleteApp(app); });
beforeEach(async () => {
  await env.clearFirestore();
  await db.doc(`users/${OLD}`).set({ email: EMAIL, role: 'gdkd', teamName: 'MAY9', assignedProjects: ['p1'], linkedToUid: NEW });
  await db.doc(`users/${NEW}`).set({ uid: NEW, email: EMAIL, role: 'gdkd', assignedProjects: ['p1'], migratedFromUid: OLD, emailIndexId: IDX });
  await db.doc(`usersByEmail/${IDX}`).set({ email: EMAIL, oldUid: OLD });
  await db.doc('blocks/B1').set({ directorUid: OLD, assistantUids: [OLD] });
  await db.doc('ban_kd/K1').set({ memberUids: [OLD, 'x'] });
  await db.doc('teams/T1').set({ gdkdUids: [OLD] });
  await db.doc('supportRequests/S1').set({ userId: OLD });
  await db.doc('budgets/G1').set({ createdBy: OLD, updatedBy: OLD });
});

describe('link-on-login executor', () => {
  it('archives + deletes the old doc, repoints refs, re-points usersByEmail; second call is a no-op', async () => {
    const r: any = await linkOnLogin(db, NEW, EMAIL);
    expect(r.status).toBe('linked');
    expect(r.retired).toEqual([OLD]);
    expect((await db.doc(`users/${OLD}`).get()).exists).toBe(false);
    const arc = (await db.doc(`users_merged_archive/${OLD}`).get()).data()!;
    expect(arc.mergedInto).toBe(NEW); expect(arc.role).toBe('gdkd');
    expect((await db.doc('blocks/B1').get()).data()).toEqual({ directorUid: NEW, assistantUids: [NEW] });
    expect((await db.doc('ban_kd/K1').get()).data()!.memberUids).toEqual([NEW, 'x']);
    expect((await db.doc('teams/T1').get()).data()!.gdkdUids).toEqual([NEW]);
    expect((await db.doc('supportRequests/S1').get()).data()!.userId).toBe(NEW);
    expect((await db.doc('budgets/G1').get()).data()).toEqual({ createdBy: NEW, updatedBy: OLD });
    expect((await db.doc(`usersByEmail/${IDX}`).get()).data()!.oldUid).toBe(NEW);
    const me = (await db.doc(`users/${NEW}`).get()).data()!;
    expect(me.mergedFrom).toEqual([OLD]); expect(me.teamName).toBe('MAY9');
    expect((await linkOnLogin(db, NEW, EMAIL)).status).toBe('clean');
  });
  it('leaves a privileged old doc that was not carried (conflict)', async () => {
    await db.doc(`users/${NEW}`).set({ uid: NEW, email: EMAIL, role: 'user' });
    await db.doc(`users/${OLD}`).set({ email: EMAIL, role: 'admin' });
    const r: any = await linkOnLogin(db, NEW, EMAIL);
    expect(r.status).toBe('conflict');
    expect((await db.doc(`users/${OLD}`).get()).exists).toBe(true);
  });
  it('rules: client cannot read the archive, delete the old doc, or re-point usersByEmail', async () => {
    await linkOnLogin(db, NEW, EMAIL);
    await db.doc(`users/${OLD}`).set({ email: EMAIL, role: 'gdkd' });
    const c = env.authenticatedContext(NEW, { email: EMAIL, email_verified: true }).firestore();
    await assertFails(getDoc(doc(c, 'users_merged_archive', OLD)));
    await assertFails(deleteDoc(doc(c, 'users', OLD)));
    await assertFails(setDoc(doc(c, 'usersByEmail', IDX), { email: EMAIL, oldUid: 'HIJACK' }));
  });
});
