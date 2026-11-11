/** Chuông thông báo: userNotifs/{id} = { toUid, type, title, body, link, refId, createdAt, createdBy, read }. Ghi lỗi không chặn thao tác chính. */
import { addDoc, collection } from 'firebase/firestore';
import type { VCtx } from './ctx';
export type NotifType = 'approved' | 'rejected' | 'need_pay' | 'pending' | 'reapproval' | 'member' | 'ban_change' | 'payout' | 'data_error' | 'error_spike';
export async function pushNotif(c: Pick<VCtx, 'db' | 'uid'>, toUid: string | undefined, n: { type: NotifType; title: string; body?: string; link?: string; refId?: string }) {
  if (!toUid || toUid === c.uid) return;
  try {
    await addDoc(collection(c.db, 'userNotifs'), { toUid, type: n.type, title: n.title.slice(0, 200), body: (n.body || '').slice(0, 1000), link: (n.link || '').slice(0, 300), refId: n.refId || '', createdAt: new Date().toISOString(), createdBy: c.uid, read: false });
  } catch (e: any) { console.warn('pushNotif', e?.code || e); }
}
/** GĐ Khối + Trợ lý Khối của một Khối. */
export function khoiManagers(c: VCtx, blockId?: string): string[] {
  const b = c.blocks.find((x) => x.id === blockId); if (!b) return [];
  return [b.directorUid, ...(Array.isArray(b.assistantUids) ? b.assistantUids : [])].filter(Boolean);
}
/** Trưởng Ban + Phó Ban. */
export function banManagers(c: VCtx, banKdId?: string): string[] {
  const b = c.banKds.find((x) => x.id === banKdId); if (!b) return [];
  return [b.leaderUid, b.headUid, ...(Array.isArray(b.deputyUids) ? b.deputyUids : []), ...(Array.isArray(b.leaderUids) ? b.leaderUids : [])].filter(Boolean);
}
/** Mở bản ghi khi bấm thông báo: lưu id để màn đích tô sáng. */
export const FOCUS_KEY = 'vnFocusLine';
