import { createHash } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type DocumentSnapshot, type Timestamp } from 'firebase-admin/firestore';
import { appendHistory, NS_COLLECTION, type NsLine } from '../../lib/vnext/budget.js';
import { buildSaWriteAudit } from '../../lib/vnext/nsAdmin.js';
import { activeLock, normLocks, pastLocked } from '../../lib/vnext/platform.js';
import { buildHist, diffLine, HISTORY_COLLECTION, SUPPORT_COLLECTION } from '../../lib/vnext/support.js';
import { normalizeLegacyFieldValues } from '../../lib/legacyFieldValues.js';
import {
  amountEdit, isOperationId, NS_SYNC_IMPACTS, NsSyncError, planNsAmount, replayNsSync,
  requireSuperAdmin, syncOptions, syncRequestKey, versionConflict, type NsSyncPlan,
} from '../../lib/vnext/nsSync.js';
import { databaseId, databaseIdOrNull } from '../_lib/dbId.js';
import { linkAdminApp } from '../_lib/linkOnLoginExec.js';

type Result = NsSyncPlan & { operationId: string; docsWritten: string[]; committedUpdatedAt: string; reverseOf?: string };
type Operation = { requestHash: string; result: Result };
const stamp = (t: Timestamp | undefined) => t ? `${t.seconds}:${t.nanoseconds}` : '';
const revision = (line: DocumentSnapshot, support: DocumentSnapshot) => `${stamp(line.updateTime)}/${stamp(support.updateTime)}`;

export default function handler(req: any, res: any) {
  return handleNsSync(req.query?.action, req, res);
}

export async function handleNsSync(action: string, req: any, res: any) {
  res.setHeader('cache-control', 'no-store');
  const reply = (status: number, body: object) => {
    const id = databaseIdOrNull();
    return res.status(status).json(id ? { ...body, databaseId: id } : body);
  };
  if (req.method !== 'POST') return reply(405, { error: 'Chỉ hỗ trợ POST.' });
  if (action !== 'preview' && action !== 'commit' && action !== 'reverse') return reply(404, { error: 'Không có action.' });
  let db, auth;
  try {
    const id = databaseId();
    const app = linkAdminApp();
    if (!app) throw new Error();
    db = getFirestore(app, id);
    auth = getAuth(app);
  } catch {
    return reply(503, { code: 'unavailable', error: 'Máy chủ chưa cấu hình Firestore Admin.' });
  }

  const token = /^Bearer (\S+)$/.exec(String(req.headers?.authorization || ''))?.[1];
  if (!token) return reply(401, { error: 'Thiếu ID token.' });
  let uid: string;
  try { ({ uid } = await auth.verifyIdToken(token, true)); }
  catch { return reply(401, { error: 'ID token không hợp lệ.' }); }

  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new NsSyncError(400, 'invalid_request', 'Cần JSON object.');
    const reverse = action === 'reverse';
    const dryRun = action === 'preview' || (reverse && body.dryRun === true);
    const options = syncOptions(body);
    const reverseOf = reverse ? body.reverseOf : undefined;
    if (reverse && (!isOperationId(reverseOf) || reverseOf === options.operationId || typeof body.dryRun !== 'boolean')) {
      throw new NsSyncError(400, 'invalid_reverse', 'Cần reverseOf, UUID mới và lựa chọn dryRun.');
    }
    const version = dryRun ? '' : body.version;
    if (!dryRun && (typeof version !== 'string' || !/^\d+:\d+\/(\d+:\d+)?$/.test(version) || version.length > 80)) {
      throw new NsSyncError(400, 'missing_preview', 'Cần phiên bản từ bước xem trước.');
    }
    const edit = reverse ? null : amountEdit(body);
    const requestHash = createHash('sha256').update(syncRequestKey(uid, { ...options, ...edit }, version, reverseOf)).digest('hex');
    const opRef = db.collection('nsSyncOps').doc(options.operationId);
    const ret = await db.runTransaction(async (tx) => {
      const profile = (await tx.get(db.collection('users').doc(uid))).data();
      requireSuperAdmin(profile?.role);
      const prior = (await tx.get(opRef)).data() as Operation | undefined;
      if (dryRun && prior) throw new NsSyncError(409, 'operation_conflict', 'UUID đã được sử dụng.');
      const replay = dryRun ? undefined : replayNsSync(prior, requestHash);
      if (replay) return { response: { ...replay, replayed: true } };

      const old = reverse ? (await tx.get(db.collection('nsSyncOps').doc(reverseOf))).data() as Operation | undefined : undefined;
      if (reverse && !old) throw new NsSyncError(404, 'operation_not_found', 'Không tìm thấy giao dịch để đảo.');
      const lineId = edit?.lineId ?? old!.result.lineId;
      const lineRef = db.collection(NS_COLLECTION).doc(lineId);
      const [snap, supportSnap, locksSnap] = await tx.getAll(
        lineRef, db.collection(SUPPORT_COLLECTION).doc(lineId), db.doc('vnLocks/current'),
      );
      const line = snap.exists ? { ...normalizeLegacyFieldValues(snap.data()), id: snap.id } as NsLine : null;
      const currentVersion = revision(snap, supportSnap);
      if (old && (!line || !old.result.committedUpdatedAt || line.amount !== old.result.after.amount ||
        line.updatedAt !== old.result.committedUpdatedAt)) throw versionConflict();
      if (!dryRun && currentVersion !== version) throw versionConflict();
      const requested = edit ?? amountEdit({
        lineId, amount: old!.result.before.amount,
        expectedAmount: old!.result.after.amount, expectedUpdatedAt: old!.result.committedUpdatedAt,
      });
      const now = new Date();
      const locks = normLocks(locksSnap.data());
      const locked = !!line && (pastLocked(locks.pastLock?.ns, line.period, +now) || !!activeLock(locks, 'nsEdit', line.period, +now));
      const plan = planNsAmount(profile?.role, requested, line, supportSnap.data(), locked);
      if (dryRun) return { response: { ...plan, version: currentVersion, impacts: NS_SYNC_IMPACTS, operationId: options.operationId } };

      const historyRef = db.collection(HISTORY_COLLECTION).doc(options.operationId);
      const auditRef = db.collection('auditLogs').doc(options.operationId);
      const at = now.toISOString();
      const result: Result = {
        ...plan, operationId: options.operationId, committedUpdatedAt: at, ...(reverse ? { reverseOf } : {}),
        docsWritten: [lineRef.path, historyRef.path, auditRef.path, opRef.path],
      };
      const actor = { uid, role: 'super_admin', name: String(profile?.displayName || profile?.fullName || profile?.name || '') };
      const patch = {
        amount: plan.after.amount, updatedAt: at, updatedBy: uid,
        history: appendHistory(line!, { at, byUid: uid, byName: actor.name, byRole: actor.role, action: 'update', from: plan.before.amount, to: plan.after.amount, reason: options.reason }),
      };
      tx.update(lineRef, patch);
      tx.create(historyRef, buildHist(line!, actor, 'update', diffLine(line, { ...line!, ...patch }), { reason: options.reason, at }));
      tx.create(auditRef, {
        ...buildSaWriteAudit({
          create: false, lineId, actor, reason: options.reason, before: plan.before, after: plan.after, at,
          extra: { source: 'ns-sync', operationId: options.operationId, impacts: NS_SYNC_IMPACTS, locked, ...(reverse ? { reverseOf } : {}) },
        }),
        timestamp: FieldValue.serverTimestamp(),
      });
      tx.create(opRef, { status: 'committed', actor, requestHash, result, timestamp: FieldValue.serverTimestamp() });
      const notification = options.notify && typeof line!.ownerEmail === 'string' && line!.ownerEmail && line!.ownerUid !== uid ? {
        type: 'ns_edit', title: 'Super Admin đã điều chỉnh Ngân sách MKT của bạn',
        message: `NS kỳ ${line!.period}: ${plan.before.amount.toLocaleString('vi-VN')} → ${plan.after.amount.toLocaleString('vi-VN')} đ. Lý do: ${options.reason}`,
        targetEmails: [line!.ownerEmail.toLowerCase()], targetUid: line!.ownerUid!,
        createdBy: uid, creatorEmail: String(profile?.email || ''), createdAt: at, readBy: [],
        lineId, period: line!.period, projectId: line!.projectId, teamId: line!.teamId!,
      } : undefined;
      return { response: { ...result, replayed: false }, notification };
    }, dryRun ? { readOnly: true } : undefined);

    if (ret.notification) {
      try { await db.collection('teamNotifications').doc(options.operationId).create(ret.notification); }
      catch { return reply(200, { ...ret.response, notificationFailed: true }); }
    }
    return reply(200, ret.response);
  } catch (err: unknown) {
    if (err instanceof NsSyncError) return reply(err.status, { code: err.code, error: err.message });
    if ((err as { code?: number })?.code === 10) return reply(409, { code: 'transaction_conflict', error: 'Dữ liệu đang được cập nhật. Vui lòng thử lại.' });
    return reply(500, { code: 'sync_failed', error: 'Không xử lý được yêu cầu đồng bộ NS.' });
  }
}
