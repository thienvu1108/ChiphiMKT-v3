import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fitContain, jpegOrientation, swapsAxes } from '../lib/vnext/fitImage';
const ab = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
describe('fitImage', () => {
  it('fitContain giữ tỉ lệ dọc/ngang', () => {
    const box = { x: 0, y: 0, w: 9.2, h: 4.1 };
    const p = fitContain(1200, 1600, box); expect(p.w / p.h).toBeCloseTo(0.75, 5); expect(p.h).toBeCloseTo(4.1);
    const l = fitContain(1600, 900, box); expect(l.w / l.h).toBeCloseTo(16 / 9, 5);
  });
  it('jpegOrientation đọc EXIF', () => {
    expect(jpegOrientation(ab('tests/fixtures/portrait-exif6.jpg'))).toBe(6);
    expect(jpegOrientation(ab('tests/fixtures/landscape.jpg'))).toBe(1);
    expect(jpegOrientation(new Uint8Array([1, 2, 3, 4]).buffer)).toBe(1);
    expect(swapsAxes(6)).toBe(true); expect(swapsAxes(1)).toBe(false);
  });
});
