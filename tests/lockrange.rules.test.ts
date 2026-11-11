// Kỳ khoá theo ngày bắt đầu → ngày kết thúc (giờ VN), có chọn kỳ. Doc như app lưu (ranges + lockWin biên dịch).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { compileLockWin } from '../lib/vnext/platform';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const now = Date.now();
type Rg = { from: number; to: number; period: string };
const rg = (a: number, b: number, period: string): Rg => ({ from: now + a * 3600e3, to: now + b * 3600e3, period });
const TS = (r: Rg) => ({ from: Timestamp.fromMillis(r.from), to: Timestamp.fromMillis(r.to), period: r.period });
/** Giống LocksPage.save: danh sách kỳ khoá + lockWin. */
function lockDoc(m: { nsCreate?: Rg[]; nsEdit?: Rg[]; nt?: Rg[] }) {
  const out: any = { recurring: {}, lockWin: {}, updatedAt: 'x', updatedBy: 'sup' };
  for (const k of ['nsCreate', 'nsEdit', 'nt'] as const) {
    const rs = m[k] || []; out[k] = rs.map(TS);
    out.lockWin[k] = Object.fromEntries(Object.entries(compileLockWin(rs, undefined).win).map(([i, ws]) => [i, ws.map(TS)]));
  }
  return out;
}
const LID = (p: string) => `u_${p}_T1_P1_u1`;
const LINE = (p: string, o: any = {}) => ({ period: p, kind: 'user', teamId: 'T1', blockId: 'B1', projectId: 'P1', ownerUid: 'u1', ownerName: 'U1', amount: 5000000, ...o });
const A = (month: string) => ({ projectId: 'P1', teamId: 'T1', month, status: 'Đã nghiệm thu' });

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-lockrange', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('settings/global', { nsUnlockedPeriods: ['2026-10', '2026-11'] });
  await seed('blocks/B1', { name: 'Khối 1', directorUid: 'gdk', assistantUids: [] });
  await seed('teams/T1', { name: 'T1', blockId: 'B1', gdkdUids: [], active: true });
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/sup', { uid: 'sup', role: 'super_admin', email: 'sup@x.com' });
  await seed('users/u1', { uid: 'u1', role: 'user', email: 'u1@x.com', teamId: 'T1', vnOnboarding: { status: 'approved' } });
});

describe('Kỳ khoá Nghiệm thu (ngày bắt đầu → kết thúc, theo kỳ)', () => {
  it('Super Admin lưu được doc kỳ khoá như app; Admin không', async () => {
    const d = lockDoc({ nt: [rg(-1, 48, '2026-09')], nsCreate: [rg(-1, 48, '2026-11')], nsEdit: [rg(-1, 48, '2026-11')] });
    await assertFails(setDoc(doc(as('adm'), 'vnLocks/current'), d));
    await assertSucceeds(setDoc(doc(as('sup'), 'vnLocks/current'), d));
    await assertSucceeds(setDoc(doc(as('sup'), 'vnLocks/current'), lockDoc({ nt: Array.from({ length: 12 }, (_, i) => rg(i * 2000, i * 2000 + 1, '2026-09')) })));
  });
  it('Đang trong kỳ khoá 2026-09: tạo / sửa NT kỳ 2026-09 bị chặn (cả Admin), kỳ khác vẫn được, Super Admin được', async () => {
    await seed('acceptances/old9', A('2026-09'));
    await seed('acceptances/old10', A('2026-10'));
    await seed('vnLocks/current', lockDoc({ nt: [rg(-1, 2, '2026-09')] }));
    await assertFails(setDoc(doc(as('adm'), 'acceptances/n9'), A('2026-09')));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/n10'), A('2026-10')));
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/old9'), { notes: 'x' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'acceptances/old10'), { notes: 'x' }));
    // không được chuyển bản ghi sang kỳ đang khoá
    await assertFails(updateDoc(doc(as('adm'), 'acceptances/old10'), { month: '2026-09' }));
    await assertSucceeds(setDoc(doc(as('sup'), 'acceptances/s9'), A('2026-09')));
    await assertSucceeds(updateDoc(doc(as('sup'), 'acceptances/old9'), { notes: 'y' }));
  });
  it('Chưa tới ngày bắt đầu / đã qua ngày kết thúc → mở', async () => {
    await seed('vnLocks/current', lockDoc({ nt: [rg(2, 30, '2026-09'), rg(-30, -1, '2026-09')] }));
    await assertSucceeds(setDoc(doc(as('adm'), 'acceptances/n9'), A('2026-09')));
  });
});

describe('Kỳ khoá NT chặn cả xoá / hoá đơn / ảnh / finalAcceptances / ntKeys', () => {
  it('Đang khoá 2026-09: Admin không xoá / ghi được; kỳ 2026-10 vẫn được; Super Admin được', async () => {
    await seed('acceptances/a9', A('2026-09'));
    await seed('acceptances/a9b', A('2026-09'));
    await seed('acceptances/a10', A('2026-10'));
    await seed('acceptanceInvoices/i9', { acceptanceId: 'a9', fileId: 'abcdefghijk', mime: 'application/pdf' });
    await seed('acceptanceInvoices/i10', { acceptanceId: 'a10', fileId: 'abcdefghijk', mime: 'application/pdf' });
    await seed('acceptanceImageData/g9', { acceptanceId: 'a9', dataUrl: 'x' });
    await seed('finalAcceptances/f9', { month: '2026-09', teamId: 'T1' });
    await seed('finalAcceptances/f10', { month: '2026-10', teamId: 'T1' });
    await seed('ntKeys/2026-09_u1_P1', { acceptanceId: 'a9', month: '2026-09', uid: 'u1', projectId: 'P1' });
    await seed('vnLocks/current', lockDoc({ nt: [rg(-1, 2, '2026-09')] }));
    const adm = as('adm'); const sup = as('sup');
    await assertFails(deleteDoc(doc(adm, 'acceptances/a9')));
    await assertSucceeds(deleteDoc(doc(adm, 'acceptances/a10')));
    await assertFails(deleteDoc(doc(adm, 'acceptanceInvoices/i9')));
    await assertFails(updateDoc(doc(adm, 'acceptanceInvoices/i9'), { order: 2 }));
    await assertFails(deleteDoc(doc(adm, 'acceptanceImageData/g9')));
    await assertFails(setDoc(doc(adm, 'acceptanceImageData/g9n'), { acceptanceId: 'a9', dataUrl: 'x' }));
    await assertSucceeds(setDoc(doc(adm, 'acceptanceImageData/g10'), { acceptanceId: 'a9b'.replace('a9b', 'a10x'), dataUrl: 'x' }));
    await assertFails(setDoc(doc(adm, 'finalAcceptances/f9n'), { month: '2026-09', teamId: 'T1' }));
    await assertFails(updateDoc(doc(adm, 'finalAcceptances/f9'), { x: 1 }));
    await assertFails(deleteDoc(doc(adm, 'finalAcceptances/f9')));
    await assertSucceeds(updateDoc(doc(adm, 'finalAcceptances/f10'), { x: 1 }));
    await assertFails(deleteDoc(doc(adm, 'ntKeys/2026-09_u1_P1')));
    await assertFails(setDoc(doc(adm, 'ntKeys/2026-09_u2_P1'), { acceptanceId: 'a9b', month: '2026-09', uid: 'u2', projectId: 'P1', createdAt: 'x' }));
    await assertSucceeds(setDoc(doc(adm, 'ntKeys/2026-10_u2_P1'), { acceptanceId: 'a10', month: '2026-10', uid: 'u2', projectId: 'P1', createdAt: 'x' }));
    // Super Admin bỏ qua
    await assertSucceeds(deleteDoc(doc(sup, 'acceptanceInvoices/i9')));
    await assertSucceeds(deleteDoc(doc(sup, 'acceptanceImageData/g9')));
    await assertSucceeds(deleteDoc(doc(sup, 'finalAcceptances/f9')));
    await assertSucceeds(deleteDoc(doc(sup, 'ntKeys/2026-09_u1_P1')));
    await assertSucceeds(deleteDoc(doc(sup, 'acceptances/a9')));
  });
});

describe('Kỳ khoá Ngân sách (ns_lines)', () => {
  it('Khoá cả đăng ký mới + sửa của tháng NS 2026-11; tháng 2026-10 vẫn mở', async () => {
    await seed('ns_lines/' + LID('2026-11'), LINE('2026-11'));
    await seed('vnLocks/current', lockDoc({ nsCreate: [rg(-1, 2, '2026-11')], nsEdit: [rg(-1, 2, '2026-11')] }));
    await assertFails(updateDoc(doc(as('u1'), 'ns_lines/' + LID('2026-11')), { amount: 6000000 }));
    await assertFails(updateDoc(doc(as('adm'), 'ns_lines/' + LID('2026-11')), { amount: 6000000 }));
    await assertSucceeds(setDoc(doc(as('u1'), 'ns_lines/' + LID('2026-10')), LINE('2026-10')));
    await assertSucceeds(updateDoc(doc(as('sup'), 'ns_lines/' + LID('2026-11')), { amount: 6000000 }));
  });
  it('Chỉ khoá đăng ký mới: tạo bị chặn, sửa vẫn được', async () => {
    await seed('ns_lines/' + LID('2026-11'), LINE('2026-11'));
    await seed('vnLocks/current', lockDoc({ nsCreate: [rg(-1, 2, '2026-11')] }));
    await assertSucceeds(updateDoc(doc(as('u1'), 'ns_lines/' + LID('2026-11')), { amount: 6000000 }));
    await env.withSecurityRulesDisabled(async (c) => { const { deleteDoc } = await import('firebase/firestore'); await deleteDoc(doc(c.firestore(), 'ns_lines/' + LID('2026-11'))); });
    await assertFails(setDoc(doc(as('u1'), 'ns_lines/' + LID('2026-11')), LINE('2026-11')));
  });
});
