/** B1 userKyc (GĐKD không đọc CCCD/STK), B2 nsSupport, B4 acceptanceInvoices, B5 GĐK/Trợ lý duyệt NVKD vào Phòng trong Khối. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const OK = { vnOnboarding: { status: 'approved' } };
const K = (uid: string, by = uid) => ({ uid, cccd: '001099012345', bankAccount: '0123456789', bankName: 'Vietcombank', accountHolder: 'NGUYỄN VĂN ' + uid.toUpperCase(), fullName: 'N ' + uid, updatedAt: 'x', updatedBy: by });
const LID = 'u_2026-11_T1_P1_u1', LID2 = 'u_2026-11_T2_P1_u2';
const SUP = (by: string, over: any = {}) => {
  const status = over.status ?? 'approved';
  const { banStatus: _b, ...rest } = over;
  return { lineId: LID, period: '2026-11', ownerUid: 'u1', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 5000000, status: 'approved', decidedBy: by, decidedByName: by, decidedAt: 'x', history: [], ...(status === 'approved' ? { banStatus: 'pending' } : {}), ...rest, status };
};
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-kyc', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlk'] });
  await seed('blocks/B2', { name: 'Khối 2', blockCode: 'E02', directorUid: 'gdk2', assistantUids: [] });
  await seed('teams/T1', { name: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', gdkdUids: ['g1'] });
  await seed('teams/T2', { name: 'MAY-02', teamCode: 'E02.1', blockId: 'B2', gdkdUids: [] });
  for (const [u, r] of [['adm', 'admin'], ['mod', 'mod'], ['kt', 'accountant'], ['gdk', 'gd_khoi'], ['tlk', 'tro_ly_khoi'], ['gdk2', 'gd_khoi']]) await seed('users/' + u, { uid: u, role: r, email: u + '@x.com' });
  await seed('users/g1', { ...OK, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1', teamName: 'MAY-01' });
  await seed('users/u1', { ...OK, uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', teamName: 'MAY-01' });
  await seed('users/u2', { ...OK, uid: 'u2', role: 'user', email: 'u2@x.com', teamId: 'T2', teamName: 'MAY-02' });
  await seed('userKyc/u1', K('u1'));
  await seed('userKyc/u2', K('u2'));
  await seed('ns_lines/' + LID, { period: '2026-11', kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', ownerUid: 'u1', ownerName: 'U1', amount: 5000000 });
  await seed('ns_lines/' + LID2, { period: '2026-11', kind: 'user', teamId: 'T2', blockId: 'B2', projectId: 'P1', ownerUid: 'u2', ownerName: 'U2', amount: 3000000 });
});
describe('B1 userKyc', () => {
  it('đọc: chính mình, Admin, Kế toán, GĐK/Trợ lý Khối của Khối; GĐKD / Mod / user khác / GĐK Khối khác KHÔNG', async () => {
    for (const u of ['u1', 'adm', 'kt', 'gdk', 'tlk']) await assertSucceeds(getDoc(doc(as(u), 'userKyc/u1')));
    for (const u of ['g1', 'mod', 'u2', 'gdk2']) await assertFails(getDoc(doc(as(u), 'userKyc/u1')));
    await assertFails(getDoc(doc(as('gdk'), 'userKyc/u2')));
    await assertFails(getDocs(collection(as('g1'), 'userKyc')));
    await assertFails(getDocs(collection(as('gdk'), 'userKyc')));
    await assertSucceeds(getDocs(collection(as('adm'), 'userKyc')));
  });
  it('ghi: tự khai đúng định dạng; Admin sửa hộ; người khác / sai định dạng bị chặn', async () => {
    await assertSucceeds(setDoc(doc(as('g1'), 'userKyc/g1'), K('g1')));
    await assertFails(setDoc(doc(as('g1'), 'userKyc/g1'), { ...K('g1'), cccd: '12345' }));
    await assertFails(setDoc(doc(as('g1'), 'userKyc/g1'), { ...K('g1'), bankAccount: '12a' }));
    await assertFails(setDoc(doc(as('g1'), 'userKyc/g1'), { ...K('g1'), extra: 1 }));
    const { accountHolder: _h, ...noHolder } = K('g1');
    await assertFails(setDoc(doc(as('g1'), 'userKyc/g1'), noHolder));
    await assertFails(setDoc(doc(as('g1'), 'userKyc/g1'), { ...K('g1'), accountHolder: 'Nguyễn Văn A' }));
    await assertFails(setDoc(doc(as('g1'), 'userKyc/g1'), { ...K('g1'), accountHolder: 'A' }));
    await assertFails(setDoc(doc(as('g1'), 'userKyc/u1'), K('u1', 'g1')));
    await assertFails(setDoc(doc(as('gdk'), 'userKyc/u1'), K('u1', 'gdk')));
    await assertSucceeds(setDoc(doc(as('adm'), 'userKyc/u1'), K('u1', 'adm')));
  });
});
describe('B2 nsSupport', () => {
  it('GĐK / Trợ lý Khối duyệt dòng Khối mình; không Khối khác; GĐKD / user không duyệt', async () => {
    await assertSucceeds(setDoc(doc(as('gdk'), 'nsSupport/' + LID), SUP('gdk')));
    await assertSucceeds(setDoc(doc(as('tlk'), 'nsSupport/' + LID), SUP('tlk', { status: 'rejected', reason: 'Thiếu chứng từ' })));
    await assertFails(setDoc(doc(as('gdk2'), 'nsSupport/' + LID), SUP('gdk2')));
    await assertFails(setDoc(doc(as('g1'), 'nsSupport/' + LID), SUP('g1')));
    await assertFails(setDoc(doc(as('u1'), 'nsSupport/' + LID), SUP('u1')));
    await assertSucceeds(setDoc(doc(as('adm'), 'nsSupport/' + LID2), { ...SUP('adm'), lineId: LID2, ownerUid: 'u2', teamId: 'T2', blockId: 'B2', amount: 3000000 }));
  });
  it('phải khớp dòng NS (số tiền, Khối), từ chối cần lý do', async () => {
    await assertFails(setDoc(doc(as('gdk'), 'nsSupport/' + LID), SUP('gdk', { amount: 9 })));
    await assertFails(setDoc(doc(as('gdk'), 'nsSupport/' + LID), SUP('gdk', { blockId: 'B2' })));
    await assertFails(setDoc(doc(as('gdk'), 'nsSupport/' + LID), SUP('gdk', { status: 'rejected' })));
    await assertFails(setDoc(doc(as('gdk'), 'nsSupport/' + LID), SUP('adm')));
  });
  it('NS Khối (tự duyệt): GĐK/Trợ lý Khối mình + Admin được Đặt lại / Từ chối / Duyệt; Khối khác / user không', async () => {
    const KL = 'k_2026-11_B1_P1_gdk';
    await seed('ns_lines/' + KL, { period: '2026-11', kind: 'khoi', teamId: '', blockId: 'B1', projectId: 'P1', ownerUid: 'gdk', ownerName: 'GDK', amount: 60000000 });
    await seed('userKyc/gdk', K('gdk'));
    const KS = (by: string, over: any = {}) => SUP(by, { lineId: KL, ownerUid: 'gdk', teamId: '', blockId: 'B1', projectId: 'P1', amount: 60000000, ...over });
    await assertSucceeds(setDoc(doc(as('gdk'), 'nsSupport/' + KL), KS('gdk', { status: 'pending' })));
    await assertSucceeds(setDoc(doc(as('tlk'), 'nsSupport/' + KL), KS('tlk', { status: 'rejected', reason: 'Sai dự án' })));
    await assertSucceeds(setDoc(doc(as('gdk'), 'nsSupport/' + KL), KS('gdk')));
    await assertSucceeds(setDoc(doc(as('adm'), 'nsSupport/' + KL), KS('adm', { status: 'pending' })));
    await assertFails(setDoc(doc(as('gdk2'), 'nsSupport/' + KL), KS('gdk2', { status: 'pending' })));
    await assertFails(setDoc(doc(as('u1'), 'nsSupport/' + KL), KS('u1', { status: 'pending' })));
    await assertFails(setDoc(doc(as('gdk'), 'nsSupport/' + KL), KS('gdk', { amount: 1 })));
    // dòng user: chủ dòng vẫn không tự duyệt
    await assertFails(setDoc(doc(as('u1'), 'nsSupport/' + LID), SUP('u1')));
  });
  it('đọc: chủ dòng, GĐKD Phòng (trạng thái), GĐK Khối; không user khác', async () => {
    await seed('nsSupport/' + LID, SUP('gdk'));
    await assertSucceeds(getDocs(query(collection(as('u1'), 'nsSupport'), where('ownerUid', '==', 'u1'))));
    await assertSucceeds(getDocs(query(collection(as('gdk'), 'nsSupport'), where('blockId', '==', 'B1'))));
    await assertSucceeds(getDocs(query(collection(as('g1'), 'nsSupport'), where('teamId', '==', 'T1'))));
    await assertFails(getDoc(doc(as('u2'), 'nsSupport/' + LID)));
    await assertFails(getDocs(query(collection(as('gdk2'), 'nsSupport'), where('blockId', '==', 'B1'))));
  });
});
describe('B4 acceptanceInvoices', () => {
  const INV = (by: string, mime = 'application/pdf') => ({ acceptanceId: 'A1', fileId: 'abcdefghijkl', name: 'MAYHOMES - HD - x.pdf', mime, size: 99999999999, webViewLink: 'https://drive.google.com/x', path: 'a/b', order: 1, uploadedBy: by, uploadedByName: by, uploadedAt: 'x' });
  it('Admin/Mod tạo; không giới hạn size; ảnh/PDF/ZIP/Excel; GĐKD/user không', async () => {
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptanceInvoices/i1'), INV('adm')));
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptanceInvoices/i2'), INV('mod', 'image/png')));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptanceInvoices/i3'), INV('adm', 'application/zip')));
    await assertFails(setDoc(doc(as('adm'), 'acceptanceInvoices/i3b'), INV('adm', 'text/html')));
    await assertFails(setDoc(doc(as('g1'), 'acceptanceInvoices/i4'), INV('g1')));
    await assertFails(setDoc(doc(as('u1'), 'acceptanceInvoices/i5'), INV('u1')));
    // GĐKD chỉ đọc hoá đơn có teamId Phòng mình (lưu lúc tải lên); thiếu teamId → không đọc.
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptanceInvoices/i6'), { ...INV('adm'), teamId: 'T1' }));
    await assertFails(setDoc(doc(as('adm'), 'acceptanceInvoices/i7'), { ...INV('adm'), teamId: 5 }));
    await assertSucceeds(getDoc(doc(as('g1'), 'acceptanceInvoices/i6')));
    await assertFails(getDoc(doc(as('g1'), 'acceptanceInvoices/i1')));
  });
});
describe('B5 GĐK / Trợ lý Khối duyệt NVKD vào Phòng (đã có GĐKD) trong Khối mình', () => {
  const OB = (uid: string, over: any = {}) => ({ uid, email: uid + '@x.com', name: 'Tên ' + uid, kind: 'onboarding', dept: 'kd', status: 'pending', position: 'nvkd', teamId: 'T1', teamName: 'MAY-01', teamCode: 'E01.1', blockId: 'B1', blockCode: 'E01', createdAt: 'x', ...over });
  const decide = (by: string, uid: string, team = 'T1', name = 'MAY-01', code = 'E01.1', bid = 'B1') => { const db = as(by); const b = writeBatch(db);
    b.update(doc(db, 'accessRequests', uid), { status: 'approved', decidedBy: by, decidedAt: 'x' });
    b.update(doc(db, 'users', uid), { updatedAt: 'x', role: 'user', teamId: team, teamName: name, teamCode: code, vnOnboarding: { status: 'approved', position: 'nvkd', teamId: team, blockId: bid } }); return b.commit(); };
  beforeEach(async () => {
    for (const u of ['n1', 'n2', 'n3', 'n4']) await seed('users/' + u, { uid: u, role: 'user', email: u + '@x.com' });
    await seed('accessRequests/n1', OB('n1')); await seed('accessRequests/n2', OB('n2'));
    await seed('accessRequests/n3', OB('n3', { teamId: 'T2', teamName: 'MAY-02', teamCode: 'E02.1', blockId: 'B2', blockCode: 'E02' }));
    await seed('accessRequests/n4', OB('n4'));
  });
  it('GĐK & Trợ lý Khối B1 duyệt được NVKD vào T1 (đã có GĐKD); không duyệt Khối khác', async () => {
    await assertSucceeds(decide('gdk', 'n1'));
    await assertSucceeds(decide('tlk', 'n2'));
    await assertFails(decide('gdk', 'n3', 'T2', 'MAY-02', 'E02.1', 'B2'));
    await assertFails(decide('tlk', 'n3', 'T2', 'MAY-02', 'E02.1', 'B2'));
  });
  it('GĐKD vẫn duyệt Phòng mình', async () => {
    await assertSucceeds(decide('g1', 'n4'));
  });
});
