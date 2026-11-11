/**
 * Rehearsal of scripts/merge-duplicate-users.mjs against the Firestore emulator
 * (synthetic data shaped like the real duplicates). Run via: npm run test:firestore-rules
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT = 'demo-chiphi-merge';
const EMU = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [H, P] = EMU.split(':');
let env: RulesTestEnvironment;

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // remap pair (old project UID copied into new UID), old doc still Khối director
    await setDoc(doc(db, 'users', 'OLD_A'), { email: 'a@example.com', role: 'gd_khoi', assignedBlock: 'E29', teamName: 'T', createdAt: ts('2026-07-21T01:55:41Z') });
    await setDoc(doc(db, 'users', 'NEW_A'), { uid: 'NEW_A', email: 'a@example.com', role: 'gd_khoi', assignedBlock: 'E29', teamName: 'T', migratedFromUid: 'OLD_A', createdAt: ts('2026-07-21T01:55:41Z') });
    await setDoc(doc(db, 'blocks', 'B1'), { blockCode: 'E29', directorUid: 'OLD_A', assistantUids: ['X', 'OLD_A', 'NEW_A'], createdBy: 'OLD_A' });
    await setDoc(doc(db, 'budgets', 'BU1'), { createdBy: 'OLD_A', subBudgets: [{ userId: 'OLD_A', amount: 1 }, { userId: 'Z', amount: 2 }] });
    await setDoc(doc(db, 'auditLogs', 'L1'), { userId: 'OLD_A', action: 'x' });
    await setDoc(doc(db, 'usersByEmail', 'a_at_example_dot_com'), { email: 'a@example.com', oldUid: 'OLD_A' });
    // admin-added random-id doc (gdkd) + self-created UID doc (user); person never signed in to v2
    await setDoc(doc(db, 'users', 'RAND_B'), { email: 'b@example.com', role: 'gdkd', teamName: 'MAY38', fullName: 'B', createdAt: ts('2026-10-05T02:10:56Z') });
    await setDoc(doc(db, 'users', 'OLDUID_B'), { email: 'B@example.com', role: 'user', teamName: '', assignedProjects: [], createdAt: ts('2026-08-20T08:58:13Z') });
    await setDoc(doc(db, 'usersByEmail', 'b_at_example_dot_com'), { email: 'b@example.com', oldUid: 'OLDUID_B' });
    // not a duplicate
    await setDoc(doc(db, 'users', 'C'), { email: 'c@example.com', role: 'user' });
  });
}

function run(extra: string[], outDir: string) {
  return execFileSync('node', [resolve('scripts/merge-duplicate-users.mjs'), `--emulator=${EMU}`, `--project=${PROJECT}`, '--database=(default)', `--out=${outDir}`, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const get = async (path: string) => {
  let snap: any;
  await env.withSecurityRulesDisabled(async (ctx) => { snap = await getDoc(doc(ctx.firestore(), path)); });
  return snap.exists() ? snap.data() : null;
};

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: H, port: Number(P), rules: 'rules_version = "2"; service cloud.firestore { match /databases/{d}/documents { match /{x=**} { allow read, write: if false; } } }' } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });

describe('merge-duplicate-users.mjs', () => {
  it('dry-run (default) writes a plan and changes nothing', async () => {
    const out = mkdtempSync(join(tmpdir(), 'merge-dry-'));
    const fixture = join(out, 'auth.json');
    writeFileSync(fixture, JSON.stringify({ 'a@example.com': 'NEW_A' }));
    run([`--auth-fixture=${fixture}`], out);
    const plan = JSON.parse(readFileSync(join(out, 'plan.json'), 'utf8'));
    expect(plan.mode).toBe('dry-run');
    expect(plan.groups.map((g: any) => g.email)).toEqual(['a@example.com', 'b@example.com']);
    const a = plan.groups[0];
    expect(a.keepId).toBe('NEW_A');
    expect(a.needsHumanDecision).toBe(false);
    expect(a.refsToRepoint.map((r: any) => `${r.collection}.${r.field}`).sort()).toEqual(
      ['blocks.assistantUids[1]', 'blocks.directorUid', 'budgets.createdBy', 'budgets.subBudgets[0].userId', 'usersByEmail.oldUid'].sort(),
    );
    const b = plan.groups[1];
    expect(b.keepId).toBe('RAND_B');
    expect(b.needsHumanDecision).toBe(true);
    expect(b.conflicts[0].field).toBe('role');
    expect(await get('users/OLD_A')).not.toBeNull();
    expect((await get('blocks/B1'))!.directorUid).toBe('OLD_A');
    expect(readdirSync(out).some((f) => f.startsWith('backup-'))).toBe(false);
  });

  it('--apply refuses while a group still needs a human decision', async () => {
    const out = mkdtempSync(join(tmpdir(), 'merge-block-'));
    const fixture = join(out, 'auth.json');
    writeFileSync(fixture, JSON.stringify({ 'a@example.com': 'NEW_A' }));
    expect(() => run([`--auth-fixture=${fixture}`, '--apply'], out)).toThrow(/human decision/);
    expect(await get('users/OLD_A')).not.toBeNull();
  });

  it('--apply with decisions backs up, merges, repoints access/ownership refs, archives and deletes', async () => {
    const out = mkdtempSync(join(tmpdir(), 'merge-apply-'));
    const fixture = join(out, 'auth.json');
    const decisions = join(out, 'decisions.json');
    writeFileSync(fixture, JSON.stringify({ 'a@example.com': 'NEW_A' }));
    writeFileSync(decisions, JSON.stringify({ 'b@example.com': { keepId: 'RAND_B', role: 'gdkd' } }));
    run([`--auth-fixture=${fixture}`, `--decisions=${decisions}`, '--apply'], out);

    const backupFile = readdirSync(out).find((f) => f.startsWith('backup-'))!;
    const backup = JSON.parse(readFileSync(join(out, backupFile), 'utf8'));
    expect(Object.keys(backup)).toEqual(expect.arrayContaining(['users/OLD_A', 'users/NEW_A', 'blocks/B1', 'budgets/BU1', 'users/RAND_B', 'users/OLDUID_B']));

    const keepA = await get('users/NEW_A');
    expect(keepA!.role).toBe('gd_khoi');
    expect(keepA!.mergedFrom).toEqual(['OLD_A']);
    expect(await get('users/OLD_A')).toBeNull();
    expect((await get('users_merged_archive/OLD_A'))!.mergedInto).toBe('NEW_A');
    const b1 = await get('blocks/B1');
    expect(b1!.directorUid).toBe('NEW_A');
    expect(b1!.assistantUids).toEqual(['X', 'NEW_A']); // repointed + de-duplicated
    expect(b1!.createdBy).toBe('OLD_A'); // history untouched
    const bu1 = await get('budgets/BU1');
    expect(bu1!.createdBy).toBe('NEW_A');
    expect(bu1!.subBudgets).toEqual([{ userId: 'NEW_A', amount: 1 }, { userId: 'Z', amount: 2 }]);
    expect((await get('auditLogs/L1'))!.userId).toBe('OLD_A');
    expect((await get('usersByEmail/a_at_example_dot_com'))!.oldUid).toBe('NEW_A');

    const keepB = await get('users/RAND_B');
    expect(keepB!.role).toBe('gdkd');
    expect(keepB!.createdAt.toDate().toISOString()).toBe('2026-08-20T08:58:13.000Z'); // earliest kept
    expect(await get('users/OLDUID_B')).toBeNull();
    expect((await get('usersByEmail/b_at_example_dot_com'))!.oldUid).toBe('RAND_B'); // first login links RAND_B
    expect(await get('users/C')).not.toBeNull();
  });
});
