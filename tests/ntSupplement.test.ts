import { describe, it, expect } from 'vitest';
import { prevMonth, suppValid, ntCountsInTotals, suppCounts, suppDecisionPatch, suppBadge, suppKeySuffix } from '../lib/vnext/ntSupplement';
import { isAccepted } from '../lib/vnext/ntReport';
describe('ntSupplement', () => {
  it('prevMonth', () => {
    expect(prevMonth('2026-11')).toBe('2026-10');
    expect(prevMonth('2027-01')).toBe('2026-12');
    expect(prevMonth('11.2026')).toBe('');
    expect(suppValid('2026-11', '2026-10')).toBe(true);
    expect(suppValid('2026-11', '2026-09')).toBe(true);
    expect(suppValid('2026-11', '2026-11')).toBe(false);
    expect(suppValid('2026-11', '2025-10')).toBe(false);
  });
  it('only approved supplements count', () => {
    expect(ntCountsInTotals({})).toBe(true);
    expect(ntCountsInTotals({ supplementFor: '2026-10' })).toBe(false);
    expect(ntCountsInTotals({ supplementFor: '2026-10', supplementStatus: 'rejected' })).toBe(false);
    expect(ntCountsInTotals({ supplementFor: '2026-10', supplementStatus: 'approved' })).toBe(true);
    expect(isAccepted({ status: 'Đã nghiệm thu', supplementFor: '2026-10', supplementStatus: 'pending' })).toBe(false);
    expect(isAccepted({ status: 'Đã nghiệm thu', supplementFor: '2026-10', supplementStatus: 'approved' })).toBe(true);
  });
  it('counts, badge, key, decision patch', () => {
    const c = suppCounts([{ supplementFor: '2026-10' }, { supplementFor: '2026-10', supplementStatus: 'approved' }, { month: '2026-11' }]);
    expect(c['2026-10']).toEqual({ pending: 1, approved: 1, rejected: 0, total: 2 });
    expect(suppBadge({ supplementFor: '2026-10' })).toBe('Bổ sung T10');
    expect(suppKeySuffix({ supplementFor: '2026-10' })).toBe('_bs');
    expect(suppKeySuffix({})).toBe('');
    const p = suppDecisionPatch({ supplementFor: '2026-10', supplementHistory: [{ to: 'pending' }] }, 'approved', { email: 'a@x' }, '', 'T');
    expect(p.supplementStatus).toBe('approved');
    expect(p.supplementHistory).toHaveLength(2);
    expect(p.supplementHistory[1]).toMatchObject({ from: 'pending', to: 'approved', by: 'a@x' });
  });
});

import { suppViewLabel } from '../lib/vnext/ntSupplement';
import { activeLock, normLocks } from '../lib/vnext/platform';
describe('ntSupplement — hiển thị & ô tick theo kỳ mở', () => {
  it('suppViewLabel: pending / rejected kèm lý do / bản thường rỗng', () => {
    expect(suppViewLabel({ supplementFor: '2026-09' })).toBe('Bổ sung T9 · Chờ duyệt');
    expect(suppViewLabel({ supplementFor: '2026-09', supplementStatus: 'rejected', supplementNote: 'thiếu HĐ' })).toBe('Bổ sung T9 · Từ chối: thiếu HĐ');
    expect(suppViewLabel({ supplementFor: '2026-09', supplementStatus: 'approved', supplementNote: 'ok' })).toBe('Bổ sung T9 · Đã duyệt');
    expect(suppViewLabel({ month: '2026-10' })).toBe('');
  });
  it('ô tick chỉ khi kỳ NT đang MỞ (21 → hết 26, Tháng này)', () => {
    const locks = normLocks({ open: { nt: { on: true, rec: { on: true, fromDay: 21, fromMin: 0, toDay: 27, toMin: 0, apply: 0, exceptions: [] }, ranges: [] } } });
    const vn = (d: string) => Date.parse(d + '+07:00');
    expect(activeLock(locks, 'nt', '2026-10', vn('2026-10-24T10:00:00'))).toBeNull();
    expect(activeLock(locks, 'nt', '2026-10', vn('2026-10-27T01:00:00'))).not.toBeNull();
    expect(activeLock(locks, 'nt', '2026-10', vn('2026-10-15T10:00:00'))).not.toBeNull();
    expect(activeLock(locks, 'nt', '2026-09', vn('2026-10-24T10:00:00'))).not.toBeNull();
  });
});

import { suppIn, suppMonths, ntDeniedMsg } from '../lib/vnext/ntSupplement';
describe('ntSupplement v3 — bản bổ sung mới, kỳ gốc', () => {
  it('approved counts (in original kỳ); months list; suppIn fallback', () => {
    const r = { supplementFor: '2026-09', supplementIn: '2026-10', supplementStatus: 'approved', month: '2026-09' };
    expect(ntCountsInTotals(r)).toBe(true);
    expect(ntCountsInTotals({ ...r, supplementStatus: 'pending' })).toBe(false);
    expect(suppBadge(r)).toBe('Bổ sung T9');
    expect(suppIn({ month: '2026-10' })).toBe('2026-10');
    expect(suppIn(r)).toBe('2026-10');
    expect(suppMonths('2026-10', 3)).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(suppMonths('2026-10').length).toBe(12);
  });
  it('permission-denied → clear lock message', () => {
    expect(ntDeniedMsg({ code: 'permission-denied' }, '2026-09')).toContain('Kỳ tháng 9/2026 đã khoá');
    expect(ntDeniedMsg({ code: 'unavailable' })).toBeNull();
  });
});

import { suppMissingFiles, suppMissingBadge } from '../lib/vnext/ntSupplement';
describe('Cách 2: thiếu ảnh / hoá đơn', () => {
  it('messages', () => {
    expect(suppMissingFiles(0, 0)).toContain('Chưa đủ ảnh Nghiệm thu và Hoá đơn');
    expect(suppMissingFiles(1, 0)).toContain('Hoá đơn');
    expect(suppMissingFiles(0, 2)).toContain('ảnh');
    expect(suppMissingFiles(1, 1)).toBe('');
    expect(suppMissingBadge(0, 0)).toBe('Thiếu ảnh + HĐ');
    expect(suppMissingBadge(3, 1)).toBe('');
  });
});
