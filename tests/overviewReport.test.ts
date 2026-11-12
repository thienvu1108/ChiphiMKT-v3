import { describe, expect, it } from 'vitest';
import { buildOverview } from '../lib/vnext/overviewReport';

const blocks = [{ id: 'B1', name: 'Khối 1' }, { id: 'B2', name: 'Khối 2' }];
const teams = [{ id: 'T1', blockId: 'B1' }];
const bans = [{ id: 'BANA', name: 'Ban A', supportPct: 10 }];
const projects = [
  { id: 'P1', name: 'DA1', banKdId: 'BANA' },             // hỗ trợ theo Ban = 10%
  { id: 'P2', name: 'DA2', banKdId: 'BANA', supportPct: 20 }, // hỗ trợ riêng 20%
];
const nsLines = [
  { id: 'n1', kind: 'user', period: '2026-11', teamId: 'T1', ownerUid: 'u1', projectId: 'P1', amount: 100 }, // → Khối B1
  { id: 'n2', kind: 'khoi', period: '2026-11', blockId: 'B2', ownerUid: 'g1', projectId: 'P2', amount: 200 },
];
const acceptances = [
  { id: 'a1', status: 'Đã nghiệm thu', month: '2026-11', blockId: 'B1', projectId: 'P1', digitalFb: 60, caNhanNopTien: 5 },  // cost 60, ratio 0.6
  { id: 'a2', status: 'Đã nghiệm thu', month: '2026-11', blockId: 'B2', projectId: 'P2', digitalFb: 200, caNhanNopTien: 10 }, // cost 200, ratio 1.0
  { id: 'a3', status: 'Chưa', month: '2026-11', blockId: 'B1', projectId: 'P1', digitalFb: 999 }, // không tính
];
const canBanLines = [
  { month: '2026-11', blockId: 'B1', projectId: 'P1', soLuong: 2 },
  { month: '2026-10', blockId: 'B1', projectId: 'P1', soLuong: 9 }, // kỳ khác → bỏ
];

const ov = () => buildOverview({ period: '2026-11', nsLines, nsSupport: {}, acceptances, canBanLines, projects, bans, blocks, teams });

describe('buildOverview — tổng quan', () => {
  it('tổng NS đăng ký / thực chạy / hỗ trợ / lead / căn bán / CP·căn', () => {
    const t = ov().totals;
    expect(t.nsReg).toBe(300);          // 100 + 200
    expect(t.cost).toBe(260);           // 60 + 200
    expect(t.support).toBe(46);         // P1 60×10% + P2 200×20% = 6 + 40
    expect(t.leads).toBe(15);           // 5 + 10
    expect(t.canBan).toBe(2);
    expect(t.cpl).toBe(Math.round(260 / 15));   // 17
    expect(t.cpPerUnit).toBe(130);              // 260 / 2
  });
});

describe('buildOverview — theo Khối', () => {
  it('số Khối trong/ngoài NS + danh sách tỉ lệ thấp', () => {
    const o = ov();
    expect(o.blocksInBudget).toBe(1);   // B2 ratio 1.0 ∈ [0.7,1.5]
    expect(o.blocksOutBudget).toBe(1);  // B1 ratio 0.6 < 0.7
    expect(o.blocksLowRatio.map((b) => b.blockId)).toEqual(['B1']);
    expect(o.blocksLowRatio[0].ratio).toBeCloseTo(0.6, 5);
  });
  it('mục 3/4: Khối có / chưa có căn bán', () => {
    const o = ov();
    expect(o.blocksWithSales.map((b) => b.blockId)).toEqual(['B1']);
    expect(o.blocksWithSales[0].cpPerUnit).toBe(30); // 60 / 2
    expect(o.blocksNoSales.map((b) => b.blockId)).toEqual(['B2']);
    expect(o.blocksNoSales[0].cost).toBe(200);
    expect(o.blocksNoSales[0].cpl).toBe(20); // 200 / 10 lead
  });
});

describe('buildOverview — Dự án & Ban', () => {
  it('dự án có / chưa có căn bán', () => {
    const o = ov();
    expect(o.projectsWithSales.map((p) => p.projectId)).toEqual(['P1']);
    expect(o.projectsNoSales.map((p) => p.projectId)).toEqual(['P2']);
  });
  it('gộp theo Ban KD (suy từ dự án)', () => {
    const o = ov();
    expect(o.bans).toHaveLength(1);
    const a = o.bans[0];
    expect(a.banId).toBe('BANA');
    expect(a.nsReg).toBe(300);
    expect(a.cost).toBe(260);
    expect(a.canBan).toBe(2);
    expect(a.ratio).toBeCloseTo(260 / 300, 5);
  });
});
