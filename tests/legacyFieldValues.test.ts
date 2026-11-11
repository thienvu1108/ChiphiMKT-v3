import { describe, expect, it } from 'vitest';
import {
  evaluateMockFieldUpdate,
  healLegacyArrayUnionUpdate,
  isLegacyArrayUnionMap,
  normalizeLegacyFieldValues,
} from '../src/lib/legacyFieldValues';

const au = (...value: any[]) => ({ _type: 'arrayUnion', value });

describe('legacy {_type:"arrayUnion"} values (P1-1)', () => {
  it('reads malformed maps back as arrays', () => {
    const doc = { amount: 5, editHistory: au({ a: 1 }, { a: 2 }), readBy: au('x@y.vn') };
    const n = normalizeLegacyFieldValues(doc);
    expect(n.editHistory).toEqual([{ a: 1 }, { a: 2 }]);
    expect(n.readBy).toEqual(['x@y.vn']);
    expect(n.amount).toBe(5);
    expect(doc.editHistory).toEqual(au({ a: 1 }, { a: 2 })); // input not mutated
  });

  it('returns the same object when nothing is malformed', () => {
    const doc = { editHistory: [{ a: 1 }] };
    expect(normalizeLegacyFieldValues(doc)).toBe(doc);
  });

  it('offline evaluation appends (and keeps legacy items)', () => {
    expect(evaluateMockFieldUpdate(au('b'), ['a'])).toEqual(['a', 'b']);
    expect(evaluateMockFieldUpdate(au('a'), ['a'])).toEqual(['a']);
    expect(evaluateMockFieldUpdate(au('c'), au('a', 'b'))).toEqual(['a', 'b', 'c']);
    expect(evaluateMockFieldUpdate({ _type: 'increment', value: 2 }, 3)).toBe(5);
    expect(evaluateMockFieldUpdate('plain', 'old')).toBe('plain');
  });

  it('heals a legacy field into a full array on the next write; proper arrays keep arrayUnion', () => {
    const current = { editHistory: au({ v: 1 }), readBy: ['a@x.vn'] };
    const update = { editHistory: au({ v: 2 }), readBy: au('b@x.vn'), amount: 9 };
    const healed = healLegacyArrayUnionUpdate(current, update);
    expect(healed.editHistory).toEqual([{ v: 1 }, { v: 2 }]);
    expect(isLegacyArrayUnionMap(healed.readBy)).toBe(true); // still a descriptor -> real arrayUnion online
    expect(healed.amount).toBe(9);
  });
});
