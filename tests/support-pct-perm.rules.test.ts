import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const db = (uid: string) => env.authenticatedContext(uid, { email: uid + '@t.local', email_verified: true }).firestore();
const seed = (f: (d: any) => Promise<any>) => env.withSecurityRulesDisabled((c) => f(c.firestore()));

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-chiphi-pctperm', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (d) => {
    await setDoc(doc(d, 'users/tb'), { uid: 'tb', role: 'truong_ban_kd' });
    await setDoc(doc(d, 'users/pb'), { uid: 'pb', role: 'user' });
    await setDoc(doc(d, 'users/tb2'), { uid: 'tb2', role: 'truong_ban_kd' });
    await setDoc(doc(d, 'users/adm'), { uid: 'adm', role: 'admin' });
    await setDoc(doc(d, 'users/nv'), { uid: 'nv', role: 'user' });
    await setDoc(doc(d, 'ban_kd/B1'), { name: 'Ban 1', leaderUid: 'tb', deputyUids: ['pb'] });
    await setDoc(doc(d, 'ban_kd/B2'), { name: 'Ban 2', leaderUid: 'tb2' });
    await setDoc(doc(d, 'projects/P1'), { name: 'Alpha', banKdId: 'B1', banKdName: 'Ban 1', supportPct: 20 });
  });
});
const pol = { supportPct: 30, supportBonusPct: 5, supportBonusCond: 'Đạt 10 căn', supportMaxPerSale: 5000000, supportCdt: 'dai_ly' };

describe('Sửa Tỉ lệ hỗ trợ MKT theo quyền', () => {
  it('Trưởng Ban sửa mọi trường chính sách dự án Ban mình', async () => { await assertSucceeds(updateDoc(doc(db('tb'), 'projects/P1'), pol)); });
  it('Trưởng Ban Ban khác bị chặn', async () => { await assertFails(updateDoc(doc(db('tb2'), 'projects/P1'), pol)); });
  it('Nhân viên bị chặn', async () => { await assertFails(updateDoc(doc(db('nv'), 'projects/P1'), pol)); });
  it('Admin sửa mọi Ban', async () => { await assertSucceeds(updateDoc(doc(db('adm'), 'projects/P1'), pol)); });
  it('Giá trị sai bị chặn', async () => {
    await assertFails(updateDoc(doc(db('tb'), 'projects/P1'), { supportBonusPct: 150 }));
    await assertFails(updateDoc(doc(db('tb'), 'projects/P1'), { supportCdt: 'abc' }));
    await assertFails(updateDoc(doc(db('tb'), 'projects/P1'), { supportMaxPerSale: -1 }));
  });
  it('Phó Ban (vai trò user) sửa Ban mình theo mặc định; bỏ quyền ở vai trò → chặn', async () => {
    await assertSucceeds(updateDoc(doc(db('pb'), 'projects/P1'), pol));
    await seed((d) => setDoc(doc(d, 'rolePermissions/user'), { role: 'user', knownKeys: ['vn.bankd.support_pct_edit'], permissions: [] }));
    await assertFails(updateDoc(doc(db('pb'), 'projects/P1'), { supportPct: 31 }));
  });
  it('Thu hồi quyền sửa của Trưởng Ban → chặn (dự án + tỉ lệ chung Ban), vẫn sửa tên dự án được', async () => {
    await seed((d) => setDoc(doc(d, 'rolePermissions/truong_ban_kd'), { role: 'truong_ban_kd', knownKeys: ['vn.bankd.support_pct_edit'], permissions: [] }));
    await assertFails(updateDoc(doc(db('tb'), 'projects/P1'), pol));
    await assertFails(updateDoc(doc(db('tb'), 'ban_kd/B1'), { supportPct: 25 }));
    await assertSucceeds(updateDoc(doc(db('tb'), 'projects/P1'), { name: 'Alpha 2' }));
  });
  it('Nhiều mức Bonus: Trưởng Ban lưu được; quá 10 mức / không phải list bị chặn; nhân viên bị chặn', async () => {
    const tiers = [{ pct: 2, amount: null, minUnits: 5, cond: '' }, { pct: null, amount: 7000000, minUnits: 10, cond: 'x' }];
    await assertSucceeds(updateDoc(doc(db('tb'), 'projects/P1'), { supportBonusTiers: tiers, supportBonusPct: 2, supportBonusCond: 'Từ 5 căn' }));
    await assertFails(updateDoc(doc(db('tb'), 'projects/P1'), { supportBonusTiers: Array.from({ length: 11 }, () => tiers[0]) }));
    await assertFails(updateDoc(doc(db('tb'), 'projects/P1'), { supportBonusTiers: 'x' }));
    await assertFails(updateDoc(doc(db('nv'), 'projects/P1'), { supportBonusTiers: tiers }));
  });
  it('Max / 1 sale chung Ban: Trưởng/Phó Ban sửa được; giá trị âm / nhân viên / Ban khác bị chặn', async () => {
    await assertSucceeds(updateDoc(doc(db('tb'), 'ban_kd/B1'), { supportMaxPerSale: 20000000 }));
    await assertSucceeds(updateDoc(doc(db('pb'), 'ban_kd/B1'), { supportMaxPerSale: null }));
    await assertFails(updateDoc(doc(db('tb'), 'ban_kd/B1'), { supportMaxPerSale: -5 }));
    await assertFails(updateDoc(doc(db('nv'), 'ban_kd/B1'), { supportMaxPerSale: 1 }));
    await assertFails(updateDoc(doc(db('tb2'), 'ban_kd/B1'), { supportMaxPerSale: 1 }));
  });
  it('Tỉ lệ chung Ban: Trưởng Ban có quyền thì sửa được', async () => { await assertSucceeds(updateDoc(doc(db('tb'), 'ban_kd/B1'), { supportPct: 25 })); });
  it('Mọi người đăng nhập đọc được dự án (Thông tin Hỗ trợ)', async () => { await assertSucceeds(getDoc(doc(db('nv'), 'projects/P1'))); });
});

describe('KYC nhiều tài khoản: cùng một tên chủ tài khoản', () => {
  const acc = (id: string, h: string, n: string) => ({ id, bankName: 'MB Bank', bankAccount: n, accountHolder: h });
  const kyc = (accounts: any[], holder = 'NGUYEN VAN A') => ({ uid: 'nv', cccd: '079011100001', bankAccount: accounts[0].bankAccount, bankName: 'MB Bank', accountHolder: holder, accounts, defaultAccountId: accounts[0].id, fullName: 'NV', updatedAt: 'x', updatedBy: 'nv' });
  it('Cùng chủ → lưu được', async () => { await assertSucceeds(setDoc(doc(db('nv'), 'userKyc/nv'), kyc([acc('a1', 'NGUYEN VAN A', '111111'), acc('a2', 'NGUYEN VAN A', '222222'), acc('a3', 'NGUYEN VAN A', '333333')]))); });
  it('TK 2 khác chủ → chặn', async () => { await assertFails(setDoc(doc(db('nv'), 'userKyc/nv'), kyc([acc('a1', 'NGUYEN VAN A', '111111'), acc('a2', 'TRAN B', '222222')]))); });
  it('TK 3 khác chủ → chặn', async () => { await assertFails(setDoc(doc(db('nv'), 'userKyc/nv'), kyc([acc('a1', 'NGUYEN VAN A', '111111'), acc('a2', 'NGUYEN VAN A', '222222'), acc('a3', 'TRAN B', '333333')]))); });
  it('Chủ gốc khác TK → chặn', async () => { await assertFails(setDoc(doc(db('nv'), 'userKyc/nv'), kyc([acc('a1', 'NGUYEN VAN A', '111111')], 'TRAN B'))); });
  it('Dữ liệu cũ 1 TK (không có accounts) vẫn lưu được', async () => { const { accounts, defaultAccountId, ...k } = kyc([acc('a1', 'NGUYEN VAN A', '111111')]) as any; await assertSucceeds(setDoc(doc(db('nv'), 'userKyc/nv'), k)); });
});
