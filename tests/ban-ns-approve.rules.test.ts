/** Tầng Ban duyệt nsSupport: đọc theo isBanMgrOf(project.banKdId); Trưởng Ban duyệt; Phó Ban không duyệt. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string, email?: string) => env.authenticatedContext(uid, { email: (email || uid + '@x.com'), email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const LID = 'u_2026-11_T1_P1_u1';
const KL = 'k_2026-11_B1_P1_gdk';
const baseSup = (by: string, over: any = {}) => ({
  lineId: LID, period: '2026-11', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 5000000,
  status: 'approved', decidedBy: by, decidedByName: by, decidedAt: '2026-11-01T00:00:00Z', history: [], banStatus: 'pending', ...over,
});
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-ban-ns', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlk'] });
  await seed('teams/T1', { name: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', gdkdUids: ['g1'] });
  await seed('projects/P1', { name: 'DA1', banKdId: 'BAN1', banKdName: 'Ban 1' });
  await seed('ban_kd/BAN1', { name: 'Ban 1', leaderUid: 'tb1', deputyUids: ['pb1'] });
  for (const [u, r] of [['adm', 'admin'], ['kt', 'accountant'], ['gdk', 'gd_khoi'], ['tlk', 'tro_ly_khoi'], ['tb1', 'truong_ban_kd'], ['pb1', 'user'], ['u1', 'user'], ['tb2', 'truong_ban_kd']]) {
    await seed('users/' + u, { uid: u, role: r, email: u + '@x.com', ...(r === 'user' || r === 'gdkd' ? { vnOnboarding: { status: 'approved' } } : {}) });
  }
  await seed('users/u1', { uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
  await seed('userKyc/u1', { uid: 'u1', cccd: '001099012345', bankAccount: '0123456789', bankName: 'VCB', accountHolder: 'NGUYEN VAN A', fullName: 'A', updatedAt: 'x', updatedBy: 'u1' });
  await seed('ns_lines/' + LID, { period: '2026-11', kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', ownerUid: 'u1', ownerName: 'U1', amount: 5000000 });
  await seed('ns_lines/' + KL, { period: '2026-11', kind: 'khoi', teamId: '', blockId: 'B1', projectId: 'P1', ownerUid: 'gdk', ownerName: 'GDK', amount: 60000000 });
  await seed('userKyc/gdk', { uid: 'gdk', cccd: '001099012345', bankAccount: '0123456789', bankName: 'VCB', accountHolder: 'GDK', fullName: 'GDK', updatedAt: 'x', updatedBy: 'gdk' });
});

describe('nsSupport Ban layer', () => {
  it('GĐK duyệt kèm banStatus pending', async () => {
    await assertSucceeds(setDoc(doc(as('gdk'), 'nsSupport/' + LID), baseSup('gdk')));
  });
  it('Trưởng Ban + Phó Ban đọc nsSupport của dự án Ban mình; Trưởng Ban khác không', async () => {
    await seed('nsSupport/' + LID, baseSup('gdk'));
    await assertSucceeds(getDoc(doc(as('tb1'), 'nsSupport/' + LID)));
    await assertSucceeds(getDoc(doc(as('pb1'), 'nsSupport/' + LID)));
    await assertFails(getDoc(doc(as('tb2'), 'nsSupport/' + LID)));
  });
  it('Trưởng Ban duyệt / từ chối; Phó Ban không duyệt; Admin override', async () => {
    await seed('nsSupport/' + LID, baseSup('gdk'));
    const banOk = { ...baseSup('gdk'), banStatus: 'approved', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: '2026-11-02T00:00:00Z' };
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), banOk));
    await seed('nsSupport/' + LID, baseSup('gdk'));
    const banRej = { ...baseSup('gdk'), banStatus: 'rejected', banReason: 'Sai chứng từ', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: '2026-11-02T00:00:00Z' };
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), banRej));
    await seed('nsSupport/' + LID, baseSup('gdk'));
    // Phó Ban: phải ghi banDecidedRole='deputy'
    await assertFails(setDoc(doc(as('pb1'), 'nsSupport/' + LID), { ...banOk, banDecidedBy: 'pb1', banDecidedByName: 'PB' }));
    await assertSucceeds(setDoc(doc(as('pb1'), 'nsSupport/' + LID), { ...banOk, banDecidedBy: 'pb1', banDecidedByName: 'PB', banDecidedRole: 'deputy' }));
    await seed('nsSupport/' + LID, baseSup('gdk'));
    await assertSucceeds(setDoc(doc(as('adm'), 'nsSupport/' + LID), { ...banOk, banDecidedBy: 'adm', banDecidedByName: 'Admin' }));
    await seed('nsSupport/' + LID, baseSup('gdk'));
    await assertSucceeds(setDoc(doc(as('kt'), 'nsSupport/' + LID), { ...banOk, banDecidedBy: 'kt', banDecidedByName: 'KT' }));
  });
  it('Trưởng Ban materialize NS Khối tự duyệt (create decidedBy=auto)', async () => {
    const payload = {
      lineId: KL, period: '2026-11', ownerUid: 'gdk', teamId: '', blockId: 'B1', projectId: 'P1', amount: 60000000,
      status: 'approved', decidedBy: 'auto', decidedByName: 'Tự động duyệt (GĐK/Trợ lý đăng ký)', decidedAt: '2026-11-01T00:00:00Z', history: [],
      banStatus: 'approved', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: '2026-11-02T00:00:00Z',
    };
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + KL), payload));
    await assertFails(setDoc(doc(as('pb1'), 'nsSupport/' + KL), { ...payload, banDecidedBy: 'pb1' }));
  });
  it('Đặt lại Ban: pending không bắt buộc banReason; nếu có thì ≥ 3 ký tự', async () => {
    await seed('nsSupport/' + LID, baseSup('gdk'));
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), {
      ...baseSup('gdk'), banStatus: 'pending', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: 'x',
    }));
    await assertFails(setDoc(doc(as('tb1'), 'nsSupport/' + LID), {
      ...baseSup('gdk'), banStatus: 'pending', banReason: 'ab', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: 'x',
    }));
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), {
      ...baseSup('gdk'), banStatus: 'pending', banReason: 'Cần rà lại', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: 'x',
    }));
  });
  it('Từ chối Ban cần lý do ≥ 3 ký tự', async () => {
    await seed('nsSupport/' + LID, baseSup('gdk'));
    await assertFails(setDoc(doc(as('tb1'), 'nsSupport/' + LID), {
      ...baseSup('gdk'), banStatus: 'rejected', banReason: 'ab', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: 'x',
    }));
  });
  it('Đổi quyết định Ban: approved→rejected→pending→approved; Phó Ban vẫn không', async () => {
    await seed('nsSupport/' + LID, baseSup('gdk'));
    const ok = { ...baseSup('gdk'), banStatus: 'approved', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: '2026-11-02T00:00:00Z', history: [{ at: 'x', byUid: 'tb1', byName: 'TB', status: 'approved', amount: 5000000 }] };
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), ok));
    const rej = { ...baseSup('gdk'), banStatus: 'rejected', banReason: 'Sai chứng từ', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: '2026-11-03T00:00:00Z', history: ok.history.concat([{ at: 'y', byUid: 'tb1', byName: 'TB', status: 'rejected', reason: 'Sai chứng từ', amount: 5000000 }]) };
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), rej));
    const pend = { ...baseSup('gdk'), banStatus: 'pending', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: '2026-11-04T00:00:00Z', history: rej.history };
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), pend));
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), { ...ok, banDecidedAt: '2026-11-05T00:00:00Z' }));
    await assertFails(setDoc(doc(as('pb1'), 'nsSupport/' + LID), { ...ok, banDecidedBy: 'pb1', banDecidedByName: 'PB' }));
  });
  it('grandfather (thiếu banStatus): Trưởng Ban ghi rõ rejected', async () => {
    // seed without banStatus key (grandfather trước cutover)
    await seed('nsSupport/' + LID, { lineId: LID, period: '2026-11', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 5000000, status: 'approved', decidedBy: 'gdk', decidedByName: 'gdk', decidedAt: '2026-10-20T00:00:00Z', history: [] });
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), {
      lineId: LID, period: '2026-11', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 5000000,
      status: 'approved', decidedBy: 'gdk', decidedByName: 'gdk', decidedAt: '2026-10-20T00:00:00Z', history: [],
      banStatus: 'rejected', banReason: 'Rà lại grandfather', banDecidedBy: 'tb1', banDecidedByName: 'TB', banDecidedAt: '2026-11-06T00:00:00Z',
    }));
  });

  it('Phó Ban duyệt; Trưởng Ban ưu tiên (Phó không ghi đè quyết định Trưởng)', async () => {
    const dec = (by: string, role: string, st: string, extra: any = {}) => ({ ...baseSup('gdk'), banStatus: st, banDecidedBy: by, banDecidedByName: by, banDecidedAt: '2026-11-02T00:00:00Z', banDecidedRole: role, ...extra });
    await seed('nsSupport/' + LID, baseSup('gdk'));
    await assertSucceeds(setDoc(doc(as('pb1'), 'nsSupport/' + LID), dec('pb1', 'deputy', 'rejected', { banReason: 'Thiếu hồ sơ' })));
    // Trưởng Ban ghi đè quyết định Phó Ban
    await assertSucceeds(setDoc(doc(as('tb1'), 'nsSupport/' + LID), dec('tb1', 'leader', 'approved')));
    // Phó Ban không ghi đè quyết định Trưởng Ban
    await assertFails(setDoc(doc(as('pb1'), 'nsSupport/' + LID), dec('pb1', 'deputy', 'rejected', { banReason: 'Thiếu hồ sơ' })));
    // Phó Ban không giả danh Trưởng Ban / Admin
    await seed('nsSupport/' + LID, baseSup('gdk'));
    await assertFails(setDoc(doc(as('pb1'), 'nsSupport/' + LID), dec('pb1', 'leader', 'approved')));
    await assertFails(setDoc(doc(as('pb1'), 'nsSupport/' + LID), dec('pb1', 'admin', 'approved')));
    // Trưởng Ban không ghi vai trò deputy; Trưởng Ban khác không ghi
    await assertFails(setDoc(doc(as('tb1'), 'nsSupport/' + LID), dec('tb1', 'deputy', 'approved')));
    await assertFails(setDoc(doc(as('tb2'), 'nsSupport/' + LID), dec('tb2', 'leader', 'approved')));
  });
});
