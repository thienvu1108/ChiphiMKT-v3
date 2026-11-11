/** Khoá theo ngày: 1 listener vnLocks/current dùng chung; kiểm tra đồng bộ trước khi ghi (rules cũng chặn). */
import { useEffect, useState } from 'react';
import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { normLocks, activeLock, lockUntilText, LOCK_LABEL, pastLocked, type Locks, type LockKind } from '../../lib/vnext/platform';
let cache: { db: Firestore; locks: Locks; subs: Set<(l: Locks) => void>; un?: () => void } | null = null;
export function useLocks(db: Firestore | null | undefined): Locks {
  const [l, setL] = useState<Locks>(cache && cache.db === db ? cache.locks : {});
  useEffect(() => {
    if (!db) return;
    if (!cache || cache.db !== db) { cache?.un?.(); cache = { db, locks: {}, subs: new Set() }; }
    const c = cache; c.subs.add(setL);
    if (!c.un) c.un = onSnapshot(doc(db, 'vnLocks', 'current'), (s) => { c.locks = normLocks(s.data() || {}); c.subs.forEach((f) => f(c.locks)); }, () => { c.un = undefined; });
    else setL(c.locks);
    return () => { c.subs.delete(setL); };
  }, [db]);
  return l;
}
export const currentLocks = (): Locks => cache?.locks || {};
/** null = được phép; chuỗi = lý do bị khoá (super_admin luôn được). */
/** Khoá KỲ ĐÃ QUA (vĩnh viễn, theo cài đặt Super Admin): null = được phép. */
export function pastBlock(role: string, kind: 'ns' | 'nt', month: any, locks: Locks = currentLocks()): string | null {
  if (role === 'super_admin' || !pastLocked(locks.pastLock?.[kind], month)) return null;
  return `Kỳ ${String(month)} đã khoá (kỳ đã qua) — chỉ Super Admin được sửa / xoá / thay đổi ${kind === 'ns' ? 'Ngân sách MKT' : 'Nghiệm thu'} của kỳ này.`;
}
export function lockBlock(role: string, kind: LockKind, period = '', locks: Locks = currentLocks()): string | null {
  if (role === 'super_admin') return null;
  { const pb = pastBlock(role, kind === 'nt' ? 'nt' : 'ns', period, locks); if (pb) return pb; }
  const a = activeLock(locks, kind, period); if (!a) return null;
  return `«${LOCK_LABEL[kind]}» ${lockUntilText(a.until).replace(/^Đang khoá/, 'đang khoá')}${a.period ? ` cho tháng NS ${a.period.slice(5)}/${a.period.slice(0, 4)}` : ''}. Chỉ Super Admin được tạo/sửa trong thời gian này.`;
}
