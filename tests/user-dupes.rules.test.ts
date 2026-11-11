/**
 * Duplicate user accounts (same email, two users docs): link-instead-of-create on first login,
 * source marking, admin provisioning uniqueness, usersByEmail self-claim.
 * Run via: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, deleteDoc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;

const EMAIL = 'pre.provisioned@example.com';
const IDX = 'pre_dot_provisioned_at_example_dot_com';
const SRC = 'RandomAdminDocId01'; // admin "Thêm người dùng" doc (non-UID id)
const NEW = 'new-auth-uid-1';
const ADMIN = 'admin-uid';

const as = (uid: string, email: string, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const seed = (fn: (db: any) => Promise<void>) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-chiphi-dupes',
    firestore: { rules: RULES, host: EMU_HOST, port: Number(EMU_PORT) },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'users', ADMIN), { uid: ADMIN, email: 'admin@example.com', role: 'admin' });
    await setDoc(doc(db, 'users', SRC), { email: EMAIL, fullName: 'Pre User', role: 'gdkd', teamName: 'MAY38', assignedProjects: [] });
    await setDoc(doc(db, 'usersByEmail', IDX), { email: EMAIL, oldUid: SRC });
  });
});

const linked = (extra: Record<string, unknown> = {}) => ({
  email: EMAIL, fullName: 'Pre User', role: 'gdkd', teamName: 'MAY38', assignedProjects: [],
  uid: NEW, displayName: 'Pre User', migratedFromUid: SRC, emailIndexId: IDX, ...extra,
});

describe('first login links a pre-provisioned (non-UID) profile instead of creating a duplicate', () => {
  it('creates users/{uid} copying the admin-assigned role verbatim', async () => {
    await assertSucceeds(setDoc(doc(as(NEW, EMAIL), 'users', NEW), linked()));
  });

  it('denies a different role than the source (no self-escalation)', async () => {
    await assertFails(setDoc(doc(as(NEW, EMAIL), 'users', NEW), linked({ role: 'admin' })));
  });

  it('denies smuggling extra privileged keys (permissions / isAdmin / managedBlocks)', async () => {
    const db = as(NEW, EMAIL);
    await assertFails(setDoc(doc(db, 'users', NEW), linked({ permissions: ['admin.users.view'] })));
    await assertFails(setDoc(doc(db, 'users', NEW), linked({ isAdmin: true })));
    await assertFails(setDoc(doc(db, 'users', NEW), linked({ managedBlocks: ['E01'] })));
  });

  it('denies linking when the email is unverified', async () => {
    await assertFails(setDoc(doc(as(NEW, EMAIL, false), 'users', NEW), linked()));
  });

  it('denies claiming a source already linked to another account', async () => {
    await seed(async (db) => { await updateDoc(doc(db, 'users', SRC), { linkedToUid: 'someone-else' }); });
    await assertFails(setDoc(doc(as(NEW, EMAIL), 'users', NEW), linked()));
  });

  it('creates the profile and marks the source linked atomically in one batch', async () => {
    const db = as(NEW, EMAIL);
    const b = writeBatch(db);
    b.set(doc(db, 'users', NEW), linked());
    b.update(doc(db, 'users', SRC), { linkedToUid: NEW, linkedAt: new Date() });
    await assertSucceeds(b.commit());
  });
});

describe('marking the source doc as linked', () => {
  beforeEach(async () => {
    await seed(async (db) => { await setDoc(doc(db, 'users', NEW), linked()); });
  });

  it('lets the owner of the email set linkedToUid/linkedAt on the source it linked from', async () => {
    await assertSucceeds(updateDoc(doc(as(NEW, EMAIL), 'users', SRC), { linkedToUid: NEW, linkedAt: new Date() }));
  });

  it('denies changing role or anything else on the source', async () => {
    await assertFails(updateDoc(doc(as(NEW, EMAIL), 'users', SRC), { linkedToUid: NEW, role: 'admin' }));
    await assertFails(updateDoc(doc(as(NEW, EMAIL), 'users', SRC), { fullName: 'x' }));
  });

  it('denies pointing linkedToUid at someone else', async () => {
    await assertFails(updateDoc(doc(as(NEW, EMAIL), 'users', SRC), { linkedToUid: 'other' }));
  });

  it('denies marking a doc that users/{uid}.migratedFromUid does not point to', async () => {
    await seed(async (db) => { await setDoc(doc(db, 'users', 'OtherDocSameEmail'), { email: EMAIL, role: 'user' }); });
    await assertFails(updateDoc(doc(as(NEW, EMAIL), 'users', 'OtherDocSameEmail'), { linkedToUid: NEW }));
  });

  it('denies another account (different email)', async () => {
    await seed(async (db) => { await setDoc(doc(db, 'users', 'intruder'), { uid: 'intruder', email: 'i@example.com', role: 'user', migratedFromUid: SRC }); });
    await assertFails(updateDoc(doc(as('intruder', 'i@example.com'), 'users', SRC), { linkedToUid: 'intruder' }));
  });

  it('does not let a user set linkedToUid on their own profile (privileged key)', async () => {
    await assertFails(updateDoc(doc(as(NEW, EMAIL), 'users', NEW), { linkedToUid: 'x' }));
  });
});

describe('admin provisioning cannot create a second users doc for an existing email', () => {
  const NEW_EMAIL = 'brand.new@example.com';
  const NEW_IDX = 'brand_dot_new_at_example_dot_com';

  it('allows users/{randomId} + usersByEmail claim in one batch', async () => {
    const db = as(ADMIN, 'admin@example.com');
    const b = writeBatch(db);
    b.set(doc(db, 'users', 'ProvDoc1'), { email: NEW_EMAIL, role: 'gdkd', assignedProjects: [] });
    b.set(doc(db, 'usersByEmail', NEW_IDX), { email: NEW_EMAIL, oldUid: 'ProvDoc1' });
    await assertSucceeds(b.commit());
  });

  it('denies creating another profile without claiming usersByEmail', async () => {
    const db = as(ADMIN, 'admin@example.com');
    await assertFails(setDoc(doc(db, 'users', 'ProvDoc2'), { email: NEW_EMAIL, role: 'user' }));
  });

  it('denies when the email already maps to an existing profile', async () => {
    const db = as(ADMIN, 'admin@example.com');
    const b = writeBatch(db);
    b.set(doc(db, 'users', 'DupDoc'), { email: EMAIL, role: 'gdkd' });
    b.set(doc(db, 'usersByEmail', IDX), { email: EMAIL, oldUid: 'DupDoc' });
    await assertFails(b.commit());
  });

  it('denies a mixed-case variant of an existing email', async () => {
    const db = as(ADMIN, 'admin@example.com');
    const b = writeBatch(db);
    b.set(doc(db, 'users', 'DupDoc'), { email: 'Pre.Provisioned@Example.com', role: 'gdkd' });
    b.set(doc(db, 'usersByEmail', IDX), { email: EMAIL, oldUid: 'DupDoc' });
    await assertFails(b.commit());
  });

  it('allows re-provisioning when the indexed profile no longer exists', async () => {
    await seed(async (db) => { await deleteDoc(doc(db, 'users', SRC)); });
    const db = as(ADMIN, 'admin@example.com');
    const b = writeBatch(db);
    b.set(doc(db, 'users', 'Replacement'), { email: EMAIL, role: 'gdkd' });
    b.set(doc(db, 'usersByEmail', IDX), { email: EMAIL, oldUid: 'Replacement' });
    await assertSucceeds(b.commit());
  });

  it('denies a non-admin provisioning someone else', async () => {
    await seed(async (db) => { await setDoc(doc(db, 'users', 'plain'), { uid: 'plain', email: 'p@example.com', role: 'user' }); });
    const db = as('plain', 'p@example.com');
    const b = writeBatch(db);
    b.set(doc(db, 'users', 'X1'), { email: NEW_EMAIL, role: 'user' });
    b.set(doc(db, 'usersByEmail', NEW_IDX), { email: NEW_EMAIL, oldUid: 'X1' });
    await assertFails(b.commit());
  });

  it('admin may read usersByEmail entries', async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN, 'admin@example.com'), 'usersByEmail', IDX)));
  });
});

describe('usersByEmail self-claim on first sign-in (no entry yet)', () => {
  const E = 'fresh@example.com';
  const I = 'fresh_at_example_dot_com';

  it('lets a verified user claim their own email for their own uid', async () => {
    await assertSucceeds(setDoc(doc(as('fresh-uid', E), 'usersByEmail', I), { email: E, oldUid: 'fresh-uid', claimedAt: new Date() }));
  });

  it('denies claiming for another uid, another email, or unverified email', async () => {
    await assertFails(setDoc(doc(as('fresh-uid', E), 'usersByEmail', I), { email: E, oldUid: 'other' }));
    await assertFails(setDoc(doc(as('fresh-uid', E), 'usersByEmail', 'other_at_example_dot_com'), { email: 'other@example.com', oldUid: 'fresh-uid' }));
    await assertFails(setDoc(doc(as('fresh-uid', E, false), 'usersByEmail', I), { email: E, oldUid: 'fresh-uid' }));
  });

  it('denies re-pointing an existing entry (admin-only)', async () => {
    await assertFails(setDoc(doc(as(NEW, EMAIL), 'usersByEmail', IDX), { email: EMAIL, oldUid: NEW }));
  });

  it('then blocks admin provisioning a second profile for that email', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', 'fresh-uid'), { uid: 'fresh-uid', email: E, role: 'user' });
      await setDoc(doc(db, 'usersByEmail', I), { email: E, oldUid: 'fresh-uid' });
    });
    const db = as(ADMIN, 'admin@example.com');
    const b = writeBatch(db);
    b.set(doc(db, 'users', 'Dup'), { email: E, role: 'gdkd' });
    b.set(doc(db, 'usersByEmail', I), { email: E, oldUid: 'Dup' });
    await assertFails(b.commit());
  });
});
