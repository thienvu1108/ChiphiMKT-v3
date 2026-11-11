import { describe, it, expect } from 'vitest';
import { weeklyEditAccess, editMeta } from '../src/lib/weeklyEdit';
const base = { windowState: 'open' as const, submitted: true, isOwner: true, canAdminEdit: false };
describe('weeklyEditAccess', () => {
  it('owner edits submitted while open', () => expect(weeklyEditAccess(base)).toEqual({ canWrite: true, needsEditToggle: true, viaAdmin: false, reason: '' }));
  it('owner new report no toggle', () => expect(weeklyEditAccess({ ...base, submitted: false }).needsEditToggle).toBe(false));
  it('owner closed blocked', () => expect(weeklyEditAccess({ ...base, windowState: 'closed' })).toMatchObject({ canWrite: false, reason: 'closed' }));
  it('owner upcoming blocked', () => expect(weeklyEditAccess({ ...base, windowState: 'upcoming' }).reason).toBe('upcoming'));
  it('admin closed allowed via admin', () => expect(weeklyEditAccess({ ...base, windowState: 'closed', isOwner: false, canAdminEdit: true })).toMatchObject({ canWrite: true, viaAdmin: true }));
  it('super admin bypass', () => expect(weeklyEditAccess({ ...base, windowState: 'closed', isSuperAdmin: true }).canWrite).toBe(true));
  it('non-owner non-admin', () => expect(weeklyEditAccess({ ...base, isOwner: false }).reason).toBe('not_owner'));
  it('deleted blocks owner', () => expect(weeklyEditAccess({ ...base, deleted: true }).reason).toBe('deleted'));
});
describe('editMeta', () => {
  it('create has no editedBy', () => { const m: any = editMeta({ uid: 'u', name: 'N', now: 't', isEdit: false }); expect(m.editedBy).toBeUndefined(); expect(m.history[0].action).toBe('create'); });
  it('edit records editor + prevItems', () => { const m: any = editMeta({ uid: 'u', name: 'N', now: 't', isEdit: true, prevItems: [1] }); expect(m).toMatchObject({ editedBy: 'u', editedAt: 't' }); expect(m.history[0]).toMatchObject({ action: 'edit', prevItems: [1] }); });
  it('admin edit action', () => expect((editMeta({ uid: 'a', name: 'A', now: 't', isEdit: true, viaAdmin: true }) as any).history[0].action).toBe('admin_edit'));
  it('caps history 100', () => expect(editMeta({ prevHistory: Array.from({ length: 120 }, () => ({ at: '', byUid: '', byName: '', action: 'x' })), uid: 'u', name: 'N', now: 't', isEdit: true }).history.length).toBe(100));
});
