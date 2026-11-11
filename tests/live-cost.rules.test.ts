/** Giới hạn 1000 biểu thức với dữ liệu dạng LIVE (user đã gộp, rolePermissions không có knownKeys, vnLocks có lockWin 36 tháng + pastLock).
 *  Hồi quy: GĐ Khối HN.E06 không duyệt được Duyệt hỗ trợ MKT (nsSupport) sau khi thêm vnPastOpen (24/10/2026). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertSucceeds, assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), process.env.RULES_FILE || 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid.toLowerCase() + '@gmail.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const vn = new Date(Date.now() + 7 * 3600e3); const Y = vn.getUTCFullYear(), M = vn.getUTCMonth() + 1;
const CUR = `${Y}-${String(M).padStart(2, '0')}`;
const GDK = '2s2eFf66yiYuZFCEFKsoB6vBP3J3', TLK = 'tlkLiveUid000000000000000001', ADM = 'admLiveUid000000000000000001', MOD = 'modLiveUid000000000000000001', OWN = 'kat2W4NC0JNEViW5lYNqxZxcAYC3';
const BLK = 'n5YcHEX8s4s0wq8WUt0u', TEAM = 'X5hAfMxTiKJTGgetWFGb', PRJ = 'YcEAaWbdyg1pL8uCD7PL';
const LID = `u_${CUR}_${TEAM}_${PRJ}_${OWN}`;
const ts = (ms: number) => Timestamp.fromMillis(ms);
// lockWin như app biên dịch: 36 tháng × 3 loại, mỗi tháng 1–3 cửa sổ (đều ở quá khứ/tương lai xa → không khoá lúc test).
const far = Date.UTC(2099, 0, 1);
const WIN = () => Object.fromEntries(Array.from({ length: 36 }, (_, i) => [String(Y * 12 + i), [{ from: ts(far + i * 864e5), to: ts(far + i * 864e5 + 3600e3), period: '' }, { from: ts(far + i * 864e5 + 7200e3), to: ts(far + i * 864e5 + 9000e3), period: CUR }]]));
const LOCKS = (pastOn: boolean) => ({ nsCreate: [], nsEdit: [], nt: [], recurring: { nsCreate: { on: true, fromDay: 25, fromMin: 0, toDay: 1, toMin: 0, periodOffset: null, exceptions: [] } },
  lockWin: { nsCreate: WIN(), nsEdit: WIN(), nt: WIN() }, updatedAt: 'x', updatedBy: 'sup',
  ...(pastOn ? { pastLock: { ns: { on: true, day: 1, min: 0, offset: 1 }, nt: { on: true, day: 1, min: 0, offset: 1 } } } : {}) });
const liveUser = (uid: string, role: string, o: any = {}) => ({ uid, role, email: 'redacted@gmail.com', displayName: 'Tên ' + uid.slice(0, 4), fullName: 'Tên ' + uid.slice(0, 4),
  createdAt: ts(1.7e12), updatedAt: ts(1.76e12), assignedProjects: ['p1', 'p2', 'p3', 'p4', 'p5'], emailIndexId: 'redacted', migratedFromUid: 'old' + uid.slice(3), mergedAt: ts(1.76e12),
  mergedFrom: ['old' + uid.slice(3)], nameAuditId: 'a1', nameUpdatedAt: ts(1.76e12), nameUpdatedBy: uid, ...o });
const PERMS = ['dashboard.view', 'home.view', 'register.view', 'register.create', 'register.edit', 'actual.view', 'actual.edit', 'block.view', 'block_budget.view', 'block_budget.create', 'block_budget.edit', 'block_budget.delete', 'history.view', 'projects.view', 'acceptance.view', 'reports.view', 'reciprocal_budget.view', 'reciprocal_budget.edit', 'reciprocal_budget.delete', 'actual.create', 'actual.edit', 'admin.costs.create', 'admin.costs.edit', 'admin.budgets.create', 'admin.budgets.edit'];
const SUP = (by: string, status: string, o: any = {}) => ({ lineId: LID, period: CUR, ownerUid: OWN, teamId: TEAM, blockId: BLK, projectId: PRJ, amount: 7500000, status,
  ...(status === 'rejected' ? { reason: 'Thiếu chứng từ' } : {}), ...(status === 'approved' ? { banStatus: 'pending' } : {}), decidedBy: by, decidedByName: 'Người duyệt', decidedAt: new Date().toISOString(),
  history: [{ at: 'x', byUid: by, byName: 'x', status: 'approved', amount: 7500000 }], ...o });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-livecost', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
async function base(pastOn: boolean) {
  await env.clearFirestore();
  if (!process.env.NOLOCK) await seed('vnLocks/current', LOCKS(pastOn));
  await seed('users/' + GDK, liveUser(GDK, 'gd_khoi', { assignedBlock: 'E06' }));
  await seed('users/' + TLK, liveUser(TLK, 'tro_ly_khoi', { assignedBlock: 'E06' }));
  await seed('users/' + ADM, liveUser(ADM, 'admin'));
  await seed('users/' + MOD, liveUser(MOD, 'mod'));
  await seed('users/' + OWN, liveUser(OWN, 'user', { teamId: TEAM, teamName: 'MAY19.01', vnOnboarding: { status: 'approved', blockId: BLK, teamId: TEAM, position: 'user' } }));
  for (const r of ['gd_khoi', 'tro_ly_khoi', 'admin', 'mod']) await seed('rolePermissions/' + r, { role: r, permissions: PERMS, updatedBy: 'x', updatedAt: ts(1.759e12) });
  await seed('blocks/' + BLK, { name: 'HN.E06', blockCode: 'E06', directorUid: GDK, assistantUids: [TLK], createdBy: 'x', createdAt: ts(1.7e12), teamPrefix: 'MAY19' });
  await seed('teams/' + TEAM, { name: 'MAY19.01', teamCode: 'MAY19.01', blockId: BLK, gdkdUids: [], active: true });
  await seed('userKyc/' + OWN, { uid: OWN, cccd: '001099012345', bankAccount: '0123456789', bankName: 'VCB', accountHolder: 'NGUYEN VAN A', fullName: 'A', updatedAt: 'x', updatedBy: OWN });
  await seed('ns_lines/' + LID, { period: CUR, kind: 'user', projectId: PRJ, teamId: TEAM, blockId: BLK, ownerUid: OWN, ownerName: 'A', ownerEmail: 'redacted@gmail.com',
    createdAt: 'x', createdBy: OWN, amount: 7500000, deleted: false, history: [{ at: 'x', by: OWN, action: 'create' }], updatedAt: 'x', updatedBy: OWN });
  await seed('block_budgets/bb', { blockId: BLK, blockCode: 'E06', month: CUR, amount: 1, projectId: PRJ, createdBy: GDK });
  await seed('budgets/b1', { month: CUR, amount: 1, projectId: PRJ, createdBy: ADM });
  await seed('costs/c1', { month: CUR, amount: 1, projectId: PRJ, createdBy: ADM });
  await seed('reciprocal_budgets/r1', { month: CUR, amount: 1, projectId: PRJ, blockId: BLK });
  await seed('acceptances/a1', { month: CUR, ntMonth: CUR, projectId: PRJ, teamId: TEAM, status: 'Đã nghiệm thu', grandTotal: 1000 });
  await seed('finalAcceptances/f1', { month: CUR, projectId: PRJ });
  await seed('acceptanceImages/i1', { acceptanceId: 'a1', provider: 'drive' });
  await seed('acceptanceImageData/d1', { dataUrl: 'x', acceptanceId: 'a1' });
}
for (const pastOn of [false, true]) describe(`dữ liệu dạng live — pastLock ${pastOn ? 'BẬT (kỳ hiện tại, đánh giá đủ)' : 'chưa cài (như live 24/10)'}`, () => {
  beforeEach(async () => { await base(pastOn); });
  for (const [who, uid] of [['GĐ Khối', GDK], ['Trợ lý Khối', TLK], ['Admin', ADM]] as const) it(`nsSupport: ${who} Duyệt → Từ chối → Đặt lại`, async () => {
    const d = doc(as(uid), 'nsSupport/' + LID);
    await assertSucceeds(setDoc(d, SUP(uid, 'approved')));
    await assertSucceeds(setDoc(d, SUP(uid, 'rejected')));
    await assertSucceeds(setDoc(d, SUP(uid, 'pending')));
  });
  if (pastOn) it('nsSupport: kỳ đã qua bị khoá — GĐ Khối bị chặn', async () => {
    const pm = M === 1 ? `${Y - 1}-12` : `${Y}-${String(M - 1).padStart(2, '0')}`, pl = `u_${pm}_${TEAM}_${PRJ}_${OWN}`;
    await seed('ns_lines/' + pl, { period: pm, kind: 'user', projectId: PRJ, teamId: TEAM, blockId: BLK, ownerUid: OWN, amount: 7500000 });
    await assertFails(setDoc(doc(as(GDK), 'nsSupport/' + pl), SUP(GDK, 'approved', { lineId: pl, period: pm })));
  });
  it('nsSupport: vẫn chặn Mod / chủ dòng / sai số tiền', async () => {
    await assertFails(setDoc(doc(as(MOD), 'nsSupport/' + LID), SUP(MOD, 'approved')));
    await assertFails(setDoc(doc(as(OWN), 'nsSupport/' + LID), SUP(OWN, 'approved')));
    await assertFails(setDoc(doc(as(GDK), 'nsSupport/' + LID), SUP(GDK, 'approved', { amount: 1 })));
  });
  // GĐ Khối / Trợ lý sửa NS Khối phụ thuộc khung ngày đăng ký (blockBudgetWindowOk) → chỉ kiểm tra Admin ở đây.
  it('Ngân sách Khối: Admin sửa / xoá', async () => {
    await assertSucceeds(updateDoc(doc(as(ADM), 'block_budgets/bb'), { amount: 4 }));
    await assertSucceeds(deleteDoc(doc(as(ADM), 'block_budgets/bb')));
  });
  it('Ngân sách / chi phí / đối ứng: Admin tạo, sửa, xoá', async () => {
    for (const c of ['budgets', 'costs']) {
      await assertSucceeds(setDoc(doc(as(ADM), `${c}/n`), { month: CUR, amount: 1, projectId: PRJ, createdBy: ADM }));
      await assertSucceeds(updateDoc(doc(as(ADM), `${c}/${c === 'budgets' ? 'b1' : 'c1'}`), { amount: 2 }));
      await assertSucceeds(deleteDoc(doc(as(ADM), `${c}/n`)));
    }
    await assertSucceeds(updateDoc(doc(as(ADM), 'reciprocal_budgets/r1'), { amount: 2 }));
    await assertSucceeds(deleteDoc(doc(as(ADM), 'reciprocal_budgets/r1')));
  });
  it('Nghiệm thu: Admin / Mod sửa chi phí, bản chốt, ảnh, ảnh lưu tạm', async () => {
    await assertSucceeds(updateDoc(doc(as(ADM), 'acceptances/a1'), { grandTotal: 2, notes: 'x' }));
    await assertSucceeds(updateDoc(doc(as(MOD), 'acceptances/a1'), { grandTotal: 3 }));
    await assertSucceeds(updateDoc(doc(as(ADM), 'finalAcceptances/f1'), { x: 1 }));
    await assertSucceeds(setDoc(doc(as(ADM), `ntKeys/${CUR}_u9_${PRJ}`), { acceptanceId: 'a1', month: CUR, uid: 'u9', projectId: PRJ }));
    await assertSucceeds(setDoc(doc(as(ADM), 'acceptanceImageData/d2'), { dataUrl: 'x', acceptanceId: 'a1' }));
    await assertSucceeds(deleteDoc(doc(as(ADM), 'acceptanceImageData/d1')));
    await assertSucceeds(deleteDoc(doc(as(ADM), 'acceptanceImages/i1')));
    await assertSucceeds(deleteDoc(doc(as(MOD), 'acceptances/a1')));
  });
  // Chủ dòng sửa phụ thuộc khung ngày đăng ký (nsWindowOk) → kiểm tra Admin.
  it('NS dòng (ns_lines): Admin sửa số tiền kỳ hiện tại', async () => {
    await assertSucceeds(updateDoc(doc(as(ADM), 'ns_lines/' + LID), { amount: 8000000, updatedAt: 'y', updatedBy: ADM }));
  });
});
