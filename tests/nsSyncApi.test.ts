import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/ns-sync/[action]';
import { nsLineId } from '../lib/vnext/budget';

const firebase = vi.hoisted(() => ({
  adminApp: vi.fn(), verifyIdToken: vi.fn(), getFirestore: vi.fn(),
}));
vi.mock('../api/_lib/linkOnLoginExec.js', () => ({ linkAdminApp: firebase.adminApp }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: firebase.verifyIdToken }) }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: firebase.getFirestore,
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));

const lineId = nsLineId('user', '2026-11', 'T', 'P', 'U');
const linePath = `ns_lines/${lineId}`;
const operationId = '28cfe229-3333-43e2-8af9-4c23bb8aed4c';
const reverseId = 'f884a707-9e22-4cc5-aaa9-3fdde1d778d4';
const edit = { lineId, amount: 99, expectedAmount: 10, expectedUpdatedAt: null, operationId, reason: 'Điều chỉnh tiền', notify: true };
type Ref = { path: string };
type Data = Record<string, any>;

function fakeFirestore() {
  const docs = new Map<string, { data: Data; version: number }>();
  let clock = 4;
  const notification = vi.fn(async () => {});
  const snapshot = ({ path }: Ref) => {
    const doc = docs.get(path);
    return {
      id: path.split('/').at(-1), exists: !!doc, data: () => doc?.data,
      updateTime: doc ? { seconds: doc.version, nanoseconds: 0, isEqual: (other: { seconds: number }) => doc.version === other.seconds } : undefined,
    };
  };
  return {
    docs, notification,
    db: {
      doc: (path: string) => ({ path }),
      collection: (collection: string) => ({ doc: (id: string) => ({ path: `${collection}/${id}`, create: notification }) }),
      async runTransaction<T>(work: (tx: any) => Promise<T>, options?: { readOnly: boolean }) {
        const writes = new Map<string, Data>();
        const result = await work({
          get: snapshot, getAll: (...refs: Ref[]) => refs.map(snapshot),
          update: ({ path }: Ref, patch: Data) => writes.set(path, { ...docs.get(path)?.data, ...patch }),
          create: ({ path }: Ref, data: Data) => writes.set(path, data),
        });
        if (options?.readOnly) expect(writes.size).toBe(0);
        for (const [path, data] of writes) docs.set(path, { data, version: ++clock });
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
});
