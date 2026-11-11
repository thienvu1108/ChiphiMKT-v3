/** Yêu cầu cập nhật tên (nameUpdateRequests) — ai gắn cờ, ai xoá, báo lại người yêu cầu. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc, writeBatch, collection, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { buildRename } from '../lib/vnext/rename';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const OK = { vnOnboarding: { status: 'approved' } };
const flag = (by: string, over: any = {}) => ({ uid: 'n1', by, byName: by, byEmail: `${by}@x.com`, at: '2026-10-24T01:00:00Z', note: 'Ghi đủ họ tên', oldName: 'abc', teamId: 'T1', ...over });
async function selfRename(uid: string, name: string, extra?: (b: any, db: any) => void) {
  const db = as(uid); let t: any = {};
  await env.withSecurityRulesDisabled(async (c) => { t = (await getDoc(doc(c.firestore(), 'users', uid))).data() || {}; });
  const aref = doc(collection(db, 'auditLogs'));
  const { userPatch, audit } = buildRename({ uid, email: `${uid}@x.com`, role: '', can: true, myBlockIds: [], gdkdTeamIds: [] }, { id: uid, ...t }, name, '2026-10-24T01:00:00Z', aref.id);
  const b = writeBatch(db); b.set(aref, audit); b.update(doc(db, 'users', uid), userPatch); extra?.(b, db); return b.commit();
}
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-namereq', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk', assistantUids: [] });
  await seed('teams/T1', { name: 'MAY-01', blockId: 'B1', blockCode: 'E01', gdkdUids: ['g1'] });
  await seed('teams/T2', { name: 'MAY-02', blockId: 'B1', blockCode: 'E01', gdkdUids: ['g2'] });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com', fullName: 'Admin' });
  await seed('users/g1', { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1', teamName: 'MAY-01', fullName: 'GĐKD 1' });
  await seed('users/g2', { ...OK, uid: 'g2', role: 'gdkd', email: 'g2@x.com', teamId: 'T2', teamName: 'MAY-02', fullName: 'GĐKD 2' });
  await seed('users/n1', { uid: 'n1', role: 'user', email: 'n1@x.com', fullName: 'abc' });
  await seed('users/u9', { ...OK, uid: 'u9', role: 'user', email: 'u9@x.com', teamId: 'T1', fullName: 'U9' });
  await seed('accessRequests/n1', { uid: 'n1', email: 'n1@x.com', name: 'abc', kind: 'onboarding', position: 'nvkd', teamId: 'T1', blockId: 'B1', status: 'pending', createdAt: '2026-10-24T00:00:00Z' });
});
describe('Yêu cầu cập nhật tên', () => {
  it('GĐKD của Phòng và Admin gắn cờ được; GĐKD Phòng khác / user thường / chính mình thì không', async () => {
    await assertSucceeds(setDoc(doc(as('g1'), 'nameUpdateRequests/n1'), flag('g1')));
    await assertSucceeds(setDoc(doc(as('adm'), 'nameUpdateRequests/n1'), flag('adm')));
    await assertFails(setDoc(doc(as('g2'), 'nameUpdateRequests/n1'), flag('g2')));
    await assertFails(setDoc(doc(as('u9'), 'nameUpdateRequests/n1'), flag('u9')));
    await assertFails(setDoc(doc(as('n1'), 'nameUpdateRequests/n1'), flag('n1')));
    await assertFails(setDoc(doc(as('g1'), 'nameUpdateRequests/n1'), flag('adm')));
    await assertFails(setDoc(doc(as('g1'), 'nameUpdateRequests/n1'), { ...flag('g1'), role: 'admin' }));
  });
  it('Người dùng không tự xoá cờ khi chưa đổi tên; đổi tên xong xoá + báo người yêu cầu trong cùng batch', async () => {
    await seed('nameUpdateRequests/n1', flag('g1'));
    await assertFails(deleteDoc(doc(as('n1'), 'nameUpdateRequests/n1')));
    await assertSucceeds(selfRename('n1', 'Nguyễn Văn An', (b, db) => {
      b.set(doc(collection(db, 'userNotifs')), { toUid: 'g1', type: 'member', title: 'Người dùng đã cập nhật họ tên', body: 'abc → Nguyễn Văn An', link: '', refId: 'n1', createdAt: 'x', createdBy: 'n1', read: false });
      b.delete(doc(db, 'nameUpdateRequests/n1'));
    }));
  });
  it('Đổi tên riêng rồi xoá cờ sau cũng được; người khác không xoá được', async () => {
    await seed('nameUpdateRequests/n1', flag('g1'));
    await assertFails(deleteDoc(doc(as('g2'), 'nameUpdateRequests/n1')));
    await assertSucceeds(selfRename('n1', 'Trần B'));
    await assertSucceeds(deleteDoc(doc(as('n1'), 'nameUpdateRequests/n1')));
  });
  it('Có cờ → tự đổi tên được kể cả khi quyền rename_self bị tắt', async () => {
    await seed('rolePermissions/user', { knownKeys: ['vn.users.rename_self'], permissions: [] });
    await assertFails(selfRename('u9', 'Tự đổi khi bị tắt quyền'));
    await seed('nameUpdateRequests/n1', flag('g1'));
    await assertSucceeds(selfRename('n1', 'Lê C'));
  });
  it('Đọc: chính mình, người yêu cầu, Admin; người khác không', async () => {
    await seed('nameUpdateRequests/n1', flag('g1'));
    await assertSucceeds(getDoc(doc(as('n1'), 'nameUpdateRequests/n1')));
    await assertSucceeds(getDoc(doc(as('g1'), 'nameUpdateRequests/n1')));
    await assertFails(getDoc(doc(as('u9'), 'nameUpdateRequests/n1')));
  });
});
