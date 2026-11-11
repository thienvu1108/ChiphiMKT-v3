/**
 * Role "Trưởng ban KD" (truong_ban_kd) + role-locked menus (GĐ Khối / Trợ lý Khối).
 * Rules side: own-Ban-only reads/updates, no user writes / self-escalation, PR #1 linking
 * still works for a pre-provisioned Trưởng ban KD, legacy leaders (role 'user') unchanged.
 * Run via: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;

const as = (uid: string, email: string, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const seed = (path: string, data: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path), data); });

// tb1 = Trưởng ban KD of BAN 1 by uid; tb2 = Trưởng ban KD of BAN 2 by email only (not logged in when assigned)
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-chiphi-truongban', firestore: { rules: RULES, host: EMU_HOST, port: Number(EMU_PORT) } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed('users/adm', { uid: 'adm', role: 'admin', email: 'adm@x.com' });
  await seed('users/tb1', { uid: 'tb1', role: 'truong_ban_kd', email: 'tb1@x.com', assignedBanKd: 'b1', assignedBanKds: ['b1'] });
  await seed('users/tb2', { uid: 'tb2', role: 'truong_ban_kd', email: 'tb2@x.com', assignedBanKd: 'b2', assignedBanKds: ['b2'] });
  await seed('users/legacy', { uid: 'legacy', role: 'user', email: 'legacy@x.com' });
  await seed('users/plain', { uid: 'plain', role: 'user', email: 'plain@x.com', teamName: 'MAY-01' });
  await seed('users/gdk', { uid: 'gdk', role: 'gd_khoi', email: 'gdk@x.com', assignedBlock: 'E01' });
  await seed('ban_kd/b1', { name: 'BAN 1', code: 'B1', leaderUid: 'tb1', leaderEmail: 'tb1@x.com', memberUids: [] });
  await seed('ban_kd/b2', { name: 'BAN 2', code: 'B2', leaderUid: '', leaderEmail: 'tb2@x.com', memberUids: ['m1'] });
  await seed('ban_kd/b3', { name: 'BAN 3', code: 'B3', leaderEmail: 'legacy@x.com', memberUids: [] });
  await seed('block_budgets/bb1', { blockId: 'blk', projectId: 'p1', month: '2026-10', amount: 1 });
  await seed('acceptances/a1', { projectId: 'p1', month: '2026-10' });
});

describe('truong_ban_kd — reads only own Ban', () => {
  it('can get own Ban (by leaderUid and by leaderEmail)', async () => {
    await assertSucceeds(getDoc(doc(as('tb1', 'tb1@x.com'), 'ban_kd/b1')));
    await assertSucceeds(getDoc(doc(as('tb2', 'tb2@x.com'), 'ban_kd/b2')));
  });
  it('cannot get another Ban', async () => {
    await assertFails(getDoc(doc(as('tb1', 'tb1@x.com'), 'ban_kd/b2')));
    await assertFails(getDoc(doc(as('tb2', 'tb2@x.com'), 'ban_kd/b3')));
  });
  it('cannot list the whole ban_kd collection', async () => {
    await assertFails(getDocs(collection(as('tb1', 'tb1@x.com'), 'ban_kd')));
  });
  it('can list with the leader-scoped queries the app uses', async () => {
    const d1 = as('tb1', 'tb1@x.com');
    await assertSucceeds(getDocs(query(collection(d1, 'ban_kd'), where('leaderUid', '==', 'tb1'))));
    await assertSucceeds(getDocs(query(collection(d1, 'ban_kd'), where('leaderId', '==', 'tb1'))));
    await assertSucceeds(getDocs(query(collection(d1, 'ban_kd'), where('leaderEmail', '==', 'tb1@x.com'))));
    const d2 = as('tb2', 'tb2@x.com');
    await assertSucceeds(getDocs(query(collection(d2, 'ban_kd'), where('leaderEmail', '==', 'tb2@x.com'))));
  });
  it('cannot query someone else’s Ban by their email / uid', async () => {
    const d1 = as('tb1', 'tb1@x.com');
    await assertFails(getDocs(query(collection(d1, 'ban_kd'), where('leaderEmail', '==', 'tb2@x.com'))));
    await assertFails(getDocs(query(collection(d1, 'ban_kd'), where('leaderUid', '==', 'tb2'))));
  });
  it('email leadership needs a verified email', async () => {
    await assertFails(getDoc(doc(as('tb2', 'tb2@x.com', false), 'ban_kd/b2')));
  });
  it('may read users (member picker) and Ban data via default perms', async () => {
    const d = as('tb1', 'tb1@x.com');
    await assertSucceeds(getDoc(doc(d, 'users/plain')));
    await assertSucceeds(getDocs(collection(d, 'block_budgets')));
    // Nghiệm thu: Trưởng ban KD chỉ đọc dự án thuộc Ban mình (xem nt-read-scope.rules.test.ts) → không list toàn bộ.
    await assertFails(getDocs(collection(d, 'acceptances')));
  });
  it('gets nothing from Khối-only collections by default', async () => {
    const d = as('tb1', 'tb1@x.com');
    await assertFails(getDocs(collection(d, 'reciprocal_budgets')));
    await assertFails(getDocs(collection(d, 'budgets')));
    await assertFails(getDocs(collection(d, 'auditLogs')));
  });
});

describe('truong_ban_kd — manages members of own Ban only', () => {
  it('can update memberUids of own Ban', async () => {
    await assertSucceeds(updateDoc(doc(as('tb1', 'tb1@x.com'), 'ban_kd/b1'), { memberUids: ['plain'], updatedAt: new Date() }));
    await assertSucceeds(updateDoc(doc(as('tb2', 'tb2@x.com'), 'ban_kd/b2'), { memberUids: ['m1', 'new@x.com'] }));
  });
  it('cannot change leader / name of own Ban', async () => {
    const d = as('tb1', 'tb1@x.com');
    await assertFails(updateDoc(doc(d, 'ban_kd/b1'), { leaderEmail: 'other@x.com' }));
    await assertFails(updateDoc(doc(d, 'ban_kd/b1'), { leaderUid: 'plain' }));
    await assertFails(updateDoc(doc(d, 'ban_kd/b1'), { name: 'Renamed' }));
  });
  it('cannot touch another Ban', async () => {
    await assertFails(updateDoc(doc(as('tb1', 'tb1@x.com'), 'ban_kd/b2'), { memberUids: ['plain'] }));
    await assertFails(updateDoc(doc(as('tb1', 'tb1@x.com'), 'ban_kd/b3'), { memberUids: ['plain'] }));
  });
  it('cannot create / delete Ban KD docs', async () => {
    await assertFails(setDoc(doc(as('tb1', 'tb1@x.com'), 'ban_kd/new'), { name: 'X', leaderUid: 'tb1' }));
  });
});

describe('truong_ban_kd — no role/scope changes, no self-escalation', () => {
  it('cannot self-escalate role', async () => {
    await assertFails(updateDoc(doc(as('tb1', 'tb1@x.com'), 'users/tb1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(as('tb1', 'tb1@x.com'), 'users/tb1'), { role: 'gd_khoi' }));
  });
  it('cannot change own Ban scope', async () => {
    await assertFails(updateDoc(doc(as('tb1', 'tb1@x.com'), 'users/tb1'), { assignedBanKd: 'b2', assignedBanKds: ['b2'] }));
  });
  it('cannot change other users’ role / scope / profile', async () => {
    const d = as('tb1', 'tb1@x.com');
    await assertFails(updateDoc(doc(d, 'users/plain'), { role: 'truong_ban_kd' }));
    await assertFails(updateDoc(doc(d, 'users/plain'), { assignedBanKds: ['b1'] }));
    await assertFails(updateDoc(doc(d, 'users/plain'), { fullName: 'X' }));
  });
  it('may still edit own non-sensitive profile fields', async () => {
    await assertSucceeds(updateDoc(doc(as('tb1', 'tb1@x.com'), 'users/tb1'), { fullName: 'Trưởng Ban 1' }));
  });
  it('a plain user cannot self-assign truong_ban_kd', async () => {
    await assertFails(updateDoc(doc(as('plain', 'plain@x.com'), 'users/plain'), { role: 'truong_ban_kd' }));
  });
  it('self-create with role truong_ban_kd is denied', async () => {
    await assertFails(setDoc(doc(as('fresh', 'fresh@x.com'), 'users/fresh'), { uid: 'fresh', email: 'fresh@x.com', role: 'truong_ban_kd', assignedProjects: [] }));
  });
});

describe('admin assigns Trưởng ban KD (role + Ban leader in one batch)', () => {
  it('admin: users.role/assignedBanKd + ban_kd leader + clear old Ban leader atomically', async () => {
    const d = as('adm', 'adm@x.com');
    const b = writeBatch(d);
    b.update(doc(d, 'users/plain'), { role: 'truong_ban_kd', assignedBanKd: 'b3', assignedBanKds: ['b3'], updatedAt: new Date() });
    b.update(doc(d, 'ban_kd/b3'), { leaderUid: 'plain', leaderEmail: 'plain@x.com', leaderName: 'Plain', updatedAt: new Date() });
    await assertSucceeds(b.commit());
    // the new Trưởng ban now reads + manages BAN 3; the replaced legacy leader cannot manage it any more
    await assertSucceeds(getDoc(doc(as('plain', 'plain@x.com'), 'ban_kd/b3')));
    await assertSucceeds(updateDoc(doc(as('plain', 'plain@x.com'), 'ban_kd/b3'), { memberUids: ['x'] }));
    await assertFails(updateDoc(doc(as('legacy', 'legacy@x.com'), 'ban_kd/b3'), { memberUids: ['y'] }));
  });
  it('a gd_khoi cannot assign Trưởng ban KD', async () => {
    const d = as('gdk', 'gdk@x.com');
    const b = writeBatch(d);
    b.update(doc(d, 'users/plain'), { role: 'truong_ban_kd', assignedBanKd: 'b3', assignedBanKds: ['b3'] });
    b.update(doc(d, 'ban_kd/b3'), { leaderUid: 'plain', leaderEmail: 'plain@x.com' });
    await assertFails(b.commit());
  });
  it('admin pre-provisions a Trưởng ban KD by email (PR #1) and the first login links it', async () => {
    const EMAIL = 'leader.new@x.com';
    const IDX = 'leader_dot_new_at_x_dot_com';
    const a = as('adm', 'adm@x.com');
    const b = writeBatch(a);
    b.set(doc(a, 'users/ProvTb'), { email: EMAIL, fullName: 'Leader New', displayName: 'Leader New', role: 'truong_ban_kd', teamName: '', assignedProjects: [], assignedBanKd: 'b3', assignedBanKds: ['b3'], provisionedBy: 'adm' });
    b.set(doc(a, `usersByEmail/${IDX}`), { email: EMAIL, oldUid: 'ProvTb', provisionedBy: 'adm' });
    b.update(doc(a, 'ban_kd/b3'), { leaderUid: '', leaderEmail: EMAIL, leaderName: 'Leader New' });
    await assertSucceeds(b.commit());
    // first Google login: users/{authUid} copies role + Ban scope verbatim (migratedSourceOk)
    const n = as('auth-new', EMAIL);
    const lb = writeBatch(n);
    lb.set(doc(n, 'users/auth-new'), {
      email: EMAIL, fullName: 'Leader New', displayName: 'Leader New', role: 'truong_ban_kd', teamName: '', assignedProjects: [],
      assignedBanKd: 'b3', assignedBanKds: ['b3'], provisionedBy: 'adm',
      uid: 'auth-new', migratedFromUid: 'ProvTb', emailIndexId: IDX,
    });
    lb.update(doc(n, 'users/ProvTb'), { linkedToUid: 'auth-new', linkedAt: new Date() });
    await assertSucceeds(lb.commit());
    // linking cannot widen the Ban scope
    await assertFails(setDoc(doc(as('auth-x', EMAIL), 'users/auth-x'), {
      email: EMAIL, role: 'truong_ban_kd', assignedProjects: [], assignedBanKd: 'b1', assignedBanKds: ['b1'],
      uid: 'auth-x', migratedFromUid: 'ProvTb', emailIndexId: IDX,
    }));
    // and the linked account leads BAN 3 by email
    await assertSucceeds(getDocs(query(collection(n, 'ban_kd'), where('leaderEmail', '==', EMAIL))));
    await assertSucceeds(updateDoc(doc(n, 'ban_kd/b3'), { memberUids: ['m'] }));
  });
});

describe('unchanged behaviour for other roles', () => {
  it('legacy leader (role user) still reads all Bans and manages own Ban members', async () => {
    const d = as('legacy', 'legacy@x.com');
    await assertSucceeds(getDocs(collection(d, 'ban_kd')));
    await assertSucceeds(updateDoc(doc(d, 'ban_kd/b3'), { memberUids: ['plain'] }));
    await assertFails(updateDoc(doc(d, 'ban_kd/b1'), { memberUids: ['plain'] }));
  });
  it('gd_khoi / plain users still list ban_kd', async () => {
    await assertSucceeds(getDocs(collection(as('gdk', 'gdk@x.com'), 'ban_kd')));
    await assertSucceeds(getDocs(collection(as('plain', 'plain@x.com'), 'ban_kd')));
  });
  it('a plain user still cannot list users', async () => {
    await assertFails(getDocs(collection(as('plain', 'plain@x.com'), 'users')));
  });
});
