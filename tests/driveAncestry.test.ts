import { describe, it, expect } from 'vitest';
import { isUnderRoot } from '../api/_lib/driveAncestry';

describe('isUnderRoot', () => {
  const tree: Record<string, string[]> = { F: ['A'], A: ['B'], B: ['ROOT'], X: ['OTHER'], OTHER: [] };
  const get = async (id: string) => tree[id] ?? null;
  it('file trong cây gốc', async () => expect(await isUnderRoot(get, 'F', 'ROOT')).toBe(true));
  it('file ngoài cây', async () => expect(await isUnderRoot(get, 'X', 'ROOT')).toBe(false));
  it('thiếu root', async () => expect(await isUnderRoot(get, 'F', '')).toBe(false));
});
