/**
 * Firestore security rules unit tests.
 * Run via: npm run test:firestore-rules
 * (starts Firestore emulator then runs Vitest)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  deleteField,
  collection,
  getDocs,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'demo-chiphi-rules';
const OWNER_EMAIL = 'thienvu1108@gmail.com';
const RULES = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

// Emulator address: FIRESTORE_EMULATOR_HOST (set by `firebase emulators:exec`) or 127.0.0.1:8080.
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

let testEnv: RulesTestEnvironment;

async function seedUser(
  uid: string,
  data: Record<string, unknown>,
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', uid), data);
  });
}

async function seedRolePerms(role: string, permissions: string[]) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'rolePermissions', role), { role, permissions });
  });
}

async function seedCost(id: string, data: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'costs', id), {
      amount: 100,
      projectId: 'p1',
      createdBy: 'seed',
      ...data,
    });
  });
}

function authedDb(uid: string, email: string, emailVerified = true) {
  return testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: emailVerified,
    })
    .firestore();
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: RULES,
      host: EMU_HOST,
      port: Number(EMU_PORT),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('firestore.rules — unauthenticated', () => {
  it('denies unauthenticated read of costs', async () => {
    await seedCost('c1');
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'costs', 'c1')));
  });

  it('denies unauthenticated create of users doc', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'users', 'anyone'), {
        uid: 'anyone',
        email: 'x@y.com',
        role: 'user',
        assignedProjects: [],
      }),
    );
  });
});

describe('firestore.rules — user self-create (role escalation)', () => {
  it('denies new user creating users/{uid} with role admin', async () => {
    const uid = 'u-escalator';
    const db = authedDb(uid, 'escalator@example.com');
    await assertFails(
      setDoc(doc(db, 'users', uid), {
        uid,
        email: 'escalator@example.com',
        displayName: 'Esc',
        role: 'admin',
        assignedProjects: [],
      }),
    );
  });

  it('allows new user creating users/{uid} with role user and safe defaults', async () => {
    const uid = 'u-normal';
    const db = authedDb(uid, 'normal@example.com');
    await assertSucceeds(
      setDoc(doc(db, 'users', uid), {
        uid,
        email: 'normal@example.com',
        displayName: 'Normal',
        role: 'user',
        assignedProjects: [],
      }),
    );
  });

  it('allows verified app owner creating as super_admin', async () => {
    const uid = 'u-owner';
    const db = authedDb(uid, OWNER_EMAIL, true);
    await assertSucceeds(
      setDoc(doc(db, 'users', uid), {
        uid,
        email: OWNER_EMAIL,
        displayName: 'Owner',
        role: 'super_admin',
        assignedProjects: [],
      }),
    );
  });
});

describe('firestore.rules — costs permission keys', () => {
  it('denies costs read for role user without cost permission (no rolePermissions doc → defaultHasPerm)', async () => {
    await seedUser('u-user', {
      uid: 'u-user',
      email: 'user@example.com',
      role: 'user',
      assignedProjects: [],
    });
    // intentionally no rolePermissions/user doc — fallback defaultHasPerm
    await seedCost('c-deny');
    const db = authedDb('u-user', 'user@example.com');
    await assertFails(getDoc(doc(db, 'costs', 'c-deny')));
  });

  it('allows costs read for role with actual.view via rolePermissions doc', async () => {
    await seedUser('u-mod', {
      uid: 'u-mod',
      email: 'mod@example.com',
      role: 'mod',
      assignedProjects: [],
    });
    await seedRolePerms('mod', ['actual.view', 'home.view']);
    await seedCost('c-ok');
    const db = authedDb('u-mod', 'mod@example.com');
    await assertSucceeds(getDoc(doc(db, 'costs', 'c-ok')));
  });

  it('allows costs read for app owner even without rolePermissions', async () => {
    await seedUser('u-owner2', {
      uid: 'u-owner2',
      email: OWNER_EMAIL,
      role: 'user',
      assignedProjects: [],
    });
    await seedCost('c-owner');
    const db = authedDb('u-owner2', OWNER_EMAIL, true);
    await assertSucceeds(getDoc(doc(db, 'costs', 'c-owner')));
  });

  it('allows costs read via missing rolePermissions fallback for admin defaults', async () => {
    await seedUser('u-admin', {
      uid: 'u-admin',
      email: 'admin@example.com',
      role: 'admin',
      assignedProjects: [],
    });
    // no rolePermissions/admin — defaultHasPerm(admin, actual.view) should be true
    await seedCost('c-admin');
    const db = authedDb('u-admin', 'admin@example.com');
    await assertSucceeds(getDoc(doc(db, 'costs', 'c-admin')));
  });
});

describe('firestore.rules — rolePermissions readable for boot', () => {
  it('allows signed-in user to list rolePermissions', async () => {
    await seedUser('u-boot', {
      uid: 'u-boot',
      email: 'boot@example.com',
      role: 'user',
      assignedProjects: [],
    });
    await seedRolePerms('user', ['process_doiung.view']);
    const db = authedDb('u-boot', 'boot@example.com');
    await assertSucceeds(getDocs(collection(db, 'rolePermissions')));
  });
});

describe('firestore.rules — cross-project UID remap (usersByEmail)', () => {
  const EMAIL = 'migrated@example.com';
  const IDX = 'migrated_at_example_dot_com';
  const OLD = 'old-uid-1';
  const NEW = 'new-uid-1';

  async function seedMigration(oldData: Record<string, unknown> = {}) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'usersByEmail', IDX), { email: EMAIL, oldUid: OLD });
      await setDoc(doc(db, 'users', OLD), {
        uid: OLD,
        email: 'Migrated@Example.com',
        role: 'gd_khoi',
        assignedBlock: 'b1',
        fullName: 'Old Name',
        teamName: 'MAY-01',
        ...oldData,
      });
    });
  }

  it('lets a new uid read its own usersByEmail entry and pre-migration profile', async () => {
    await seedMigration();
    const db = authedDb(NEW, EMAIL);
    await assertSucceeds(getDoc(doc(db, 'usersByEmail', IDX)));
    await assertSucceeds(getDoc(doc(db, 'users', OLD)));
  });

  it('denies reading someone else\'s pre-migration profile', async () => {
    await seedMigration();
    const db = authedDb('intruder', 'intruder@example.com');
    await assertFails(getDoc(doc(db, 'users', OLD)));
  });

  it('allows creating users/{newUid} copying the migrated role/scope', async () => {
    await seedMigration();
    const db = authedDb(NEW, EMAIL);
    await assertSucceeds(
      setDoc(doc(db, 'users', NEW), {
        uid: NEW,
        email: EMAIL,
        role: 'gd_khoi',
        assignedBlock: 'b1',
        fullName: 'Old Name',
        teamName: 'MAY-01',
        migratedFromUid: OLD,
        emailIndexId: IDX,
      }),
    );
  });

  it('allows migrated gd_khoi copied down to user + needsRoleReview (not named in any Khối)', async () => {
    await seedMigration();
    const db = authedDb(NEW, EMAIL);
    await assertSucceeds(
      setDoc(doc(db, 'users', NEW), {
        uid: NEW, email: EMAIL, role: 'user', fullName: 'Old Name', teamName: 'MAY-01',
        needsRoleReview: true, needsRoleReviewReason: 'x', migratedFromUid: OLD, emailIndexId: IDX,
      }),
    );
  });

  it('denies migrated downgrade without needsRoleReview, or keeping the Khối', async () => {
    await seedMigration();
    const db = authedDb(NEW, EMAIL);
    await assertFails(setDoc(doc(db, 'users', NEW), { uid: NEW, email: EMAIL, role: 'user', migratedFromUid: OLD, emailIndexId: IDX }));
    await assertFails(setDoc(doc(db, 'users', NEW), { uid: NEW, email: EMAIL, role: 'user', assignedBlock: 'b1', needsRoleReview: true, migratedFromUid: OLD, emailIndexId: IDX }));
  });

  it('denies downgrade path for a non-Khối source role (e.g. gdkd → user stays verbatim)', async () => {
    await seedMigration({ role: 'gdkd' });
    const db = authedDb(NEW, EMAIL);
    await assertFails(setDoc(doc(db, 'users', NEW), { uid: NEW, email: EMAIL, role: 'user', fullName: 'Old Name', teamName: 'MAY-01', needsRoleReview: true, migratedFromUid: OLD, emailIndexId: IDX }));
  });

  it('denies escalating role during migrated create', async () => {
    await seedMigration();
    const db = authedDb(NEW, EMAIL);
    await assertFails(
      setDoc(doc(db, 'users', NEW), {
        uid: NEW,
        email: EMAIL,
        role: 'super_admin',
        assignedBlock: 'b1',
        migratedFromUid: OLD,
        emailIndexId: IDX,
      }),
    );
  });

  it('allows one-time repair of a stub user profile to the migrated profile', async () => {
    await seedMigration();
    await seedUser(NEW, { uid: NEW, email: EMAIL, role: 'user', assignedProjects: [], fullName: '', teamName: '' });
    const db = authedDb(NEW, EMAIL);
    await assertSucceeds(
      setDoc(
        doc(db, 'users', NEW),
        {
          uid: NEW,
          email: EMAIL,
          role: 'gd_khoi',
          assignedBlock: 'b1',
          fullName: 'Old Name',
          teamName: 'MAY-01',
          migratedFromUid: OLD,
          emailIndexId: IDX,
        },
        { merge: true },
      ),
    );
  });

  it('denies stub repair that escalates beyond the migrated role', async () => {
    await seedMigration();
    await seedUser(NEW, { uid: NEW, email: EMAIL, role: 'user', assignedProjects: [] });
    const db = authedDb(NEW, EMAIL);
    await assertFails(
      setDoc(
        doc(db, 'users', NEW),
        { role: 'admin', assignedBlock: 'b1', migratedFromUid: OLD, emailIndexId: IDX },
        { merge: true },
      ),
    );
  });

  it('denies migration for a different email', async () => {
    await seedMigration();
    const db = authedDb(NEW, 'other@example.com');
    await assertFails(
      setDoc(doc(db, 'users', NEW), {
        uid: NEW,
        email: 'other@example.com',
        role: 'gd_khoi',
        assignedBlock: 'b1',
        migratedFromUid: OLD,
        emailIndexId: IDX,
      }),
    );
  });
});

describe('firestore.rules — GitHub backup token is admin-only', () => {
  const FAKE_TOKEN = 'ghp_fake_token_for_rules_test';

  async function seedGithubBackup(withLegacyToken: boolean) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'settings_private', 'github_backup'), { token: FAKE_TOKEN });
      await setDoc(doc(db, 'settings', 'github_backup'), {
        repoUrl: 'https://github.com/thienvu1108/ChiphiMKT-v2',
        branch: 'main',
        targetFolder: 'backups',
        ...(withLegacyToken ? { token: FAKE_TOKEN } : {}),
      });
    });
  }

  async function seedRoles() {
    await seedUser('u-admin', { uid: 'u-admin', email: 'admin@example.com', role: 'admin' });
    await seedUser('u-super', { uid: 'u-super', email: 'super@example.com', role: 'super_admin' });
    await seedUser('u-acc', { uid: 'u-acc', email: 'acc@example.com', role: 'accountant' });
    await seedUser('u-user', { uid: 'u-user', email: 'user@example.com', role: 'user' });
  }

  it('denies non-admin roles reading settings_private/github_backup', async () => {
    await seedRoles();
    await seedGithubBackup(false);
    for (const [uid, email] of [
      ['u-user', 'user@example.com'],
      ['u-acc', 'acc@example.com'],
    ]) {
      await assertFails(getDoc(doc(authedDb(uid, email), 'settings_private', 'github_backup')));
    }
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'settings_private', 'github_backup')),
    );
  });

  it('allows admin and super_admin to read the token', async () => {
    await seedRoles();
    await seedGithubBackup(false);
    await assertSucceeds(getDoc(doc(authedDb('u-admin', 'admin@example.com'), 'settings_private', 'github_backup')));
    await assertSucceeds(getDoc(doc(authedDb('u-super', 'super@example.com'), 'settings_private', 'github_backup')));
  });

  it('only admin can write settings_private/github_backup', async () => {
    await seedRoles();
    await assertFails(
      setDoc(doc(authedDb('u-acc', 'acc@example.com'), 'settings_private', 'github_backup'), { token: 'x' }),
    );
    await assertFails(
      setDoc(doc(authedDb('u-user', 'user@example.com'), 'settings_private', 'github_backup'), { token: 'x' }),
    );
    await assertSucceeds(
      setDoc(doc(authedDb('u-admin', 'admin@example.com'), 'settings_private', 'github_backup'), { token: 'x' }),
    );
  });

  it('non-admin can read migrated (token-free) public config, but not a legacy doc with token', async () => {
    await seedRoles();
    await seedGithubBackup(false);
    await assertSucceeds(getDoc(doc(authedDb('u-user', 'user@example.com'), 'settings', 'github_backup')));

    await seedGithubBackup(true);
    await assertFails(getDoc(doc(authedDb('u-user', 'user@example.com'), 'settings', 'github_backup')));
    await assertFails(getDoc(doc(authedDb('u-acc', 'acc@example.com'), 'settings', 'github_backup')));
    await assertSucceeds(getDoc(doc(authedDb('u-admin', 'admin@example.com'), 'settings', 'github_backup')));
  });

  it('public config: accountant cannot write; admin cannot add a token but can remove the legacy one', async () => {
    await seedRoles();
    await seedGithubBackup(true);
    await assertFails(
      setDoc(doc(authedDb('u-acc', 'acc@example.com'), 'settings', 'github_backup'), { branch: 'x' }, { merge: true }),
    );
    const adminDb = authedDb('u-admin', 'admin@example.com');
    await assertFails(
      setDoc(doc(adminDb, 'settings', 'github_backup'), { token: 'ghp_new' }, { merge: true }),
    );
    // merge write that keeps the existing legacy token unchanged (e.g. lastSyncResult) is ok
    await assertSucceeds(
      setDoc(doc(adminDb, 'settings', 'github_backup'), { lastSyncAt: 'now' }, { merge: true }),
    );
    // migration: remove the token from the public doc
    await assertSucceeds(
      setDoc(doc(adminDb, 'settings', 'github_backup'), { token: deleteField(), branch: 'main' }, { merge: true }),
    );
    await assertSucceeds(getDoc(doc(authedDb('u-user', 'user@example.com'), 'settings', 'github_backup')));
  });

  it('other settings docs keep previous behaviour (signed-in read, admin/accountant write)', async () => {
    await seedRoles();
    await assertSucceeds(
      setDoc(doc(authedDb('u-acc', 'acc@example.com'), 'settings', 'global'), { budgetStartDay: 14 }),
    );
    await assertSucceeds(getDoc(doc(authedDb('u-user', 'user@example.com'), 'settings', 'global')));
    await assertFails(
      setDoc(doc(authedDb('u-user', 'user@example.com'), 'settings', 'global'), { budgetStartDay: 1 }),
    );
  });
});
