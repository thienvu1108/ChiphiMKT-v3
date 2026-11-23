/** GĐ Khối kiêm Phó Ban: đọc nsSupport toàn Ban (kể cả Khối khác), ns_lines chỉ theo Khối mình;
 *  duyệt Ban được cả dòng Khối mình lẫn Khối khác; Trưởng Ban ưu tiên; tầng GĐK vẫn giới hạn Khối mình. */
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
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
const mkLine = (owner: string, team: string, block: string): any => ({
  id: `u_${PERIOD}_${team}_P1_${owner}`, kind: 'user', period: PERIOD, ownerUid: owner, teamId: team, blockId: block, projectId: 'P1',
  amount: 40000000, updatedAt: '2026-11-01T00:00:00.000Z',
});
const mkPrev = (l: any, gdk: string): any => ({
  lineId: l.id, period: PERIOD, ownerUid: l.ownerUid, teamId: l.teamId, blockId: l.blockId, projectId: 'P1', amount: 40000000,
  status: 'approved', decidedBy: gdk, decidedByName: 'GĐK', decidedAt: '2026-11-03T00:00:00.000Z',
  history: [1, 2, 3, 4, 5].map((i) => ({ at: '2026-11-0' + i + 'T00:00:00.000Z', byUid: gdk, byName: 'GĐK', status: 'approved', amount: 40000000 })),
  banStatus: 'pending',
});
const line1 = mkLine('own1', 'T1', 'B1'); // Khối của dep
const line2 = mkLine('own2', 'T2', 'B2'); // Khối khác (gdk2)
const prev1 = mkPrev(line1, 'dep');
const prev2 = mkPrev(line2, 'gdk2');
const DEP = { uid: 'dep', name: 'PB', role: 'deputy' as const };
const LEAD = { uid: 'lead', name: 'TB', role: 'leader' as const };

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-gdk-deputy-ban', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('vnLocks/current', { pastLock: { ns: { on: false, day: 6, min: 0, offset: 0 } } });
  await seed('users/lead', { ...OK, uid: 'lead', role: 'truong_ban_kd', email: 'lead@x.com' });
  await seed('users/dep', { ...OK, uid: 'dep', role: 'gd_khoi', email: 'dep@x.com' });
  await seed('users/gdk2', { ...OK, uid: 'gdk2', role: 'gd_khoi', email: 'gdk2@x.com' });
  await seed('users/sa', { ...OK, uid: 'sa', role: 'super_admin', email: 'sa@x.com' });
  await seed('ban_kd/BAN10', { name: 'BAN KD 10', leaderUid: 'lead', leaderEmail: 'lead@x.com', deputyUids: ['dep'] });
  await seed('projects/P1', { name: 'Dự án', banKdId: 'BAN10' });
  await seed('blocks/B1', { name: 'K1', blockCode: 'A1.E21', directorUid: 'dep', assistantUids: [] });
  await seed('blocks/B2', { name: 'K2', blockCode: 'A1.E22', directorUid: 'gdk2', assistantUids: [] });
  await seed('teams/T1', { name: 'T1', blockId: 'B1' });
  await seed('teams/T2', { name: 'T2', blockId: 'B2' });
  for (const [l, p] of [[line1, prev1], [line2, prev2]] as const) {
    const { id, ...d } = l; await seed('ns_lines/' + id, d);
    await seed('nsSupport/' + id, p);
    await seed('userKyc/' + l.ownerUid, { cccd: '001', bankAccount: '12345678', accountHolder: 'A', bankName: 'B' });
  }
});

describe('GĐ Khối kiêm Phó Ban — đọc & duyệt Ban', () => {
  it('đọc nsSupport theo dự án của Ban: thấy cả dòng Khối khác', async () => {
    const snap = await assertSucceeds(getDocs(query(collection(as('dep'), 'nsSupport'), where('projectId', 'in', ['P1']))));
    if (snap.size !== 2) throw new Error('kỳ vọng 2 nsSupport (cả Khối B2), nhận ' + snap.size);
  });
  it('đọc ns_lines theo blockId == Khối mình được', async () => {
    await assertSucceeds(getDocs(query(collection(as('dep'), 'ns_lines'), where('blockId', '==', 'B1'))));
  });
  it('đọc ns_lines theo projectId (không giới hạn Khối) bị chặn — UI dựng dòng Khối khác từ nsSupport', async () => {
    await assertFails(getDocs(query(collection(as('dep'), 'ns_lines'), where('projectId', 'in', ['P1']))));
  });
  it('Phó Ban kiêm GĐK duyệt Ban dòng Khối khác (B2) được', async () => {
    await assertSucceeds(setDoc(doc(as('dep'), 'nsSupport/' + line2.id), buildBanDecision(line2, prev2, DEP, 'approved')));
  });
  it('Phó Ban kiêm GĐK duyệt Ban dòng Khối mình (B1) được — không chặn xung đột lợi ích', async () => {
    await assertSucceeds(setDoc(doc(as('dep'), 'nsSupport/' + line1.id), buildBanDecision(line1, prev1, DEP, 'approved')));
  });
  it('Trưởng Ban đã duyệt dòng B2 → Phó Ban kiêm GĐK từ chối sau đó bị chặn (Trưởng Ban ưu tiên)', async () => {
    const byLead: any = buildBanDecision(line2, prev2, LEAD, 'approved');
    await assertSucceeds(setDoc(doc(as('lead'), 'nsSupport/' + line2.id), byLead));
    await assertFails(setDoc(doc(as('dep'), 'nsSupport/' + line2.id), buildBanDecision(line2, byLead, DEP, 'rejected', 'Sai số liệu')));
  });
  it('tầng GĐK: dep không quyết định được dòng Khối khác (B2); quyết định được dòng B1 đang chờ', async () => {
    const { banStatus: _b2, ...g2 } = prev2; const p2 = { ...g2, status: 'pending' };
    await seed('nsSupport/' + line2.id, p2);
    await assertFails(setDoc(doc(as('dep'), 'nsSupport/' + line2.id), buildDecision(line2, p2, { uid: 'dep', name: 'G' }, 'approved')));
    const { banStatus: _b1, ...g1 } = prev1; const p1 = { ...g1, status: 'pending' };
    await seed('nsSupport/' + line1.id, p1);
    await assertSucceeds(setDoc(doc(as('dep'), 'nsSupport/' + line1.id), buildDecision(line1, p1, { uid: 'dep', name: 'G' }, 'approved')));
  });
});
