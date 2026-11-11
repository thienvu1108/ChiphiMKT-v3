import { describe, it, expect } from 'vitest';
import { pastOpenConflicts, fmtVnEnd, openNext, type OpenCfg, type PastLock } from '../lib/vnext/platform';
const vn = (s: string) => Date.parse(s + '+07:00');
const nt: OpenCfg = { on: true, rec: { on: true, fromDay: 21, fromMin: 0, toDay: 27, toMin: 0, apply: 0, exceptions: [] }, ranges: [] };
const ns: OpenCfg = { on: true, rec: { on: true, fromDay: 27, fromMin: 0, toDay: 14, toMin: 0, apply: 1, exceptions: [] }, ranges: [] };
const t = vn('2026-10-24T20:30:00');
describe('openwin3', () => {
  it('NT next window 21/11 -> het ngay 26/11, ky 2026-11', () => {
    const w = openNext(nt, '', vn('2026-10-27T01:00:00'))!;
    expect(w.from).toBe(vn('2026-11-21T00:00:00')); expect(fmtVnEnd(w.to)).toBe('hết ngày 26/11/2026'); expect(w.period).toBe('2026-11');
  });
  it('NT past lock day 26 M conflicts, day 27 M ok', () => {
    expect(pastOpenConflicts({ on: true, day: 26, min: 0, offset: 0 }, nt, t).length).toBeGreaterThan(0);
    expect(pastOpenConflicts({ on: true, day: 27, min: 0, offset: 0 }, nt, t)).toEqual([]);
  });
  it('NS past lock 26/M no conflict with open 27->14 thang sau', () => {
    const p: PastLock = { on: true, day: 26, min: 0, offset: 0 };
    expect(pastOpenConflicts(p, ns, t)).toEqual([]);
  });
  it('fmtVnEnd non-midnight', () => { expect(fmtVnEnd(vn('2026-11-26T18:00:00'))).toBe('18:00 26/11/2026'); });
});
