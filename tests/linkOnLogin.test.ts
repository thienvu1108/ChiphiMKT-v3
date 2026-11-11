import { describe, it, expect } from 'vitest';
import { planLink, replaceIn, emailIndexId } from '../api/_lib/linkOnLogin';

const E = 'Old.User@Example.com';
const base = (over: any = {}) => ({
  uid: 'NEW', email: E,
  profile: { email: 'old.user@example.com', role: 'gdkd', migratedFromUid: 'OLD', fullName: 'A', assignedProjects: ['p1'] },
  candidates: [{ id: 'OLD', data: { email: 'old.user@example.com', role: 'gdkd', assignedProjects: ['p1'], teamName: 'MAY1', linkedToUid: 'NEW' } }],
  refDocs: [
    { col: 'blocks', id: 'B1', data: { directorUid: 'OLD', assistantUids: ['X', 'OLD', 'NEW'], createdBy: 'OLD' } },
    { col: 'ban_kd', id: 'K1', data: { leaderUid: 'OLD', memberUids: ['OLD'], name: 'OLD' } },
    { col: 'teams', id: 'T1', data: { gdkdUids: ['OLD'], createdBy: 'OLD', nested: { leaderUid: 'OLD' } } },
    { col: 'budgets', id: 'G1', data: { createdBy: 'OLD', updatedBy: 'OLD' } },
    { col: 'usersByEmail', id: emailIndexId(E), data: { oldUid: 'OLD' } },
    { col: 'auditLogs', id: 'L1', data: { userId: 'OLD' } },
  ],
  ...over,
});

describe('planLink', () => {
  it('retires the carried old doc and repoints access + ownership refs only', () => {
    const p = planLink(base());
    expect(p.status).toBe('linked');
    expect(p.retire).toEqual(['OLD']);
    const by = Object.fromEntries(p.refUpdates.map((r) => [`${r.col}/${r.id}`, r.patch]));
    expect(by['blocks/B1']).toEqual({ directorUid: 'NEW', assistantUids: ['X', 'NEW'] });
    expect(by['ban_kd/K1']).toEqual({ leaderUid: 'NEW', memberUids: ['NEW'] });
    expect(by['teams/T1']).toEqual({ gdkdUids: ['NEW'] });
    expect(by['budgets/G1']).toEqual({ createdBy: 'NEW' });
    expect(by['usersByEmail/' + emailIndexId(E)]).toEqual({ oldUid: 'NEW' });
    expect(by['auditLogs/L1']).toBeUndefined();
    expect(p.profilePatch).toEqual({ teamName: 'MAY1' });
  });
  it('admin-level profile: ownership (createdBy) is not rewritten', () => {
    const b = base();
    b.profile.role = 'admin'; b.candidates[0].data.role = 'admin';
    const p = planLink(b);
    expect(p.refUpdates.find((r) => r.col === 'budgets')).toBeUndefined();
  });
  it('is idempotent: nothing to do when no other doc', () => {
    expect(planLink(base({ candidates: [] })).status).toBe('clean');
  });
  it('no profile yet → does nothing', () => {
    expect(planLink(base({ profile: null })).status).toBe('no-profile');
  });
  it('never retires a doc linked to another uid, another Auth account, or a different email', () => {
    const c = [
      { id: 'A', data: { email: 'old.user@example.com', role: 'user', linkedToUid: 'SOMEONE' } },
      { id: 'B', data: { email: 'old.user@example.com', role: 'user' } },
      { id: 'C', data: { email: 'other@example.com', role: 'user' } },
    ];
    const p = planLink(base({ candidates: c, otherAuthUidIds: new Set(['B']) }));
    expect(p.status).toBe('conflict');
    expect(p.retire).toEqual([]);
    expect(p.conflicts.map((x) => x.id).sort()).toEqual(['A', 'B']);
  });
  it('privileged old doc NOT carried into the profile → conflict, untouched (no role loss)', () => {
    const p = planLink(base({ profile: { email: E, role: 'user' }, candidates: [{ id: 'ADM', data: { email: E, role: 'admin' } }] }));
    expect(p.status).toBe('conflict');
    expect(p.retire).toEqual([]);
  });
  it('plain user stub with same email is retired even if not migratedFrom', () => {
    const p = planLink(base({ candidates: [...base().candidates, { id: 'STUB', data: { email: E.toLowerCase(), role: 'user', assignedProjects: [] } }] }));
    expect(p.retire.sort()).toEqual(['OLD', 'STUB']);
  });
  it('replaceIn dedups string arrays and leaves non-matching values', () => {
    expect(replaceIn(['a', 'b', 'a2'], 'a', 'b')).toEqual([['b', 'a2'], true]);
    expect(replaceIn({ x: 1, y: 'z' }, 'a', 'b')).toEqual([{ x: 1, y: 'z' }, false]);
  });
});
