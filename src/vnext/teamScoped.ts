import { collection, onSnapshot, query, where, type QueryConstraint } from 'firebase/firestore';
import { listenMerged } from '../lib/scopedListen';
import { type VCtx, gdkdTeams } from './ctx';
import { gdkdScopedTeamIds } from '../../lib/vnext/teamScope';

/** Nghe 1 collection NT (ảnh / hoá đơn): GĐKD chỉ được đọc bản ghi có teamId Phòng mình (rules) → mỗi Phòng 1 truy vấn, gộp lại. */
export function listenTeamScoped(c: VCtx, col: string, cs: QueryConstraint[], cb: (rows: any[]) => void): () => void {
  const base = collection(c.db, col);
  const tids = gdkdScopedTeamIds(c.role, gdkdTeams(c));
  const map = (docs: any[]) => cb(docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
  if (!tids) return onSnapshot(cs.length ? query(base, ...cs) : base, (s) => map(s.docs), () => cb([]));
  return listenMerged(tids.map((t) => query(base, ...cs, where('teamId', '==', t))), (s) => map(s.docs), () => cb([]));
}
