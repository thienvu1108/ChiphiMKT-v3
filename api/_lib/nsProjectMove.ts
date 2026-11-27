import { createHash } from 'node:crypto';
import { DocumentReference, FieldValue, GeoPoint, Timestamp, type DocumentData, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { appendHistory, isNsLinePaid, NS_COLLECTION, nsLineId, type NsLine } from '../../lib/vnext/budget.js';
import { buildSaWriteAudit } from '../../lib/vnext/nsAdmin.js';
import { personAccountIds } from '../../lib/vnext/ntBudgetProjects.js';
import { matchesMoveNt, moveNtKeys, planMoveNt, planMoveWeek, validateMoveChoices } from '../../lib/vnext/nsProjectMove.js';
import { NsSyncError, versionConflict, type NsAmountEdit, type NsSyncPlan, type syncOptions } from '../../lib/vnext/nsSync.js';
import { buildHist, diffLine, HISTORY_COLLECTION, SUPPORT_COLLECTION } from '../../lib/vnext/support.js';
import { WEEKLY_COLLECTION, weeklyId, type WeeklyItem } from '../../lib/vnext/weekly.js';
import { normalizeLegacyFieldValues } from '../../src/lib/legacyFieldValues.js';

type Context = {
  db: Firestore; tx: Transaction; opRef: DocumentReference;
  source: DocumentSnapshot; support: DocumentSnapshot; locks: DocumentSnapshot;
  actor: { uid: string; name: string; role: string };
  options: ReturnType<typeof syncOptions>; requestHash: string; at: string; dryRun: boolean; version: string;
};
type Change = { snap: DocumentSnapshot; data: DocumentData | null };
type UndoEntry = { path: string; beforeHash: string | null; afterHash: string | null };
export type MoveResult = NsSyncPlan & { operationId: string; committedUpdatedAt: string; docsWritten: string[]; reverseOf?: string };
type Guard = { path: string; seconds: number | null; nanoseconds: number | null };
export type MoveOperation = { result: MoveResult; undo?: UndoEntry[]; guards?: Guard[] };
const impacts = {
  updated: ['teamBudget', 'blockBudget', 'acceptanceProjectDropdown', 'dashboard', 'weeklyKpi', 'successor', 'banProjection'],
  approval: 'pending-on-destination',
};
const revision = (snap: DocumentSnapshot): Guard => ({
  path: snap.ref.path, seconds: snap.updateTime?.seconds ?? null, nanoseconds: snap.updateTime?.nanoseconds ?? null,
});
const fingerprint = (snaps: DocumentSnapshot[]) => createHash('sha256')
  .update(JSON.stringify(snaps.map(revision).sort((a, b) => a.path.localeCompare(b.path)))).digest('hex');
const plain = (snap: DocumentSnapshot) => snap.data() ?? {};
const asLine = (snap: DocumentSnapshot) => ({ ...snap.data(), id: snap.id }) as NsLine;
const projection = (line: DocumentData, revisionId: string) => ({
  currentAmount: line.amount, currentDeleted: !!line.deleted, currentProjectId: line.projectId, currentRevision: revisionId,
});
const historyLimit = 100;

function encodeFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) return ['timestamp', value.seconds, value.nanoseconds];
  if (value instanceof GeoPoint) return ['geo', value.latitude, value.longitude];
  if (value instanceof DocumentReference) return ['ref', value.path];
  if (value instanceof Uint8Array) return ['bytes', Buffer.from(value).toString('base64')];
  if (Array.isArray(value)) return ['array', value.map(encodeFirestoreValue)];
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return ['map', Object.keys(record).sort().map((key) => [key, encodeFirestoreValue(record[key])])];
  }
  return [typeof value, String(value)];
}

const stateHash = (data: DocumentData | null | undefined) => data == null ? null
  : createHash('sha256').update(JSON.stringify(encodeFirestoreValue(data))).digest('hex');

function checkTarget(target: DocumentSnapshot, support: DocumentSnapshot) {
  const data = normalizeLegacyFieldValues(plain(target));
  const decision = normalizeLegacyFieldValues(plain(support));
  if (target.exists && data.deleted !== true) throw new NsSyncError(409, 'target_live', 'Dự án đích đã có đăng ký NS còn hiệu lực.');
  if (isNsLinePaid(data, decision)) throw new NsSyncError(409, 'paid_line', 'Dòng NS đích đã chi tiền.');
  if (data.history?.length || data.predecessorLineId || data.successorLineId || data.convertedFrom?.length || data.convertedTo
    || (decision.status && decision.status !== 'pending') || decision.decidedAt || decision.decidedBy || decision.history?.length
    || decision.banStatus || decision.banDecidedAt || decision.banDecidedBy) {
    throw new NsSyncError(409, 'target_history', 'Dòng NS đích có lịch sử hoặc quyết định riêng. Không thể tái sử dụng.');
  }
}

export async function moveNsProject(c: Context, line: NsLine, edit: NsAmountEdit, base: NsSyncPlan) {
  const projectId = base.after.projectId;
  const newLineId = nsLineId('user', line.period, line.teamId!, projectId, line.ownerUid);
  if (Buffer.byteLength(newLineId) > 1500) throw new NsSyncError(422, 'invalid_target', 'Khoá dòng NS đích quá dài.');
  const { db, tx, actor, options, at } = c;
  const [target, targetSupport, owner, project, ...reports] = await tx.getAll(
    db.collection(NS_COLLECTION).doc(newLineId), db.collection(SUPPORT_COLLECTION).doc(newLineId),
    db.collection('users').doc(line.ownerUid!), db.collection('projects').doc(projectId),
    ...[1, 2, 3, 4].map((dot) => db.collection(WEEKLY_COLLECTION).doc(weeklyId(line.period, dot, line.ownerUid!))),
  );
  checkTarget(target, targetSupport);
  if (target.exists) {
    const history = await tx.get(db.collection(HISTORY_COLLECTION).where('lineId', '==', newLineId).limit(1));
    if (history.docs.length) throw new NsSyncError(409, 'target_history', 'Dòng NS đích có lịch sử riêng. Không thể tái sử dụng.');
  }
  const account = plain(owner);
  const ids = personAccountIds({ ...account, id: owner.id, aliasUids: Array.isArray(account.aliasUids) ? account.aliasUids : [] }, line.ownerUid);
  const accounts = new Set(ids);
  const candidates: DocumentSnapshot[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const found = await tx.get(db.collection('acceptances').where('implementerUid', 'in', ids.slice(i, i + 30)));
    candidates.push(...found.docs.filter((snap) => matchesMoveNt(plain(snap), line.projectId, line.period, accounts, line)));
  }
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  if (candidates.length > 60) throw new NsSyncError(409, 'too_many_acceptances', 'Có quá nhiều bản Nghiệm thu liên kết để chuyển trong một giao dịch.');
  const keys = candidates.map((snap) => moveNtKeys(plain(snap), projectId));
  const allKeys = [...new Set(keys.flatMap(({ key, targetKey }) => [key, targetKey]))];
  if (allKeys.some((key) => key.includes('/') || Buffer.byteLength(key) > 1500)) {
    throw new NsSyncError(409, 'invalid_nt_key', 'Có bản Nghiệm thu dùng khoá không hợp lệ.');
  }
  const keyDocs = allKeys.length ? await tx.getAll(...allKeys.map((key) => db.collection('ntKeys').doc(key))) : [];
  const byKey = new Map(keyDocs.map((snap) => [snap.id, snap]));
  const evidence = await Promise.all(candidates.map(async (snap) => {
    const [invoice, images] = await Promise.all(['acceptanceInvoices', 'acceptanceImages'].map((collection) =>
      tx.get(db.collection(collection).where('acceptanceId', '==', snap.id).limit(1))));
    return { invoice: invoice.docs, images: images.docs };
  }));
  const nts = candidates.map((snap, i) => {
    const row = plain(snap);
    const hasInvoice = !!evidence[i].invoice.length || Number(row.hoaDonTien) > 0
      || (Array.isArray(row.hoaDonLines) && row.hoaDonLines.length > 0);
    return planMoveNt(snap.id, row, keys[i], byKey.get(keys[i].targetKey)?.data(), hasInvoice, !!evidence[i].images.length);
  });
  const weekly = reports.flatMap((snap, i) => {
    const items = normalizeLegacyFieldValues(plain(snap)).items;
    const planned = planMoveWeek(snap.id, i + 1, Array.isArray(items) ? items : [], line.projectId, projectId);
    return planned ? [planned] : [];
  });
  const plan = { ...base, newLineId, before: { ...base.before, lineId: line.id }, after: { ...base.after, lineId: newLineId }, nts, weekly };
  const version = fingerprint([c.source, c.support, c.locks, target, targetSupport, owner, project, ...reports,
    ...candidates, ...keyDocs, ...evidence.flatMap(({ invoice, images }) => [...invoice, ...images])]);
  if (c.dryRun) return { response: { ...plan, version, impacts, operationId: options.operationId } };
  if (version !== c.version) throw versionConflict();
  const conflict = weekly.find((week) => week.conflict);
  if (conflict) throw new NsSyncError(409, 'weekly_conflict', conflict.blockReason!);
  const choices = edit.ntChoices ?? {};
  validateMoveChoices(nts, choices);

  const historyActor = { at, byUid: actor.uid, byName: actor.name, byRole: actor.role, reason: options.reason };
  const sourceData = { ...plain(c.source), amount: 0, deleted: true, successorLineId: newLineId, successorOperationId: options.operationId,
    updatedAt: at, updatedBy: actor.uid, history: appendHistory(line, { ...historyActor, action: 'delete', from: line.amount, to: 0 }) };
  const { kind, period, teamId, blockId, ownerUid, ownerName, ownerEmail, payAccount, coImplementer } = line;
  const targetData = {
    kind, period, teamId, ownerUid, projectId, amount: edit.amount, deleted: false, predecessorLineId: line.id,
    ...(blockId !== undefined ? { blockId } : {}), ...(ownerName !== undefined ? { ownerName } : {}),
    ...(ownerEmail !== undefined ? { ownerEmail } : {}), ...(payAccount !== undefined ? { payAccount } : {}),
    ...(coImplementer !== undefined ? { coImplementer } : {}), createdByRole: actor.role,
    createdAt: at, createdBy: actor.uid, updatedAt: at, updatedBy: actor.uid,
    history: [{ ...historyActor, action: 'create', from: 0, to: edit.amount }],
  };
  const changes: Change[] = [{ snap: c.source, data: sourceData }, { snap: target, data: targetData }];
  const sourceSupport = c.support.data() ?? {
    lineId: line.id, ownerUid, period, teamId, blockId: blockId ?? '', projectId: line.projectId,
  };
  changes.push({ snap: c.support, data: { ...sourceSupport, ...projection(sourceData, options.operationId) } });
  if (targetSupport.exists) {
    changes.push({ snap: targetSupport, data: { ...plain(targetSupport), ...projection(targetData, options.operationId) } });
  }
  const movedKeys: { acceptanceId: string; from: string | null; to: string }[] = [];
  const guards = reports.filter((_, i) => !weekly.some((week) => week.dot === i + 1)).map(revision);
  if (!targetSupport.exists) guards.push(revision(targetSupport));
  const name = plain(project).name;
  const code = plain(project).projectCode ?? plain(project).code;
  candidates.forEach((snap, i) => {
    if (choices[snap.id] !== 'move') return;
    const { key, targetKey, month, uid } = keys[i];
    const sourceKey = byKey.get(key)!;
    const destKey = byKey.get(targetKey)!;
    const ownsKey = plain(sourceKey).acceptanceId === snap.id;
    changes.push({ snap, data: { ...plain(snap), projectId, updatedAt: Timestamp.fromDate(new Date(at)),
      ...(plain(snap).nsLineId ? { nsLineId: newLineId } : {}),
      ...(typeof name === 'string' && name ? { projectName: name } : {}),
      ...(typeof code === 'string' ? { projectCode: code } : {}) } });
    if (ownsKey) changes.push({ snap: sourceKey, data: null });
    else guards.push(revision(sourceKey));
    if (destKey.exists) guards.push(revision(destKey));
    else {
      const oldKeyData = ownsKey ? plain(sourceKey) : {};
      changes.push({ snap: destKey, data: { ...oldKeyData,
        acceptanceId: snap.id, month, uid, projectId, createdAt: oldKeyData.createdAt ?? at } });
    }
    movedKeys.push({ acceptanceId: snap.id, from: ownsKey ? key : null, to: targetKey });
  });
  for (const week of weekly) {
    const snap = reports[week.dot - 1];
    const data = plain(snap);
    const { items, history } = normalizeLegacyFieldValues(data);
    changes.push({ snap, data: { ...data, updatedAt: at,
      items: items.map((item: WeeklyItem) => item?.projectId === line.projectId ? { ...item, projectId } : item),
      history: [...(Array.isArray(history) ? history : []),
        { ...historyActor, action: 'ns_move_project', fromProjectId: line.projectId, projectId, operationId: options.operationId, count: week.count }].slice(-historyLimit),
    } });
  }
  const movedNtCount = movedKeys.length;
  const changedPaths = new Set(changes.map(({ snap }) => snap.ref.path));
  return writeMove(c, { ...plan, movedNtCount, keptNtCount: nts.length - movedNtCount }, changes,
    { ntChoices: nts.map(({ id }) => ({ acceptanceId: id, choice: choices[id] })), weekly, movedKeys },
    guards.filter(({ path }) => !changedPaths.has(path)));
}

function writeMove(c: Context, plan: NsSyncPlan, changes: Change[], extra: Record<string, unknown>, guards: Guard[] | null, reverseOf?: string) {
  const { tx, db, opRef, actor, options, at } = c;
  const auditRef = db.collection('auditLogs').doc(options.operationId);
  const historyRefs = [options.operationId, `${options.operationId}_target`].map((id) => db.collection(HISTORY_COLLECTION).doc(id));
  const entries = guards ? changes.map(({ snap, data }) => ({
    path: snap.ref.path, beforeHash: stateHash(snap.data()), afterHash: stateHash(data),
  })) : undefined;
  const undoRefs = entries?.map((entry, i) => entry.beforeHash ? db.doc(`${opRef.path}/undo/${i}`) : null) ?? [];
  const result: MoveResult = { ...plan, operationId: options.operationId, committedUpdatedAt: at,
    ...(reverseOf ? { reverseOf } : {}), docsWritten: [...changes.map(({ snap }) => snap.ref.path),
      ...historyRefs.map((ref) => ref.path), auditRef.path, opRef.path, ...undoRefs.flatMap((ref) => ref ? [ref.path] : [])] };
  changes.forEach(({ snap, data }, i) => {
    if (data === null) tx.delete(snap.ref);
    else tx.set(snap.ref, data);
    if (undoRefs[i]) tx.create(undoRefs[i]!, snap.data()!);
  });
  changes.slice(0, 2).forEach(({ snap, data }, i) => {
    const before = snap.exists ? asLine(snap) : null;
    const after = data ? { ...data, id: snap.id } as NsLine : null;
    const action = after && !after.deleted ? (reverseOf ? 'restore' : 'create') : 'delete';
    const historyChanges = diffLine(before, after ?? { ...before, deleted: true, amount: 0 });
    historyChanges.push(
      { field: 'Dự án', from: plan.before.projectId, to: plan.after.projectId },
      { field: 'Nghiệm thu', from: '', to: reverseOf ? `Khôi phục ${plan.movedNtCount} bản đã chuyển` : `Chuyển ${plan.movedNtCount}, giữ ${plan.keptNtCount}` },
      { field: 'Báo cáo tuần', from: '', to: String(plan.weekly?.reduce((sum, week) => sum + week.count, 0) ?? 0) + ' mục và KPI' },
      { field: 'Dòng NS đích', from: '', to: plan.newLineId! },
    );
    tx.create(historyRefs[i], buildHist((after ?? before)!, actor, action,
      historyChanges, { at, reason: options.reason }));
  });
  tx.create(auditRef, {
    ...buildSaWriteAudit({ create: false, lineId: plan.lineId, actor, reason: options.reason, before: plan.before, after: plan.after, at,
      extra: { ...extra, source: 'ns-sync', operationId: options.operationId, locked: plan.locked, successorLineId: plan.newLineId,
        ...(reverseOf ? { reverseOf } : {}) } }),
    action: reverseOf ? 'NS_LINE_SA_REVERSE_MOVE_PROJECT' : 'NS_LINE_SA_MOVE_PROJECT',
    timestamp: FieldValue.serverTimestamp(),
  });
  tx.create(opRef, { status: 'committed', actor, requestHash: c.requestHash, result,
    ...(entries ? { undo: entries, guards } : {}), timestamp: FieldValue.serverTimestamp() });
  return { response: { ...result, replayed: false } };
}

export async function reverseNsProject(c: Context, original: DocumentSnapshot, op: MoveOperation, locked: boolean) {
  if (!op.undo || !original.updateTime) throw new NsSyncError(409, 'invalid_reverse', 'Giao dịch này không có dữ liệu để đảo.');
  const { tx, db } = c;
  const refs = op.undo.map(({ path }) => db.doc(path));
  const undos = op.undo.map((_, i) => db.doc(`${original.ref.path}/undo/${i}`));
  const guards = op.guards ?? [];
  const reads = await tx.getAll(...refs, ...guards.map(({ path }) => db.doc(path)), ...undos);
  const snapshots = reads.slice(0, refs.length);
  const checkedGuards = reads.slice(refs.length, refs.length + guards.length);
  const previous = reads.slice(refs.length + guards.length);
  // Compare each exact postimage independently. Document write times can differ.
  const conflicts = snapshots.flatMap((snap, i) => stateHash(snap.data()) === op.undo![i].afterHash ? [] : [snap.ref.path]);
  checkedGuards.forEach((snap, i) => {
    const { seconds, nanoseconds } = revision(snap);
    if (seconds !== guards[i].seconds || nanoseconds !== guards[i].nanoseconds) conflicts.push(snap.ref.path);
  });
  if (conflicts.length) throw new NsSyncError(409, 'reverse_conflict', `Không thể đảo vì dữ liệu đã đổi: ${conflicts.join(', ')}.`);
  if (previous.some((snap, i) => stateHash(snap.data()) !== op.undo![i].beforeHash)) {
    throw new NsSyncError(409, 'reverse_conflict', 'Bản sao khôi phục của giao dịch đã thay đổi.');
  }
  const version = fingerprint([...reads, c.locks, original]);
  if (!c.dryRun && version !== c.version) throw versionConflict();
  const { result } = op;
  const plan: NsSyncPlan = { lineId: result.newLineId!, newLineId: result.lineId,
    before: result.after, after: result.before, locked, nts: result.nts, weekly: result.weekly,
    movedNtCount: result.movedNtCount, keptNtCount: result.keptNtCount };
  if (c.dryRun) return { response: { ...plan, version, reverseOf: original.id, operationId: c.options.operationId } };
  const changes = snapshots.map((snap, i) => ({ snap, data: previous[i].data() ?? null }));
  for (const change of changes) {
    if (!change.data) continue;
    if (change.snap.ref.path.startsWith(`${WEEKLY_COLLECTION}/`)) {
      const history = plain(change.snap).history;
      change.data.history = [...(Array.isArray(history) ? history : []), { at: c.at, byUid: c.actor.uid, byName: c.actor.name,
        action: 'ns_reverse_move_project', fromProjectId: plan.before.projectId, projectId: plan.after.projectId,
        operationId: c.options.operationId, reverseOf: original.id, reason: c.options.reason }].slice(-historyLimit);
      change.data.updatedAt = c.at;
    }
    if (!change.snap.ref.path.startsWith(`${SUPPORT_COLLECTION}/`)) continue;
    const restoredLine = change.snap.id === result.lineId ? changes[0].data : changes[1].data;
    if (restoredLine) Object.assign(change.data, projection(restoredLine, c.options.operationId));
    else Object.assign(change.data, { currentAmount: 0, currentDeleted: true, currentProjectId: change.data.projectId ?? result.after.projectId, currentRevision: c.options.operationId });
  }
  return writeMove(c, plan, changes, { restoredDocs: refs.map((ref) => ref.path), weekly: result.weekly ?? [] }, null, original.id);
}
