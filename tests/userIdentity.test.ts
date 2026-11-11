import { describe, expect, it } from 'vitest';
import {
  buildLinkedProfile,
  buildUserListRows,
  emailIndexId,
  findDuplicateGroups,
  findUserByEmail,
  normalizeEmail,
  pickCanonicalUser,
  scopeConflicts,
} from '../src/lib/userIdentity';

// Shapes mirror the real duplicate patterns found in chiphi-mkt (anonymized).
const remapPair = [
  { id: 'OLDUID_a', email: 'a@example.com', role: 'gd_khoi', assignedBlock: 'E29', createdAt: '2026-07-21T01:55:41Z', updatedAt: '2026-10-06T02:58:08Z' },
  { id: 'NEWUID_a', uid: 'NEWUID_a', email: 'a@example.com', role: 'gd_khoi', assignedBlock: 'E29', migratedFromUid: 'OLDUID_a', createdAt: '2026-07-21T01:55:41Z', updatedAt: '2026-10-06T02:59:07Z' },
];
const adminAddedPair = [
  { id: 'OLDUID_b', uid: 'OLDUID_b', email: 'B@Example.com ', role: 'user', assignedProjects: [], createdAt: '2026-09-23T09:07:06Z' },
  { id: 'RandomDoc_b', email: 'b@example.com', role: 'gdkd', teamName: 'MAY38', createdAt: '2026-10-05T02:11:37Z' },
];
const single = [{ id: 'U1', uid: 'U1', email: 'c@example.com', role: 'user' }];

describe('email normalization / index id (mirrors firestore.rules emailIndexKey)', () => {
  it('trims + lowercases and maps @ and . like the usersByEmail index', () => {
    expect(normalizeEmail('  Foo.Bar@Gmail.COM ')).toBe('foo.bar@gmail.com');
    expect(emailIndexId('Foo.Bar@Gmail.COM')).toBe('foo_dot_bar_at_gmail_dot_com');
  });
});

describe('pickCanonicalUser', () => {
  it('prefers the doc copied INTO (migratedFromUid points at the other doc)', () => {
    expect(pickCanonicalUser(remapPair).id).toBe('NEWUID_a');
    expect(pickCanonicalUser([...remapPair].reverse()).id).toBe('NEWUID_a');
  });

  it('prefers the target of linkedToUid and never a doc linked away', () => {
    const docs = [
      { id: 'X', email: 'x@e.com', role: 'admin', linkedToUid: 'Y' },
      { id: 'Y', email: 'x@e.com', role: 'user' },
    ];
    expect(pickCanonicalUser(docs).id).toBe('Y');
  });

  it('prefers a known live Auth UID over everything else', () => {
    expect(pickCanonicalUser(adminAddedPair, 'OLDUID_b').id).toBe('OLDUID_b');
  });

  it('without link info, prefers the admin-assigned (higher) role', () => {
    expect(pickCanonicalUser(adminAddedPair).id).toBe('RandomDoc_b');
  });
});

describe('findDuplicateGroups / scopeConflicts', () => {
  it('groups case/whitespace variants and ignores singletons and empty emails', () => {
    const groups = findDuplicateGroups([...remapPair, ...adminAddedPair, ...single, { id: 'E1' }, { id: 'E2', email: '' }]);
    expect(groups.map((g) => g.email).sort()).toEqual(['a@example.com', 'b@example.com']);
  });

  it('flags role conflicts but treats missing arrays as empty', () => {
    expect(scopeConflicts(remapPair)).toEqual([]);
    expect(scopeConflicts(adminAddedPair)).toEqual(['role']);
  });
});

describe('buildUserListRows (Users screen)', () => {
  it('shows one row per email by default, flagged with count and conflicts', () => {
    const rows = buildUserListRows([...remapPair, ...adminAddedPair, ...single]);
    expect(rows.map((r) => r.id)).toEqual(['NEWUID_a', 'RandomDoc_b', 'U1']);
    const b = rows.find((r) => r.id === 'RandomDoc_b')!;
    expect(b._dupCount).toBe(2);
    expect(b._dupConflicts).toEqual(['role']);
    expect(rows.find((r) => r.id === 'U1')!._dupCount).toBe(1);
  });

  it('with showDuplicates, secondaries follow their canonical row and are marked read-only', () => {
    const rows = buildUserListRows([...remapPair, ...single], true);
    expect(rows.map((r) => [r.id, r._isDuplicateSecondary])).toEqual([
      ['NEWUID_a', false],
      ['OLDUID_a', true],
      ['U1', false],
    ]);
    expect(rows[1]._canonicalId).toBe('NEWUID_a');
  });
});

describe('findUserByEmail (admin add-user guard)', () => {
  it('finds an existing profile regardless of case / id shape', () => {
    expect(findUserByEmail([...adminAddedPair], '  b@EXAMPLE.com')?.id).toBe('RandomDoc_b');
    expect(findUserByEmail(single, 'nobody@example.com')).toBeUndefined();
    expect(findUserByEmail(single, '')).toBeUndefined();
  });
});

describe('buildLinkedProfile (first login)', () => {
  const source = { email: 'b@example.com', role: 'gdkd', teamName: 'MAY38', assignedProjects: ['p1'], linkedToUid: 'zzz', linkedAt: 1 };

  it('copies role/scope verbatim, takes identity from the token, records the source', () => {
    const p = buildLinkedProfile(source, 'RandomDoc_b', { uid: 'NEW', email: 'B@example.com', displayName: 'B' });
    expect(p).toMatchObject({ uid: 'NEW', email: 'B@example.com', role: 'gdkd', assignedProjects: ['p1'], teamName: 'MAY38', migratedFromUid: 'RandomDoc_b', emailIndexId: 'b_at_example_dot_com' });
    expect(p).not.toHaveProperty('linkedToUid');
    expect(p).not.toHaveProperty('linkedAt');
  });

  it('owner keeps super_admin', () => {
    expect(buildLinkedProfile(source, 'S', { uid: 'N', email: 'o@x.com' }, { isOwner: true }).role).toBe('super_admin');
  });
});
