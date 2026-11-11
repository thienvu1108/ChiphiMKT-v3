/** v-next rules: Đổi tên người dùng (vn.users.rename) — phạm vi + nhật ký bắt buộc. npm run test:firestore-rules */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, collection, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { buildRename } from '../lib/vnext/rename';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: true }).firestore();
const seed = (path: string, data: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path), data); });
const OK = { vnOnboarding: { status: 'approved' } };
const NOW = '2026-10-18T09:00:00.000Z';

async function rename(by: string, target: string, newName: string, over: { audit?: any; patch?: any; noAudit?: boolean } = {}) {
  const db = as(by);
  // withSecurityRulesDisabled trả về void → đọc qua biến ngoài.
  let t: any = {};
  await env.withSecurityRulesDisabled(async (c) => { t = (await getDoc(doc(c.firestore(), 'users', target))).data() || {}; });
  const aref = doc(collection(db, 'auditLogs'));
  const { userPatch, audit } = buildRename({ uid: by, email: `${by}@x.com`, role: '', can: true, myBlockIds: [], gdkdTeamIds: [] }, { id: target, ...t }, newName, NOW, aref.id);
  const b = writeBatch(db);
  if (!over.noAudit) b.set(aref, { ...audit, ...(over.audit || {}) });
  b.update(doc(db, 'users', target), { ...userPatch, ...(over.patch || {}) });
  return b.commit();
}

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-chiphi-rename', firestore: { rules: RULES, host: EMU_HOST, port: Number(EMU_PORT) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlk'] });
  await seed('blocks/B2', { name: 'Khối 2', blockCode: 'E02', directorUid: 'gdk2', assistantUids: [] });
  await seed('teams/T1', { name: 'MAY-01', blockId: 'B1', blockCode: 'E01', gdkdUids: ['g1'] });
  await seed('teams/T2', { name: 'MAY-02', blockId: 'B2', blockCode: 'E02', gdkdUids: ['g2'] });
  await seed('teams/T1b', { name: 'MAY-01B', blockId: 'B1', blockCode: 'E01', gdkdUids: ['gdk'] });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com', fullName: 'Admin' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com', fullName: 'Mod' });
  await seed('users/acc', { uid: 'acc', role: 'accountant', email: 'acc@x.com', fullName: 'KT' });
  await seed('users/gdk', { uid: 'gdk', role: 'gd_khoi', email: 'gdk@x.com', assignedBlock: 'E01', fullName: 'GDK 1' });
  await seed('users/gdk2', { uid: 'gdk2', role: 'gd_khoi', email: 'gdk2@x.com', assignedBlock: 'E02', fullName: 'GDK 2' });
  await seed('users/tlk', { uid: 'tlk', role: 'tro_ly_khoi', email: 'tlk@x.com', assignedBlock: 'E01', fullName: 'TL 1' });
  await seed('users/tlStale', { uid: 'tlStale', role: 'tro_ly_khoi', email: 'tlStale@x.com', assignedBlock: 'E01', fullName: 'TL cũ' });
  await seed('users/g1', { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1', teamName: 'MAY-01', fullName: 'GĐKD 1' });
  await seed('users/g2', { ...OK, uid: 'g2', role: 'gdkd', email: 'g2@x.com', teamId: 'T2', teamName: 'MAY-02', fullName: 'GĐKD 2' });
  await seed('users/u1', { ...OK, uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', teamName: 'MAY-01', fullName: 'User 1' });
  await seed('users/u1b', { ...OK, uid: 'u1b', role: 'user', email: 'u1b@x.com', teamId: 'T1b', teamName: 'MAY-01B', fullName: 'User 1B' });
  await seed('users/u2', { ...OK, uid: 'u2', role: 'user', email: 'u2@x.com', teamId: 'T2', teamName: 'MAY-02', fullName: 'User 2' });
  await seed('users/tlNew', { uid: 'tlNew', role: 'tro_ly_khoi', email: 'tlNew@x.com', fullName: 'TL mới', vnOnboarding: { status: 'approved', position: 'tro_ly_khoi', blockId: 'B1' } });
});

describe('Đổi tên người dùng — phạm vi', () => {
  it('Admin đổi tên bất kỳ ai (kèm nhật ký)', async () => {
    await assertSucceeds(rename('adm', 'u2', 'Nguyễn Văn Hai'));
    await assertSucceeds(rename('adm', 'gdk', 'GĐ Khối Một'));
  });
  it('GĐ Khối: user / GĐKD / Trợ lý trong Khối mình; không Khối khác, không Admin/Mod', async () => {
    await assertSucceeds(rename('gdk', 'u1', 'Tên mới U1'));
    await assertSucceeds(rename('gdk', 'g1', 'Tên mới G1'));
    await assertSucceeds(rename('gdk', 'tlNew', 'Trợ lý mới'));
    await assertFails(rename('gdk', 'u2', 'X'));
    await assertFails(rename('gdk', 'adm', 'X'));
    await assertFails(rename('gdk', 'mod', 'X'));
  });
  it('Trợ lý Khối có tên trong Khối: được; Trợ lý chỉ có assignedBlock (Khối đã có GĐ): không', async () => {
    await assertSucceeds(rename('tlk', 'u1', 'Tên TL đổi'));
    await assertFails(rename('tlStale', 'u1', 'Tên TL cũ đổi'));
  });
  it('GĐKD: chỉ người trong Phòng mình; không Phòng khác, không GĐ Khối', async () => {
    await assertSucceeds(rename('g1', 'u1', 'Tên do GĐKD'));
    await assertFails(rename('g1', 'u2', 'X'));
    await assertFails(rename('g1', 'u1b', 'X'));
    await assertFails(rename('g1', 'gdk', 'X'));
  });
  it('GĐ Khối kiêm GĐKD (teams.gdkdUids) đổi tên user Phòng đó', async () => {
    await assertSucceeds(rename('gdk', 'u1b', 'Tên kiêm'));
  });
  it('user / Mod / Kế toán (mặc định không có quyền) không đổi tên người khác', async () => {
    await assertFails(rename('u1', 'u1b', 'X'));
    await assertFails(rename('mod', 'u1', 'X'));
    await assertFails(rename('acc', 'u1', 'X'));
  });
  it('Mod được cấp quyền trong Phân quyền → đổi tên người không phải Admin', async () => {
    await seed('rolePermissions/mod', { role: 'mod', permissions: ['vn.users.rename'], knownKeys: ['vn.users.rename'] });
    await assertSucceeds(rename('mod', 'u1', 'Tên do Mod'));
    await assertFails(rename('mod', 'adm', 'X'));
  });
  it('Tắt quyền GĐKD trong Phân quyền → bị chặn', async () => {
    await seed('rolePermissions/gdkd', { role: 'gdkd', permissions: [], knownKeys: ['vn.users.rename'] });
    await assertFails(rename('g1', 'u1', 'X'));
  });
});

describe('Đổi tên — chỉ trường tên, nhật ký bắt buộc', () => {
  it('không có nhật ký → chặn', async () => { await assertFails(rename('gdk', 'u1', 'Không log', { noAudit: true })); });
  it('nhật ký sai tên cũ / tên mới / người đổi → chặn', async () => {
    await assertFails(rename('gdk', 'u1', 'Tên A', { audit: { oldName: 'Bịa' } }));
    await assertFails(rename('gdk', 'u1', 'Tên A', { audit: { newName: 'Khác' } }));
    await assertFails(rename('gdk', 'u1', 'Tên A', { audit: { targetUid: 'u2' } }));
  });
  it('kèm trường khác (role / teamId / email) → chặn', async () => {
    await assertFails(rename('gdk', 'u1', 'Tên A', { patch: { role: 'gdkd' } }));
    await assertFails(rename('gdk', 'u1', 'Tên A', { patch: { teamId: 'T2' } }));
    await assertFails(rename('g1', 'u1', 'Tên A', { patch: { email: 'z@x.com' } }));
  });
  it('displayName khác fullName / tên rỗng → chặn', async () => {
    await assertFails(rename('gdk', 'u1', 'Tên A', { patch: { displayName: 'Khác' } }));
    await assertFails(rename('gdk', 'u1', ' ', { audit: { newName: '' }, patch: { fullName: '', displayName: '' } }));
  });
  it('sửa thẳng fullName người khác (không qua đổi tên) → chặn cho GĐK / GĐKD / Mod', async () => {
    await assertFails(updateDoc(doc(as('gdk'), 'users/u1'), { fullName: 'Thẳng' }));
    await assertFails(updateDoc(doc(as('g1'), 'users/u1'), { fullName: 'Thẳng' }));
    await assertFails(updateDoc(doc(as('mod'), 'users/u1'), { fullName: 'Thẳng' }));
  });
  it('nhật ký lưu đúng ai đổi / đổi ai / cũ → mới', async () => {
    await assertSucceeds(rename('gdk', 'u1', 'Tên Ghi Log'));
    let logs: any[] = [];
    await env.withSecurityRulesDisabled(async (c) => {
      const { getDocs, collection: col } = await import('firebase/firestore');
      logs = (await getDocs(col(c.firestore(), 'auditLogs'))).docs.map((d) => d.data());
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'RENAME_USER', userId: 'gdk', targetUid: 'u1', oldName: 'User 1', newName: 'Tên Ghi Log' });
  });
  it('tự đổi tên mình: mọi vai trò (kể cả đang chờ duyệt), có nhật ký', async () => {
    await seed('users/pend', { uid: 'pend', role: 'user', email: 'pend@x.com', fullName: 'Chờ duyệt', vnOnboarding: { status: 'pending' } });
    for (const u of ['u1', 'g1', 'gdk', 'tlk', 'mod', 'acc', 'adm', 'pend']) await assertSucceeds(rename(u, u, 'Tên tự đổi ' + u));
  });
  it('tự đổi tên: không nhật ký / kèm trường khác / nhật ký sai → chặn', async () => {
    await assertFails(updateDoc(doc(as('u1'), 'users/u1'), { fullName: 'Tôi tự đổi' }));
    await assertFails(updateDoc(doc(as('u1'), 'users/u1'), { displayName: 'Tôi tự đổi' }));
    await assertFails(rename('u1', 'u1', 'Tên A', { noAudit: true }));
    await assertFails(rename('u1', 'u1', 'Tên A', { patch: { teamId: 'T2' } }));
    await assertFails(rename('u1', 'u1', 'Tên A', { patch: { role: 'admin' } }));
    await assertFails(rename('u1', 'u1', 'Tên A', { audit: { oldName: 'Bịa' } }));
  });
  it('tự đổi tên: tắt quyền trong Phân quyền → bị chặn; lần đầu điền tên (fullName rỗng) vẫn được', async () => {
    await seed('rolePermissions/user', { role: 'user', permissions: [], knownKeys: ['vn.users.rename_self'] });
    await assertFails(rename('u1', 'u1', 'Tên B'));
    await seed('users/fresh', { uid: 'fresh', role: 'user', email: 'fresh@x.com', fullName: '' });
    await assertSucceeds(updateDoc(doc(as('fresh'), 'users/fresh'), { fullName: 'Lần đầu', displayName: 'Lần đầu' }));
  });
});
