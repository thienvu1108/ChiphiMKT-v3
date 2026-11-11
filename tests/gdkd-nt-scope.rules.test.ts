/** GĐKD: ảnh/hoá đơn/finalAcceptances chỉ Phòng mình; không auditLogs/docProcessing; thông báo chỉ người nhận; teamName fallback. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const OK = { vnOnboarding: { status: 'approved' } };
const NT = ['finalAcceptances', 'acceptanceImages', 'acceptanceInvoices', 'acceptanceImageData'];
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-gdkd-nt', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'K1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlk'] });
  await seed('teams/T1', { name: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', gdkdUids: ['g1'] });
  await seed('teams/T2', { name: 'MAY-02', teamCode: 'E01.2', blockId: 'B1', gdkdUids: ['g2'] });
  for (const [u, r] of [['adm', 'admin'], ['mod', 'mod'], ['kt', 'accountant'], ['gdk', 'gd_khoi'], ['tlk', 'tro_ly_khoi']]) await seed('users/' + u, { ...OK, uid: u, role: r, email: u + '@x.com' });
  await seed('users/g1', { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1' });
  await seed('users/gn', { ...OK, uid: 'gn', role: 'gdkd', email: 'gn@x.com', teamName: 'MAY-01' }); // GĐKD cũ: chỉ có teamName
  await seed('users/u1', { ...OK, uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1' });
  for (const c of NT) { await seed(`${c}/a1`, { teamId: 'T1', acceptanceId: 'a1', provider: 'drive', month: '2026-10' }); await seed(`${c}/a2`, { teamId: 'T2', acceptanceId: 'a2', provider: 'drive', month: '2026-10' }); await seed(`${c}/none`, { acceptanceId: 'x', provider: 'drive' }); }
  for (const c of ['auditLogs', 'docProcessing']) await seed(`${c}/l1`, { teamId: 'T1', action: 'X', userId: 'adm' });
  for (const c of ['notifications', 'teamNotifications']) { await seed(`${c}/n1`, { targetEmails: ['u1@x.com'], title: 't' }); await seed(`${c}/n2`, { targetUid: 'g1', title: 't' }); await seed(`${c}/n3`, { recipients: ['adm@x.com'], title: 't' }); }
  await seed('weekly_reports/w1', { teamId: 'T1', uid: 'u1', period: '2026-10' });
  await seed('weekly_reports/w2', { teamId: 'T2', uid: 'u2', period: '2026-10' });
});
describe('GĐKD NT scope', () => {
  it('ảnh / hoá đơn / ảnh dự phòng / finalAcceptances: chỉ Phòng mình (teamId), không Phòng khác, không bản ghi thiếu teamId', async () => {
    for (const c of NT) {
      await assertSucceeds(getDoc(doc(as('g1'), `${c}/a1`)));
      await assertFails(getDoc(doc(as('g1'), `${c}/a2`)));
      await assertFails(getDoc(doc(as('g1'), `${c}/none`)));
      await assertFails(getDocs(collection(as('g1'), c)));
      await assertSucceeds(getDocs(query(collection(as('g1'), c), where('teamId', '==', 'T1'))));
      await assertSucceeds(getDocs(query(collection(as('g1'), c), where('acceptanceId', '==', 'a1'), where('teamId', '==', 'T1'))));
      await assertFails(getDocs(query(collection(as('g1'), c), where('teamId', '==', 'T2'))));
    }
  });
  it('vai trò khác không đổi: Admin / Mod / Kế toán / GĐK đọc toàn bộ NT', async () => {
    for (const u of ['adm', 'mod', 'kt', 'gdk']) for (const c of NT) if (!(u === 'gdk' && c === 'finalAcceptances')) await assertSucceeds(getDocs(collection(as(u), c)));
    // GĐ Khối: finalAcceptances theo Phòng thuộc Khối (nt-read-scope.rules.test.ts).
    await assertSucceeds(getDocs(query(collection(as('gdk'), 'finalAcceptances'), where('teamId', '==', 'T2'))));
  });
  it('auditLogs / docProcessing: GĐKD không đọc, không ghi docProcessing; Admin vẫn đọc', async () => {
    for (const c of ['auditLogs', 'docProcessing']) { await assertFails(getDoc(doc(as('g1'), `${c}/l1`))); await assertFails(getDocs(collection(as('g1'), c))); await assertSucceeds(getDocs(collection(as('adm'), c))); }
    await assertFails(setDoc(doc(as('g1'), 'docProcessing/x'), { projectId: 'p', teamId: 'T1' }));
    await assertSucceeds(getDocs(collection(as('gdk'), 'docProcessing')));
  });
  it('thông báo: chỉ người nhận (mọi vai trò, kể cả Admin); truy vấn array-contains email được phép', async () => {
    for (const c of ['notifications', 'teamNotifications']) {
      await assertSucceeds(getDoc(doc(as('u1'), `${c}/n1`)));
      await assertSucceeds(getDoc(doc(as('g1'), `${c}/n2`)));
      await assertSucceeds(getDoc(doc(as('adm'), `${c}/n3`)));
      await assertFails(getDoc(doc(as('g1'), `${c}/n1`)));
      await assertFails(getDoc(doc(as('adm'), `${c}/n1`)));
      for (const u of ['u1', 'g1', 'adm', 'gdk', 'tlk']) await assertFails(getDocs(collection(as(u), c)));
      await assertSucceeds(getDocs(query(collection(as('u1'), c), where('targetEmails', 'array-contains', 'u1@x.com'))));
      await assertFails(getDocs(query(collection(as('u1'), c), where('targetEmails', 'array-contains', 'g1@x.com'))));
    }
  });
  it('GĐKD chỉ có teamName (không teamId): vẫn đọc báo cáo tuần Phòng mình (vnGdkdOfTeamCheap = isGdkdOfTeam), không Phòng khác', async () => {
    await assertSucceeds(getDoc(doc(as('gn'), 'weekly_reports/w1')));
    await assertFails(getDoc(doc(as('gn'), 'weekly_reports/w2')));
    await assertSucceeds(getDoc(doc(as('gn'), 'acceptanceImages/a1')));
    await assertFails(getDoc(doc(as('gn'), 'acceptanceImages/a2')));
  });
});
