import { describe, it, expect } from 'vitest';
import { stepIndex, keyAction, swipeAction, dataUrlToBlob } from '../src/lib/photoViewer';
describe('PhotoViewer logic', () => {
  it('stepIndex vòng quanh', () => { expect(stepIndex(0, -1, 3)).toBe(2); expect(stepIndex(2, 1, 3)).toBe(0); expect(stepIndex(1, 1, 3)).toBe(2); expect(stepIndex(0, 1, 0)).toBe(-1); });
  it('phím', () => { expect(keyAction('Escape')).toBe('close'); expect(keyAction('ArrowLeft')).toBe('prev'); expect(keyAction('ArrowRight')).toBe('next'); expect(keyAction('a')).toBeNull(); });
  it('vuốt', () => { expect(swipeAction(-80, 5)).toBe('next'); expect(swipeAction(80, 5)).toBe('prev'); expect(swipeAction(30, 0)).toBeNull(); expect(swipeAction(60, 70)).toBeNull(); });
  it('data URL → Blob giữ mime/kích thước', () => { const b = dataUrlToBlob('data:image/png;base64,' + btoa('abc'))!; expect(b.type).toBe('image/png'); expect(b.size).toBe(3); expect(dataUrlToBlob('https://x')).toBeNull(); });
});
