import { describe, it, expect } from 'vitest';
import { ntManualAllowed, cleanManualName, validateManualName, isManualImplementer, implementerLabel, manualAttributionPatch } from '../lib/vnext/ntManual';
import { buildReconcile } from '../lib/vnext/ntReport';
import { extractImageFiles, pastedName, readClipboardImages, pasteSummary, clipboardReadSupported, PASTE_MAX_BYTES } from '../lib/vnext/pasteImages';

describe('ntManual', () => {
  it('only Tháng 10/2026', () => {
    expect(ntManualAllowed('10.2026')).toBe(true);
    expect(ntManualAllowed('2026-10')).toBe(true);
    expect(ntManualAllowed('11.2026')).toBe(false);
    expect(ntManualAllowed('09.2026')).toBe(false);
    expect(ntManualAllowed('')).toBe(false);
  });
  it('clean/validate name', () => {
    expect(cleanManualName('  Nguyễn\tVăn   A \n')).toBe('Nguyễn Văn A');
    expect(validateManualName('   ')).toBeTruthy();
    expect(validateManualName('x'.repeat(121))).toBeTruthy();
    expect(validateManualName('Trần B')).toBeFalsy();
  });
  it('patch + label', () => {
    const p = manualAttributionPatch('10.2026', ' Lê  C ', { uid: 'a', email: 'a@x' });
    expect(p).toMatchObject({ implementerUid: '', implementerName: 'Lê C', implementerManual: true, ntMonth: '2026-10' });
    expect(() => manualAttributionPatch('11.2026', 'X', {})).toThrow();
    expect(() => manualAttributionPatch('10.2026', ' ', {})).toThrow();
    expect(isManualImplementer(p)).toBe(true);
    expect(isManualImplementer({ implementerUid: 'u', implementerName: 'X', implementerManual: true })).toBe(false);
    expect(implementerLabel(p)).toBe('Lê C (tự nhập)');
    expect(implementerLabel({ implementerUid: 'u', implementerName: 'U' })).toBe('U');
  });
  it('buildReconcile includes manual rows separately', () => {
    const acc = [
      { id: 'a', status: 'Đã nghiệm thu', month: '10.2026', projectId: 'P1', implementerUid: '', implementerName: 'Lê C', implementerManual: true, totalCost: 100 },
      { id: 'b', status: 'Đã nghiệm thu', month: '10.2026', projectId: 'P1', implementerUid: 'u1', implementerName: 'U1', totalCost: 50 },
      { id: 'c', status: 'Đã nghiệm thu', month: '10.2026', projectId: 'P1', implementerUid: '', implementerName: 'Cũ', totalCost: 1 },
    ];
    const flat: any[] = buildReconcile([], acc, { month: '2026-10' });
    expect(flat.some((r: any) => r.manual && r.name === 'Lê C')).toBe(true);
    expect(flat.some((r: any) => r.uid === 'u1')).toBe(true);
    expect(flat.some((r: any) => r.name === 'Cũ')).toBe(false);
  });
});

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });
const fi = (f: File) => ({ kind: 'file', type: f.type, getAsFile: () => f });
describe('pasteImages', () => {
  const now = new Date(2026, 9, 19, 8, 5, 9);
  it('names', () => {
    expect(pastedName({ name: 'image.png', type: 'image/png' }, 0, now)).toBe('dan-anh-20261019-080509-1.png');
    expect(pastedName({ name: '', type: 'image/jpeg' }, 1, now)).toBe('dan-anh-20261019-080509-2.jpg');
    expect(pastedName({ name: 'hoa-don.jpg', type: 'image/jpeg' }, 0, now)).toBe('hoa-don.jpg');
  });
  it('multiple images + non-image + too large', () => {
    const big = file('big.png', 'image/png', 10); Object.defineProperty(big, 'size', { value: PASTE_MAX_BYTES + 1 });
    const r = extractImageFiles({ items: [fi(file('image.png', 'image/png')), fi(file('a.jpg', 'image/jpeg')), fi(file('x.pdf', 'application/pdf')), fi(big), { kind: 'string', type: 'text/plain' }] }, now);
    expect(r.files.map((f) => f.name)).toEqual(['dan-anh-20261019-080509-1.png', 'a.jpg']);
    expect(r.skipped).toBe(1); expect(r.tooLarge).toEqual(['big.png']);
    expect(pasteSummary(r)?.msg).toMatch(/quá lớn/);
  });
  it('text-only paste → not image', () => {
    const r = extractImageFiles({ items: [{ kind: 'string', type: 'text/plain' }] });
    expect(r.files.length).toBe(0); expect(pasteSummary(r)).toEqual({ msg: 'Nội dung dán không phải ảnh', err: true });
  });
  it('drop uses files when no items', () => {
    const r = extractImageFiles({ files: [file('p.png', 'image/png'), file('t.txt', 'text/plain')] });
    expect(r.files.length).toBe(1); expect(r.skipped).toBe(1);
  });
  it('clipboard.read: unsupported / denied / ok', async () => {
    expect(clipboardReadSupported({})).toBe(false);
    expect((await readClipboardImages({})).unsupported).toBe(true);
    const denied = await readClipboardImages({ clipboard: { read: async () => { const e: any = new Error('x'); e.name = 'NotAllowedError'; throw e; } } });
    expect(denied.denied).toBe(true); expect(pasteSummary(denied)?.err).toBe(true);
    const ok = await readClipboardImages({ clipboard: { read: async () => [
      { types: ['text/plain'], getType: async () => new Blob(['x']) },
      { types: ['image/png'], getType: async () => new Blob([new Uint8Array(5)], { type: 'image/png' }) },
    ] } }, now);
    expect(ok.files.length).toBe(1); expect(ok.files[0].name).toBe('dan-anh-20261019-080509-1.png'); expect(ok.skipped).toBe(1);
  });
});
