/**
 * Ngân sách Ban cho GĐ Khối kiêm Phó Ban KD.
 *
 * firestore.rules chỉ cho GĐK đọc ns_lines của Khối mình, nhưng nsSupport của MỌI Khối trong Ban thì đọc được
 * (isBanMgrOf theo deputyUids). Nên danh sách dòng ở tầng Ban = ns_lines đọc được (Khối mình) + dòng "tổng hợp"
 * dựng từ nsSupport (các Khối còn lại). Dòng chưa có nsSupport = còn chờ GĐK duyệt → chưa cần hiện ở tầng Ban.
 */
import type { NsLine } from '../../lib/vnext/budget';
import type { Support } from '../../lib/vnext/support';

/** Dòng NS tối thiểu dựng từ nsSupport (id nsSupport = id dòng NS). */
export function lineFromSupport(s: Partial<Support> & { id: string }, nameOf?: (uid: string) => string): NsLine {
  const ownerUid = s.ownerUid || '';
  return {
    id: s.lineId || s.id,
    period: s.period || '',
    kind: 'user',
    teamId: s.teamId || '',
    blockId: s.blockId || '',
    projectId: s.projectId || '',
    ownerUid,
    ownerName: (s as any).ownerName || (nameOf && ownerUid ? nameOf(ownerUid) : '') || '',
    amount: Number(s.amount) || 0,
  };
}

/**
 * Gộp: ns_lines đọc được luôn thắng (đủ trường, history…); nsSupport không có dòng tương ứng → dòng tổng hợp.
 * `projectIds` (nếu có) giới hạn theo dự án của Ban.
 */
export function mergeBanLines(
  readable: NsLine[],
  supports: Array<Partial<Support> & { id: string }>,
  projectIds?: Set<string> | null,
  nameOf?: (uid: string) => string,
): NsLine[] {
  const out = [...readable];
  const seen = new Set(readable.map((l) => l.id));
  for (const s of supports) {
    const id = s.lineId || s.id;
    if (!id || seen.has(id)) continue;
    if (!s.period || !s.projectId || !(Number(s.amount) > 0)) continue;
    if (projectIds && !projectIds.has(s.projectId)) continue;
    seen.add(id);
    out.push(lineFromSupport(s, nameOf));
  }
  return out;
}
