import { describe, it, expect } from 'vitest';
import { coImplementerOf } from '../src/components/acceptance/acceptanceUtils';

const lines = [
  { ownerUid: 'u1', projectId: 'p1', period: '2026-12', coImplementer: 'Nguyễn Văn A' },
  { ownerUid: 'u1', projectId: 'p2', period: '2026-12', coImplementer: 'Trần Thị B' },
  { ownerUid: 'u2', projectId: 'p1', period: '2026-12', coImplementer: '' },
  { ownerUid: 'u1', projectId: 'p1', period: '2026-12', coImplementer: 'Đã xoá', deleted: true },
];

describe('coImplementerOf — đồng bộ Người cùng triển khai từ Đăng ký MKT', () => {
  it('khớp Người phụ trách + Dự án + kỳ (nhãn tháng MM.YYYY)', () => {
    expect(coImplementerOf({ implementerUid: 'u1', projectId: 'p1', month: '12.2026' }, lines)).toBe('Nguyễn Văn A');
    expect(coImplementerOf({ implementerUid: 'u1', projectId: 'p2', month: '2026-12' }, lines)).toBe('Trần Thị B');
  });
  it('bỏ qua dòng đã xoá', () => {
    // u1/p1 còn 1 dòng sống "Nguyễn Văn A" (dòng deleted bị loại)
    expect(coImplementerOf({ implementerUid: 'u1', projectId: 'p1', month: '2026-12' }, lines)).toBe('Nguyễn Văn A');
  });
  it('không có đăng ký khớp → rỗng', () => {
    expect(coImplementerOf({ implementerUid: 'u9', projectId: 'p1', month: '2026-12' }, lines)).toBe('');
    expect(coImplementerOf({ implementerUid: 'u1', projectId: 'p1', month: '2026-11' }, lines)).toBe('');
  });
  it('Người phụ trách tự nhập (manual) hoặc thiếu định danh → rỗng', () => {
    expect(coImplementerOf({ implementerUid: 'u1', projectId: 'p1', month: '2026-12', implementerManual: true }, lines)).toBe('');
    expect(coImplementerOf({ projectId: 'p1', month: '2026-12' }, lines)).toBe('');
    expect(coImplementerOf({ implementerUid: 'u1', month: '2026-12' }, lines)).toBe('');
  });
});
