import { describe, it, expect } from 'vitest';
import { explainNtCreateDenied, type NtDenyInput } from '../lib/vnext/ntDenyDiag';

const ok = (o: Partial<NtDenyInput> = {}, p: any = {}): NtDenyInput => ({
  authUid: 'abcdef123', profileDocId: 'abcdef123', serverRole: 'mod',
  payload: { month: '2026-10', ntMonth: '2026-10', implementerUid: 'u1', ntRequired: true, adLinks: [], ...p },
  cutoffMs: 1000, serverNowMs: 2000, pastLocked: false, windowLocked: false,
  keyExists: false, keyAcceptanceExists: false, ...o,
});
const code = (o?: Partial<NtDenyInput>, p?: any) => explainNtCreateDenied(ok(o, p)).code;

describe('explainNtCreateDenied', () => {
  it('no-profile / role', () => {
    const r = explainNtCreateDenied(ok({ serverRole: null }));
    expect(r.code).toBe('no-profile');
    expect(r.message).toContain('abcdef…');
    expect(r.message).not.toContain('abcdef123');
    expect(code({ serverRole: 'user' })).toBe('role');
  });
  it('locks', () => {
    expect(code({ pastLocked: true })).toBe('past-locked');
    expect(explainNtCreateDenied(ok({ windowLocked: true })).message).toContain('Kỳ tháng 10/2026 đã khoá Nghiệm thu');
    expect(code({ windowLocked: true })).toBe('window-locked');
  });
  it('dup-key / orphan-key', () => {
    const r = explainNtCreateDenied(ok({ keyExists: true, keyAcceptanceExists: true, keyAcceptanceId: 'xyz987654' }));
    expect(r.code).toBe('dup-key'); expect(r.message).toContain('xyz987…');
    expect(code({ keyExists: true })).toBe('orphan-key');
  });
  it('missing-required', () => {
    expect(code({}, { ntRequired: false })).toBe('missing-required');
    expect(code({}, { implementerUid: '', ntRequired: true })).toBe('missing-required');
    expect(code({ cutoffMs: null }, { ntRequired: false })).toBe('unknown');
    expect(code({ cutoffMs: 5000 }, { ntRequired: false })).toBe('unknown');
  });
  it('manual / supplement / adlinks', () => {
    expect(code({}, { implementerUid: '', implementerManual: true, month: '2026-11' })).toBe('manual-not-allowed');
    expect(code({}, { implementerManual: true, implementerUid: '' })).toBe('unknown');
    expect(code({}, { supplementFor: '2026-10' })).toBe('supplement-shape');
    expect(code({}, { supplementFor: '2026-09' })).toBe('unknown');
    expect(code({}, { adLinks: new Array(21).fill('x') })).toBe('adlinks');
  });
  it('order: role beats lock beats dup beats required', () => {
    expect(code({ serverRole: null, pastLocked: true, keyExists: true }, { ntRequired: false })).toBe('no-profile');
    expect(code({ pastLocked: true, keyExists: true }, { ntRequired: false })).toBe('past-locked');
    expect(code({ keyExists: true }, { ntRequired: false })).toBe('orphan-key');
    expect(code({}, { ntRequired: false, adLinks: new Array(30).fill('x') })).toBe('missing-required');
  });
  it('unknown fallback', () => {
    const r = explainNtCreateDenied(ok());
    expect(r.code).toBe('unknown'); expect(r.message).toContain('NT-?');
  });
});
