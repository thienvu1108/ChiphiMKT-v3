/**
 * v-next rules: ns_lines, weekly_reports, acceptanceImages, shareLinks, teams.status/gdkdUids.
 * Run via: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, where, Timestamp, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = (path: string, data: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path), data); });

const OPEN = '2030-01';   // mở qua vnLocks/current.openWin («Thời gian MỞ»)
const CLOSED = '2031-05'; // ngoài hạn
const vnK = () => { const d = new Date(Date.now() + 7 * 3600e3); return String(d.getUTCFullYear() * 12 + d.getUTCMonth() + 1); };
const winNow = (period: string) => ({ [vnK()]: [{ from: Timestamp.fromMillis(Date.now() - 864e5), to: Timestamp.fromMillis(Date.now() + 864e5), period }] });
/** «Thời gian MỞ» đang mở ngay lúc chạy test cho kỳ createP (Đăng ký mới) / editP (Sửa NS; '' = mọi tháng). */
const openLocks = (createP: string, editP = '') => ({ openWin: { nsCreate: winNow(createP), nsEdit: winNow(editP) } });
const uLine = (period: string, uid: string, team = 'T1', amount = 10) => ({ period, kind: 'user', teamId: team, blockId: 'B1', projectId: 'P1', ownerUid: uid, amount, history: [] });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-chiphi-vnext', firestore: { rules: RULES, host: EMU_HOST, port: Number(EMU_PORT) } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('vnLocks/current', openLocks(OPEN, OPEN));
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/mod', { uid: 'mod', role: 'mod', email: 'mod@x.com' });
  await seed('users/u1', { vnOnboarding: { status: 'approved' }, uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', teamName: 'MAY-01' });
  await seed('users/u2', { vnOnboarding: { status: 'approved' }, uid: 'u2', role: 'user', email: 'u2@x.com', teamId: 'T2', teamName: 'MAY-02' });
  await seed('users/u3', { vnOnboarding: { status: 'approved' }, uid: 'u3', role: 'user', email: 'u3@x.com', teamId: 'T3', teamName: 'MAY-03' });
  await seed('users/g1', { vnOnboarding: { status: 'approved' }, uid: 'g1', role: 'gdkd', email: 'g1@x.com', teamId: 'T1', teamName: 'MAY-01' });
  await seed('users/g2', { vnOnboarding: { status: 'approved' }, uid: 'g2', role: 'gdkd', email: 'g2@x.com', teamId: 'TX', teamName: 'other' });
  await seed('users/gdk', { uid: 'gdk', role: 'gd_khoi', email: 'gdk@x.com', assignedBlock: 'E01' });
  await seed('users/kt', { uid: 'kt', role: 'accountant', email: 'kt@x.com' });
  await seed('users/tb', { uid: 'tb', role: 'truong_ban_kd', email: 'tb@x.com' });
  await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk' });
  await seed('blocks/B2', { name: 'Khối 2', blockCode: 'E02' });
  await seed('teams/T1', { name: 'MAY-01', blockId: 'B1', gdkdUids: ['g1', 'g2'] });
  await seed('teams/T2', { name: 'MAY-02', blockId: 'B1' });
  await seed('teams/T3', { name: 'MAY-03', blockId: 'B1', status: 'inactive' });
});

describe('ns_lines — user', () => {
  it('user tạo/sửa/xoá dòng của mình trong hạn', async () => {
    const id = `u_${OPEN}_T1_P1_u1`;
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines', id), uLine(OPEN, 'u1')));
    await assertSucceeds(updateDoc(doc(as('u1'), 'ns_lines', id), { amount: 20 }));
    await assertSucceeds(deleteDoc(doc(as('u1'), 'ns_lines', id)));
  });
  it('ngoài hạn bị chặn', async () => {
    await assertFails(setDoc(doc(as('u1'), 'ns_lines', `u_${CLOSED}_T1_P1_u1`), uLine(CLOSED, 'u1')));
  });
  it('không đăng ký cho Phòng khác / thay người khác / sai id', async () => {
    await assertFails(setDoc(doc(as('u1'), 'ns_lines', `u_${OPEN}_T2_P1_u1`), uLine(OPEN, 'u1', 'T2')));
    await assertFails(setDoc(doc(as('u1'), 'ns_lines', `u_${OPEN}_T1_P1_u2`), uLine(OPEN, 'u2')));
    await assertFails(setDoc(doc(as('u1'), 'ns_lines', `bad_id`), uLine(OPEN, 'u1')));
  });
  it('user dữ liệu cũ chỉ có teamName (không teamId) vẫn đăng ký cho Phòng của mình', async () => {
    await seed('users/old', { vnOnboarding: { status: 'approved' }, uid: 'old', role: 'user', email: 'old@x.com', teamName: 'MAY-02' });
    await assertSucceeds(setDoc(doc(as('old'), 'ns_lines', `u_${OPEN}_T2_P1_old`), uLine(OPEN, 'old', 'T2')));
    await assertFails(setDoc(doc(as('old'), 'ns_lines', `u_${OPEN}_T1_P1_old`), uLine(OPEN, 'old', 'T1')));
  });
  it('Phòng Ngừng hoạt động: user không đăng ký được', async () => {
    await assertFails(setDoc(doc(as('u3'), 'ns_lines', `u_${OPEN}_T3_P1_u3`), uLine(OPEN, 'u3', 'T3')));
  });
  it('GĐK / Mod / Kế toán không đăng ký như user', async () => {
    await seed('users/gdk2', { uid: 'gdk2', role: 'gd_khoi', teamId: 'T1' });
    await assertFails(setDoc(doc(as('gdk2'), 'ns_lines', `u_${OPEN}_T1_P1_gdk2`), uLine(OPEN, 'gdk2')));
    await seed('users/mod', { uid: 'mod', role: 'mod', teamId: 'T1' });
    await assertFails(setDoc(doc(as('mod'), 'ns_lines', `u_${OPEN}_T1_P1_mod`), uLine(OPEN, 'mod')));
  });
  it('user chỉ đọc dòng của mình', async () => {
    await seed(`ns_lines/u_${OPEN}_T1_P1_u1`, uLine(OPEN, 'u1'));
    await seed(`ns_lines/u_${OPEN}_T2_P1_u2`, uLine(OPEN, 'u2', 'T2'));
    await assertSucceeds(getDocs(query(collection(as('u1'), 'ns_lines'), where('ownerUid', '==', 'u1'))));
    await assertFails(getDoc(doc(as('u1'), 'ns_lines', `u_${OPEN}_T2_P1_u2`)));
    await assertFails(getDocs(collection(as('u1'), 'ns_lines')));
  });
});

describe('ns_lines — GĐKD (2 GĐKD/Phòng) và GĐK', () => {
  const id = `u_${OPEN}_T1_P1_u1`;
  beforeEach(async () => { await seed(`ns_lines/${id}`, uLine(OPEN, 'u1')); });
  it('GĐKD sửa dòng user: bắt buộc lý do', async () => {
    await assertFails(updateDoc(doc(as('g1'), 'ns_lines', id), { amount: 5 }));
    await assertSucceeds(updateDoc(doc(as('g1'), 'ns_lines', id), { amount: 5, history: [{ byUid: 'g1', reason: 'Giảm theo kế hoạch', from: 10, to: 5 }] }));
  });
  it('GĐKD thứ 2 (qua gdkdUids) cùng quyền; GĐKD Phòng khác bị chặn', async () => {
    await assertSucceeds(updateDoc(doc(as('g2'), 'ns_lines', id), { amount: 6, history: [{ byUid: 'g2', reason: 'Điều chỉnh', from: 10, to: 6 }] }));
    await seed('users/g3', { uid: 'g3', role: 'gdkd', teamId: 'T2' });
    await assertFails(updateDoc(doc(as('g3'), 'ns_lines', id), { amount: 6, history: [{ byUid: 'g3', reason: 'Điều chỉnh', from: 10, to: 6 }] }));
  });
  it('GĐKD không tạo dòng thay user, không xoá; đã bỏ dòng bổ sung GĐKD (chỉ Admin)', async () => {
    await assertFails(setDoc(doc(as('g1'), 'ns_lines', `u_${OPEN}_T1_P2_u1`), { ...uLine(OPEN, 'u1'), projectId: 'P2' }));
    await assertFails(deleteDoc(doc(as('g1'), 'ns_lines', id)));
    const pid = `p_${OPEN}_T1_P1`;
    await assertFails(setDoc(doc(as('g1'), 'ns_lines', pid), { period: OPEN, kind: 'gdkd', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 7 }));
    await seed(`ns_lines/${pid}`, { period: OPEN, kind: 'gdkd', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 7 });
    await assertFails(updateDoc(doc(as('g2'), 'ns_lines', pid), { amount: 9 }));
    await assertSucceeds(getDoc(doc(as('g1'), 'ns_lines', pid)));
    await assertFails(updateDoc(doc(as('adm'), 'ns_lines', pid), { amount: 0 })); // bỏ hẳn bổ sung, kể cả Admin
    await assertFails(setDoc(doc(as('adm'), 'ns_lines', `p_${OPEN}_T1_P2`), { period: OPEN, kind: 'gdkd', teamId: 'T1', blockId: 'B1', projectId: 'P2', amount: 7 }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'ns_lines', pid), { deleted: true, convertedTo: 'u_x' })); // chỉ đánh dấu
    await assertFails(setDoc(doc(as('g1'), 'ns_lines', `p_${CLOSED}_T1_P1`), { period: CLOSED, kind: 'gdkd', teamId: 'T1', projectId: 'P1', amount: 7 }));
  });
  it('GĐKD không đổi danh tính dòng', async () => {
    await assertFails(updateDoc(doc(as('g1'), 'ns_lines', id), { ownerUid: 'g1', history: [{ byUid: 'g1', reason: 'xxxx' }] }));
  });
  it('GĐK: đã bỏ bổ sung GĐK; Phòng chỉ đọc', async () => {
    await assertFails(setDoc(doc(as('gdk'), 'ns_lines', `k_${OPEN}_B1_P1`), { period: OPEN, kind: 'gdk', blockId: 'B1', projectId: 'P1', amount: 100 }));
    await seed(`ns_lines/k_${OPEN}_B1_P1`, { period: OPEN, kind: 'gdk', blockId: 'B1', projectId: 'P1', amount: 100 });
    await assertFails(updateDoc(doc(as('gdk'), 'ns_lines', `k_${OPEN}_B1_P1`), { amount: 5 }));
    await assertSucceeds(getDoc(doc(as('gdk'), 'ns_lines', `k_${OPEN}_B1_P1`)));
    await assertFails(updateDoc(doc(as('adm'), 'ns_lines', `k_${OPEN}_B1_P1`), { amount: 5 }));
    await assertFails(setDoc(doc(as('adm'), 'ns_lines', `k_${OPEN}_B1_P2`), { period: OPEN, kind: 'gdk', blockId: 'B1', projectId: 'P2', amount: 100 }));
    await assertFails(setDoc(doc(as('gdk'), 'ns_lines', `k_${OPEN}_B2_P1`), { period: OPEN, kind: 'gdk', blockId: 'B2', projectId: 'P1', amount: 100 }));
    await assertFails(updateDoc(doc(as('gdk'), 'ns_lines', id), { amount: 1, history: [{ byUid: 'gdk', reason: 'abcd' }] }));
    await assertSucceeds(getDoc(doc(as('gdk'), 'ns_lines', id)));
  });
  it('Ngoài Thời gian MỞ: Admin bị chặn, Super Admin vẫn ghi; Kế toán & Trưởng ban chỉ xem', async () => {
    await assertFails(setDoc(doc(as('adm'), 'ns_lines', `u_${CLOSED}_T1_P1_u1`), uLine(CLOSED, 'u1')));
    await seed('users/sup', { uid: 'sup', role: 'super_admin', email: 'sup@x.com' });
    await assertSucceeds(setDoc(doc(as('sup'), 'ns_lines', `u_${CLOSED}_T1_P1_u1`), uLine(CLOSED, 'u1')));
    await assertSucceeds(getDoc(doc(as('kt'), 'ns_lines', id)));
    await assertSucceeds(getDoc(doc(as('tb'), 'ns_lines', id)));
    await assertFails(updateDoc(doc(as('kt'), 'ns_lines', id), { amount: 1 }));
    await assertFails(updateDoc(doc(as('tb'), 'ns_lines', id), { amount: 1 }));
  });
});

describe('teams — Ngừng hoạt động & danh sách GĐKD chỉ Admin', () => {
  it('GĐK không đổi status / gdkdUids nhưng vẫn sửa tên Phòng trong Khối', async () => {
    await assertFails(updateDoc(doc(as('gdk'), 'teams/T2'), { status: 'inactive' }));
    await assertFails(updateDoc(doc(as('gdk'), 'teams/T2'), { gdkdUids: ['gdk'] }));
    await assertSucceeds(updateDoc(doc(as('gdk'), 'teams/T2'), { name: 'MAY-02b' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'teams/T2'), { status: 'inactive', gdkdUids: ['g1'] }));
  });
  it('GĐK không đổi role tài khoản', async () => {
    await assertFails(updateDoc(doc(as('gdk'), 'users/u1'), { role: 'gdkd' }));
  });
});

describe('ns_lines — GĐ Khối Đăng ký MKT (kind khoi)', () => {
  const kLine = (period: string, uid: string, block = 'B1', amount = 50) => ({ period, kind: 'khoi', blockId: block, projectId: 'P1', ownerUid: uid, amount, history: [] });
  it('GĐK tạo/sửa/xoá dòng của mình cho Khối mình trong hạn', async () => {
    const id = `g_${OPEN}_B1_P1_gdk`;
    await assertSucceeds(setDoc(doc(as('gdk'), 'ns_lines', id), kLine(OPEN, 'gdk')));
    await assertSucceeds(updateDoc(doc(as('gdk'), 'ns_lines', id), { amount: 70 }));
    await assertFails(updateDoc(doc(as('gdk'), 'ns_lines', id), { blockId: 'B2' }));
    await assertSucceeds(getDoc(doc(as('gdk'), 'ns_lines', id)));
    await assertSucceeds(deleteDoc(doc(as('gdk'), 'ns_lines', id)));
  });
  it('chặn: Khối khác, ngoài hạn, thay người khác, sai id, vai trò khác', async () => {
    await assertFails(setDoc(doc(as('gdk'), 'ns_lines', `g_${OPEN}_B2_P1_gdk`), kLine(OPEN, 'gdk', 'B2')));
    await assertFails(setDoc(doc(as('gdk'), 'ns_lines', `g_${CLOSED}_B1_P1_gdk`), kLine(CLOSED, 'gdk')));
    await assertFails(setDoc(doc(as('gdk'), 'ns_lines', `g_${OPEN}_B1_P1_u1`), kLine(OPEN, 'u1')));
    await assertFails(setDoc(doc(as('gdk'), 'ns_lines', `bad`), kLine(OPEN, 'gdk')));
    await assertFails(setDoc(doc(as('g1'), 'ns_lines', `g_${OPEN}_B1_P1_g1`), kLine(OPEN, 'g1')));
    await assertFails(setDoc(doc(as('u1'), 'ns_lines', `g_${OPEN}_B1_P1_u1`), kLine(OPEN, 'u1')));
    await seed('users/tlk', { uid: 'tlk', role: 'tro_ly_khoi', email: 'tlk@x.com', assignedBlock: 'E01' });
    await seed('blocks/B1', { name: 'Khối 1', blockCode: 'E01', directorUid: 'gdk', assistantUids: ['tlk'] });
    await assertSucceeds(setDoc(doc(as('tlk'), 'ns_lines', `g_${OPEN}_B1_P1_tlk`), kLine(OPEN, 'tlk'))); // Trợ lý Khối cũng Đăng ký MKT
    await assertSucceeds(updateDoc(doc(as('tlk'), 'ns_lines', `g_${OPEN}_B1_P1_tlk`), { amount: 9 }));
    await assertFails(setDoc(doc(as('tlk'), 'ns_lines', `g_${OPEN}_B2_P1_tlk`), kLine(OPEN, 'tlk', 'B2')));
    const w = { period: '2026-11', dot: 1, uid: 'tlk', teamId: '', blockId: 'B1', items: [] };
    await assertSucceeds(setDoc(doc(as('tlk'), 'weekly_reports', '2026-11_1_tlk'), w));
  });
  it('kế toán đọc được; GĐK nộp Báo cáo tuần của mình', async () => {
    await seed(`ns_lines/g_${OPEN}_B1_P1_gdk`, kLine(OPEN, 'gdk'));
    await assertSucceeds(getDoc(doc(as('kt'), 'ns_lines', `g_${OPEN}_B1_P1_gdk`)));
    const w = { period: '2026-11', dot: 1, uid: 'gdk', teamId: '', blockId: 'B1', items: [{ projectId: 'P1', cumCost: 1, leads: 0, interested: 0 }] };
    await assertSucceeds(setDoc(doc(as('gdk'), 'weekly_reports', '2026-11_1_gdk'), w));
    await assertFails(setDoc(doc(as('gdk'), 'weekly_reports', '2026-11_1_u1'), { ...w, uid: 'u1' }));
  });
});

describe('weekly_reports', () => {
  const w = (uid: string, dot = 1) => ({ period: '2026-11', dot, uid, items: [{ projectId: 'P1', cumCost: 1, leads: 0, interested: 0 }] });
  it('user nộp báo cáo của mình, không nộp thay', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'weekly_reports', '2026-11_1_u1'), w('u1')));
    await assertFails(setDoc(doc(as('u1'), 'weekly_reports', '2026-11_1_u2'), w('u2')));
    await assertFails(setDoc(doc(as('u1'), 'weekly_reports', '2026-11_2_u1'), w('u1', 1)));
  });
  it('Số căn chốt (closedUnits) trong items: lưu được; báo cáo cũ không có trường vẫn sửa được', async () => {
    await seed('weekly_reports/2026-11_1_u1', w('u1'));
    await assertSucceeds(setDoc(doc(as('u1'), 'weekly_reports', '2026-11_1_u1'), { ...w('u1'), items: [{ projectId: 'P1', cumCost: 2, leads: 3, interested: 1, closedUnits: 2 }] }));
    await assertFails(setDoc(doc(as('u1'), 'weekly_reports', '2026-11_1_u2'), { ...w('u2'), items: [{ projectId: 'P1', cumCost: 2, leads: 3, interested: 1, closedUnits: 2 }] }));
  });
  it('quản lý đọc, user không đọc của người khác', async () => {
    await seed('weekly_reports/2026-11_1_u2', w('u2'));
    await seed('weekly_reports/2026-11_1_u1t', { ...w('u1'), teamId: 'T1' });
    // fix/gdkd-scope: GĐKD chỉ đọc báo cáo Phòng mình
    await assertSucceeds(getDoc(doc(as('g1'), 'weekly_reports/2026-11_1_u1t')));
    await assertFails(getDoc(doc(as('g1'), 'weekly_reports/2026-11_1_u2')));
    await assertSucceeds(getDocs(collection(as('adm'), 'weekly_reports')));
    await assertFails(getDoc(doc(as('u1'), 'weekly_reports/2026-11_1_u2')));
    await assertFails(setDoc(doc(as('g1'), 'weekly_reports', '2026-11_1_u2'), w('u2')));
  });
});

describe('weekly_reports — Báo cáo Khối (query blockId + period)', () => {
  const wr = (uid: string, blockId: string) => ({ period: '2026-11', dot: 1, uid, blockId, teamId: 'T1', items: [] });
  const q = (by: string, b: string) => getDocs(query(collection(as(by), 'weekly_reports'), where('blockId', '==', b), where('period', '==', '2026-11')));
  it('GĐ Khối chỉ đọc báo cáo Khối mình; Admin / Mod / Kế toán đọc theo Khối được; user không', async () => {
    await seed('weekly_reports/2026-11_1_u1', wr('u1', 'B1'));
    await seed('weekly_reports/2026-11_1_u9', wr('u9', 'B2'));
    await assertSucceeds(q('gdk', 'B1'));
    await assertFails(q('gdk', 'B2'));
    await assertFails(getDoc(doc(as('gdk'), 'weekly_reports/2026-11_1_u9')));
    for (const by of ['adm', 'mod', 'kt']) await assertSucceeds(q(by, 'B2'));
    await assertFails(q('u1', 'B1'));
  });
});

describe('Nghiệm thu: ảnh & link công khai', () => {
  it('chỉ Admin/Mod tải ảnh', async () => {
    const img = { acceptanceId: 'a1', provider: 'firestore', caption: 'Ảnh 1' };
    await assertSucceeds(setDoc(doc(as('mod'), 'acceptanceImages/i1'), img));
    await assertFails(setDoc(doc(as('u1'), 'acceptanceImages/i2'), img));
    await assertFails(setDoc(doc(as('g1'), 'acceptanceImages/i2'), img));
    await assertFails(setDoc(doc(as('kt'), 'acceptanceImageData/i2'), { dataUrl: 'data:x' }));
  });
  const tok = 'abcdefghijkmnopqrstuvwxyzABCDEF2';
  it('chỉ Admin/Mod tạo link; ẩn danh GET được khi còn hạn; không LIST', async () => {
    const exp = Timestamp.fromMillis(Date.now() + 7 * 86400e3);
    await assertFails(setDoc(doc(as('u1'), 'shareLinks', tok), { createdBy: 'u1', expiresAt: exp }));
    await assertFails(setDoc(doc(as('mod'), 'shareLinks', tok), { createdBy: 'mod', expiresAt: Timestamp.fromMillis(Date.now() + 60 * 86400e3) }));
    await assertSucceeds(setDoc(doc(as('mod'), 'shareLinks', tok), { createdBy: 'mod', expiresAt: exp, snapshot: '{}' }));
    await assertSucceeds(getDoc(doc(anon(), 'shareLinks', tok)));
    await assertFails(getDocs(collection(anon(), 'shareLinks')));
    await assertSucceeds(setDoc(doc(as('mod'), `shareLinks/${tok}/images/x`), { dataUrl: 'data:image/png;base64,AA' }));
    await assertSucceeds(getDoc(doc(anon(), `shareLinks/${tok}/images/x`)));
  });
  it('link thu hồi / hết hạn → ẩn danh bị chặn', async () => {
    await seed(`shareLinks/${tok}`, { createdBy: 'mod', expiresAt: Timestamp.fromMillis(Date.now() + 86400e3), revokedAt: null });
    await assertFails(updateDoc(doc(as('u1'), 'shareLinks', tok), { revokedAt: 'now' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'shareLinks', tok), { revokedAt: 'now', revokedBy: 'adm' }));
    await assertFails(getDoc(doc(anon(), 'shareLinks', tok)));
    await seed(`shareLinks/${tok}x`, { createdBy: 'mod', expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await assertFails(getDoc(doc(anon(), 'shareLinks', tok + 'x')));
  });
  it('GĐK chỉ đọc ns_lines / weekly_reports của Khối mình (truy vấn blockId ==)', async () => {
    await seed('blocks/B2', { name: 'Khối 2', blockCode: 'E02' });
    await seed('ns_lines/xb1', { period: OPEN, kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', amount: 5, ownerUid: 'u9' });
    await seed('ns_lines/xb2', { period: OPEN, kind: 'user', teamId: 'T2', blockId: 'B2', projectId: 'P1', amount: 5, ownerUid: 'u9' });
    await seed('weekly_reports/wb2', { period: OPEN, dot: 1, uid: 'u9', teamId: 'T2', blockId: 'B2', items: [] });
    await assertSucceeds(getDocs(query(collection(as('gdk'), 'ns_lines'), where('blockId', '==', 'B1'))));
    await assertFails(getDocs(query(collection(as('gdk'), 'ns_lines'), where('blockId', '==', 'B2'))));
    await assertFails(getDocs(query(collection(as('gdk'), 'ns_lines'), where('period', '==', OPEN))));
    await assertFails(getDoc(doc(as('gdk'), 'ns_lines', 'xb2')));
    await assertFails(getDoc(doc(as('gdk'), 'weekly_reports', 'wb2')));
    await assertFails(getDocs(query(collection(as('g1'), 'ns_lines'), where('period', '==', OPEN))));
    await assertSucceeds(getDocs(query(collection(as('g1'), 'ns_lines'), where('teamId', '==', 'T1'))));
  });
});

describe('acceptances — Người phụ trách bắt buộc sau go-live', () => {
  const admDb = () => env.authenticatedContext('adm', { email: 'adm@x.com' }).firestore();
  const base = { projectId: 'P1', teamId: 'T1', month: '2026-11', status: 'Đã nghiệm thu' };
  const withImpl = async (id: string, extra: any = {}) => {
    const db = admDb(); const b = writeBatch(db);
    b.set(doc(db, `ntKeys/2026-11_u1_P1`), { acceptanceId: id, month: '2026-11', uid: 'u1', projectId: 'P1' });
    b.set(doc(db, `acceptances/${id}`), { ...base, implementerUid: 'u1', ntMonth: '2026-11', ...extra });
    return b.commit();
  };
  it('chưa cấu hình mốc → tạo không cần người phụ trách', async () => {
    await assertSucceeds(setDoc(doc(admDb(), 'acceptances/a0'), base));
  });
  it('sau mốc: thiếu người phụ trách hoặc thiếu cờ → bị chặn; đủ → OK', async () => {
    await seed('settings/global', { budgetStartDay: 15, budgetEndDay: 6, ntImplementerRequiredFrom: new Date('2020-01-01T00:00:00+07:00') });
    await assertFails(setDoc(doc(admDb(), 'acceptances/a1'), base));
    await assertFails(withImpl('a2'));
    await assertSucceeds(withImpl('a3', { ntRequired: true }));
    // bản ghi có cờ không được bỏ trống người phụ trách
    await assertFails(updateDoc(doc(admDb(), 'acceptances/a3'), { implementerUid: '' }));
    await assertSucceeds(updateDoc(doc(admDb(), 'acceptances/a3'), { notes: 'x' }));
  });
  it('mốc trong tương lai → chưa bắt buộc; bản ghi cũ (không cờ) vẫn sửa được', async () => {
    await seed('settings/global', { budgetStartDay: 15, budgetEndDay: 6, ntImplementerRequiredFrom: new Date('2099-01-01T00:00:00+07:00') });
    await assertSucceeds(setDoc(doc(admDb(), 'acceptances/a4'), base));
    await seed('acceptances/old', base);
    await assertSucceeds(updateDoc(doc(admDb(), 'acceptances/old'), { notes: 'y' }));
  });
});

describe('Quản lý Ban KD — Trưởng Ban / Phó Ban: dự án & Tỉ lệ hỗ trợ MKT', () => {
  beforeEach(async () => {
    await seed('users/pb', { uid: 'pb', role: 'gdkd', email: 'pb@x.com', teamId: 'T1' });
    await seed('ban_kd/BK1', { name: 'Ban 1', leaderUid: 'tb', deputyUids: ['pb'] });
    await seed('ban_kd/BK2', { name: 'Ban 2', leaderUid: 'other' });
    await seed('projects/PA', { name: 'Dự án A', banKdId: 'BK1', banKdName: 'Ban 1' });
    await seed('projects/PB', { name: 'Dự án B', banKdId: 'BK2', banKdName: 'Ban 2' });
  });
  const np = (ban: string) => ({ name: 'Dự án mới', projectCode: 'X1', region: 'HN', type: 'Khác', banKdId: ban, banKdName: 'Ban', createdAt: 'now', createdBy: 'tb' });
  it('Trưởng/Phó Ban KHÔNG tạo dự án mới; gắn dự án có sẵn chưa thuộc Ban nào; sửa / gỡ dự án Ban mình; chỉ Admin xoá', async () => {
    for (const by of ['tb', 'pb']) {
      await assertFails(setDoc(doc(as(by), 'projects', 'N_' + by), np('BK1')));
      await seed('projects/F_' + by, { name: 'Tự do ' + by });
      const link = { banKdId: 'BK1', banKdName: 'Ban 1', updatedAt: 'x', updatedBy: by };
      await assertFails(updateDoc(doc(as(by), 'projects', 'F_' + by), { ...link, banKdName: 'Sai tên' }));
      await assertFails(updateDoc(doc(as(by), 'projects', 'F_' + by), { banKdId: 'BK2', banKdName: 'Ban 2', updatedAt: 'x', updatedBy: by })); // Ban không quản lý
      await assertSucceeds(updateDoc(doc(as(by), 'projects', 'F_' + by), link));
      await assertFails(updateDoc(doc(as(by), 'projects', 'PB'), { banKdId: 'BK1', banKdName: 'Ban 1', updatedAt: 'x', updatedBy: by })); // đã thuộc Ban khác
      await assertSucceeds(updateDoc(doc(as(by), 'projects', 'PA'), { name: 'Dự án A2 ' + by, updatedAt: 'x', updatedBy: by }));
      await assertFails(updateDoc(doc(as(by), 'projects', 'F_' + by), { deleted: true, deletedAt: 'x', deletedBy: by })); // không xoá mềm
      await assertFails(updateDoc(doc(as(by), 'projects', 'F_' + by), { status: 'inactive' }));
      await assertFails(deleteDoc(doc(as(by), 'projects', 'PA'))); // chỉ Admin xoá
      await assertSucceeds(updateDoc(doc(as(by), 'projects', 'F_' + by), { banKdId: '', banKdName: '' })); // Gỡ khỏi Ban
      await assertFails(updateDoc(doc(as(by), 'projects', 'F_' + by), { name: 'sau khi gỡ' })); // không còn thuộc Ban
    }
    await seed('projects/L1', { name: 'Legacy', banKdName: 'Ban 2' }); // legacy theo tên vẫn tính là đã thuộc Ban
    await assertFails(updateDoc(doc(as('tb'), 'projects', 'L1'), { banKdId: 'BK1', banKdName: 'Ban 1', updatedAt: 'x', updatedBy: 'tb' }));
    await assertSucceeds(setDoc(doc(as('adm'), 'projects', 'NA'), np('BK1')));
  });
  it('chặn: Ban khác, chuyển sang Ban khác, người ngoài, % sai', async () => {
    await assertFails(setDoc(doc(as('tb'), 'projects', 'N1'), np('BK2')));
    await assertFails(updateDoc(doc(as('pb'), 'projects', 'PB'), { name: 'x' }));
    await assertFails(updateDoc(doc(as('tb'), 'projects', 'PA'), { banKdId: 'BK2' }));
    await assertFails(updateDoc(doc(as('u1'), 'projects', 'PA'), { name: 'x' }));
    await assertFails(setDoc(doc(as('g1'), 'projects', 'N2'), np('BK1')));
    await assertFails(updateDoc(doc(as('tb'), 'projects', 'PA'), { supportPct: 150 }));
    await assertFails(setDoc(doc(as('tb'), 'projects', 'N3'), { ...np('BK1'), secret: 1 }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'projects', 'PB'), { name: 'Admin sửa' }));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'projects', 'PB')));
  });
  it('Tỉ lệ hỗ trợ MKT: Ban (mặc định) + dự án (riêng)', async () => {
    await assertSucceeds(updateDoc(doc(as('tb'), 'ban_kd', 'BK1'), { supportPct: 30, supportPctHistory: [{ to: 30 }], updatedAt: 'x' }));
    await assertSucceeds(updateDoc(doc(as('pb'), 'ban_kd', 'BK1'), { supportPct: 25.5, updatedAt: 'y' }));
    await assertSucceeds(updateDoc(doc(as('pb'), 'ban_kd', 'BK1'), { supportPct: null }));
    await assertSucceeds(updateDoc(doc(as('pb'), 'projects', 'PA'), { supportPct: 40, supportPctHistory: [{ to: 40 }] }));
    await assertFails(updateDoc(doc(as('pb'), 'ban_kd', 'BK1'), { supportPct: 101 }));
    await assertFails(updateDoc(doc(as('pb'), 'ban_kd', 'BK1'), { deputyUids: ['pb', 'u1'] })); // chỉ Admin gán Phó Ban
    await assertFails(updateDoc(doc(as('pb'), 'ban_kd', 'BK2'), { supportPct: 10 }));
    await assertFails(updateDoc(doc(as('u1'), 'ban_kd', 'BK1'), { supportPct: 10 }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'ban_kd', 'BK1'), { deputyUids: ['pb', 'u1'] }));
  });
  it('Trưởng ban KD (role) đọc Ban mình làm Phó Ban', async () => {
    await seed('users/tb2', { uid: 'tb2', role: 'truong_ban_kd', email: 'tb2@x.com' });
    await seed('ban_kd/BK3', { name: 'Ban 3', leaderUid: 'zz', deputyUids: ['tb2'] });
    await assertSucceeds(getDocs(query(collection(as('tb2'), 'ban_kd'), where('deputyUids', 'array-contains', 'tb2'))));
    await assertFails(getDoc(doc(as('tb2'), 'ban_kd', 'BK2')));
  });
});

describe('Quản lý CĐT (investors) + CĐT của dự án', () => {
  it('Admin thêm/sửa/xoá mềm; người khác chỉ đọc; Trưởng/Phó Ban gắn CĐT cho dự án Ban mình', async () => {
    await assertSucceeds(setDoc(doc(as('adm'), 'investors', 'C1'), { name: 'CĐT A', contact: '', note: '', deleted: false, createdAt: 'x', createdBy: 'adm' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'investors', 'C1'), { deleted: true }));
    await assertFails(deleteDoc(doc(as('adm'), 'investors', 'C1')));
    await assertFails(setDoc(doc(as('u1'), 'investors', 'C2'), { name: 'x' }));
    await assertFails(updateDoc(doc(as('tb'), 'investors', 'C1'), { name: 'y' }));
    await assertFails(setDoc(doc(as('adm'), 'investors', 'C3'), { name: '' }));
    await assertSucceeds(getDoc(doc(as('u1'), 'investors', 'C1')));
    await seed('ban_kd/BK1', { name: 'Ban 1', leaderUid: 'tb' });
    await seed('projects/PA', { name: 'Dự án A', banKdId: 'BK1' });
    await assertSucceeds(updateDoc(doc(as('tb'), 'projects', 'PA'), { cdtId: 'C1', cdtName: 'CĐT A' }));
  });
});

describe('weekly_reports — Admin sửa / xoá mềm', () => {
  const w = { period: '2026-11', dot: 1, uid: 'u1', items: [{ projectId: 'P1', cumCost: 1, leads: 0, interested: 0 }] };
  beforeEach(async () => { await seed('weekly_reports/2026-11_1_u1', w); });
  it('Admin sửa + xoá mềm (có history); user / GĐKD / Mod không xoá được; user không tự đặt deleted', async () => {
    await assertSucceeds(updateDoc(doc(as('adm'), 'weekly_reports', '2026-11_1_u1'), { items: [{ projectId: 'P1', cumCost: 5, leads: 1, interested: 0 }], editedBy: 'adm', editedAt: 'x', history: [{ action: 'admin_edit', prevItems: w.items }] }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'weekly_reports', '2026-11_1_u1'), { deleted: true, deletedBy: 'adm', deletedAt: 'x' }));
    await assertFails(updateDoc(doc(as('g1'), 'weekly_reports', '2026-11_1_u1'), { deleted: true }));
    await assertFails(updateDoc(doc(as('mod'), 'weekly_reports', '2026-11_1_u1'), { deleted: true }));
    await assertFails(updateDoc(doc(as('u1'), 'weekly_reports', '2026-11_1_u1'), { deleted: true }));
    await assertSucceeds(setDoc(doc(as('u1'), 'weekly_reports', '2026-11_1_u1'), w)); // nộp lại sau khi bị xoá
  });
  it('Admin bị tắt quyền vn.reports.admin_edit trong Phân quyền thì không sửa được', async () => {
    await seed('rolePermissions/admin', { permissions: [], knownKeys: ['vn.reports.admin_edit'] });
    await assertFails(updateDoc(doc(as('adm'), 'weekly_reports', '2026-11_1_u1'), { deleted: true }));
  });
});

describe('fix/gdkd-scope: GĐKD chỉ thấy Phòng mình', () => {
  it('ns_lines / weekly_reports: GĐKD đọc Phòng mình, không đọc Phòng/Khối khác', async () => {
    await seed('users/gs', { vnOnboarding: { status: 'approved' }, uid: 'gs', role: 'gdkd', email: 'gs@x.com', teamId: 'TS1' });
    await seed('teams/TS1', { name: 'S1', blockId: 'B1', gdkdUids: ['gs'] });
    await seed('teams/TS2', { name: 'S2', blockId: 'B2', gdkdUids: [] });
    await seed('ns_lines/u_2026-11_TS1_P1_ux', { period: '2026-11', kind: 'user', teamId: 'TS1', blockId: 'B1', projectId: 'P1', ownerUid: 'ux', amount: 5 });
    await seed('ns_lines/u_2026-11_TS2_P1_uy', { period: '2026-11', kind: 'user', teamId: 'TS2', blockId: 'B2', projectId: 'P1', ownerUid: 'uy', amount: 5 });
    await seed('weekly_reports/w_ts2', { uid: 'uy', teamId: 'TS2', blockId: 'B2', period: '2026-11' });
    await seed('weekly_reports/w_ts1', { uid: 'ux', teamId: 'TS1', blockId: 'B1', period: '2026-11' });
    await assertSucceeds(getDoc(doc(as('gs'), 'ns_lines/u_2026-11_TS1_P1_ux')));
    await assertFails(getDoc(doc(as('gs'), 'ns_lines/u_2026-11_TS2_P1_uy')));
    await assertSucceeds(getDoc(doc(as('gs'), 'weekly_reports/w_ts1')));
    await assertFails(getDoc(doc(as('gs'), 'weekly_reports/w_ts2')));
    await assertSucceeds(getDocs(query(collection(as('gs'), 'ns_lines'), where('teamId', '==', 'TS1'))));
    await assertFails(getDocs(query(collection(as('gs'), 'ns_lines'), where('blockId', '==', 'B2'))));
    // Mod vẫn xem toàn công ty
    await assertSucceeds(getDoc(doc(as('mod'), 'ns_lines/u_2026-11_TS2_P1_uy')));
  });
  it('GĐKD không còn đọc NS Khối / Đối ứng (block_budgets, reciprocal_budgets)', async () => {
    await seed('block_budgets/bb1', { blockId: 'B2', amount: 1 });
    await seed('reciprocal_budgets/rb1', { blockId: 'B2', amount: 1 });
    await assertFails(getDoc(doc(as('gs'), 'block_budgets/bb1')));
    await assertFails(getDoc(doc(as('gs'), 'reciprocal_budgets/rb1')));
    await assertSucceeds(getDoc(doc(as('gdk'), 'block_budgets/bb1')).catch(() => getDoc(doc(as('adm'), 'block_budgets/bb1'))));
  });
});

describe('Khung NS CHỈ theo «Thời gian MỞ» (đã bỏ budgetStartDay/EndDay, nsUnlockedPeriods)', () => {
  const past = { from: Timestamp.fromMillis(Date.now() - 2 * 864e5), to: Timestamp.fromMillis(Date.now() - 864e5) };
  const closedWin = (period: string) => ({ [vnK()]: [{ ...past, period }] });
  const uid = `u_${OPEN}_T1_P1_u1`;
  const kLine = (period: string, uid: string, block = 'B1', amount = 50) => ({ period, kind: 'khoi', blockId: block, projectId: 'P1', ownerUid: uid, amount, history: [] });
  const gid = `g_${OPEN}_B1_P1_gdk`;
  beforeEach(async () => { await seed('users/sup', { uid: 'sup', role: 'super_admin', email: 'sup@x.com' }); });

  it('user & GĐ Khối: tạo NS cho tháng được phép trong cửa sổ; tháng khác bị chặn', async () => {
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines', uid), uLine(OPEN, 'u1')));
    await assertSucceeds(setDoc(doc(as('gdk'), 'ns_lines', gid), kLine(OPEN, 'gdk')));
    await assertFails(setDoc(doc(as('u1'), 'ns_lines', `u_${CLOSED}_T1_P1_u1`), uLine(CLOSED, 'u1')));
    await assertFails(setDoc(doc(as('gdk'), 'ns_lines', `g_${CLOSED}_B1_P1_gdk`), kLine(CLOSED, 'gdk')));
  });
  it('ngoài cửa sổ (đã hết giờ mở) → chặn đăng ký mới, kể cả khung cũ settings/global mở', async () => {
    await seed('settings/global', { budgetStartDay: 1, budgetEndDay: 31, nsUnlockedPeriods: [OPEN, CLOSED] });
    await seed('vnLocks/current', { openWin: { nsCreate: closedWin(OPEN), nsEdit: closedWin('') } });
    await assertFails(setDoc(doc(as('u1'), 'ns_lines', uid), uLine(OPEN, 'u1')));
    await assertFails(setDoc(doc(as('gdk'), 'ns_lines', gid), kLine(OPEN, 'gdk')));
  });
  it('Sửa NS: đăng ký mới đã đóng nhưng Sửa NS (Mọi tháng) mở → sửa được, không tạo mới được', async () => {
    await seed(`ns_lines/${uid}`, uLine(OPEN, 'u1'));
    await seed(`ns_lines/${gid}`, kLine(OPEN, 'gdk'));
    await seed('vnLocks/current', { openWin: { nsCreate: closedWin(OPEN), nsEdit: winNow('') } });
    await assertSucceeds(updateDoc(doc(as('u1'), 'ns_lines', uid), { amount: 20 }));
    await assertSucceeds(updateDoc(doc(as('gdk'), 'ns_lines', gid), { amount: 20 }));
    await assertFails(setDoc(doc(as('u1'), 'ns_lines', `u_${OPEN}_T1_P2_u1`), { ...uLine(OPEN, 'u1'), projectId: 'P2' }));
    await seed('vnLocks/current', { openWin: { nsCreate: winNow(OPEN), nsEdit: closedWin('') } });
    await assertFails(updateDoc(doc(as('u1'), 'ns_lines', uid), { amount: 30 }));
    await assertFails(deleteDoc(doc(as('u1'), 'ns_lines', uid)));
  });
  it('Super Admin bỏ qua mọi khung', async () => {
    await seed('vnLocks/current', { openWin: { nsCreate: closedWin(OPEN), nsEdit: closedWin('') } });
    await assertSucceeds(setDoc(doc(as('sup'), 'ns_lines', uid), uLine(OPEN, 'u1')));
    await assertSucceeds(updateDoc(doc(as('sup'), 'ns_lines', uid), { amount: 5 }));
  });
  it('khoá kỳ đã qua (pastWin) vẫn chặn dù cửa sổ đang mở; Super Admin vẫn được', async () => {
    await seed(`ns_lines/${uid}`, uLine(OPEN, 'u1'));
    await seed('vnLocks/current', { ...openLocks(OPEN, ''), pastWin: { ns: { [vnK()]: { m: OPEN, at: Timestamp.fromMillis(Date.now() - 864e5) } } } });
    await assertFails(updateDoc(doc(as('u1'), 'ns_lines', uid), { amount: 20 }));
    await assertFails(setDoc(doc(as('gdk'), 'ns_lines', gid), kLine(OPEN, 'gdk')));
    await assertSucceeds(updateDoc(doc(as('sup'), 'ns_lines', uid), { amount: 21 }));
  });
});
