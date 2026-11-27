import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/ns-sync/[action]';
import { nsLineId } from '../lib/vnext/budget';
import { matchesMoveNt, moveNtKeys, planMoveWeek } from '../lib/vnext/nsProjectMove';

const firebase = vi.hoisted(() => ({
  adminApp: vi.fn(), verifyIdToken: vi.fn(), getFirestore: vi.fn(),
}));
vi.mock('../api/_lib/linkOnLoginExec.js', () => ({ linkAdminApp: firebase.adminApp }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: firebase.verifyIdToken }) }));
vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase-admin/firestore')>(),
  getFirestore: firebase.getFirestore,
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));

const lineId = nsLineId('user', '2026-11', 'T', 'P', 'U');
const linePath = `ns_lines/${lineId}`;
const operationId = '28cfe229-3333-43e2-8af9-4c23bb8aed4c';
const reverseId = 'f884a707-9e22-4cc5-aaa9-3fdde1d778d4';
const edit = { lineId, amount: 99, expectedAmount: 10, expectedUpdatedAt: null, operationId, reason: 'Điều chỉnh tiền', notify: true };
type Ref = { path: string };
type Query = { collection: string; field: string; op: string; value: unknown; count?: number };
type Data = Record<string, any>;

function copyValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copyValue) as T;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)])) as T;
  }
  return value;
}

function fakeFirestore() {
  const docs = new Map<string, { data: Data; version: number }>();
  let clock = 4;
  const notification = vi.fn(async () => {});
  const snapshot = ({ path }: Ref) => {
    const doc = docs.get(path);
    return {
      ref: { path }, id: path.split('/').at(-1), exists: !!doc, data: () => doc && copyValue(doc.data),
      updateTime: doc ? { seconds: doc.version, nanoseconds: 0, isEqual: (other: { seconds: number }) => doc.version === other.seconds } : undefined,
    };
  };
  return {
    docs, notification,
    db: {
      doc: (path: string) => ({ path }),
      collection: (collection: string) => ({
        doc: (id: string) => ({ path: `${collection}/${id}`, create: notification }),
        where: (field: string, op: string, value: unknown) => ({
          collection, field, op, value, limit: (count: number): Query => ({ collection, field, op, value, count }),
        }),
      }),
      async runTransaction<T>(work: (tx: any) => Promise<T>, options?: { readOnly: boolean }) {
        const writes = new Map<string, Data | null>();
        const result = await work({
          get: (ref: Ref | Query) => {
            expect(writes.size).toBe(0);
            if ('path' in ref) return snapshot(ref);
            const found = Array.from(docs).filter(([path, { data }]) => path.startsWith(ref.collection + '/')
              && (ref.op === 'in' ? (ref.value as unknown[]).includes(data[ref.field]) : data[ref.field] === ref.value));
            return { docs: found.slice(0, ref.count ?? found.length).map(([path]) => snapshot({ path })) };
          },
          getAll: (...refs: Ref[]) => { expect(writes.size).toBe(0); return refs.map(snapshot); },
          update: ({ path }: Ref, patch: Data) => writes.set(path, { ...docs.get(path)?.data, ...patch }),
          create: ({ path }: Ref, data: Data) => { expect(docs.has(path)).toBe(false); writes.set(path, data); },
          set: ({ path }: Ref, data: Data) => writes.set(path, data),
          delete: ({ path }: Ref) => writes.set(path, null),
        });
        if (options?.readOnly) expect(writes.size).toBe(0);
        for (const [path, data] of writes) {
          if (data) docs.set(path, { data: copyValue(data), version: ++clock });
          else docs.delete(path);
        }
        return result;
      },
    },
  };
}

async function call(action: string, body: Data) {
  const result = { status: 0, data: {} as Data };
  const res = {
    setHeader: vi.fn(),
    status: (status: number) => { result.status = status; return res; },
    json: (data: Data) => { result.data = data; },
  };
  await handler({ method: 'POST', query: { action }, body, headers: { authorization: 'Bearer mock-token' } }, res);
  return result;
}

describe('API đồng bộ số tiền NS', () => {
  let mock: ReturnType<typeof fakeFirestore>;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('FIRESTORE_DATABASE_ID', 'chiphi-mkt-staging');
    mock = fakeFirestore();
    firebase.adminApp.mockReturnValue({});
    firebase.verifyIdToken.mockResolvedValue({ uid: 'sa', role: 'super_admin' });
    firebase.getFirestore.mockReturnValue(mock.db);
    mock.docs.set('users/sa', { version: 1, data: { role: 'super_admin' } });
    mock.docs.set(linePath, { version: 2, data: { kind: 'user', period: '2026-11', teamId: 'T', projectId: 'P', ownerUid: 'U', ownerEmail: 'user@example.test', amount: 10 } });
    mock.docs.set('vnLocks/current', { version: 3, data: { nsEdit: [{ from: 1, to: 4_000_000_000_000, period: '2026-11' }] } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('preview không ghi; commit ghi audit và lịch sử; replay không ghi hoặc gửi lại; reverse có preview riêng', async () => {
    const preview = await call('preview', edit);
    expect(preview).toMatchObject({ status: 200, data: { locked: true, version: '2:0/' } });
    expect(mock.docs.size).toBe(3);
    const body = { ...edit, version: preview.data.version };
    const committed = await call('commit', body);
    expect(committed).toMatchObject({ status: 200, data: { replayed: false, after: { amount: 99 } } });
    const operation = mock.docs.get(`nsSyncOps/${operationId}`)!;
    const committedLine = mock.docs.get(linePath)!;
    expect(operation.version).not.toBe(committedLine.version);
    expect(operation.data.result.committedUpdatedAt).toBe(committedLine.data.updatedAt);
    expect(committed.data.committedUpdatedAt).toBe(new Date(committedLine.data.updatedAt).toISOString());
    expect(mock.docs.get(linePath)?.data).toMatchObject({ amount: 99, projectId: 'P', ownerUid: 'U', teamId: 'T', period: '2026-11' });
    expect(mock.docs.get(`auditLogs/${operationId}`)?.data).toMatchObject({ action: 'NS_LINE_SA_UPDATE', locked: true, source: 'ns-sync', operationId });
    expect(mock.docs.get(`nsLineHistory/${operationId}`)?.data.changes).toContainEqual({ field: 'amount', from: '10', to: '99' });
    const replay = await call('commit', body);
    expect(replay).toEqual({ ...committed, data: { ...committed.data, replayed: true } });
    expect(await call('commit', { ...body, amount: 999 })).toMatchObject({ status: 409, data: { code: 'operation_conflict' } });
    expect(mock.notification).toHaveBeenCalledTimes(1);

    const reverse = { ...edit, operationId: reverseId, reverseOf: operationId, notify: false };
    const reversePreview = await call('reverse', { ...reverse, dryRun: true });
    expect(reversePreview).toMatchObject({ status: 200, data: { before: { amount: 99 }, after: { amount: 10 } } });
    expect(mock.docs.get(linePath)?.data.amount).toBe(99);
    expect(await call('reverse', { ...reverse, dryRun: false, version: reversePreview.data.version })).toMatchObject({ status: 200, data: { reverseOf: operationId } });
    expect(mock.docs.get(linePath)?.data.amount).toBe(10);
    expect(mock.docs.has(`auditLogs/${operationId}`)).toBe(true);
  });

  it.each([
    { amount: 42 },
    { updatedAt: '2099-01-01T00:00:00.000Z' },
  ])('chặn đảo khi dòng NS đã thay đổi: %j', async (patch) => {
    const preview = await call('preview', edit);
    expect(await call('commit', { ...edit, version: preview.data.version })).toMatchObject({ status: 200 });
    const reverse = { ...edit, operationId: reverseId, reverseOf: operationId, notify: false };
    const reversePreview = await call('reverse', { ...reverse, dryRun: true });
    expect(reversePreview.status).toBe(200);
    const line = mock.docs.get(linePath)!;
    mock.docs.set(linePath, { data: { ...line.data, ...patch }, version: line.version + 1 });
    const conflict = { status: 409, data: { code: 'version_conflict' } };
    expect(await call('reverse', { ...reverse, dryRun: true })).toMatchObject(conflict);
    expect(await call('reverse', { ...reverse, dryRun: false, version: reversePreview.data.version })).toMatchObject(conflict);
    expect(mock.docs.has(`nsSyncOps/${reverseId}`)).toBe(false);
  });

  it('chặn commit nếu dòng đổi sau preview, kể cả khi số tiền và updatedAt giữ nguyên', async () => {
    const preview = await call('preview', edit);
    mock.docs.get(linePath)!.version++;
    expect(await call('commit', { ...edit, version: preview.data.version })).toMatchObject({ status: 409, data: { code: 'version_conflict' } });
    expect(mock.docs.size).toBe(3);
  });

  it('role lấy từ Firestore; cấu hình sai hoặc thiếu phải đóng API', async () => {
    mock.docs.get('users/sa')!.data.role = 'admin';
    expect(await call('preview', edit)).toMatchObject({ status: 403 });
    vi.stubEnv('FIRESTORE_DATABASE_ID', 'wrong-id');
    expect(await call('preview', edit)).toMatchObject({ status: 503 });
    vi.stubEnv('FIRESTORE_DATABASE_ID', 'chiphi-mkt-staging');
    firebase.adminApp.mockReturnValue(null);
    expect(await call('preview', edit)).toMatchObject({ status: 503 });
  });

  const targetId = nsLineId('user', '2026-11', 'T', 'Q', 'U');
  const targetPath = `ns_lines/${targetId}`;
  const supportPath = `nsSupport/${lineId}`;
  const weeklyPath = 'weekly_reports/2026-11_1_U';
  const oldKey = 'ntKeys/2026-11_U_P';
  const newKey = 'ntKeys/2026-11_U_Q';
  const move = { ...edit, projectId: 'Q', reason: 'Đổi dự án đăng ký' };
  const choices = { a: 'move', b: 'keep' };
  const reverseMove = { operationId: reverseId, reverseOf: operationId, reason: 'Đảo đổi dự án', notify: false };
  const put = (path: string, data: Data) => {
    const version = (mock.docs.get(path)?.version ?? 90) + 1;
    mock.docs.set(path, { data, version });
  };
  function prepareMove() {
    const nt = { projectId: 'P', implementerUid: 'U', ntMonth: '2026-11', status: 'Đã nghiệm thu', teamId: 'T' };
    put('users/U', { aliasUids: ['ALT'] });
    put('projects/Q', { name: 'Dự án Q', projectCode: 'Q2' });
    put('acceptances/a', { ...nt, ntNo: 'NT1', nsLineId: lineId });
    put('acceptances/b', { ...nt, implementerUid: 'ALT', ntMonth: '2026-12', supplementFor: '2026-11' });
    put('acceptances/noBudget', { ...nt, supplementFor: '2026-11', ntNoBudget: true });
    put('acceptances/draft', { ...nt, isDraft: true });
    put('acceptances/otherReference', { ...nt, nsLineId: 'other' });
    put('acceptances/otherPeriod', { ...nt, ntMonth: '2026-10' });
    put('acceptanceInvoices/inv', { acceptanceId: 'a' });
    put('acceptanceImages/img', { acceptanceId: 'a' });
    put(oldKey, { acceptanceId: 'a', projectId: 'P', month: '2026-11', uid: 'U' });
    put(supportPath, { status: 'approved', amount: 10, decidedAt: '2026-11-09', history: [{ status: 'approved' }] });
    put(weeklyPath, { items: [{ projectId: 'P', leads: 7, nsAtSubmit: 10, cumCost: 4 }, { projectId: 'Z', leads: 9 }] });
    const original = mock.docs.get(linePath)!.data;
    put(linePath, { ...original, coImplementer: 'Cùng triển khai', payAccount: { id: 'pay', bankName: 'Bank', tail: '90' } });
  }
  const commitMove = async () => {
    const preview = await call('preview', move);
    expect(preview.status).toBe(200);
    return call('commit', { ...move, version: preview.data.version, ntChoices: choices });
  };

  it('xem trước NT theo alias và kỳ bổ sung, bỏ nháp và noBudget, báo khoá đích trùng', async () => {
    prepareMove();
    put(newKey, { acceptanceId: 'already-owner' });
    const preview = await call('preview', move);
    expect(preview).toMatchObject({ status: 200, data: { newLineId: targetId, locked: true, nts: [
      { id: 'a', ntNo: 'NT1', key: oldKey.split('/')[1], canMove: false, hasInvoice: true, hasImages: true },
      { id: 'b', supplement: true, canMove: true, targetKey: '2026-12_ALT_Q_bs' },
    ], weekly: [{ id: weeklyPath.split('/')[1], count: 1, conflict: false }] } });
    expect(preview.data.nts[0].blockReason).toContain('already-owner');
    expect(await call('commit', { ...move, version: preview.data.version, ntChoices: choices }))
      .toMatchObject({ status: 409, data: { code: 'nt_key_conflict' } });
    expect(mock.docs.get(newKey)?.data.acceptanceId).toBe('already-owner');
    expect(await call('commit', { ...move, version: preview.data.version, ntChoices: { a: 'keep', b: 'keep' } }))
      .toMatchObject({ status: 200, data: { movedNtCount: 0, keptNtCount: 2 } });
  });

  it('chuyển NS, NT, khóa, KPI trong một commit và đảo theo operationId sau dry-run', async () => {
    prepareMove();
    const retained = structuredClone(mock.docs.get('acceptances/b'));
    const independent = structuredClone(mock.docs.get('acceptances/noBudget'));
    const preview = await call('preview', move);
    const body = { ...move, version: preview.data.version, ntChoices: choices };
    const committed = await call('commit', body);
    expect(committed).toMatchObject({ status: 200, data: { movedNtCount: 1, keptNtCount: 1 } });
    expect(mock.docs.get(`nsSyncOps/${operationId}`)?.version).not.toBe(mock.docs.get(targetPath)?.version);
    expect(mock.docs.get(linePath)?.data).toMatchObject({ deleted: true, amount: 0, successorLineId: targetId });
    expect(mock.docs.get(targetPath)?.data).toMatchObject({ deleted: false, amount: 99, predecessorLineId: lineId, coImplementer: 'Cùng triển khai', payAccount: { id: 'pay' } });
    expect(mock.docs.has(`nsSupport/${targetId}`)).toBe(false);
    expect(mock.docs.get(supportPath)?.data).toMatchObject({ status: 'approved', amount: 10, decidedAt: '2026-11-09', currentAmount: 0, currentDeleted: true, currentProjectId: 'P', currentRevision: operationId });
    expect(mock.docs.get('acceptances/a')?.data).toMatchObject({ projectId: 'Q', projectName: 'Dự án Q', projectCode: 'Q2', nsLineId: targetId });
    expect(mock.docs.get('acceptances/b')).toEqual(retained);
    expect(mock.docs.get('acceptances/noBudget')).toEqual(independent);
    expect(mock.docs.has(oldKey)).toBe(false);
    expect(mock.docs.get(newKey)?.data).toMatchObject({ projectId: 'Q', acceptanceId: 'a' });
    expect(mock.docs.get(weeklyPath)?.data.items).toEqual([{ projectId: 'Q', leads: 7, nsAtSubmit: 10, cumCost: 4 }, { projectId: 'Z', leads: 9 }]);
    expect(mock.docs.get(weeklyPath)?.data.history.at(-1)).toMatchObject({ action: 'ns_move_project', operationId });
    expect(mock.docs.get(`auditLogs/${operationId}`)?.data).toMatchObject({
      action: 'NS_LINE_SA_MOVE_PROJECT', successorLineId: targetId,
      ntChoices: [{ acceptanceId: 'a', choice: 'move' }, { acceptanceId: 'b', choice: 'keep' }],
    });
    expect(await call('commit', { ...body, ntChoices: [{ acceptanceId: 'b', choice: 'keep' }, { a: 'move' }] }))
      .toMatchObject({ status: 200, data: { replayed: true } });
    expect(await call('commit', { ...body, ntChoices: { a: 'keep', b: 'keep' } }))
      .toMatchObject({ status: 409, data: { code: 'operation_conflict' } });
    const dry = await call('reverse', { ...reverseMove, dryRun: true });
    expect(dry).toMatchObject({ status: 200, data: { before: { amount: 99, projectId: 'Q' }, after: { amount: 10, projectId: 'P' } } });
    expect(mock.docs.has(targetPath)).toBe(true);
    const request = { ...reverseMove, dryRun: false, version: dry.data.version };
    expect(await call('reverse', request)).toMatchObject({ status: 200 });
    expect(await call('reverse', request)).toMatchObject({ status: 200, data: { replayed: true } });
    expect(mock.docs.has(targetPath)).toBe(false);
    expect(mock.docs.get(linePath)?.data.amount).toBe(10);
    expect(mock.docs.get(linePath)?.data.successorLineId).toBeUndefined();
    expect(mock.docs.get(supportPath)?.data).toMatchObject({ status: 'approved', amount: 10, currentAmount: 10, currentDeleted: false, currentRevision: reverseId });
    expect(mock.docs.get('acceptances/a')?.data).toMatchObject({ projectId: 'P', nsLineId: lineId });
    expect(mock.docs.get(oldKey)?.data.acceptanceId).toBe('a');
    expect(mock.docs.has(newKey)).toBe(false);
    expect(mock.docs.get(weeklyPath)?.data.items[0]).toMatchObject({ projectId: 'P', leads: 7, nsAtSubmit: 10 });
    expect(mock.docs.get(weeklyPath)?.data.history.at(-1)).toMatchObject({ action: 'ns_reverse_move_project', reverseOf: operationId });
  });

  it('tiền giữ nguyên, đích đã xoá và không có quyết định riêng vẫn chuyển được', async () => {
    prepareMove();
    mock.docs.delete(supportPath);
    const archived = { deleted: true, amount: 0, projectId: 'Q' };
    put(targetPath, archived);
    const sameAmount = { ...move, amount: 10 };
    const preview = await call('preview', sameAmount);
    expect(preview.status).toBe(200);
    expect(await call('commit', { ...sameAmount, version: preview.data.version, ntChoices: choices })).toMatchObject({ status: 200 });
    expect(mock.docs.get(supportPath)?.data).toMatchObject({ lineId, currentAmount: 0, currentDeleted: true, currentRevision: operationId });
    expect(mock.docs.get(supportPath)?.data.status).toBeUndefined();
    const reversePreview = await call('reverse', { ...reverseMove, dryRun: true });
    expect(await call('reverse', { ...reverseMove, dryRun: false, version: reversePreview.data.version })).toMatchObject({ status: 200 });
    expect(mock.docs.get(targetPath)?.data).toEqual(archived);
    expect(mock.docs.has(supportPath)).toBe(false);
  });

  it.each([
    ['acceptances/a', { notes: 'changed' }],
    [weeklyPath, { updatedAt: 'changed' }],
    [newKey, { acceptanceId: 'another-owner' }],
    [`nsSupport/${targetId}`, { status: 'approved' }],
    ['weekly_reports/2026-11_2_U', { items: [{ projectId: 'Q' }] }],
  ])('chặn đảo khi %s thay đổi', async (path, patch) => {
    prepareMove();
    expect(await commitMove()).toMatchObject({ status: 200 });
    const dry = await call('reverse', { ...reverseMove, dryRun: true });
    expect(dry.status).toBe(200);
    put(path, { ...mock.docs.get(path)?.data, ...patch });
    const blocked = await call('reverse', { ...reverseMove, dryRun: false, version: dry.data.version });
    expect(blocked).toMatchObject({ status: 409, data: { code: 'reverse_conflict' } });
    expect(blocked.data.error).toContain(path);
    expect(mock.docs.get(targetPath)?.data.deleted).toBe(false);
  });

  it.each([
    ['acceptances/a', { notes: 'changed' }],
    [weeklyPath, { updatedAt: 'changed' }],
    [oldKey, { acceptanceId: 'another-owner' }],
    [newKey, { acceptanceId: 'another-owner' }],
    [`nsSupport/${targetId}`, { status: 'pending' }],
  ])('chặn commit khi %s thay đổi từ preview', async (path, patch) => {
    prepareMove();
    const preview = await call('preview', move);
    put(path, { ...mock.docs.get(path)?.data, ...patch });
    expect(await call('commit', { ...move, version: preview.data.version, ntChoices: choices })).toMatchObject({ status: 409, data: { code: 'version_conflict' } });
    expect(mock.docs.has(targetPath)).toBe(false);
  });

  it('chặn mục tuần trùng và thiếu lựa chọn từng NT', async () => {
    prepareMove();
    let preview = await call('preview', move);
    expect(await call('commit', { ...move, version: preview.data.version, ntChoices: { a: 'move' } }))
      .toMatchObject({ status: 409, data: { code: 'nt_choices_required' } });
    put(weeklyPath, { items: [{ projectId: 'P' }, { projectId: 'Q' }] });
    preview = await call('preview', move);
    expect(preview).toMatchObject({ status: 200, data: { weekly: [{ conflict: true, blockReason: expect.any(String) }] } });
    expect(await call('commit', { ...move, version: preview.data.version, ntChoices: choices }))
      .toMatchObject({ status: 409, data: { code: 'weekly_conflict' } });
    expect(mock.docs.has(targetPath)).toBe(false);
  });

  it.each([
    [targetPath, { deleted: false }, 409, 'target_live'],
    [targetPath, { deleted: true, history: [{ action: 'delete' }] }, 409, 'target_history'],
    [`nsSupport/${targetId}`, { status: 'approved' }, 409, 'target_history'],
    [linePath, { paid: true }, 409, 'paid_line'],
    [supportPath, { paidAt: '2026-11-20' }, 409, 'paid_line'],
    [linePath, { period: '2026-10' }, 409, 'unsupported_period'],
    ['users/sa', { role: 'admin' }, 409, 'forbidden'],
  ])('chặn đổi dự án khi %s không đủ điều kiện', async (path, patch, status, code) => {
    prepareMove();
    put(path, { ...mock.docs.get(path)?.data, ...patch });
    expect(await call('preview', move)).toMatchObject({ status, data: { code } });
  });
});

describe('planner đổi dự án NS', () => {
  it('khớp kỳ gốc nhưng giữ tháng khoá thực tế của bản bổ sung', () => {
    const row = { projectId: 'P', implementerUid: 'ALIAS', ntMonth: '2026-12', supplementFor: '2026-11' };
    expect(matchesMoveNt(row, 'P', '2026-11', new Set(['ALIAS']))).toBe(true);
    expect(matchesMoveNt({ ...row, ntNoBudget: true }, 'P', '2026-11', new Set(['ALIAS']))).toBe(false);
    expect(moveNtKeys(row, 'Q')).toMatchObject({ key: '2026-12_ALIAS_P_bs', targetKey: '2026-12_ALIAS_Q_bs' });
    expect(planMoveWeek('id', 2, [{ projectId: 'P' }, { projectId: 'Q' }], 'P', 'Q')).toMatchObject({ count: 1, conflict: true });
  });
});
