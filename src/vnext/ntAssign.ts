import { asArr } from './ctx';
/**
 * Gán Người phụ trách cho bản ghi Nghiệm thu (dùng chung bảng chính + tab Gán).
 * Ghi nhận: uid, tên, Phòng/Khối tại thời điểm gán, tháng (ntMonth), dự án; khoá ntKeys 1 user/dự án/tháng.
 */
import { doc, getDoc, deleteDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { ntKey, findDuplicate } from '../../lib/vnext/onboarding';
import { normalizeMonth } from '../../lib/vnext/ntReport';
import { manualAttributionPatch } from '../../lib/vnext/ntManual';
import { isSupplement, suppKeySuffix } from '../../lib/vnext/ntSupplement';

export type NtAttribution = { uid: string; name: string; teamId: string; blockId: string; month: string; projectId: string; supp?: boolean };

/** Trả về bản ghi trùng (nếu có) — dùng trước khi ghi. */
export function ntDuplicateOf(all: any[], recId: string, a: { uid: string; month: string; projectId: string; supp?: boolean }) {
  // Bản bổ sung chỉ so với bản bổ sung; bản thường chỉ so với bản thường.
  const recs = asArr(all).filter((r) => isSupplement(r) === !!a.supp).map((r) => ({ ...r, month: normalizeMonth(r.ntMonth || r.month) }));
  return findDuplicate(recs, { id: recId, month: a.month, implementerUid: a.uid, projectId: a.projectId });
}

/** Khoá ntKeys của bản ghi (rỗng nếu chưa gán uid). */
export function ntKeyOf(rec: any): string {
  return rec?.implementerUid && rec?.ntMonth && rec?.projectId ? ntKey(rec.ntMonth, rec.implementerUid, rec.projectId) + suppKeySuffix(rec) : '';
}

/** Xoá bản ghi Nghiệm thu: thêm vào batch xoá luôn khoá ntKeys (tránh khoá mồ côi chặn tạo lại cùng người + dự án + tháng). */
export function ntDeleteOps(db: Firestore, batch: ReturnType<typeof writeBatch>, rec: any) {
  const k = ntKeyOf(rec);
  if (k) batch.delete(doc(db, 'ntKeys', k));
  batch.delete(doc(db, 'acceptances', rec.id));
}

/** Trước khi gán khoá mới: nếu ntKeys/{key} còn tồn tại nhưng trỏ tới bản ghi đã bị xoá (khoá mồ côi) → xoá khoá. */
export async function releaseOrphanNtKey(db: Firestore, recId: string, next: { uid: string; month: string; projectId: string; supp?: boolean } | null) {
  if (!next?.uid || !next.month || !next.projectId) return false;
  const key = ntKey(next.month, next.uid, next.projectId) + suppKeySuffix(next);
  try {
    const ks = await getDoc(doc(db, 'ntKeys', key));
    if (!ks.exists()) return false;
    const aid = String(ks.data()?.acceptanceId || '');
    if (aid === recId) return false;
    if (aid) { const as = await getDoc(doc(db, 'acceptances', aid)); if (as.exists()) return false; }
    await deleteDoc(doc(db, 'ntKeys', key));
    return true;
  } catch (e) { console.warn('releaseOrphanNtKey', e); return false; }
}

/** Thêm vào batch: giải phóng khoá cũ, tạo khoá mới (nếu đổi), trả về patch cho acceptances/{id}. */
export function ntAttributionOps(db: Firestore, batch: ReturnType<typeof writeBatch>, recId: string, old: any, next: NtAttribution | null, by?: { uid?: string; email?: string }) {
  const oldKey = old?.implementerUid && old?.ntMonth && old?.projectId ? ntKey(old.ntMonth, old.implementerUid, old.projectId) + suppKeySuffix(old) : '';
  if (!next || !next.uid) {
    if (oldKey) batch.delete(doc(db, 'ntKeys', oldKey));
    return { implementerUid: '', implementerManual: false, ntMonth: '', ntTeamId: '', ntBlockId: '' };
  }
  const newKey = ntKey(next.month, next.uid, next.projectId) + suppKeySuffix(next);
  if (oldKey && oldKey !== newKey) batch.delete(doc(db, 'ntKeys', oldKey));
  if (oldKey !== newKey) batch.set(doc(db, 'ntKeys', newKey), { acceptanceId: recId, month: next.month, uid: next.uid, projectId: next.projectId, createdAt: new Date().toISOString() });
  return {
    implementerUid: next.uid, implementerName: next.name, implementerManual: false, ntMonth: next.month,
    ntTeamId: next.teamId || '', ntBlockId: next.blockId || '', blockId: next.blockId || old?.blockId || '',
    ntAssignedAt: new Date().toISOString(), ntAssignedBy: by?.email || by?.uid || '',
  };
}

export async function assignImplementer(db: Firestore, all: any[], rec: any, next: NtAttribution, by?: { uid?: string; email?: string }) {
  if (!next?.uid && rec?.ntRequired === true) throw Object.assign(new Error('Bản ghi sau go-live bắt buộc có Người phụ trách'), { code: 'required' });
  next = { ...next, supp: isSupplement(rec) };
  const dup = ntDuplicateOf(all, rec.id, next);
  if (dup) throw Object.assign(new Error('dup'), { code: 'dup', dup });
  await releaseOrphanNtKey(db, rec.id, next);
  const b = writeBatch(db);
  const patch = ntAttributionOps(db, b, rec.id, rec, next, by);
  b.update(doc(db, 'acceptances', rec.id), patch);
  await b.commit();
  return patch;
}

/** Thêm vào batch: giải phóng khoá ntKeys cũ (nếu bản ghi đang gán uid) → patch tên tự nhập (chỉ Tháng 10/2026). */
export function ntManualOps(db: Firestore, batch: ReturnType<typeof writeBatch>, old: any, month: unknown, name: string, by?: { uid?: string; email?: string }) {
  const patch = manualAttributionPatch(month, name, by);
  const oldKey = old?.implementerUid && old?.ntMonth && old?.projectId ? ntKey(old.ntMonth, old.implementerUid, old.projectId) + suppKeySuffix(old) : '';
  if (oldKey) batch.delete(doc(db, 'ntKeys', oldKey));
  return patch;
}

export async function assignManualImplementer(db: Firestore, rec: any, name: string, by?: { uid?: string; email?: string }) {
  const b = writeBatch(db);
  const patch = ntManualOps(db, b, rec, rec?.month || rec?.ntMonth, name, by);
  b.update(doc(db, 'acceptances', rec.id), patch);
  await b.commit();
  return patch;
}
