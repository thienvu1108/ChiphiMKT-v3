import { describe, it, expect } from 'vitest';
import { classifyClientError, dedupeOk, stackOrigin, snapPending, snapExists } from '../src/lib/clientErrorFilter';
const O = 'https://chiphi.mayhomes.net';
const own = (m: string) => Object.assign(new Error(m), { stack: `TypeError: ${m}\n    at x (${O}/assets/index-abc.js:1:200)` });
describe('classifyClientError', () => {
  it('keeps real app errors', () => { expect(classifyClientError(own('boom'), 'boom', O)).toBeNull(); });
  it('keeps errors without stack (unknown origin)', () => { expect(classifyClientError('plain', 'plain', O)).toBeNull(); });
  it('drops extension stacks', () => {
    const e = { message: "Cannot read properties of undefined (reading 'M_ID')", stack: "TypeError: x\n at chrome-extension://abcd/content.js:1:2" };
    expect(classifyClientError(e, e.message, O)).toBe('extension');
    expect(classifyClientError({ stack: 'at moz-extension://q/a.js:1:1' }, 'x', O)).toBe('extension');
    expect(classifyClientError({ stack: 'at safari-web-extension://q/a.js:1:1' }, 'x', O)).toBe('extension');
  });
  it('drops foreign-only stacks but keeps mixed with own', () => {
    expect(classifyClientError({ stack: 'at https://evil.cdn/inj.js:1:1' }, 'x', O)).toBe('foreign');
    expect(classifyClientError({ stack: `at https://evil.cdn/inj.js:1:1\n at ${O}/assets/a.js:2:2` }, 'x', O)).toBeNull();
  });
  it('drops abort errors', () => {
    expect(classifyClientError({ name: 'AbortError', message: 'x' }, 'x', O)).toBe('abort');
    expect(classifyClientError('signal is aborted without reason', 'signal is aborted without reason', O)).toBe('abort');
  });
  it('drops Script error. without stack only', () => {
    expect(classifyClientError('Script error.', 'Script error.', O)).toBe('script-error');
    expect(classifyClientError(own('Script error.'), 'Script error.', O)).toBeNull();
  });
  it('drops empty / ResizeObserver', () => {
    expect(classifyClientError(null, '', O)).toBe('empty');
    expect(classifyClientError(null, 'ResizeObserver loop limit exceeded', O)).toBe('resize');
  });
  it('stackOrigin unknown without urls', () => { expect(stackOrigin('Error\n at foo', O)).toBe('unknown'); });
});
describe('dedupeOk', () => {
  it('suppresses same msg+page within window', () => {
    const m = new Map<string, number>();
    expect(dedupeOk(m, 'a', '/p', 0)).toBe(true);
    expect(dedupeOk(m, 'a', '/p', 30_000)).toBe(false);
    expect(dedupeOk(m, 'a', '/q', 30_000)).toBe(true);
    expect(dedupeOk(m, 'b', '/p', 30_000)).toBe(true);
    expect(dedupeOk(m, 'a', '/p', 61_000)).toBe(true);
  });
});
describe('snapshot guards (Safari undefined snapshot)', () => {
  it('never throws', () => {
    expect(snapPending(undefined)).toBe(false);
    expect(snapPending({})).toBe(false);
    expect(snapPending({ metadata: { hasPendingWrites: true } })).toBe(true);
    expect(snapExists(undefined)).toBe(false);
    expect(snapExists({ exists: () => true })).toBe(true);
    expect(snapExists({ exists: () => { throw new Error('x'); } })).toBe(false);
  });
});
