import { describe, it, expect } from 'vitest';
import { effectiveSupportPct, projectLabelWithPct, pushPctHistory, validPct, banOfProject, pctAtCutoff, baseSupportPctAtPeriod, excelSupportPctFields, EXCEL_PCT_COL, EXCEL_PCT_NOTE_COL, EXCEL_PCT_FALLBACK_NOTE } from '../lib/vnext/supportPct';
import { periodEndIso } from '../lib/vnext/period';
import { isBanKdManager, isBanKdDeputy, isBanKdLeader } from '../src/lib/orgPermissions';
import { vnDefaultPerms } from '../lib/vnext/featureRegistry';

const bans = [{ id: 'B1', name: 'Ban A', supportPct: 30 }, { id: 'B2', name: 'Ban B' }];
describe('Tỉ lệ hỗ trợ MKT', () => {
  it('riêng dự án > Ban > chưa đặt', () => {
    expect(effectiveSupportPct({ banKdId: 'B1', supportPct: 50 }, bans)).toEqual({ pct: 50, source: 'project' });
    expect(effectiveSupportPct({ banKdId: 'B1' }, bans)).toEqual({ pct: 30, source: 'ban' });
    expect(effectiveSupportPct({ banKdId: 'B1', supportPct: null }, bans)).toEqual({ pct: 30, source: 'ban' });
    expect(effectiveSupportPct({ banKdId: 'B2' }, bans)).toBeNull();
    expect(effectiveSupportPct({ banKdName: 'ban a' }, bans)?.pct).toBe(30);
    expect(effectiveSupportPct({ banKdId: 'B2', supportPct: 0 }, bans)).toEqual({ pct: 0, source: 'project' });
  });
  it('nhãn ô chọn dự án', () => {
    expect(projectLabelWithPct({ name: 'Dự án X', banKdId: 'B1' }, bans)).toBe('Dự án X · Hỗ trợ MKT 30%');
    expect(projectLabelWithPct({ name: 'Dự án Y', banKdId: 'B1', supportPct: 12.5 }, bans)).toBe('Dự án Y · Hỗ trợ MKT 12,5%');
    expect(projectLabelWithPct({ name: 'Dự án Z', banKdId: 'B2' }, bans)).toBe('Dự án Z');
  });
  it('kiểm tra & lịch sử', () => {
    expect(validPct(101)).toBe(false); expect(validPct(-1)).toBe(false); expect(validPct('5')).toBe(false); expect(validPct(100)).toBe(true);
    const h = Array.from({ length: 120 }, (_, i) => ({ at: String(i), byUid: 'a', byName: 'a', from: null, to: i, scope: 'ban' as const }));
    expect(pushPctHistory(h, h[0]).length).toBe(100);
    expect(banOfProject({ banKdId: 'B2' }, bans)?.name).toBe('Ban B');
  });
});

describe('Base % theo kỳ', () => {
  it('periodEndIso = cuối 20/M giờ VN', () => {
    expect(periodEndIso('2026-11')).toBe('2026-11-20T16:59:59.999Z');
  });
  it('pctAtCutoff: lịch sử trước kỳ / sau kỳ / hiện tại', () => {
    const cut = periodEndIso('2026-11');
    const hist = [
      { at: '2026-09-01T00:00:00.000Z', from: null, to: 40, scope: 'project' },
      { at: '2026-11-25T00:00:00.000Z', from: 40, to: 55, scope: 'project' }, // sau kỳ 11
    ];
    expect(pctAtCutoff(hist, 55, cut)).toEqual({ value: 40, usedCurrent: false }); // còn 40 trong kỳ 11
    expect(pctAtCutoff([{ at: '2026-12-01T00:00:00.000Z', from: 25, to: 30, scope: 'project' }], 30, cut)).toEqual({ value: 25, usedCurrent: false }); // from của lần đổi sau = kỳ trước
    expect(pctAtCutoff([], 50, cut)).toEqual({ value: 50, usedCurrent: true });
    expect(pctAtCutoff([{ at: '2026-10-01T00:00:00.000Z', from: 10, to: null, scope: 'project', kind: 'pct' }], 50, cut)).toEqual({ value: null, usedCurrent: false });
    expect(pctAtCutoff([{ at: '2026-10-01T00:00:00.000Z', from: 10, to: 20, kind: 'max' }], 50, cut)).toEqual({ value: 50, usedCurrent: true }); // bỏ max
  });
  it('baseSupportPctAtPeriod: project > ban; fallback current', () => {
    const bans = [{ id: 'B1', name: 'Ban A', supportPct: 30, supportPctHistory: [{ at: '2026-08-01T00:00:00.000Z', from: null, to: 30, scope: 'ban' }] }];
    const p = { id: 'P1', banKdId: 'B1', supportPct: 55, supportPctHistory: [
      { at: '2026-09-01T00:00:00.000Z', from: null, to: 40, scope: 'project' },
      { at: '2026-11-25T00:00:00.000Z', from: 40, to: 55, scope: 'project' },
    ]};
    expect(baseSupportPctAtPeriod(p, bans, '2026-11')).toEqual({ pct: 40, source: 'project' });
    expect(baseSupportPctAtPeriod({ banKdId: 'B1' }, bans, '2026-11')).toEqual({ pct: 30, source: 'ban' });
    expect(baseSupportPctAtPeriod({ banKdId: 'B1', supportPct: 12 }, bans, '2026-11')).toMatchObject({ pct: 12, source: 'project', fallback: 'current' });
    expect(baseSupportPctAtPeriod({ banKdId: 'Bx' }, [{ id: 'Bx', name: 'X' }], '2026-11')).toBeNull();
  });
});
describe('Excel xuất tỉ lệ hỗ trợ MKT', () => {
  it('cột số % ngay sau Dự án; ghi chú khi fallback current; khớp projectId', () => {
    const bans = [{ id: 'B1', name: 'Ban A', supportPct: 30, supportPctHistory: [{ at: '2026-08-01T00:00:00.000Z', from: null, to: 30, scope: 'ban' }] }];
    const pHist = { id: 'P1', banKdId: 'B1', supportPct: 55, supportPctHistory: [
      { at: '2026-09-01T00:00:00.000Z', from: null, to: 40, scope: 'project' },
      { at: '2026-11-25T00:00:00.000Z', from: 40, to: 55, scope: 'project' },
    ]};
    const ok = excelSupportPctFields(pHist, bans, '2026-11');
    expect(ok[EXCEL_PCT_COL]).toBe(40);
    expect(ok[EXCEL_PCT_NOTE_COL]).toBe('');
    // Không lịch sử → fallback current + ghi chú *
    const fb = excelSupportPctFields({ id: 'P2', banKdId: 'B1', supportPct: 12 }, bans, '2026-11');
    expect(fb[EXCEL_PCT_COL]).toBe(12);
    expect(fb[EXCEL_PCT_NOTE_COL]).toBe(EXCEL_PCT_FALLBACK_NOTE);
    // Chưa đặt
    const empty = excelSupportPctFields({ id: 'P3', banKdId: 'Bx' }, [{ id: 'Bx', name: 'X' }], '2026-11');
    expect(empty[EXCEL_PCT_COL]).toBe('');
    expect(empty[EXCEL_PCT_NOTE_COL]).toBe('');
    // Ban fallback khi dự án không có % riêng
    const banOnly = excelSupportPctFields({ id: 'P4', banKdId: 'B1' }, bans, '2026-11');
    expect(banOnly[EXCEL_PCT_COL]).toBe(30);
    // Thứ tự cột: Dự án → tỉ lệ → NS (mô phỏng json_to_sheet keys)
    const row = { 'Dự án': 'VH Ocean', ...excelSupportPctFields(pHist, bans, '2026-11'), 'Ngân sách đăng ký (đ)': 1e7 };
    expect(Object.keys(row)).toEqual(['Dự án', EXCEL_PCT_COL, EXCEL_PCT_NOTE_COL, 'Ngân sách đăng ký (đ)']);
  });
});

describe('Trưởng Ban / Phó Ban', () => {
  const ban = { id: 'B1', leaderUid: 'L', deputyUids: ['D1', 'D2'] };
  it('nhận diện', () => {
    expect(isBanKdLeader(ban, { uid: 'L' })).toBe(true);
    expect(isBanKdDeputy(ban, { uid: 'D2' })).toBe(true);
    expect(isBanKdManager(ban, { uid: 'D1' })).toBe(true);
    expect(isBanKdManager(ban, { uid: 'X' })).toBe(false);
  });
  it('registry: Trợ lý Khối Đăng ký MKT + Báo cáo tuần; không còn bổ sung NS', () => {
    for (const r of ['gd_khoi', 'tro_ly_khoi'] as const) { expect(vnDefaultPerms(r)).toContain('vn.ns.khoi_register'); expect(vnDefaultPerms(r)).toContain('vn.weekly.submit'); }
    expect(vnDefaultPerms('admin')).not.toContain('vn.ns.block_edit');
    expect(vnDefaultPerms('truong_ban_kd')).toContain('vn.bankd.projects');
    expect(vnDefaultPerms('user')).toContain('vn.bankd.support_pct');
  });
});
import { cdtNameOf } from '../src/vnext/BanKdPanels';
describe('CĐT của dự án', () => {
  it('tên CĐT theo id, rơi về cdtName', () => {
    expect(cdtNameOf({ cdtId: 'C1', cdtName: 'cũ' }, [{ id: 'C1', name: 'Mới' }])).toBe('Mới');
    expect(cdtNameOf({ cdtId: 'C9', cdtName: 'cũ' }, [])).toBe('cũ');
    expect(cdtNameOf({}, [])).toBe('');
    expect(vnDefaultPerms('admin')).toContain('vn.cdt.manage'); expect(vnDefaultPerms('truong_ban_kd')).not.toContain('vn.cdt.manage');
  });
});
