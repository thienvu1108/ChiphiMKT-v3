/** Đặt ảnh vừa khung, giữ nguyên tỉ lệ (không kéo méo), căn giữa. Đơn vị tuỳ ý (inch cho PPTX). */
export function fitContain(natW: number, natH: number, box: { x: number; y: number; w: number; h: number }) {
  if (!(natW > 0) || !(natH > 0)) return { ...box };
  const s = Math.min(box.w / natW, box.h / natH);
  const w = natW * s, h = natH * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Đọc EXIF Orientation (1–8) từ JPEG; 1 nếu không có / không phải JPEG. PowerPoint không xoay theo EXIF → cần xoay sẵn. */
export function jpegOrientation(buf: ArrayBuffer): number {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const m = v.getUint16(o); const len = v.getUint16(o + 2);
    if (m === 0xffe1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966) {
      const t = o + 10; if (t + 8 > v.byteLength) return 1;
      const le = v.getUint16(t) === 0x4949;
      const ifd = t + v.getUint32(t + 4, le); if (ifd + 2 > v.byteLength) return 1;
      const n = v.getUint16(ifd, le);
      for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (e + 10 > v.byteLength) break; if (v.getUint16(e, le) === 0x0112) { const r = v.getUint16(e + 8, le); return r >= 1 && r <= 8 ? r : 1; } }
      return 1;
    }
    if ((m & 0xff00) !== 0xff00 || m === 0xffda) break;
    o += 2 + len;
  }
  return 1;
}
/** Orientation 5–8 = ảnh xoay 90°: rộng/cao hiển thị đảo so với điểm ảnh lưu. */
export const swapsAxes = (orientation: number) => orientation >= 5 && orientation <= 8;
