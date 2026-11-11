/** Trưởng/Phó Ban duyệt NS (nsSupport): khoá kỳ đã qua (vnLocks.pastLock.ns) chặn mọi người trừ Super Admin;
 *  Phó Ban kiêm GĐ Khối không bị vượt 1000 biểu thức (nhánh Ban / GĐK tách theo ý định ghi). */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc, getDoc, runTransaction } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { buildBanDecision } from '../lib/vnext/banSupport';
import { buildDecision } from '../lib/vnext/support';
const RULES = readFileSync('firestore.rules', 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const OK = { vnOnboarding: { status: 'approved' } };
const PERIOD = '2026-11';
const line: any = { id: 'u_2026-11_L1', kind: 'user', period: PERIOD, ownerUid: 'own', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 40000000, updatedAt: '2026-11-01T00:00:00.000Z' };
const prev: any = { lineId: line.id, period: PERIOD, ownerUid: 'own', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 40000000, status: 'approved', decidedBy: 'gdk0', decidedByName: 'GĐK', decidedAt: '2026-11-03T00:00:00.000Z', history: [1, 2, 3, 4, 5].map((i) => ({ at: '2026-11-0' + i + 'T00:00:00.000Z', byUid: 'gdk0', byName: 'GĐK', status: 'approved', amount: 40000000 })), banStatus: 'pending' };
const lock = (on: boolean) => seed('vnLocks/current', { pastLock: { ns: { on, day: 6, min: 0, offset: 0 } } });

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-ban-pastlock', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/lead', { ...OK, uid: 'lead', role: 'truong_ban_kd', email: 'lead@x.com' });
  await seed('users/dep', { ...OK, uid: 'dep', role: 'gd_khoi', email: 'dep@x.com' });
  await seed('users/sa', { ...OK, uid: 'sa', role: 'super_admin', email: 'sa@x.com' });
  await seed('ban_kd/BAN10', { name: 'BAN KD 10', leaderUid: 'lead', leaderEmail: 'lead@x.com', deputyUids: ['dep'] });
  await seed('projects/P1', { name: 'Dự án', banKdId: 'BAN10' });
  await seed('blocks/B1', { name: 'K', blockCode: 'A1.E21', directorUid: 'dep', assistantUids: [] });
  await seed('teams/T1', { name: 'T', blockId: 'B1' });
  const { id, ...l } = line; await seed('ns_lines/' + id, l);
  await seed('nsSupport/' + line.id, prev);
});

describe('Ban duyệt NS + khoá kỳ đã qua', () => {
  it('khoá kỳ NS bật (kỳ 11 khoá từ 06/11): Trưởng Ban bị chặn — trường hợp BAN KD 10', async () => {
    await lock(true);
    await assertFails(setDoc(doc(as('lead'), 'nsSupport/' + line.id), buildBanDecision(line, prev, { uid: 'lead', name: 'TB', role: 'leader' }, 'approved')));
  });
  it('khoá tắt: Trưởng Ban duyệt được (5 mục lịch sử, Chờ Ban duyệt)', async () => {
    await lock(false);
    await assertSucceeds(setDoc(doc(as('lead'), 'nsSupport/' + line.id), buildBanDecision(line, prev, { uid: 'lead', name: 'TB', role: 'leader' }, 'approved')));
  });
  it('Phó Ban kiêm GĐ Khối duyệt Ban được; vẫn duyệt GĐK được', async () => {
    await lock(false);
    await assertSucceeds(setDoc(doc(as('dep'), 'nsSupport/' + line.id), buildBanDecision(line, prev, { uid: 'dep', name: 'PB', role: 'deputy' }, 'approved')));
  });
  it('GĐ Khối (kiêm Phó Ban) vẫn từ chối tầng GĐK được', async () => {
    await lock(false);
    const { banStatus, ...g } = prev;
    await seed('nsSupport/' + line.id, { ...g, status: 'pending' });
    await assertSucceeds(setDoc(doc(as('dep'), 'nsSupport/' + line.id), buildDecision(line, { ...g, status: 'pending' }, { uid: 'dep', name: 'PB' }, 'rejected', 'Thiếu chứng từ')));
  });
  it('ghi quyết định Ban giả danh người khác → nhánh GĐK, Trưởng Ban không qua', async () => {
    await lock(false);
    const p: any = buildBanDecision(line, prev, { uid: 'lead', name: 'TB', role: 'leader' }, 'approved');
    await assertFails(setDoc(doc(as('lead'), 'nsSupport/' + line.id), { ...p, banDecidedBy: 'other' }));
  });
  it('GĐK duyệt: bị chặn khi khoá kỳ NS bật (trường hợp HCM.E91), được khi tắt', async () => {
    const { banStatus, ...g } = prev; const p0 = { ...g, status: 'pending' };
    await seed('nsSupport/' + line.id, p0);
    await seed('userKyc/own', { cccd: '001', bankAccount: '12345678', accountHolder: 'A', bankName: 'B' });
    await lock(true);
    await assertFails(setDoc(doc(as('dep'), 'nsSupport/' + line.id), buildDecision(line, p0, { uid: 'dep', name: 'G' }, 'approved')));
    await lock(false);
    await assertSucceeds(setDoc(doc(as('dep'), 'nsSupport/' + line.id), buildDecision(line, p0, { uid: 'dep', name: 'G' }, 'approved')));
  });
  it('Super Admin vẫn ghi khi khoá', async () => {
    await lock(true);
    await assertSucceeds(setDoc(doc(as('sa'), 'nsSupport/' + line.id), buildBanDecision(line, prev, { uid: 'sa', name: 'SA', role: 'admin' }, 'approved')));
  });
});

describe('Phó Ban transaction on missing auto-approved Khối support', () => {
  it('reads missing support in own Ban, materializes full history payload; other Ban denied', async () => {
    await seed('users/dep', { ...OK, uid: 'dep', role: 'pho_ban_kd', email: 'dep@x.com' });
    await seed('users/stranger', { ...OK, role: 'pho_ban_kd' });
    await seed('vnLocks/current', { pastLock: { ns: { on: true, day: 6, min: 0, offset: 1 } } });
    const auto = { ...line, kind: 'khoi', teamId: '' };
    const { id, ...data } = auto; await seed('ns_lines/' + id, data);
    await env.withSecurityRulesDisabled(c => deleteDoc(doc(c.firestore(), 'nsSupport/' + id)));
    await assertFails(getDoc(doc(as('stranger'), 'nsSupport/' + id)));
    const db = as('dep');
    await assertSucceeds(runTransaction(db, async tx => {
      const snap = await tx.get(doc(db, 'nsSupport/' + id));
      tx.set(doc(db, 'nsSupport/' + id), buildBanDecision(auto, snap.exists() ? snap.data() : undefined,
        { uid: 'dep', name: 'Phó Ban', role: 'deputy' }, 'approved'));
    }));
    // Existing support remains restricted to its project's Ban.
    await assertFails(getDoc(doc(as('stranger'), 'nsSupport/' + id)));
    await assertSucceeds(getDoc(doc(db, 'nsSupport/' + id)));
  });
});
