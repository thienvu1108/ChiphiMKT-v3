import { describe, it, expect, vi } from 'vitest';
import { resolveNtRequired, NT_CFG_LOADING_MSG } from '../lib/vnext/ntCutoff';
import { ntDeniedMsg } from '../lib/vnext/ntSupplement';

const NOW = new Date('2026-11-23T03:00:00Z');
const PAST = new Date('2026-10-01T00:00:00+07:00');
const FUTURE = new Date('2027-01-01T00:00:00+07:00');

describe('resolveNtRequired — settings chưa tải lúc tạo callback', () => {
  it('prop null (chưa tải) nhưng settings/global có mốc <= now → ntRequired=true', async () => {
    const fetchCutoff = vi.fn().mockResolvedValue(PAST);
    const d = await resolveNtRequired(null, fetchCutoff, NOW);
    expect(d).toEqual({ ok: true, required: true });
    expect(fetchCutoff).toHaveBeenCalledOnce();
  });
  it('prop undefined cũng đọc lại settings', async () => {
    const d = await resolveNtRequired(undefined, async () => ({ seconds: PAST.getTime() / 1000 }), NOW);
    expect(d).toEqual({ ok: true, required: true });
  });
  it('prop đã bắt buộc → không cần fetch', async () => {
    const fetchCutoff = vi.fn();
    expect(await resolveNtRequired(PAST, fetchCutoff, NOW)).toEqual({ ok: true, required: true });
    expect(fetchCutoff).not.toHaveBeenCalled();
  });
  it('chưa đặt mốc (fetch trả null) → không bắt buộc', async () => {
    expect(await resolveNtRequired(null, async () => null, NOW)).toEqual({ ok: true, required: false });
  });
  it('mốc ở tương lai → không bắt buộc', async () => {
    expect(await resolveNtRequired(null, async () => FUTURE, NOW)).toEqual({ ok: true, required: false });
  });
  it('fetch lỗi + prop chưa tải → chặn với thông báo đang tải cấu hình', async () => {
    const d = await resolveNtRequired(null, async () => { throw new Error('offline'); }, NOW);
    expect(d).toEqual({ ok: false, required: false, msg: NT_CFG_LOADING_MSG });
    expect(NT_CFG_LOADING_MSG).toBe('Đang tải cấu hình, vui lòng thử lại sau vài giây.');
  });
  it('fetch lỗi + prop đã tải (mốc tương lai) → dùng prop, không chặn', async () => {
    const d = await resolveNtRequired(FUTURE, async () => { throw new Error('offline'); }, NOW);
    expect(d).toEqual({ ok: true, required: false });
  });
});

describe('ntDeniedMsg', () => {
  const denied = { code: 'permission-denied' };
  it('không phải permission-denied → null', () => {
    expect(ntDeniedMsg({ code: 'unavailable' }, '2026-11')).toBeNull();
    expect(ntDeniedMsg({ code: 'unavailable' }, '2026-11', true)).toBeNull();
  });
  it('kỳ khoá (mặc định) → giữ thông báo cũ', () => {
    const m = ntDeniedMsg(denied, '2026-10')!;
    expect(m).toContain('Kỳ tháng 10/2026 đã khoá Nghiệm thu');
    expect(ntDeniedMsg(denied, '2026-10', false)).toBe(m);
  });
  it('client thấy kỳ đang mở → thông báo tải lại trang', () => {
    expect(ntDeniedMsg(denied, '2026-11', true)).toBe('Không lưu được (không có quyền hoặc dữ liệu thiếu) — tải lại trang (Ctrl+Shift+R) rồi thử lại.');
  });
});
