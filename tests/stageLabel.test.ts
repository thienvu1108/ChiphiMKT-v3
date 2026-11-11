import { describe, it, expect } from 'vitest';
import { stageOf, stageLabel, STAGE_LABEL, splitByBucket } from '../lib/vnext/stageLabel';

const line: any = { id: 'l1', kind: 'user', period: '2026-11', amount: 1000, ownerUid: 'u', blockId: 'b', projectId: 'p', updatedAt: '2026-11-02T00:00:00Z' };
const after = '2026-11-03T00:00:00.000Z';

describe('stageLabel', () => {
  it('GĐK stage', () => {
    expect(stageLabel('pending', line, undefined)).toBe('Chờ GĐK duyệt');
    expect(stageLabel('reapproval', line, { status: 'approved', amount: 900, decidedAt: after } as any)).toBe('Chờ GĐK duyệt lại');
  });
  it('Ban stage after GĐK approved', () => {
    const s: any = { status: 'approved', amount: 1000, decidedAt: after, banStatus: 'pending' };
    expect(stageOf('approved', line, s)).toBe('ban_pending');
    expect(stageLabel('approved', line, s)).toBe('Chờ Ban KD duyệt');
    expect(stageLabel('approved', line, { ...s, banDecidedAt: after })).toBe('Chờ Ban KD duyệt lại');
  });
  it('Ban approved / rejected unchanged', () => {
    expect(stageLabel('approved', line, { status: 'approved', amount: 1000, decidedAt: after, banStatus: 'approved' } as any)).toBe('Ban KD đã duyệt');
    expect(stageLabel('rejected', line, { status: 'rejected', amount: 1000, decidedAt: after } as any)).toBe('Từ chối');
  });
});

describe('splitByBucket', () => {
  it('splits approved into Khối đã duyệt / Ban KD đã duyệt; totals add up', () => {
    const l2 = { ...line, id: 'l2', amount: 500 }, l3 = { ...line, id: 'l3', amount: 200 }, l4 = { ...line, id: 'l4', amount: 70 };
    const rows: any[] = [
      { line, status: 'approved', s: { status: 'approved', amount: 1000, decidedAt: after, banStatus: 'pending' } },
      { line: l2, status: 'approved', s: { status: 'approved', amount: 500, decidedAt: after, banStatus: 'approved' } },
      { line: l3, status: 'pending', s: undefined },
      { line: l4, status: 'approved', s: { status: 'approved', amount: 70, decidedAt: after, banStatus: 'rejected', banReason: 'abc' } },
    ];
    const o = splitByBucket(rows);
    expect(o.khoi_ok).toEqual({ n: 1, amount: 1000 });
    expect(o.approved).toEqual({ n: 1, amount: 500 });
    expect(o.pending).toEqual({ n: 1, amount: 200 });
    expect(o.rejected).toEqual({ n: 1, amount: 70 });
    expect(o.total).toBe(1770); expect(o.n).toBe(4);
  });
});
