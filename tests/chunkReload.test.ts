import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: Record<string, string> = {};
const reload = vi.fn();
(globalThis as any).sessionStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).window = { location: { reload } };

const load = async () => { vi.resetModules(); return import('../src/lib/chunkReload'); };

describe('chunkReload', () => {
  beforeEach(() => { reload.mockClear(); for (const k of Object.keys(store)) delete store[k]; });
  it('nhận diện lỗi chunk', async () => { const { isChunkLoadError } = await load();
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/NtReportPage-Os5FneiV.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('x is undefined'))).toBe(false);
  });
  it('tự tải lại 1 lần, không lặp', async () => {
    let m = await load();
    expect(m.handleChunkError()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    m = await load(); // trang đã tải lại
    const { handleChunkError, hasPendingUpdate } = m;
    expect(handleChunkError()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(hasPendingUpdate()).toBe(true);
  });
  it('không tải lại khi đang upload', async () => { const { handleChunkError, markDirty } = await load();
    const done = markDirty();
    expect(handleChunkError()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    done();
    expect(handleChunkError()).toBe(true);
  });
});
