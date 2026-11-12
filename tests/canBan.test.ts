import { describe, expect, it } from 'vitest';
import {
  canBanDocId, canBanOf, parseCanBanQty, sumCanBanByBan, sumCanBanByBlock, sumCanBanByProject,
  validCanBanQty, type CanBanLine,
} from '../lib/vnext/canBan';

const cb = (p: Partial<CanBanLine>): CanBanLine => ({ month: '2026-11', blockId: 'B1', projectId: 'P1', soLuong: 1, ...p });

describe('canBan — id & nhập liệu', () => {
  it('docId ổn định theo (month, block, project)', () => {
    expect(canBanDocId('2026-11', 'B1', 'P1')).toBe('cb_2026-11__B1__P1');
  });
  it('validCanBanQty: nguyên ≥ 0', () => {
    expect(validCanBanQty(0)).toBe(true);
    expect(validCanBanQty(5)).toBe(true);
    expect(validCanBanQty(-1)).toBe(false);
    expect(validCanBanQty(1.5)).toBe(false);
  });
  it('parseCanBanQty: rỗng→0, bỏ dấu phân tách, chặn chữ', () => {
    expect(parseCanBanQty('')).toBe(0);
    expect(parseCanBanQty('12')).toBe(12);
    expect(parseCanBanQty('1.200')).toBe(1200);
    expect(parseCanBanQty('1,000')).toBe(1000);
    expect(parseCanBanQty('ab')).toBeNull();
    expect(parseCanBanQty(3)).toBe(3);
    expect(parseCanBanQty(-2)).toBeNull();
  });
});

describe('canBan — tổng hợp', () => {
  const lines: CanBanLine[] = [
    cb({ blockId: 'B1', projectId: 'P1', soLuong: 3 }),
    cb({ blockId: 'B1', projectId: 'P2', soLuong: 2 }),
    cb({ blockId: 'B2', projectId: 'P1', soLuong: 4 }),
    cb({ blockId: 'B2', projectId: 'P3', soLuong: 0 }),
    cb({ month: '2026-10', blockId: 'B1', projectId: 'P1', soLuong: 9 }), // kỳ khác
    cb({ month: '2026-11', blockId: 'B9', projectId: 'Pbad', soLuong: -1 as any }), // không hợp lệ
  ];

  it('canBanOf: đúng ô + đúng kỳ', () => {
    expect(canBanOf(lines, '2026-11', 'B1', 'P1')).toBe(3);
    expect(canBanOf(lines, '2026-11', 'B2', 'P1')).toBe(4);
    expect(canBanOf(lines, '2026-10', 'B1', 'P1')).toBe(9);
    expect(canBanOf(lines, '2026-11', 'B9', 'Pbad')).toBe(0); // soLuong âm → bỏ
  });

  it('sumCanBanByProject: cộng mọi Khối, đúng kỳ', () => {
    const m = sumCanBanByProject(lines, '2026-11');
    expect(m.get('P1')).toBe(7); // 3 (B1) + 4 (B2)
    expect(m.get('P2')).toBe(2);
    expect(m.get('P3')).toBe(0);
  });

  it('sumCanBanByBlock: cộng mọi Dự án, đúng kỳ', () => {
    const m = sumCanBanByBlock(lines, '2026-11');
    expect(m.get('B1')).toBe(5);
    expect(m.get('B2')).toBe(4);
  });

  it('sumCanBanByBan: gộp theo Ban suy từ Dự án', () => {
    const banOf = (pid: string) => (pid === 'P1' ? 'BAN_A' : pid === 'P2' ? 'BAN_B' : '');
    const m = sumCanBanByBan(lines, '2026-11', banOf);
    expect(m.get('BAN_A')).toBe(7); // P1 (3+4)
    expect(m.get('BAN_B')).toBe(2); // P2
    expect(m.has('')).toBe(false);  // P3 không có ban → bỏ
  });
});
