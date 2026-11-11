/** payStatus/{uid} = { uid, hasPay, updatedAt }: cờ «đã có STK nhận tiền», ai đăng nhập cũng đọc được (không chứa CCCD/STK).
 *  Rules chỉ cho ghi đúng sự thật (hasPay == userKyc có STK hợp lệ). Dùng để suy ra «Chờ cập nhật TT thanh toán» ở mọi màn. */
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, type Firestore } from 'firebase/firestore';
import type { PayMap } from '../../lib/vnext/support';
export const PAY_STATUS_COLLECTION = 'payStatus';
let cache: { db: Firestore; map: PayMap; subs: Set<(m: PayMap) => void>; un?: () => void } | null = null;
export function usePayMap(db: Firestore | undefined | null, enabled = true): PayMap {
  // Lỗi đọc / chưa tải → undefined (không chặn), tránh báo nhầm «thiếu STK».
  const [m, setM] = useState<PayMap>(cache && cache.db === db ? cache.map : undefined);
  useEffect(() => {
    if (!db || !enabled) return;
    if (!cache || cache.db !== db) { cache?.un?.(); cache = { db, map: undefined, subs: new Set() }; }
    const c = cache;
    c.subs.add(setM as any);
    if (!c.un) c.un = onSnapshot(collection(db, PAY_STATUS_COLLECTION), (s) => {
      c.map = Object.fromEntries(s.docs.map((d) => { const x = d.data() as any; return [d.id, { has: x.hasPay === true, since: typeof x.since === 'string' ? x.since : '' }]; }));
      c.subs.forEach((f) => f(c.map as any));
    }, (e) => { console.warn('payStatus', e?.code || e); c.map = undefined; c.un = undefined; c.subs.forEach((f) => f(undefined as any)); });
    else setM(c.map);
    return () => { c.subs.delete(setM as any); };
  }, [db, enabled]);
  return m;
}
/** Tự đồng bộ cờ của chính mình (dữ liệu KYC cũ chưa có payStatus). Chỉ ghi khi lệch. */
export function payDoc(uid: string, hasPay: boolean, prev: { has?: boolean; since?: string } | undefined, now = new Date().toISOString()) {
  // since: giữ nguyên nếu trước đó đã có STK; lần đầu có STK → now; không có STK → ''.
  return { uid, hasPay, since: hasPay ? (prev?.has ? prev.since || '' : now) : '', updatedAt: now };
}
export async function syncMyPay(db: Firestore, uid: string, hasPay: boolean, cur: PayMap) {
  if (!uid || !cur || (cur[uid] && cur[uid].has === hasPay)) return;
  await setDoc(doc(db, PAY_STATUS_COLLECTION, uid), payDoc(uid, hasPay, cur[uid])).catch((e) => console.warn('payStatus sync', e?.code || e));
}
