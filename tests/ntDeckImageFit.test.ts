import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Báo cáo nghiệm thu: ảnh (hóa đơn PDF trang 1 / ảnh dọc) phải hiện TRỌN trong khung slide.
// Lỗi cũ: khung `grid place-items-center` + img `max-h-full` → max-height % không áp được trong hàng grid auto → ảnh dọc bị cắt.
describe('ntDeck ImageView: ảnh vừa khung (không bị cắt)', () => {
  const src = readFileSync('src/vnext/ntDeck.tsx', 'utf8');
  const view = src.slice(src.indexOf('function ImageView'), src.indexOf('export function buildSlides'));
  it('img được định cỡ theo khung: absolute inset-0 w-full h-full object-contain', () => {
    const imgs = view.match(/<img [^>]*>/g) || [];
    expect(imgs.length).toBe(2);
    for (const t of imgs) {
      expect(t).toMatch(/absolute inset-0 w-full h-full object-contain/);
      expect(t).not.toMatch(/max-h-full/);
    }
  });
  it('khung ảnh là relative (không còn grid place-items-center)', () => {
    expect(view).toMatch(/min-h-0[^"]*relative overflow-hidden/);
    expect(view).not.toMatch(/grid place-items-center overflow-hidden/);
  });
});