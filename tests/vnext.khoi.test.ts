import { describe, it, expect } from 'vitest';
import { summarizeBlock, blockTeamIds, type NsLine } from '../lib/vnext/budget';
import { khoiScope } from '../lib/vnext/khoiScope';

const L = (p: Partial<NsLine>): NsLine => ({ id: Math.random().toString(36), period: '2026-11', projectId: 'P1', amount: 0, ...p } as any);

describe('NS Khối = Σ NS Phòng (user + bổ sung GĐKD) + bổ sung GĐK', () => {
  const lines = [
    L({ kind: 'user', teamId: 'T1', blockId: 'B1', amount: 100 }),
    L({ kind: 'user', teamId: 'T1', blockId: 'B1', amount: 200, projectId: 'P2' }),
    L({ kind: 'gdkd', teamId: 'T1', blockId: 'B1', amount: 900 }),
    L({ kind: 'user', teamId: 'T2', blockId: 'B1', amount: 50 }),
    L({ kind: 'gdk', blockId: 'B1', amount: 1000 }),
    L({ kind: 'user', teamId: 'T9', blockId: 'B2', amount: 7 }),        // Khối khác
    L({ kind: 'user', teamId: 'T1', blockId: 'B1', amount: 5, period: '2026-12' }), // kỳ khác
    L({ kind: 'user', teamId: 'T1', blockId: 'B1', amount: 999, deleted: true } as any),
  ];
  it('tổng hợp đúng', () => {
    const s = summarizeBlock(lines, '2026-11', 'B1', ['T1', 'T2']);
    expect(s.phong).toBe(1250); expect(s.gdk).toBe(1000); expect(s.total).toBe(2250);
  });
  it('dòng user mới cập nhật NS Khối ngay (live)', () => {
    const s = summarizeBlock([...lines, L({ kind: 'user', teamId: 'T2', blockId: 'B1', amount: 10 })], '2026-11', 'B1', ['T1', 'T2']);
    expect(s.total).toBe(2260);
  });
  it('Phòng chuyển Khối giữa kỳ: dòng cũ vẫn tính cho Khối cũ, không tính trùng', () => {
    const ids = blockTeamIds(lines, '2026-11', 'B1', ['T2']); // T1 đã sang Khối khác
    expect(ids.sort()).toEqual(['T1', 'T2']);
    expect(summarizeBlock(lines, '2026-11', 'B1', ids).total).toBe(2250);
    expect(summarizeBlock(lines, '2026-11', 'B2', ['T1', 'T9']).phong).toBe(7);
  });
});

describe('khoiScope', () => {
  const all = ['B1', 'B2', 'B3'];
  it('GĐK chỉ Khối mình, bỏ qua Khối đang chọn ngoài phạm vi', () => {
    const s = khoiScope('gd_khoi', ['B2'], all, 'B1');
    expect(s.allowed).toEqual(['B2']); expect(s.selected).toBe('B2'); expect(s.canSwitch).toBe(false);
  });
  it('Admin/Mod/Kế toán/Trưởng ban theo Khối đang chọn', () => {
    for (const r of ['admin', 'mod', 'accountant', 'truong_ban_kd']) expect(khoiScope(r, [], all, 'B3').selected).toBe('B3');
  });
  it('vai trò khác không có Khối', () => { expect(khoiScope('user', ['B1'], all).allowed).toEqual([]); });
});
