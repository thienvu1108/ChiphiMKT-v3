import { describe, it, expect } from 'vitest';
import { backupFileName, backupFolderPath, parseBackupName, retentionPlan, monthKey, inScope, planRestore, buildManifest, chunk } from '../lib/vnext/backup';
const D = (n: string, f: any = {}) => ({ name: `projects/p/databases/d/documents/c/${n}`, fields: f });
const S = (v: string) => ({ stringValue: v });
describe('backup naming', () => {
  const t = new Date('2026-10-14T19:13:00Z'); // 02:13 VN 15/10
  it('file + folder in VN time, staging marked', () => {
    expect(backupFileName(t, true)).toBe('[STAGING] MAYHOMES - Backup - 2026-10-15 02h13.zip');
    expect(backupFileName(t, false)).toBe('MAYHOMES - Backup - 2026-10-15 02h13.zip');
    expect(backupFolderPath(t, true)).toEqual(['Sao lưu ChiphiMKT', '[STAGING]', '2026', 'Tháng 10']);
    expect(parseBackupName(backupFileName(t, true))!.toISOString()).toBe(t.toISOString());
    expect(parseBackupName('x.zip')).toBeNull();
  });
});
describe('retention', () => {
  it('30 daily + first-of-month 12 months', () => {
    const now = new Date('2026-10-15T00:00:00Z');
    const mk = (day: string, id: string) => ({ id, name: `MAYHOMES - Backup - ${day} 02h13.zip` });
    const files = [mk('2026-10-10', 'recent'), mk('2026-09-01', 'sepFirst'), mk('2026-09-02', 'sepOld'), mk('2025-11-01', 'novFirst'), mk('2025-10-01', 'oct25'), mk('2025-10-05', 'oct25b')];
    const r = retentionPlan(files, now);
    expect(r.keep.sort()).toEqual(['novFirst', 'recent', 'sepFirst']);
    expect(r.trash.sort()).toEqual(['oct25', 'oct25b', 'sepOld']);
  });
});
describe('scope + plan', () => {
  it('monthKey', () => { expect(monthKey('2026-4')).toBe('2026-04'); expect(monthKey('04.2026')).toBe('2026-04'); expect(monthKey('Tháng 8')).toBeNull(); });
  it('inScope excludes audit/backupRuns, filters month/team', () => {
    expect(inScope('auditLogs', D('a'), {})).toBe(false);
    expect(inScope('acceptances', D('a', { ntMonth: S('2026-09'), teamId: S('T1') }), { month: '2026-09', teamId: 'T1' })).toBe(true);
    expect(inScope('acceptances', D('a', { ntMonth: S('2026-08') }), { month: '2026-09' })).toBe(false);
    expect(inScope('teams', D('T1'), { teamId: 'T1' })).toBe(true);
  });
  it('planRestore add/update/delete/same; no deletes under month filter', () => {
    const b = { costs: [D('1', { a: S('x') }), D('2', { a: S('y') }), D('3', { a: S('z') })] };
    const cur = { costs: [D('2', { a: S('CHANGED') }), D('3', { a: S('z') }), D('4', { a: S('new') })] };
    const p = planRestore(b, cur, { collections: ['costs'] });
    expect(p.rows).toEqual([{ col: 'costs', add: 1, update: 1, delete: 1, same: 1 }]);
    expect(p.writes.map((w) => `${w.op}:${w.id}`).sort()).toEqual(['delete:4', 'set:1', 'set:2']);
    const bm = { costs: [D('1', { month: S('2026-09') })] }; const cm = { costs: [D('9', { month: S('2026-09') })] };
    expect(planRestore(bm, cm, { month: '2026-09' }).writes.every((w) => w.op === 'set')).toBe(true);
    expect(planRestore({ auditLogs: [D('x')] }, {}, {}).writes).toEqual([]);
  });
  it('manifest + chunk', () => {
    const m = buildManifest({ a: [D('1'), D('2')], b: [] }, { env: 'staging', database: 'db', by: 'x', createdAt: 'now' });
    expect(m.total).toBe(2); expect(m.counts).toEqual({ a: 2, b: 0 });
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
