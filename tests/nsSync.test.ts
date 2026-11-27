import { describe, expect, it } from 'vitest';
import { amountEdit, planNsAmount, replayNsSync, syncOptions, syncRequestKey } from '../lib/vnext/nsSync';
import { nsLineId, type NsLine } from '../lib/vnext/budget';

const line: NsLine = {
  id: nsLineId('user', '2026-11', 'T', 'P', 'U'),
  kind: 'user', period: '2026-11', teamId: 'T', projectId: 'P', ownerUid: 'U',
  amount: 10, updatedAt: '2026-11-12T00:00:00.000Z',
};
const edit = amountEdit({ lineId: line.id, amount: 99, expectedAmount: 10, expectedUpdatedAt: line.updatedAt });
const options = { operationId: '28cfe229-3333-43e2-8af9-4c23bb8aed4c', reason: ' Điều chỉnh tiền ', notify: true };

describe('Xem trước đồng bộ số tiền NS', () => {
  it('lập kế hoạch sửa cùng dự án trong kỳ khoá, giữ nguyên dữ liệu đầu vào', () => {
    expect(planNsAmount('super_admin', edit, line, null, true)).toEqual({
      lineId: line.id, locked: true,
      before: { amount: 10, projectId: 'P' }, after: { amount: 99, projectId: 'P' },
    });
    expect(line.amount).toBe(10);
  });

  it('từ chối khi phiên bản hoặc số tiền nguồn thay đổi', () => {
    expect(() => planNsAmount('super_admin', edit, { ...line, updatedAt: 'later' }, null, false)).toThrow(expect.objectContaining({ status: 409, code: 'version_conflict' }));
    expect(() => planNsAmount('super_admin', edit, { ...line, amount: 11 }, null, false)).toThrow(expect.objectContaining({ status: 409, code: 'version_conflict' }));
  });

  it('từ chối kỳ cũ, tháng sai, dòng sai ID và dòng đã xoá', () => {
    for (const period of ['2026-10', '2026-13']) {
      expect(() => planNsAmount('super_admin', edit, { ...line, period }, null, false)).toThrow(expect.objectContaining({ code: 'unsupported_period' }));
    }
    expect(() => planNsAmount('super_admin', edit, { ...line, ownerUid: 'O' }, null, false)).toThrow(expect.objectContaining({ code: 'invalid_line' }));
    expect(() => planNsAmount('super_admin', edit, { ...line, deleted: true }, null, false)).toThrow(expect.objectContaining({ status: 404 }));
  });

  it('chỉ cho phép Super Admin', () => {
    expect(() => planNsAmount('admin', edit, line, null, false)).toThrow(expect.objectContaining({ status: 403 }));
  });

  it.each([{ paid: true }, { paidAt: '2026-11-12' }, { payoutStatus: 'paid' }])('chặn cờ đã chi %o', (paid) => {
    expect(() => planNsAmount('super_admin', edit, { ...line, ...paid }, null, false)).toThrow(expect.objectContaining({ code: 'paid_line' }));
    expect(() => planNsAmount('super_admin', edit, line, paid, false)).toThrow(expect.objectContaining({ code: 'paid_line' }));
  });

  it('từ chối lý do ngắn và tiền ngoài phạm vi', () => {
    expect(() => syncOptions({ ...options, reason: '  ab ' })).toThrow(expect.objectContaining({ status: 400 }));
    for (const amount of [0, -1, Infinity, 100_000_000_000, '99']) {
      expect(() => amountEdit({ ...edit, amount })).toThrow(expect.objectContaining({ code: 'invalid_edit' }));
    }
  });

  it('chuẩn hoá khóa băm và phát lại theo nội dung, người sửa, phiên bản', () => {
    const request = { ...edit, ...syncOptions(options) };
    const key = syncRequestKey('sa', request, '1:0/');
    expect(key).toBe(syncRequestKey('sa', { ...syncOptions({ ...options, reason: options.reason.trim() }), ...edit }, '1:0/'));
    const prior = { requestHash: key, result: { operationId: options.operationId } };
    expect(replayNsSync(prior, key)).toBe(prior.result);
    expect(replayNsSync(undefined, key)).toBeUndefined();
    for (const different of [syncRequestKey('sa', { ...request, notify: false }, '1:0/'), syncRequestKey('other', request, '1:0/'), syncRequestKey('sa', request, '2:0/')]) {
      expect(() => replayNsSync(prior, different)).toThrow(expect.objectContaining({ status: 409, code: 'operation_conflict' }));
    }
  });
});
