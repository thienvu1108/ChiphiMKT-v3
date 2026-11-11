import { describe, it, expect } from 'vitest';
import { bootstrapDecision, afterCreateDenied, fromRestFields } from '../src/lib/profileBootstrap';
describe('bootstrapDecision', () => {
  it('client doc wins', () => expect(bootstrapDecision({ clientExists: true, serverProfile: null })).toBe('use-client'));
  it('stale cache: server has profile → use server, no stub', () => expect(bootstrapDecision({ clientExists: false, serverProfile: { role: 'mod' } })).toBe('use-server'));
  it('really new user → create', () => expect(bootstrapDecision({ clientExists: false, serverProfile: null })).toBe('create'));
  it('server check failed → retry (never stub)', () => expect(bootstrapDecision({ clientExists: false, serverProfile: 'error' })).toBe('retry'));
});
describe('afterCreateDenied', () => {
  it('existing → use server', () => expect(afterCreateDenied({ role: 'mod' })).toBe('use-server'));
  it('none/error → error', () => { expect(afterCreateDenied(null)).toBe('error'); expect(afterCreateDenied('error')).toBe('error'); });
});
describe('fromRestFields', () => {
  it('converts', () => expect(fromRestFields({ role: { stringValue: 'mod' }, n: { integerValue: '2' }, a: { arrayValue: { values: [{ stringValue: 'x' }] } }, m: { mapValue: { fields: { s: { stringValue: 'approved' } } } }, t: { timestampValue: '2026-01-01T00:00:00Z' }, b: { booleanValue: true }, z: { nullValue: null } }))
    .toEqual({ role: 'mod', n: 2, a: ['x'], m: { s: 'approved' }, t: '2026-01-01T00:00:00Z', b: true, z: null }));
  it('empty', () => expect(fromRestFields(undefined)).toEqual({}));
});
