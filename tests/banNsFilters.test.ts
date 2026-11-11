import { describe, it, expect } from 'vitest';
import { kyMonthLabel, matchesBanNsFilter, groupByProject, activeFilterCount } from '../src/lib/banNsFilters';

describe('kyMonthLabel', () => {
  it('kỳ M = 21/(M-1) → 20/M', () => {
    expect(kyMonthLabel('2026-11')).toBe('Tháng 11/2026 (21/10 – 20/11)');
    expect(kyMonthLabel('2027-01')).toBe('Tháng 1/2027 (21/12 – 20/01)');
  });
  it('bad key passthrough', () => expect(kyMonthLabel('x')).toBe('x'));
});

describe('matchesBanNsFilter', () => {
  const r = { month: '2026-11', projectId: 'p1', blockId: 'b1', blockCode: 'K01' };
  it('all passes', () => expect(matchesBanNsFilter(r, { month: 'all', projectId: 'all', block: 'all' })).toBe(true));
  it('month', () => { expect(matchesBanNsFilter(r, { month: '2026-12' })).toBe(false); expect(matchesBanNsFilter({ period: '2026-11' }, { month: '2026-11' })).toBe(true); });
  it('project by id', () => expect(matchesBanNsFilter(r, { projectId: 'p2' })).toBe(false));
  it('block by id, code or lookup', () => {
    expect(matchesBanNsFilter(r, { block: 'b1' })).toBe(true);
    expect(matchesBanNsFilter(r, { block: 'K01' })).toBe(true);
    expect(matchesBanNsFilter({ blockId: 'b9' }, { block: 'K09' }, (id) => (id === 'b9' ? 'K09' : undefined))).toBe(true);
    expect(matchesBanNsFilter(r, { block: 'K02' })).toBe(false);
  });
  it('activeFilterCount', () => expect(activeFilterCount({ month: '2026-11', projectId: 'all', block: 'K1', search: ' ' })).toBe(2));
});

describe('groupByProject', () => {
  const rows = [
    { p: 'p2', a: 100, b: 'Khối B' }, { p: 'p1', a: '50', b: 'Khối Z' }, { p: 'p1', a: 25, b: 'Khối A' }, { p: undefined, a: 5, b: 'Khối A' },
  ];
  const names: Record<string, string> = { p1: 'Alpha', p2: 'Beta' };
  const g = groupByProject(rows, { projectId: (r) => r.p, amount: (r) => r.a, projectName: (id) => names[id], blockName: (r) => r.b });
  it('groups by projectId sorted by name, none last', () => expect(g.map((x) => x.label)).toEqual(['Alpha', 'Beta', '(Chưa gắn dự án)']));
  it('subtotals', () => expect(g.map((x) => x.subtotal)).toEqual([75, 100, 5]));
  it('rows sorted by Khối, blocks distinct', () => { expect(g[0].rows.map((r) => r.b)).toEqual(['Khối A', 'Khối Z']); expect(g[0].blocks.length).toBe(2); });
  it('same name different id stays separate', () => {
    const x = groupByProject([{ p: 'a' }, { p: 'b' }], { projectId: (r) => r.p, amount: () => 1, projectName: () => 'Same', blockName: () => '' });
    expect(x.length).toBe(2);
  });
});

import { bulkSummary, projectBulkTargets, needsBulkConfirm, validBanReason } from '../src/lib/banNsFilters';
describe('bulk', () => {
  const rows = [
    { ban: 'pending', b: 'k1', a: 10 }, { ban: 'pending', b: 'k2', a: '20' }, { ban: 'approved', b: 'k1', a: 5 }, { ban: 'pending', b: undefined, a: 1 },
  ];
  it('targets pending only', () => expect(projectBulkTargets(rows, true).length).toBe(3));
  it('view-only gets none', () => expect(projectBulkTargets(rows, false)).toEqual([]));
  it('allowed predicate', () => expect(projectBulkTargets(rows, true, (r) => r.b === 'k1').length).toBe(1));
  it('summary', () => expect(bulkSummary(projectBulkTargets(rows, true), { blockId: (r) => r.b, amount: (r) => r.a })).toEqual({ khoi: 3, records: 3, total: 31 }));
  it('empty summary', () => expect(bulkSummary([], { blockId: () => 'x', amount: () => 1 })).toEqual({ khoi: 0, records: 0, total: 0 }));
  it('needsBulkConfirm', () => { expect(needsBulkConfirm({ khoi: 1, records: 1, total: 1 })).toBe(false); expect(needsBulkConfirm({ khoi: 1, records: 2, total: 1 })).toBe(true); });
  it('reason', () => { expect(validBanReason('  ab ')).toBe(false); expect(validBanReason('abc')).toBe(true); });
});
