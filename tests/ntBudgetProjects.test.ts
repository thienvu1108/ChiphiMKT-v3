import { describe, expect, it } from 'vitest';
import {
  acceptanceAssigneeUids,
  acceptanceBudgetProjects,
  acceptanceKhoiAssignees,
  clearStaleProject,
  filterAssigneeOptions,
  khoiManagerBlockId,
  ntUsesBudgetProjects,
  personAccountIds,
  projectAllowedForAcceptance,
  type NtBudgetLine,
} from '../lib/vnext/ntBudgetProjects';
import type { Support } from '../lib/vnext/support';

const line = (p: Partial<NtBudgetLine>): NtBudgetLine => ({
  id: 'l1', period: '2026-11', teamId: 'T1', ownerUid: 'u1', projectId: 'P1', kind: 'user', amount: 10, ...p,
});

describe('kỳ nào lấy dự án từ đăng ký NS', () => {
  it('kỳ 10 và trước giữ danh mục đầy đủ', () => {
    expect(ntUsesBudgetProjects('2026-10')).toBe(false);
    expect(ntUsesBudgetProjects('10.2026')).toBe(false);
    expect(acceptanceBudgetProjects({ month: '2026-10', teamId: 'T1', personUid: 'u1', lines: [line({ period: '2026-10' })] })).toBeNull();
  });
  it('kỳ 11, 12 và năm sau thì lọc', () => {
    expect(ntUsesBudgetProjects('2026-11')).toBe(true);
    expect(ntUsesBudgetProjects('11.2026')).toBe(true);
    expect(ntUsesBudgetProjects('2026-12')).toBe(true);
    expect(ntUsesBudgetProjects('2027-01')).toBe(true);
    expect(ntUsesBudgetProjects('Tháng 11/2026')).toBe(true);
  });
});

describe('dự án theo người, phòng, kỳ', () => {
  const lines: NtBudgetLine[] = [
    line({ id: 'a', projectId: 'P1' }),
    line({ id: 'a2', projectId: 'P1', amount: 5 }),
    line({ id: 'b', projectId: 'P2' }),
    line({ id: 'other', ownerUid: 'u2', projectId: 'P9', projectName: 'Cùng tên' }),
    line({ id: 'team2', teamId: 'T2', projectId: 'P3' }),
    line({ id: 'oct', period: '2026-10', projectId: 'P4' }),
    line({ id: 'dec', period: '2026-12', projectId: 'P5' }),
    line({ id: 'next', period: '2027-01', projectId: 'P6' }),
    line({ id: 'gone', deleted: true, projectId: 'P7' }),
    line({ id: 'khoi', kind: 'khoi', projectId: 'P8' }),
    line({ id: 'oldKind', kind: 'gdkd', projectId: 'P9b' }),
  ];

  it('gộp dòng trùng dự án, nhiều dự án, không lấy người khác hay phòng khác', () => {
    const got = acceptanceBudgetProjects({ month: '2026-11', teamId: 'T1', personUid: 'u1', lines });
    expect(got?.map((c) => c.projectId)).toEqual(['P1', 'P2', 'P8']);
    expect(got?.find((c) => c.projectId === 'P1')?.lineIds.sort()).toEqual(['a', 'a2']);
  });

  it('hai người cùng tên hiển thị chỉ khớp ownerUid', () => {
    const got = acceptanceBudgetProjects({ month: '2026-11', teamId: 'T1', personUid: 'u2', lines });
    expect(got?.map((c) => c.projectId)).toEqual(['P9']);
  });

  it('không có đăng ký thì danh sách rỗng', () => {
    expect(acceptanceBudgetProjects({ month: '2026-11', teamId: 'T1', personUid: 'none', lines })).toEqual([]);
    expect(acceptanceBudgetProjects({ month: '2026-11', teamId: '', personUid: 'u1', lines })).toEqual([]);
  });

  it('kỳ 12 và năm sau không kéo dòng kỳ 11', () => {
    expect(acceptanceBudgetProjects({ month: '2026-12', teamId: 'T1', personUid: 'u1', lines })?.map((c) => c.projectId)).toEqual(['P5']);
    expect(acceptanceBudgetProjects({ month: '2027-01', teamId: 'T1', personUid: 'u1', lines })?.map((c) => c.projectId)).toEqual(['P6']);
  });

  it('khớp UID cũ đã chuyển, không khớp tên', () => {
    const ids = personAccountIds({ uid: 'new', id: 'new', migratedFromUid: 'old' }, 'new');
    expect(ids).toContain('old');
    const got = acceptanceBudgetProjects({
      month: '2026-11', teamId: 'T1', personUid: 'new', accountIds: ids,
      lines: [line({ ownerUid: 'old', projectId: 'Pold' }), line({ ownerUid: 'stranger', projectId: 'Px' })],
    });
    expect(got?.map((c) => c.projectId)).toEqual(['Pold']);
  });

  it('từ chối thì loại, chờ duyệt thì giữ', () => {
    const support: Record<string, Partial<Support>> = {
      rej: { status: 'rejected', amount: 10, decidedAt: '2026-11-20T00:00:00.000Z', projectId: 'PR', period: '2026-11', lineId: 'rej' },
      pend: { status: 'pending', amount: 10, projectId: 'PP', period: '2026-11', lineId: 'pend' },
      ban: { status: 'approved', amount: 10, decidedAt: '2026-11-20T00:00:00.000Z', banStatus: 'rejected', projectId: 'PX', period: '2026-11', lineId: 'ban' },
    };
    const rows = [
      line({ id: 'rej', projectId: 'PR' }),
      line({ id: 'pend', projectId: 'PP' }),
      line({ id: 'bare', projectId: 'PB' }),
      line({ id: 'ban', projectId: 'PX' }),
    ];
    expect(acceptanceBudgetProjects({ month: '2026-11', teamId: 'T1', personUid: 'u1', lines: rows, support })?.map((c) => c.projectId)).toEqual(['PB', 'PP']);
  });

  it('đổi kỳ hoặc người thì xoá dự án không còn hợp lệ', () => {
    const choices = acceptanceBudgetProjects({ month: '2026-11', teamId: 'T1', personUid: 'u1', lines });
    expect(clearStaleProject({ projectId: 'P9', projectName: 'X', projectCode: 'C' }, choices)).toEqual({ projectId: '', projectName: '', projectCode: '' });
    expect(clearStaleProject({ projectId: 'P1', projectName: 'Giữ' }, choices).projectId).toBe('P1');
    expect(clearStaleProject({ projectId: 'P9' }, null).projectId).toBe('P9');
    expect(projectAllowedForAcceptance(choices, 'P3')).toBe(false);
    expect(projectAllowedForAcceptance(null, 'P3')).toBe(true);
  });
});

describe('Người phụ trách theo đăng ký NS (kỳ ≥ 2026-11)', () => {
  const lines: NtBudgetLine[] = [
    line({ id: 'u1a', ownerUid: 'u1', projectId: 'P1' }),
    line({ id: 'u1b', ownerUid: 'u1', projectId: 'P2' }),
    line({ id: 'u2a', ownerUid: 'u2', projectId: 'P3', kind: 'khoi' }),
    line({ id: 't2', ownerUid: 'u3', teamId: 'T2', projectId: 'P4' }),
    line({ id: 'oct', ownerUid: 'u4', period: '2026-10', projectId: 'P5' }),
    line({ id: 'gone', ownerUid: 'u5', deleted: true, projectId: 'P6' }),
    line({ id: 'badkind', ownerUid: 'u6', kind: 'gdkd', projectId: 'P7' }),
  ];

  it('kỳ cũ trả null (không lọc)', () => {
    expect(acceptanceAssigneeUids({ month: '2026-10', teamId: 'T1', lines })).toBeNull();
  });

  it('gom ownerUid hợp lệ của đúng Phòng + kỳ, bỏ phòng khác / kỳ khác / đã xoá / kind khác', () => {
    const got = acceptanceAssigneeUids({ month: '2026-11', teamId: 'T1', lines });
    expect(got).not.toBeNull();
    expect([...(got as Set<string>)].sort()).toEqual(['u1', 'u2']);
  });

  it('chưa chọn Phòng hoặc chưa ai đăng ký → Set rỗng', () => {
    expect(acceptanceAssigneeUids({ month: '2026-11', teamId: '', lines })?.size).toBe(0);
    expect(acceptanceAssigneeUids({ month: '2026-11', teamId: 'T9', lines })?.size).toBe(0);
  });

  it('dòng bị từ chối thì loại khỏi Người phụ trách, chờ duyệt vẫn giữ', () => {
    const rows = [
      line({ id: 'rej', ownerUid: 'uR', projectId: 'PR' }),
      line({ id: 'pend', ownerUid: 'uP', projectId: 'PP' }),
    ];
    const support = {
      rej: { status: 'rejected', amount: 10, decidedAt: '2026-11-20T00:00:00.000Z', projectId: 'PR', period: '2026-11', lineId: 'rej' },
      pend: { status: 'pending', amount: 10, projectId: 'PP', period: '2026-11', lineId: 'pend' },
    } as any;
    const got = acceptanceAssigneeUids({ month: '2026-11', teamId: 'T1', lines: rows, support });
    expect([...(got as Set<string>)]).toEqual(['uP']);
  });

  it('filterAssigneeOptions: kỳ cũ giữ nguyên, kỳ mới lọc, khớp UID cũ đã chuyển', () => {
    const opts = [{ uid: 'u1', name: 'A' }, { uid: 'u2', name: 'B' }, { uid: 'x', name: 'X' }];
    expect(filterAssigneeOptions(opts, null)).toHaveLength(3);
    const uids = acceptanceAssigneeUids({ month: '2026-11', teamId: 'T1', lines });
    expect(filterAssigneeOptions(opts, uids).map((o) => o.uid)).toEqual(['u1', 'u2']);
    // 'new' có migratedFromUid 'u2' → khớp dù option mang uid mới
    const optsNew = [{ uid: 'new', name: 'B2' }];
    const users = [{ uid: 'new', id: 'new', migratedFromUid: 'u2' }];
    expect(filterAssigneeOptions(optsNew, uids, users).map((o) => o.uid)).toEqual(['new']);
  });
});

describe('GĐ/Trợ lý Khối: đăng ký khoi gắn theo Khối (không teamId)', () => {
  // Dòng khoi thực tế: có blockId, KHÔNG có teamId (GĐK không thuộc Phòng nào).
  const kLine = (p: Partial<NtBudgetLine>): NtBudgetLine => ({
    id: 'k1', period: '2026-11', kind: 'khoi', blockId: 'B1', ownerUid: 'g1', ownerName: 'GĐ Khối A', projectId: 'PK1', amount: 20, ...p,
  });
  const lines: NtBudgetLine[] = [
    kLine({ id: 'k1', projectId: 'PK1' }),
    kLine({ id: 'k2', projectId: 'PK2' }),
    kLine({ id: 'kOtherBlock', blockId: 'B2', projectId: 'PK9' }),
    kLine({ id: 'kOct', period: '2026-10', projectId: 'PKold' }),
    line({ id: 'teamUser', teamId: 'T1', ownerUid: 'u1', projectId: 'P1' }), // thành viên Phòng
  ];

  it('acceptanceKhoiAssignees: liệt kê GĐK/TLK của đúng Khối + kỳ, kèm blockId + tên từ dòng', () => {
    expect(acceptanceKhoiAssignees({ month: '2026-10', blockId: 'B1', lines })).toBeNull(); // kỳ cũ
    expect(acceptanceKhoiAssignees({ month: '2026-11', blockId: '', lines })).toEqual([]); // chưa có Khối
    const got = acceptanceKhoiAssignees({ month: '2026-11', blockId: 'B1', lines });
    expect(got).toEqual([{ uid: 'g1', name: 'GĐ Khối A', blockId: 'B1', role: 'khoi' }]);
    // Khối khác không lẫn vào
    expect(acceptanceKhoiAssignees({ month: '2026-11', blockId: 'B2', lines })?.map((k) => k.blockId)).toEqual(['B2']);
  });

  it('khoiManagerBlockId: trả Khối chuẩn của GĐK (sửa được blockId lưu sai)', () => {
    expect(khoiManagerBlockId({ month: '2026-10', uid: 'g1', lines })).toBe(''); // kỳ cũ
    expect(khoiManagerBlockId({ month: '2026-11', uid: 'u1', lines })).toBe(''); // không phải GĐK
    // Không có preferBlockId → lấy dòng khoi đầu tiên của g1 (B1)
    expect(khoiManagerBlockId({ month: '2026-11', uid: 'g1', lines })).toBe('B1');
    // preferBlockId khớp đăng ký → giữ
    expect(khoiManagerBlockId({ month: '2026-11', uid: 'g1', lines, preferBlockId: 'B2' })).toBe('B2');
    // preferBlockId SAI (BO không có đăng ký) → bỏ qua, lấy Khối thật của g1
    expect(khoiManagerBlockId({ month: '2026-11', uid: 'g1', lines, preferBlockId: 'BO' })).toBe('B1');
  });

  it('dự án của GĐK lấy theo blockId (dòng khoi không có teamId)', () => {
    // Có blockId → gộp dự án khoi của đúng Khối
    const got = acceptanceBudgetProjects({ month: '2026-11', blockId: 'B1', personUid: 'g1', lines });
    expect(got?.map((c) => c.projectId)).toEqual(['PK1', 'PK2']);
    // teamId='' nhưng có blockId (bản ghi GĐK đã xoá Phòng) vẫn ra dự án
    const got2 = acceptanceBudgetProjects({ month: '2026-11', teamId: '', blockId: 'B1', personUid: 'g1', lines });
    expect(got2?.map((c) => c.projectId)).toEqual(['PK1', 'PK2']);
  });

  it('không truyền blockId thì dòng khoi (không teamId) bị bỏ qua', () => {
    expect(acceptanceBudgetProjects({ month: '2026-11', teamId: 'T1', personUid: 'g1', lines })).toEqual([]);
  });

  it('chọn Phòng T1 vẫn chỉ ra thành viên Phòng; GĐK đến từ danh sách khoi riêng', () => {
    // assignee theo Phòng không gồm GĐK (khoi không teamId)
    const teamUids = acceptanceAssigneeUids({ month: '2026-11', teamId: 'T1', lines });
    expect([...(teamUids as Set<string>)]).toEqual(['u1']);
    // GĐK đến từ acceptanceKhoiAssignees theo blockId
    expect(acceptanceKhoiAssignees({ month: '2026-11', blockId: 'B1', lines })?.map((k) => k.uid)).toEqual(['g1']);
  });
});
