import { describe, it, expect } from 'vitest';
import { splitByStatus } from '../lib/vnext/support';
import { adaptNs, adaptLegacy, aggregate, summarize, lineStatus, legacyKey, ST5_ORDER, ST_META } from '../lib/vnext/status';
const L = (id: string, kind: any, owner: string, amount: number, x: any = {}): any => ({ id, kind, ownerUid: owner, amount, period: '2026-11', projectId: 'P1', blockId: 'B1', teamId: 'T1', ...x });
const S = (st: string, amount: number, x: any = {}): any => ({ status: st, amount, decidedAt: '2026-10-20T00:00:00Z', ...x });
const pay = { u: { has: true }, v: { has: false }, g: { has: true } } as any;
const lines = [L('1', 'user', 'u', 10), L('2', 'user', 'v', 20), L('3', 'khoi', 'g', 30, { blockId: 'B2' }), L('4', 'user', 'u', 40, { teamId: 'T2' }), L('5', 'user', 'v', 50)];
const sup: any = { '1': S('approved', 10), '2': S('approved', 20), '4': S('approved', 10), '5': S('rejected', 50) };

describe('bộ máy 5 trạng thái', () => {
  it('ưu tiên Từ chối > Chờ STK > Cần duyệt lại > Đã duyệt > Chờ duyệt', () => {
    expect(lineStatus(lines[4], sup['5'], false)).toBe('rejected');
    expect(lineStatus(lines[1], sup['2'], false)).toBe('need_pay');
    expect(lineStatus(L('x', 'user', 'v', 9), S('approved', 5), false)).toBe('need_pay'); // Chờ STK thắng Cần duyệt lại
    expect(lineStatus(lines[3], sup['4'], true)).toBe('reapproval');
    expect(lineStatus(lines[2], undefined, true)).toBe('approved');   // NS Khối tự duyệt
    expect(lineStatus(L('y', 'user', 'u', 1), undefined, true)).toBe('pending');
  });
  it('màu/nhãn đủ 5 + khoá/xoá', () => {
    expect(ST5_ORDER.map((k) => ST_META[k].label)).toEqual(['Đã duyệt', 'Chờ duyệt', 'Cần duyệt lại', 'Chờ STK', 'Từ chối']);
    expect(ST_META.locked.fg).toBe(ST_META.deleted.fg);
  });
  it('splitByStatus == summarize(adaptNs) (mọi màn cùng 1 số)', () => {
    const sp = splitByStatus(lines, sup, pay); const sm = summarize(adaptNs(lines, sup, pay));
    expect(sp.total).toBe(sm.total);
    for (const k of ST5_ORDER) expect(sp[k]).toEqual(sm.by[k]);
    expect(sm.by.approved.amount + sm.by.pending.amount + sm.by.reapproval.amount + sm.by.need_pay.amount + sm.by.rejected.amount).toBe(sm.total);
  });
  it('aggregate theo Khối / Phòng / người / tháng: tổng các nhóm == tổng chung', () => {
    const rows = adaptNs(lines, sup, pay); const all = summarize(rows);
    for (const by of ['blockId', 'teamId', 'ownerUid', 'period', 'projectId'] as const) {
      const g = [...aggregate(rows, by).values()];
      expect(g.reduce((a, s) => a + s.total, 0)).toBe(all.total);
      expect(g.reduce((a, s) => a + s.n, 0)).toBe(all.n);
    }
    expect(aggregate(rows, 'blockId').get('B2')!.by.approved.amount).toBe(30);
  });
  it('adapter kỳ cũ: chỉ ≤ 10/2026, bỏ xoá/0đ, chuẩn hoá tháng', () => {
    expect(legacyKey('05/2026')).toBe('2026-05'); expect(legacyKey('2026-5')).toBe('2026-05'); expect(legacyKey('x')).toBe('');
    const r = adaptLegacy([{ id: 'a', month: '2026-10', amount: 5, teamId: 'T1' }, { id: 'b', month: '2026-11', amount: 5 }, { id: 'c', month: '2026-09', amount: 0 }, { id: 'd', month: '2026-09', amount: 3, deleted: true }],
      [{ id: 'k', month: '09/2026', approvedAmount: 7, blockId: 'B1' }], [], () => 'B9');
    expect(r.map((x) => x.id)).toEqual(['legacy_user:a', 'legacy_khoi:k']);
    expect(r[0].blockId).toBe('B9'); expect(r.every((x) => x.status === 'approved')).toBe(true);
  });
});
