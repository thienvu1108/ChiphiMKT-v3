import { isNsLinePaid, nsLineId, type NsLine } from './budget.js';
import { reasonOk } from './nsAdmin.js';

export class NsSyncError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[^/\u0000-\u001f\u007f]{1,350}$/.test(value)
  && value !== '.' && value !== '..' && !/^__.*__$/.test(value);
export const isOperationId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const isAmount = (value: unknown): value is number =>
  typeof value === 'number' && value > 0 && value < 100_000_000_000;

export function requireSuperAdmin(role: unknown) {
  if (role !== 'super_admin') throw new NsSyncError(403, 'forbidden', 'Chỉ Super Admin được sửa số tiền.');
}

export type NsAmountEdit = {
  lineId: string;
  amount: number;
  expectedAmount: number;
  expectedUpdatedAt: string | null;
};
export type NsSyncRequest = NsAmountEdit & { operationId: string; reason: string; notify: boolean };
export type NsSyncPlan = {
  lineId: string;
  before: { amount: number; projectId: string };
  after: { amount: number; projectId: string };
  locked: boolean;
};
export const NS_SYNC_IMPACTS = {
  updated: ['teamBudget', 'blockBudget', 'nsNtReconciliation', 'dashboard', 'weeklyKpi', 'approvedTotals'],
  preserved: ['acceptances', 'nsAtSubmit', 'ntKeys'],
  approval: 'recalculate-effective-status',
};

export function syncOptions(body: Record<string, unknown>) {
  const { operationId, reason, notify } = body;
  if (!isOperationId(operationId) || typeof reason !== 'string' || !reasonOk(reason) || reason.trim().length > 1000 || typeof notify !== 'boolean') {
    throw new NsSyncError(400, 'invalid_request', 'Cần UUID, lựa chọn thông báo và lý do từ 3 đến 1000 ký tự.');
  }
  return { operationId, reason: reason.trim(), notify };
}

export function amountEdit(body: Record<string, unknown>): NsAmountEdit {
  const { lineId, amount, expectedAmount, expectedUpdatedAt } = body;
  if (!isId(lineId) || !isAmount(amount) || !isAmount(expectedAmount)
    || (expectedUpdatedAt !== null && (typeof expectedUpdatedAt !== 'string' || expectedUpdatedAt.length > 100))) {
    throw new NsSyncError(400, 'invalid_edit', 'Dòng, phiên bản hoặc số tiền không hợp lệ. Số tiền phải lớn hơn 0 và nhỏ hơn 100 tỷ.');
  }
  return { lineId, amount, expectedAmount, expectedUpdatedAt: typeof expectedUpdatedAt === 'string' ? expectedUpdatedAt : null };
}

export function planNsAmount(role: unknown, edit: NsAmountEdit, line: NsLine | null, support: unknown, locked: boolean): NsSyncPlan {
  requireSuperAdmin(role);
  if (!line || line.deleted) throw new NsSyncError(404, 'line_not_found', 'Không tìm thấy dòng đăng ký NS còn hiệu lực.');
  if (typeof line.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(line.period) || line.period < '2026-11') {
    throw new NsSyncError(422, 'unsupported_period', 'Chỉ hỗ trợ kỳ từ tháng 11/2026.');
  }
  if (line.kind !== 'user' || !isId(line.teamId) || !isId(line.ownerUid)
    || typeof line.projectId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(line.projectId)
    || (line.blockId != null && line.blockId !== '' && !isId(line.blockId))
    || (line.history != null && !Array.isArray(line.history))
    || line.id !== edit.lineId || line.id !== nsLineId('user', line.period, line.teamId, line.projectId, line.ownerUid)
    || !isAmount(line.amount)) {
    throw new NsSyncError(422, 'invalid_line', 'Dòng NS cá nhân không hợp lệ.');
  }
  if (isNsLinePaid(line, support)) throw new NsSyncError(409, 'paid_line', 'Dòng NS đã chi tiền.');
  if (line.amount !== edit.expectedAmount || (line.updatedAt ?? null) !== edit.expectedUpdatedAt) throw versionConflict();
  if (edit.amount === line.amount) throw new NsSyncError(422, 'unchanged_amount', 'Số tiền chưa thay đổi.');
  return {
    lineId: line.id, locked,
    before: { amount: line.amount, projectId: line.projectId },
    after: { amount: edit.amount, projectId: line.projectId },
  };
}

export const versionConflict = () => new NsSyncError(409, 'version_conflict', 'Dòng NS đã thay đổi. Hãy tải lại dữ liệu và xem trước.');

/** Dữ liệu đã chuẩn hoá theo thứ tự cố định trước khi băm trên máy chủ. */
export function syncRequestKey(actorUid: string, request: NsSyncRequest | ReturnType<typeof syncOptions>, version: string, reverseOf?: string) {
  const edit = 'lineId' in request ? [request.lineId, request.amount, request.expectedAmount, request.expectedUpdatedAt] : [];
  return JSON.stringify([actorUid, request.operationId, request.reason, request.notify, version, reverseOf ?? null, ...edit]);
}

export function replayNsSync<T>(prior: { requestHash: string; result: T } | undefined, requestHash: string): T | undefined {
  if (!prior) return undefined;
  if (prior.requestHash !== requestHash) throw new NsSyncError(409, 'operation_conflict', 'UUID đã được dùng cho yêu cầu khác.');
  return prior.result;
}
