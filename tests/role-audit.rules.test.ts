/**
 * Role / permission audit (2026-10-06) — moved from data-diff-2026-10-06/role-audit-rules.test.ts.
 * Originally these tests PROVED the bugs (assertSucceeds on escalation). After the P0/P1 fixes
 * they assert the fixed behaviour. Run via: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, arrayUnion, doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
let env: RulesTestEnvironment;
const seed = async (path: string, data: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path), data); });
const db = (uid: string, email: string) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();

/** Marketing month as the rules compute it (Vietnam day, UTC+7). Window in tests = whole month. */
const vnK = () => { const d = new Date(Date.now() + 7 * 3600e3); return String(d.getUTCFullYear() * 12 + d.getUTCMonth() + 1); };
const winNow = (period: string) => ({ [vnK()]: [{ from: Timestamp.fromMillis(Date.now() - 864e5), to: Timestamp.fromMillis(Date.now() + 864e5), period }] });
/** «Thời gian MỞ» đang mở ngay lúc chạy test cho kỳ createP (Đăng ký mới) / editP (Sửa NS; '' = mọi tháng). */
const openLocks = (createP: string, editP = '') => ({ openWin: { nsCreate: winNow(createP), nsEdit: winNow(editP) } });
const vnMonth = (offsetDays = 0) => new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 7);

// Real rolePermissions from chiphi-mkt (2026-10-06)
const RP: Record<string, string[]> = {
  gd_khoi: ['actual.view','admin.projects.view','block.approve','block.edit','block.view','block_budget.create','block_budget.edit','block_budget.view','home.view','process_doiung.approve','process_mkt.approve','support.create','team_mgmt.approve','team_mgmt.view'],
  tro_ly_khoi: ['block.approve','block.edit','block.view','block_budget.create','block_budget.edit','block_budget.view','history.view','home.view','process_doiung.approve','process_doiung.create','process_doiung.view','process_mkt.approve','process_mkt.create','process_mkt.view','register.view','report_nt.view','support.create','support.view','team_mgmt.approve','team_mgmt.edit','team_mgmt.view'],
  mod: ['admin.projects.view','admin.teams.view','bankd.view','block.view','process_mkt.view','report_nt.create','report_nt.edit','report_nt.view','support.create','team_mgmt.view'],
  user: ['process_doiung.approve','process_doiung.create','process_mkt.approve','process_mkt.create','support.create'],
  assistant: ['actual.create','actual.view','admin.budgets.view','admin.costs.view','admin.projects.view','admin.teams.view','history.export','history.view','home.export','home.view','mkt_efficiency.export','mkt_efficiency.filter','mkt_efficiency.view','register.view','support.create'],
};

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-chiphi-audit', firestore: { rules: RULES, host: (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')[0], port: Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')[1]) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const [r, p] of Object.entries(RP)) await seed(`rolePermissions/${r}`, { role: r, permissions: p });
  await seed('vnLocks/current', openLocks(vnMonth()));
  // Blocks: doc ids differ from codes (like production: blockId = doc id, assignedBlock = code)
  await seed('blocks/blkE01', { name: 'A.E01', blockCode: 'E01', teamPrefix: 'MAY01', directorUid: 'gdk', assistantUids: [] });
  await seed('blocks/blkE02', { name: 'A.E02', blockCode: 'E02', teamPrefix: 'MAY02', directorUid: null, assistantUids: ['tl'] });
  await seed('blocks/blkE03', { name: 'A.E03', blockCode: 'E03', teamPrefix: 'MAY03', directorUid: null, assistantUids: [] });
  await seed('blocks/OTHER', { name: 'Other', blockCode: 'E99', teamPrefix: 'MAY99', directorUid: null, assistantUids: [] });
  await seed('users/gdk', { role: 'gd_khoi', email: 'gdk@x.com', assignedBlock: 'E01' });
  await seed('users/tl', { role: 'tro_ly_khoi', email: 'tl@x.com', assignedBlock: 'E02', assignedBlocks: ['E02', 'blkE02'] });
  await seed('users/md', { role: 'mod', email: 'md@x.com' });
  await seed('users/acc', { role: 'accountant', email: 'acc@x.com' });
  await seed('users/gdkd', { role: 'gdkd', email: 'gdkd@x.com', teamName: 'MAY-01' });
  await seed('users/u', { role: 'user', email: 'u@x.com' });
  await seed('users/ub', { role: 'user', email: 'ub@x.com', assignedBlock: 'E03' });
  await seed('users/asst', { role: 'assistant', email: 'asst@x.com' });
  await seed('users/adm', { role: 'admin', email: 'adm@x.com' });
  await seed('users/victim', { role: 'user', email: 'v@x.com', teamName: 'MAY-01' });
  await seed('reciprocal_budgets/r1', { blockId: 'E01', amount: 1 });
  await seed('block_budgets/bb1', { blockId: 'OTHER', blockCode: 'E99', month: vnMonth(), amount: 1 });
  await seed('block_budgets/bbTl', { blockId: 'blkE02', blockCode: 'E02', month: vnMonth(), amount: 1 });
  await seed('block_budgets/bbGdk', { blockId: 'blkE01', blockCode: 'E01', month: vnMonth(), amount: 1 });
});

describe('P0-3 users: no self/peer role escalation', () => {
  it('gd_khoi cannot self-escalate to super_admin', async () => { await assertFails(updateDoc(doc(db('gdk','gdk@x.com'), 'users/gdk'), { role: 'super_admin' })); });
  it('tro_ly_khoi cannot escalate another user to admin', async () => { await assertFails(updateDoc(doc(db('tl','tl@x.com'), 'users/victim'), { role: 'admin' })); });
  it('mod cannot self-escalate to admin', async () => { await assertFails(updateDoc(doc(db('md','md@x.com'), 'users/md'), { role: 'admin' })); });
  it('accountant cannot self-escalate to super_admin', async () => { await assertFails(updateDoc(doc(db('acc','acc@x.com'), 'users/acc'), { role: 'super_admin' })); });
  it('accountant cannot change another user role', async () => { await assertFails(updateDoc(doc(db('acc','acc@x.com'), 'users/victim'), { role: 'mod' })); });
  it('user with assignedBlock cannot escalate anyone', async () => { await assertFails(updateDoc(doc(db('ub','ub@x.com'), 'users/victim'), { role: 'admin' })); });
  it('gd_khoi cannot change scope (assignedBlock / assignedBlocks / banKd)', async () => {
    await assertFails(updateDoc(doc(db('gdk','gdk@x.com'), 'users/gdk'), { assignedBlock: 'E02' }));
    await assertFails(updateDoc(doc(db('gdk','gdk@x.com'), 'users/victim'), { assignedBlocks: ['E01'] }));
    await assertFails(updateDoc(doc(db('gdk','gdk@x.com'), 'users/victim'), { assignedBanKds: ['b1'] }));
    await assertFails(updateDoc(doc(db('gdk','gdk@x.com'), 'users/gdk'), { permissions: ['admin.users.edit'] }));
  });
  it('gdkd cannot create same-team users nor set their role', async () => {
    await assertFails(setDoc(doc(db('gdkd','gdkd@x.com'), 'users/newbie'), { role: 'admin', teamName: 'MAY-01', email: 'n@x.com' }));
    await assertFails(updateDoc(doc(db('gdkd','gdkd@x.com'), 'users/victim'), { role: 'mod' }));
  });
  it('gdkd cannot directly edit another user name (rename flow only, with audit)', async () => {
    await assertFails(updateDoc(doc(db('gdkd','gdkd@x.com'), 'users/victim'), { fullName: 'Nguyễn A' }));
  });
  it('accountant can no longer change a user team (only Admin moves users between Phòng)', async () => {
    await assertFails(updateDoc(doc(db('acc','acc@x.com'), 'users/victim'), { teamName: 'MAY-02' }));
  });
  it('accountant cannot delete an admin', async () => { await assertFails(deleteDoc(doc(db('acc','acc@x.com'), 'users/adm'))); });
  it('admin may set role and scopes', async () => {
    await assertSucceeds(updateDoc(doc(db('adm','adm@x.com'), 'users/victim'), { role: 'tro_ly_khoi', assignedBlock: 'E03', assignedBlocks: ['E03', 'blkE03'] }));
  });
  it('user may still edit own name (onboarding)', async () => {
    await assertSucceeds(setDoc(doc(db('u','u@x.com'), 'users/u'), { uid: 'u', email: 'u@x.com', fullName: 'U' }, { merge: true }));
  });
  it('v-next: user cannot self-assign Phòng / onboarding status (written only on approval)', async () => {
    await assertFails(setDoc(doc(db('u','u@x.com'), 'users/u'), { teamName: 'T' }, { merge: true }));
    await assertFails(setDoc(doc(db('u','u@x.com'), 'users/u'), { teamId: 'T1' }, { merge: true }));
    await assertFails(setDoc(doc(db('u','u@x.com'), 'users/u'), { vnOnboarding: { status: 'approved' } }, { merge: true }));
  });
  it('user cannot change own email to someone else', async () => {
    await assertFails(updateDoc(doc(db('u','u@x.com'), 'users/u'), { email: 'thienvu1108@gmail.com' }));
  });
});

describe('P1-2 / P1-4 read alignment (UI hides what rules deny)', () => {
  it('gd_khoi cannot read reciprocal_budgets (no reciprocal_budget.view saved)', async () => { await assertFails(getDocs(collection(db('gdk','gdk@x.com'), 'reciprocal_budgets'))); });
  it('tro_ly_khoi cannot read reciprocal_budgets', async () => { await assertFails(getDocs(collection(db('tl','tl@x.com'), 'reciprocal_budgets'))); });
  it('mod cannot read budgets/costs (no home.view in saved perms)', async () => { await assertFails(getDocs(collection(db('md','md@x.com'), 'budgets'))); await assertFails(getDocs(collection(db('md','md@x.com'), 'costs'))); });
  it('tro_ly_khoi can read block_budgets', async () => { await assertSucceeds(getDocs(collection(db('tl','tl@x.com'), 'block_budgets'))); });
});

describe('P0-4 / P1-3 block_budgets scoped to own Khối', () => {
  it('tro_ly_khoi (role tro_ly_khoi → rolePermissions/tro_ly_khoi) registers for own Khối', async () => {
    await assertSucceeds(addDoc(collection(db('tl','tl@x.com'), 'block_budgets'), { blockId: 'blkE02', blockCode: 'E02', month: vnMonth(), amount: 5, projectId: 'p1' }));
  });
  it('tro_ly_khoi listed in blocks.assistantUids registers even if assignedBlock lists only the code', async () => {
    await seed('users/tl2', { role: 'tro_ly_khoi', email: 'tl2@x.com', assignedBlock: 'E03' });
    await assertSucceeds(addDoc(collection(db('tl2','tl2@x.com'), 'block_budgets'), { blockId: 'blkE03', blockCode: 'E03', month: vnMonth(), amount: 5 }));
  });
  it('Khối ĐÃ có GĐ: tro_ly_khoi chỉ có assignedBlock (không có tên trong assistantUids) bị chặn', async () => {
    await seed('users/tlStale', { role: 'tro_ly_khoi', email: 'tls@x.com', assignedBlock: 'E01', assignedBlocks: ['E01', 'blkE01'] });
    await assertFails(addDoc(collection(db('tlStale','tls@x.com'), 'block_budgets'), { blockId: 'blkE01', blockCode: 'E01', month: vnMonth(), amount: 5 }));
    await assertFails(updateDoc(doc(db('tlStale','tls@x.com'), 'block_budgets/bbGdk'), { amount: 3 }));
  });
  it('Khối ĐÃ có GĐ: gd_khoi khác chỉ có assignedBlock bị chặn', async () => {
    await seed('users/gdStale', { role: 'gd_khoi', email: 'gds@x.com', assignedBlock: 'E01' });
    await assertFails(updateDoc(doc(db('gdStale','gds@x.com'), 'block_budgets/bbGdk'), { amount: 3 }));
  });
  it('Khối ĐÃ có GĐ: Trợ lý được duyệt qua đăng ký mới (vnOnboarding approved đúng Khối) vẫn được', async () => {
    await seed('users/tlOb', { role: 'tro_ly_khoi', email: 'tlob@x.com', assignedBlock: 'E01', vnOnboarding: { status: 'approved', position: 'tro_ly_khoi', blockId: 'blkE01' } });
    await assertSucceeds(addDoc(collection(db('tlOb','tlob@x.com'), 'block_budgets'), { blockId: 'blkE01', blockCode: 'E01', month: vnMonth(), amount: 5 }));
  });
  it('vnOnboarding approved cho Khối KHÁC không cấp quyền', async () => {
    await seed('users/tlOb2', { role: 'tro_ly_khoi', email: 'tlob2@x.com', assignedBlock: 'E01', vnOnboarding: { status: 'approved', position: 'tro_ly_khoi', blockId: 'blkE03' } });
    await assertFails(addDoc(collection(db('tlOb2','tlob2@x.com'), 'block_budgets'), { blockId: 'blkE01', blockCode: 'E01', month: vnMonth(), amount: 5 }));
  });
  it('GĐ Khối qua UID cũ (migratedFromUid = directorUid) vẫn được', async () => {
    await seed('users/gdkNew', { role: 'gd_khoi', email: 'gdk@x.com', migratedFromUid: 'gdk' });
    await assertSucceeds(updateDoc(doc(db('gdkNew','gdk@x.com'), 'block_budgets/bbGdk'), { amount: 4 }));
  });
  it('tro_ly_khoi edits own Khối budget', async () => { await assertSucceeds(updateDoc(doc(db('tl','tl@x.com'), 'block_budgets/bbTl'), { amount: 9 })); });
  it('tro_ly_khoi cannot delete block budget (no block_budget.delete)', async () => { await assertFails(deleteDoc(doc(db('tl','tl@x.com'), 'block_budgets/bbTl'))); });
  it('gd_khoi can edit own Khối budget (directorUid / code match)', async () => { await assertSucceeds(updateDoc(doc(db('gdk','gdk@x.com'), 'block_budgets/bbGdk'), { amount: 7 })); });
  it('gd_khoi cannot edit block budget of ANOTHER block', async () => { await assertFails(updateDoc(doc(db('gdk','gdk@x.com'), 'block_budgets/bb1'), { amount: 999 })); });
  it('gd_khoi cannot create block budget for ANOTHER block', async () => { await assertFails(addDoc(collection(db('gdk','gdk@x.com'), 'block_budgets'), { blockId: 'OTHER', month: vnMonth(), amount: 5 })); });
  it('gd_khoi cannot create with own blockId but foreign blockCode', async () => { await assertFails(addDoc(collection(db('gdk','gdk@x.com'), 'block_budgets'), { blockId: 'blkE01', blockCode: 'E99', month: vnMonth(), amount: 5 })); });
  it('gd_khoi cannot move a record to another block', async () => { await assertFails(updateDoc(doc(db('gdk','gdk@x.com'), 'block_budgets/bbGdk'), { blockId: 'OTHER' })); });
  it('user with assignedBlock (role user) cannot register', async () => { await assertFails(addDoc(collection(db('ub','ub@x.com'), 'block_budgets'), { blockId: 'blkE03', blockCode: 'E03', month: vnMonth(), amount: 5 })); });
  it('assistant (Trợ lý BGĐ) cannot register', async () => { await assertFails(addDoc(collection(db('asst','asst@x.com'), 'block_budgets'), { blockId: 'blkE01', month: vnMonth(), amount: 5 })); });
  it('non-admin cannot register a closed (past) month', async () => {
    await assertFails(addDoc(collection(db('tl','tl@x.com'), 'block_budgets'), { blockId: 'blkE02', blockCode: 'E02', month: '2020-01', amount: 5 }));
  });
  it('admin may create for any block / month', async () => { await assertSucceeds(addDoc(collection(db('adm','adm@x.com'), 'block_budgets'), { blockId: 'OTHER', month: '2020-01', amount: 5 })); });
  it('real arrayUnion editHistory update passes rules', async () => {
    await assertSucceeds(updateDoc(doc(db('tl','tl@x.com'), 'block_budgets/bbTl'), { amount: 11, editHistory: arrayUnion({ id: 'h1', action: 'UPDATE' }) }));
  });
});

describe('P1-6 Ban KD leader', () => {
  beforeEach(async () => {
    await seed('ban_kd/b1', { name: 'BAN 1', leaderEmail: 'u@x.com', memberUids: [] });
    await seed('ban_kd/b2', { name: 'BAN 2', leaderEmail: 'other@x.com', memberUids: [] });
  });
  it('leader (role user) can update memberUids of own Ban', async () => { await assertSucceeds(updateDoc(doc(db('u','u@x.com'), 'ban_kd/b1'), { memberUids: ['victim'] })); });
  it('leader cannot rename / re-assign leader of own Ban', async () => { await assertFails(updateDoc(doc(db('u','u@x.com'), 'ban_kd/b1'), { leaderEmail: 'v@x.com' })); });
  it('leader cannot edit another Ban', async () => { await assertFails(updateDoc(doc(db('u','u@x.com'), 'ban_kd/b2'), { memberUids: ['victim'] })); });
  it('admin adds member atomically (users + ban_kd in one batch)', async () => {
    const d = db('adm','adm@x.com');
    const b = writeBatch(d);
    b.update(doc(d, 'users/victim'), { assignedBanKd: 'b1', assignedBanKds: ['b1'] });
    b.update(doc(d, 'ban_kd/b1'), { memberUids: ['victim'] });
    await assertSucceeds(b.commit());
  });
});

describe('P1-7 teams / auditLogs / notifications', () => {
  it('role user cannot create teams', async () => { await assertFails(setDoc(doc(db('u','u@x.com'), 'teams/t1'), { name: 'x' })); });
  it('role user cannot update teams', async () => { await seed('teams/t0', { name: 'x', blockId: 'blkE01' }); await assertFails(updateDoc(doc(db('u','u@x.com'), 'teams/t0'), { name: 'y' })); });
  it('gd_khoi can create a team in own Khối but not another', async () => {
    await assertSucceeds(setDoc(doc(db('gdk','gdk@x.com'), 'teams/t2'), { name: 'P1', blockId: 'blkE01', blockCode: 'E01' }));
    await assertFails(setDoc(doc(db('gdk','gdk@x.com'), 'teams/t3'), { name: 'P2', blockId: 'OTHER', blockCode: 'E99' }));
  });
  it('accountant can create teams', async () => { await assertSucceeds(setDoc(doc(db('acc','acc@x.com'), 'teams/t4'), { name: 'x' })); });
  it('gd_khoi cannot change block director/assistants', async () => {
    await assertFails(updateDoc(doc(db('gdk','gdk@x.com'), 'blocks/blkE01'), { name: 'A.E01', blockCode: 'E01', assistantUids: ['u'] }));
    await assertSucceeds(updateDoc(doc(db('gdk','gdk@x.com'), 'blocks/blkE01'), { name: 'A.E01 mới', blockCode: 'E01' }));
  });
  it('role user cannot tamper auditLogs (update)', async () => { await seed('auditLogs/a1', { action: 'X', userId: 'u' }); await assertFails(updateDoc(doc(db('u','u@x.com'), 'auditLogs/a1'), { action: 'FAKE' })); });
  it('signed-in user may create own audit log only', async () => {
    await assertSucceeds(addDoc(collection(db('u','u@x.com'), 'auditLogs'), { action: 'CREATE', collection: 'x', docId: '1', data: {}, userId: 'u', userEmail: 'u@x.com' }));
    await assertFails(addDoc(collection(db('u','u@x.com'), 'auditLogs'), { action: 'CREATE', collection: 'x', docId: '1', data: {}, userId: 'adm', userEmail: 'adm@x.com' }));
  });
  it('notification: user may only add own email to readBy', async () => {
    await seed('teamNotifications/n1', { title: 't', readBy: ['a@x.com'] });
    await assertSucceeds(updateDoc(doc(db('u','u@x.com'), 'teamNotifications/n1'), { readBy: arrayUnion('u@x.com') }));
    await assertFails(updateDoc(doc(db('u','u@x.com'), 'teamNotifications/n1'), { title: 'hacked' }));
    await assertFails(updateDoc(doc(db('u','u@x.com'), 'teamNotifications/n1'), { readBy: [] }));
  });
  it('notification: legacy malformed readBy map can be healed into a list', async () => {
    await seed('teamNotifications/n2', { title: 't', readBy: { _type: 'arrayUnion', value: ['a@x.com'] } });
    await assertSucceeds(updateDoc(doc(db('u','u@x.com'), 'teamNotifications/n2'), { readBy: ['a@x.com', 'u@x.com'] }));
  });
  it('role user cannot create notifications', async () => { await assertFails(addDoc(collection(db('u','u@x.com'), 'teamNotifications'), { title: 'spam' })); });
});

describe('extra scope checks (Khối prefix / mod non-sensitive edits)', () => {
  it('gd_khoi can delete a cost of a team in own Khối, not of another Khối', async () => {
    await seed('teams/tE01', { name: 'MAY01-A', blockId: 'blkE01', blockCode: 'E01' });
    await seed('teams/tE99', { name: 'MAY99-A', blockId: 'OTHER', blockCode: 'E99' });
    await seed('costs/c1', { teamId: 'tE01', amount: 1 });
    await seed('costs/c2', { teamId: 'tE99', amount: 1 });
    await assertSucceeds(deleteDoc(doc(db('gdk','gdk@x.com'), 'costs/c1')));
    await assertFails(deleteDoc(doc(db('gdk','gdk@x.com'), 'costs/c2')));
  });
  it('mod cannot change team / role / name of a plain user (only Admin moves users between Phòng)', async () => {
    await assertFails(updateDoc(doc(db('md','md@x.com'), 'users/victim'), { teamName: 'MAY-02' }));
    await assertFails(updateDoc(doc(db('md','md@x.com'), 'users/victim'), { fullName: 'Tên mới' }));
    await assertFails(updateDoc(doc(db('md','md@x.com'), 'users/victim'), { role: 'gdkd' }));
  });
  it('Ban leader (role user) can add a member by email to memberUids', async () => {
    await seed('ban_kd/b9', { name: 'Ban 9', leaderEmail: 'u@x.com', memberUids: ['victim'] });
    await assertSucceeds(updateDoc(doc(db('u','u@x.com'), 'ban_kd/b9'), { memberUids: ['victim', 'new@x.com'] }));
  });
});
