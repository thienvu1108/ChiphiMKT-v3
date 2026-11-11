/** Khoá theo ngày, chuông thông báo, nhật ký lỗi, thống kê sử dụng. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { compileLockWin, normRec, compilePastWin } from '../lib/vnext/platform';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const LID = 'u_2026-11_T1_P1_u1';
const LINE = (o: any = {}) => ({ period: '2026-11', kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', ownerUid: 'u1', ownerName: 'U1', amount: 5000000, ...o });
const now = Date.now();
const R = (a: number, b: number, period = '') => ({ from: Timestamp.fromMillis(now + a * 3600e3), to: Timestamp.fromMillis(now + b * 3600e3), period });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-batch', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('settings/global', { nsUnlockedPeriods: ['2026-11'] });
  await seed('blocks/B1', { name: 'Khối 1', directorUid: 'gdk', assistantUids: [] });
  await seed('teams/T1', { name: 'T1', blockId: 'B1', gdkdUids: [], active: true });
  await seed('users/gdk', { uid: 'gdk', role: 'gd_khoi', email: 'gdk@x.com' });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/sup', { uid: 'sup', role: 'super_admin', email: 'sup@x.com' });
  await seed('users/u1', { uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
  await seed('users/u2', { uid: 'u2', role: 'user', email: 'u2@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
});
describe('Khoá theo ngày', () => {
  it('Chỉ super_admin sửa cài đặt khoá', async () => {
    const d = { nsCreate: [R(-1, 1)], nsEdit: [], nt: [], updatedAt: 'x', updatedBy: 'adm' };
    await assertFails(setDoc(doc(as('adm'), 'vnLocks/current'), d));
    await assertFails(setDoc(doc(as('u1'), 'vnLocks/current'), d));
    await assertSucceeds(setDoc(doc(as('sup'), 'vnLocks/current'), d));
    await assertSucceeds(getDoc(doc(as('u1'), 'vnLocks/current')));
    await assertFails(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, nsCreate: Array.from({ length: 13 }, (_, i) => R(i * 2, i * 2 + 1)) }));
  });
  it('Đang khoá đăng ký mới: user + Admin bị chặn, super_admin được; hết hạn → mở', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
    await env.withSecurityRulesDisabled(async (c) => { await deleteDoc(doc(c.firestore(), 'ns_lines/' + LID)); });
    await seed('vnLocks/current', { nsCreate: [R(-5, -4), R(-1, 1)], nsEdit: [], nt: [] });
    await assertFails(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
    await assertFails(setDoc(doc(as('adm'), 'ns_lines/' + LID), LINE()));
    await assertSucceeds(setDoc(doc(as('sup'), 'ns_lines/' + LID), LINE()));
    await seed('vnLocks/current', { nsCreate: [R(-5, -4)], nsEdit: [], nt: [] });
    await env.withSecurityRulesDisabled(async (c) => { await deleteDoc(doc(c.firestore(), 'ns_lines/' + LID)); });
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
  });
  it('Khoá theo tháng NS: chỉ chặn đúng tháng; khoá sửa không chặn tạo', async () => {
    await seed('vnLocks/current', { nsCreate: [R(-1, 1, '2026-12')], nsEdit: [R(-1, 1)], nt: [] });
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
    await assertFails(updateDoc(doc(as('u1'), 'ns_lines/' + LID), { amount: 6000000 }));
    await assertFails(deleteDoc(doc(as('u1'), 'ns_lines/' + LID)));
    await assertFails(updateDoc(doc(as('adm'), 'ns_lines/' + LID), { amount: 6000000 }));
  });
  // Khoá lặp lại hằng tháng (giờ VN). Cả tháng (từ ngày X 00:00 → ngày X 00:00 tháng sau) để test không phụ thuộc giờ chạy.
  const vnNow = new Date(Date.now() + 7 * 3600e3); const curIdx = vnNow.getUTCFullYear() * 12 + vnNow.getUTCMonth() + 1;
  const REC = (o: any = {}) => ({ on: true, fromDay: 1, fromMin: 0, toDay: 1, toMin: 0, periodOffset: null, exceptions: [], ...o });
  const nov = 2026 * 12 + 11;
  const TS = (w: any) => ({ from: Timestamp.fromMillis(w.from), to: Timestamp.fromMillis(w.to), period: w.period });
  // Doc như app lưu: cấu hình recurring + lockWin biên dịch (lẻ + lặp). ranges: khoảng lẻ theo loại.
  const RW = (rec: Record<string, any>, ranges: Record<string, any[]> = {}) => ({ recurring: rec, lockWin: Object.fromEntries(['nsCreate', 'nsEdit', 'nt'].map((k) => [k,
    Object.fromEntries(Object.entries(compileLockWin((ranges[k] || []).map((x) => ({ from: x.from.toMillis(), to: x.to.toMillis(), period: x.period })), normRec(rec[k])).win).map(([i, ws]) => [i, ws.map(TS)]))])) });
  it('Khoá lặp: chặn tạo NS (trừ super_admin); tắt / ngoại lệ → mở', async () => {
    await seed('vnLocks/current', { nsCreate: [], nsEdit: [], nt: [], ...RW({ nsCreate: REC() }) });
    await assertFails(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
    await assertFails(setDoc(doc(as('adm'), 'ns_lines/' + LID), LINE()));
    await assertSucceeds(setDoc(doc(as('sup'), 'ns_lines/' + LID), LINE()));
    await env.withSecurityRulesDisabled(async (c) => { await deleteDoc(doc(c.firestore(), 'ns_lines/' + LID)); });
    await seed('vnLocks/current', { nsCreate: [], nsEdit: [], nt: [], ...RW({ nsCreate: REC({ exceptions: [curIdx, curIdx - 1] }) }) });
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
    await env.withSecurityRulesDisabled(async (c) => { await deleteDoc(doc(c.firestore(), 'ns_lines/' + LID)); });
    await seed('vnLocks/current', { nsCreate: [], nsEdit: [], nt: [], ...RW({ nsCreate: REC({ on: false }) }) });
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
  });
  it('Khoá lặp cùng tháng (ngày 1 → ngày 31 = cuối tháng) và periodOffset', async () => {
    // Từ ngày 1 00:00 tới ngày 31 23:59 (31 = cuối tháng) — luôn trúng trừ phút cuối tháng.
    await seed('vnLocks/current', { nsCreate: [], nsEdit: [], nt: [], ...RW({ nsCreate: REC({ toDay: 31, toMin: 1439, periodOffset: nov - curIdx + 1 }) }) });
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE())); // offset trỏ tháng khác → không khoá 2026-11
    await env.withSecurityRulesDisabled(async (c) => { await deleteDoc(doc(c.firestore(), 'ns_lines/' + LID)); });
    await seed('vnLocks/current', { nsCreate: [], nsEdit: [], nt: [], ...RW({ nsCreate: REC({ toDay: 31, toMin: 1439, periodOffset: nov - curIdx }) }) });
    if (Math.abs(nov - curIdx) <= 2) await assertFails(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
  });
  it('Biên giới chi phí rules: 2 khoảng lẻ + 1 lặp không trúng (1 khoảng đang hiệu lực nhưng khác tháng NS) + khoá lặp khác tháng NS → tạo / sửa vẫn được', async () => {
    const off = nov - curIdx + 1;
    const miss = [R(-9, -8), R(-1, 1, '2027-05')]; // + 1 cửa sổ lặp = 3 cửa sổ / tháng (mức tối đa)
    await seed('vnLocks/current', { nsCreate: miss, nsEdit: miss, nt: miss, ...RW({ nsCreate: REC({ periodOffset: off }), nsEdit: REC({ periodOffset: off }), nt: REC({ periodOffset: off }) }, { nsCreate: miss, nsEdit: miss, nt: miss }) });
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
    await assertSucceeds(updateDoc(doc(as('u1'), 'ns_lines/' + LID), { amount: 6000000 }));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/b1'), { projectId: 'P1', teamId: 'T1', month: '2026-11', status: 'Đã nghiệm thu' }));
  });
  it('Khoá lặp: chặn sửa NS + Nghiệm thu (Admin bị chặn, super_admin được)', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
    await seed('vnLocks/current', { nsCreate: [], nsEdit: [], nt: [], ...RW({ nsEdit: REC(), nt: REC() }) });
    await assertFails(updateDoc(doc(as('u1'), 'ns_lines/' + LID), { amount: 6000000 }));
    const A = { projectId: 'P1', teamId: 'T1', month: '2026-11', status: 'Đã nghiệm thu' };
    await assertFails(setDoc(doc(as('adm'), 'acceptances/a1'), A));
    await assertSucceeds(setDoc(doc(as('sup'), 'acceptances/a1'), A));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/a1'), { notes: 'x' }));
  });
  it('Nghiệm thu: khoảng lẻ chặn Admin, ngoài khoảng mở', async () => {
    const A = { projectId: 'P1', teamId: 'T1', month: '2026-11', status: 'Đã nghiệm thu' };
    await seed('vnLocks/current', { nsCreate: [], nsEdit: [], nt: [R(-1, 1)] });
    await assertFails(setDoc(doc(as('adm'), 'acceptances/a2'), A));
    await assertSucceeds(setDoc(doc(as('sup'), 'acceptances/a2'), A));
    await seed('vnLocks/current', { nsCreate: [], nsEdit: [], nt: [R(-5, -4)] });
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/a3'), A));
    await assertSucceeds(updateDoc(doc(as('adm'), 'acceptances/a2'), { notes: 'y' }));
  });
  it('Cài khoá lặp: chỉ super_admin, đúng dạng', async () => {
    const d = { nsCreate: [], nsEdit: [], nt: [], updatedAt: 'x', updatedBy: 'sup' };
    await assertSucceeds(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, ...RW({ nsCreate: REC({ fromDay: 25, fromMin: 1080, toDay: 5, toMin: 480 }) }) }));
    await assertFails(setDoc(doc(as('adm'), 'vnLocks/current'), { ...d, ...RW({ nsCreate: REC() }) }));
    await assertFails(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, ...RW({ nsCreate: REC({ fromDay: 32 }) }) }));
    await assertFails(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, ...RW({ nsCreate: REC({ toMin: 1440 }) }) }));
    await assertFails(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, recurring: { bad: REC() } }));
    await assertFails(setDoc(doc(as('sup'), 'vnLocks/current'), { ...d, recurring: { nt: REC({ periodOffset: 5 }) } }));
  });
  it('Khoá kỳ đã qua (pastLock ns) trên ns_lines: kỳ cũ chỉ Super Admin; kỳ mở vẫn tạo / sửa (kể cả khi có khoá lặp)', async () => {
    const vnD = new Date(Date.now() + 7 * 3600e3); const pi = vnD.getUTCFullYear() * 12 + vnD.getUTCMonth(); // tháng trước (idx)
    const PREVP = `${Math.floor((pi - 1) / 12)}-${String((pi - 1) % 12 + 1).padStart(2, '0')}`;
    const PID = `u_${PREVP}_T1_P1_u1`;
    await seed('ns_lines/' + PID, LINE({ period: PREVP }));
    const off = nov - curIdx + 1;
    await seed('vnLocks/current', { nsCreate: [R(-9, -8)], nsEdit: [R(-9, -8)], nt: [], pastLock: { ns: { on: true, day: 1, min: 0, offset: 1 } },
      pastWin: { ns: Object.fromEntries(Object.entries(compilePastWin({ on: true, day: 1, min: 0, offset: 1 })).map(([k, w]) => [k, { m: w.m, at: Timestamp.fromMillis(w.at) }])) },
      ...RW({ nsCreate: REC({ periodOffset: off }), nsEdit: REC({ periodOffset: off }) }, { nsCreate: [R(-9, -8)], nsEdit: [R(-9, -8)] }) });
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID), LINE()));
    await assertSucceeds(updateDoc(doc(as('u1'), 'ns_lines/' + LID), { amount: 6000000 }));
    await assertFails(updateDoc(doc(as('adm'), 'ns_lines/' + PID), { amount: 7000000 }));
    await assertFails(deleteDoc(doc(as('adm'), 'ns_lines/' + PID)));
    await assertSucceeds(updateDoc(doc(as('sup'), 'ns_lines/' + PID), { amount: 7000000 }));
  });
  it('Lịch sử khoá chỉ ghi thêm', async () => {
    await assertSucceeds(setDoc(doc(as('sup'), 'vnLocksHistory/h1'), { by: 'sup', at: 'x', change: 'y' }));
    await assertFails(setDoc(doc(as('adm'), 'vnLocksHistory/h2'), { by: 'adm' }));
    await assertFails(updateDoc(doc(as('sup'), 'vnLocksHistory/h1'), { change: 'z' }));
    await assertFails(deleteDoc(doc(as('sup'), 'vnLocksHistory/h1')));
  });
});
describe('Chuông thông báo', () => {
  const N = (o: any = {}) => ({ toUid: 'u1', type: 'approved', title: 'Đã duyệt', body: '', link: '/x', createdAt: 'x', createdBy: 'gdk', read: false, ...o });
  it('Chỉ đọc / đánh dấu / xoá của mình', async () => {
    await assertSucceeds(setDoc(doc(as('gdk'), 'userNotifs/n1'), N()));
    await assertFails(setDoc(doc(as('gdk'), 'userNotifs/n2'), N({ createdBy: 'u2' })));
    await assertSucceeds(getDoc(doc(as('u1'), 'userNotifs/n1')));
    await assertFails(getDoc(doc(as('u2'), 'userNotifs/n1')));
    await assertFails(updateDoc(doc(as('u2'), 'userNotifs/n1'), { read: true }));
    await assertFails(updateDoc(doc(as('u1'), 'userNotifs/n1'), { title: 'hack' }));
    await assertSucceeds(updateDoc(doc(as('u1'), 'userNotifs/n1'), { read: true, readAt: 'y' }));
    await assertFails(deleteDoc(doc(as('u2'), 'userNotifs/n1')));
    await assertSucceeds(deleteDoc(doc(as('u1'), 'userNotifs/n1')));
  });
});
describe('Nhật ký lỗi + thống kê', () => {
  const E = (o: any = {}) => ({ at: 'x', screen: '/ngan-sach', role: 'user', device: 'mobile', browser: 'Chrome', msg: 'TypeError', kind: 'error', expireAt: Timestamp.fromMillis(now + 90 * 864e5), ...o });
  it('Ai cũng ghi đúng dạng; chỉ Admin đọc', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'errorLogs/e1'), E()));
    await assertFails(setDoc(doc(as('u1'), 'errorLogs/e2'), E({ email: 'a@b.c' })));
    await assertFails(setDoc(doc(as('u1'), 'errorLogs/e3'), E({ msg: 'x'.repeat(600) })));
    await assertFails(getDoc(doc(as('u1'), 'errorLogs/e1')));
    await assertSucceeds(getDoc(doc(as('adm'), 'errorLogs/e1')));
    await assertFails(updateDoc(doc(as('adm'), 'errorLogs/e1'), { msg: 'y' }));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'errorLogs/e1')));
  });
  it('usageDaily: chỉ doc của mình', async () => {
    const U = { day: '2026-10-24', uid: 'u1', role: 'user', blockId: 'B1', banKdId: '', device: 'desktop', screens: { '/': 1 }, first: 'x', last: 'y', expireAt: Timestamp.fromMillis(now) };
    await assertSucceeds(setDoc(doc(as('u1'), 'usageDaily/2026-10-24_u1'), U));
    await assertFails(setDoc(doc(as('u2'), 'usageDaily/2026-10-24_u1'), U));
    await assertFails(setDoc(doc(as('u1'), 'usageDaily/2026-10-25_u1'), U));
    await assertFails(getDoc(doc(as('u1'), 'usageDaily/2026-10-24_u1')));
    await assertSucceeds(getDoc(doc(as('adm'), 'usageDaily/2026-10-24_u1')));
  });
});
