/** Sau permission-denied khi TẠO Nghiệm thu: đọc từ máy chủ các điều kiện của rules, chẩn đoán lý do + ghi 1 dòng auditLogs. Không bao giờ ném lỗi. */
import { addDoc, collection, doc, getDocFromServer, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { activeLock, normLocks, pastLocked } from '../../lib/vnext/platform';
import { cutoffDate } from '../../lib/vnext/ntCutoff';
import { explainNtCreateDenied, type NtDenyResult } from '../../lib/vnext/ntDenyDiag';
import { ntKeyOf } from '../vnext/ntAssign';

const safe = async <T,>(f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch { return null; } };

export async function probeNtCreateDenied(payload: any): Promise<NtDenyResult> {
  const uid = auth.currentUser?.uid || '';
  const clientNow = Date.now();
  const month = String(payload?.month || '');
  const ntMonth = String(payload?.ntMonth || '');
  const key = ntKeyOf(payload);
  const [prof, st, lk, keySnap] = await Promise.all([
    uid ? safe(() => getDocFromServer(doc(db, 'users', uid))) : null,
    safe(() => getDocFromServer(doc(db, 'settings', 'global'))),
    safe(() => getDocFromServer(doc(db, 'vnLocks', 'current'))),
    key ? safe(() => getDocFromServer(doc(db, 'ntKeys', key))) : null,
  ]);
  const keyAccId = keySnap?.exists() ? String((keySnap.data() as any)?.acceptanceId || '') : '';
  const accSnap = keyAccId ? await safe(() => getDocFromServer(doc(db, 'acceptances', keyAccId))) : null;
  const locks = normLocks(lk?.data() || {});
  const cutoff = cutoffDate(st?.data()?.ntImplementerRequiredFrom);
  const serverRole = prof ? (prof.exists() ? String((prof.data() as any)?.role || '') : null) : null;
  const res = explainNtCreateDenied({
    authUid: uid,
    profileDocId: prof?.id || '',
    serverRole,
    payload,
    cutoffMs: cutoff ? cutoff.getTime() : null,
    serverNowMs: clientNow,
    pastLocked: pastLocked(locks.pastLock?.nt, ntMonth || month, clientNow),
    windowLocked: !!activeLock(locks, 'nt', month, clientNow),
    keyExists: !!keySnap?.exists(),
    keyAcceptanceExists: !!accSnap?.exists(),
    keyAcceptanceId: keyAccId,
  });
  try {
    let build = String((import.meta as any).env?.VITE_BUILD_ID || '');
    if (!build) build = await Promise.race([
      fetch('/version.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => String(j?.version || j?.build || j?.hash || '')),
      new Promise<string>((r) => setTimeout(() => r(''), 1500)),
    ]).catch(() => '');
    await addDoc(collection(db, 'auditLogs'), {
      action: 'NT_SAVE_DENIED',
      collection: 'acceptances',
      docId: '',
      data: {
        code: res.code, month, ntMonth,
        hasImpl: !!payload?.implementerUid, manual: !!payload?.implementerManual, hasReq: payload?.ntRequired === true,
        keyExists: !!keySnap?.exists(), keyAccExists: !!accSnap?.exists(),
        serverRole: serverRole ?? 'none', profileIsAuth: !!prof && prof.id === uid, cutoffSet: !!cutoff,
        clientNow, build, keys: Object.keys(payload || {}).sort().join(',').slice(0, 1500), supp: !!payload?.supplementFor, ua: String(navigator.userAgent || '').slice(0, 80),
      },
      timestamp: serverTimestamp(),
      userEmail: (auth.currentUser?.email || '').toLowerCase() || null,
      userId: uid || null,
    });
  } catch { /* nhật ký lỗi không được ảnh hưởng người dùng */ }
  return res;
}
