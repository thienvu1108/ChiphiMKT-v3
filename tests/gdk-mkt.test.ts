import { describe, it, expect } from 'vitest';
import { summarizeBlock, userNsByProject, nsLineId, canRegisterAsKhoi, type NsLine } from '../lib/vnext/budget';
import { khoiRegistrants, KHOI_REG_TEAM, rollup } from '../lib/vnext/weekly';
import { fitContain } from '../lib/vnext/fitImage';
import { buildSlides, type DeckData } from '../src/vnext/ntDeck';

const L = (x: Partial<NsLine>): NsLine => ({ id: Math.random().toString(36), period: '2026-11', projectId: 'P1', amount: 0, kind: 'user', ...x } as NsLine);

describe('GĐ Khối Đăng ký MKT', () => {
  const lines = [
    L({ kind: 'user', teamId: 'T1', blockId: 'B1', ownerUid: 'u1', amount: 10 }),
    L({ kind: 'khoi', blockId: 'B1', ownerUid: 'k1', ownerName: 'GĐK 1', amount: 40 }),
    L({ kind: 'khoi', blockId: 'B1', ownerUid: 'k1', projectId: 'P2', amount: 5 }),
    L({ kind: 'khoi', blockId: 'B2', ownerUid: 'k2', amount: 7 }),
    L({ kind: 'khoi', blockId: 'B1', ownerUid: 'k3', amount: 9, deleted: true }),
    L({ kind: 'gdk', blockId: 'B1', amount: 100 }), // bổ sung GĐK cũ vẫn tính
  ];
  it('id dòng', () => expect(nsLineId('khoi', '2026-11', 'B1', 'P1', 'k1')).toBe('g_2026-11_B1_P1_k1'));
  it('GĐ Khối + Trợ lý Khối', () => { expect(canRegisterAsKhoi('gd_khoi')).toBe(true); expect(canRegisterAsKhoi('tro_ly_khoi')).toBe(true); expect(canRegisterAsKhoi('gdkd')).toBe(false); });
  it('tính vào NS Khối', () => {
    const s = summarizeBlock(lines, '2026-11', 'B1', ['T1']);
    expect(s.phong).toBe(10); expect(s.gdk).toBe(145); expect(s.total).toBe(155);
  });
  it('NS báo cáo tuần của GĐK lấy từ dòng khoi', () => {
    const m = userNsByProject(lines, '2026-11', 'k1');
    expect(m.get('P1')).toBe(40); expect(m.get('P2')).toBe(5);
  });
  it('GĐK đã đăng ký phải nộp báo cáo (khoiRegistrants + rollup expected)', () => {
    const r = khoiRegistrants(lines, '2026-11', ['B1']);
    expect(r.map((x) => x.uid)).toEqual(['k1']);
    expect(r[0].teamId).toBe(KHOI_REG_TEAM);
    expect(khoiRegistrants(lines, '2026-11').map((x) => x.uid).sort()).toEqual(['k1', 'k2']);
    const res = rollup({ period: '2026-11', dot: 1, users: r, reports: [], nsByUser: new Map([['k1', userNsByProject(lines, '2026-11', 'k1')]]) });
    expect(res.total.expected).toBe(1); expect(res.total.submitted).toBe(0);
  });
});

describe('Nghiệm thu: 1 ảnh / slide, giữ tỉ lệ', () => {
  it('fitContain giữ tỉ lệ, căn giữa, nằm trong khung', () => {
    const box = { x: 0.4, y: 1.3, w: 9.2, h: 4.1 };
    for (const [w, h] of [[4000, 3000], [1080, 1920], [1920, 1080], [500, 500]]) {
      const f = fitContain(w, h, box);
      expect(Math.abs(f.w / f.h - w / h)).toBeLessThan(1e-9);
      expect(f.w).toBeLessThanOrEqual(box.w + 1e-9); expect(f.h).toBeLessThanOrEqual(box.h + 1e-9);
      expect(Math.abs((f.x - box.x) - (box.x + box.w - f.x - f.w))).toBeLessThan(1e-9);
      expect(Math.abs((f.y - box.y) - (box.y + box.h - f.y - f.h))).toBeLessThan(1e-9);
    }
  });
  it('buildSlides: mỗi ảnh 1 slide', () => {
    const d = { title: '', scopeLabel: '', periodLabel: '', groups: [], projects: [], total: { cost: 0, leads: 0 },
      records: [{ id: 'r1', code: '1', user: 'A', team: 'T', block: 'B', project: 'P', projectId: 'P', cost: 0, leads: 0, groups: [] }],
      images: [1, 2, 3, 4, 5].map((n) => ({ id: 'i' + n, recordId: 'r1', order: n, provider: 'x', ref: '' })) } as DeckData;
    const rec = buildSlides(d).filter((s) => s.kind === 'record');
    expect(rec.length).toBe(5); expect(rec.every((s) => s.images!.length === 1)).toBe(true);
  });
});
