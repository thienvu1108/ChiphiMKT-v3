/** Executes planLink() against Firestore with the Admin SDK inside ONE transaction (idempotent). */
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { planLink, emailIndexId, normEmail, SCAN_COLLECTIONS, OWNERSHIP_COLLECTIONS, type Doc, type RefDoc } from './linkOnLogin.js';

const APP_NAME = 'chiphi-link-on-login';
export function serviceAccount(): Record<string, any> | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (typeof sa?.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    return sa?.client_email && sa?.private_key ? sa : null;
  } catch { return null; }
}
export function linkAdminApp(): App | null {
  const sa = serviceAccount();
  if (!sa) return null;
  return getApps().find((a) => a.name === APP_NAME) || initializeApp({ credential: cert(sa as any), projectId: sa.project_id }, APP_NAME);
}

export async function linkOnLogin(db: Firestore, uid: string, emailRaw: string, opts: { isOtherAuthUid?: (id: string) => Promise<boolean> } = {}) {
  const email = normEmail(emailRaw);
  const idxRef = db.collection('usersByEmail').doc(emailIndexId(email));
  // Discovery (outside the tx): candidate ids + ref docs that may point at them.
  const [me, idx, q1, q2] = await Promise.all([
    db.collection('users').doc(uid).get(), idxRef.get(),
    db.collection('users').where('email', '==', email).get(),
    emailRaw && emailRaw !== email ? db.collection('users').where('email', '==', emailRaw).get() : Promise.resolve(null),
  ]);
  const ids = new Set<string>();
  const oldIdx = String(idx.exists ? idx.data()?.oldUid || '' : '');
  if (oldIdx) ids.add(oldIdx);
  const mig = String(me.exists ? me.data()?.migratedFromUid || '' : '');
  if (mig) ids.add(mig);
  for (const d of [...q1.docs, ...(q2?.docs || [])]) ids.add(d.id);
  ids.delete(uid);
  if (!me.exists) return { status: 'no-profile' as const, retired: [], conflicts: [] };
  if (!ids.size) return { status: 'clean' as const, retired: [], conflicts: [] };

  const otherAuth = new Set<string>();
  if (opts.isOtherAuthUid) for (const id of ids) if (await opts.isOtherAuthUid(id)) otherAuth.add(id);

  const refPaths = new Set<string>();
  for (const col of SCAN_COLLECTIONS) for (const d of (await db.collection(col).get()).docs) refPaths.add(`${col}/${d.id}`);
  for (const id of ids) {
    for (const d of (await db.collection('supportRequests').where('userId', '==', id).get()).docs) refPaths.add(`supportRequests/${d.id}`);
    for (const d of (await db.collection('usersByEmail').where('oldUid', '==', id).get()).docs) refPaths.add(`usersByEmail/${d.id}`);
    for (const col of OWNERSHIP_COLLECTIONS) for (const d of (await db.collection(col).where('createdBy', '==', id).get()).docs) refPaths.add(`${col}/${d.id}`);
  }

  return db.runTransaction(async (tx) => {
    const meSnap = await tx.get(db.collection('users').doc(uid));
    const candSnaps = ids.size ? await tx.getAll(...[...ids].map((id) => db.collection('users').doc(id))) : [];
    const refList = [...refPaths];
    const refSnaps = refList.length ? await tx.getAll(...refList.map((p) => db.doc(p))) : [];
    const candidates: Doc[] = candSnaps.filter((s) => s.exists).map((s) => ({ id: s.id, data: s.data() || {} }));
    const refDocs: RefDoc[] = refSnaps.filter((s) => s.exists).map((s) => ({ col: s.ref.parent.id, id: s.id, data: s.data() || {} }));
    const plan = planLink({ uid, email, profile: meSnap.exists ? meSnap.data() || {} : null, candidates, refDocs, otherAuthUidIds: otherAuth });
    if (plan.status !== 'linked') return { status: plan.status, retired: [] as string[], conflicts: plan.conflicts };
    const now = FieldValue.serverTimestamp();
    for (const u of plan.refUpdates) if (!(u.col === 'usersByEmail' && u.id === idxRef.id)) tx.update(db.collection(u.col).doc(u.id), u.patch);
    tx.set(db.collection('users').doc(uid), { ...plan.profilePatch, mergedFrom: FieldValue.arrayUnion(...plan.retire), mergedAt: now }, { merge: true });
    for (const id of plan.retire) {
      const snap = candSnaps.find((s) => s.id === id)!;
      tx.set(db.collection('users_merged_archive').doc(id), { ...snap.data(), mergedInto: uid, mergedAt: now, mergedBy: 'link-on-login', originalUpdateTime: snap.updateTime?.toDate().toISOString() || null });
      tx.delete(db.collection('users').doc(id), snap.updateTime ? { lastUpdateTime: snap.updateTime } : undefined);
    }
    tx.set(idxRef, { email, oldUid: uid, linkedAt: now }, { merge: true });
    tx.create(db.collection('auditLogs').doc(), { action: 'LINK_ON_LOGIN_MERGE', collection: 'users', docId: uid, userId: uid, userEmail: email, timestamp: now, data: JSON.stringify({ retired: plan.retire, refs: plan.refUpdates.map((r) => `${r.col}/${r.id}:${Object.keys(r.patch).join(',')}`) }) });
    return { status: 'linked' as const, retired: plan.retire, conflicts: plan.conflicts, refs: plan.refUpdates.length };
  });
}

export async function otherAuthChecker(app: App, uid: string) {
  const auth = getAuth(app);
  return async (id: string) => { try { const u = await auth.getUser(id); return u.uid !== uid; } catch { return false; } };
}
