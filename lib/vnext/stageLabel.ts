/**
 * Nhãn trạng thái kèm tầng đang chờ (GĐK trước, Ban KD sau) — chỉ đổi CHỮ hiển thị / Excel.
 * Khoá trạng thái (St5), bộ lọc và ô tổng giữ nguyên.
 */
import type { NsLine } from './budget';
import type { Support } from './support';
import { ST_META, type St5 } from './status';
import { effectiveBanStatus } from './banSupport';

export type StageKey = St5 | 'ban_pending' | 'ban_reapproval' | 'ban_rejected';

export function stageOf(st: St5, line: NsLine, s?: Partial<Support> | null): StageKey {
  if (st === 'approved') {
    const b = effectiveBanStatus(line, s);
    if (b === 'pending') return s?.banDecidedAt ? 'ban_reapproval' : 'ban_pending';
    if (b === 'rejected') return 'ban_rejected';
  }
  return st;
}

export const STAGE_LABEL: Record<StageKey, string> = {
  pending: 'Chờ GĐK duyệt',
  reapproval: 'Chờ GĐK duyệt lại',
  ban_pending: 'Chờ Ban KD duyệt',
  ban_reapproval: 'Chờ Ban KD duyệt lại',
  ban_rejected: 'Ban KD từ chối',
  approved: 'Ban KD đã duyệt',
  need_pay: ST_META.need_pay.label,
  rejected: ST_META.rejected.label,
};

export const stageLabel = (st: St5, line: NsLine, s?: Partial<Support> | null) => STAGE_LABEL[stageOf(st, line, s)];
/** Màu: Chờ Ban KD dùng màu «Chờ duyệt», còn lại theo ST_META. */
export const stageMetaKey = (k: StageKey): St5 => (k === 'ban_pending' ? 'pending' : k === 'ban_reapproval' ? 'reapproval' : k === 'ban_rejected' ? 'rejected' : k);

/** Ô tổng / bộ lọc Ngân sách MKT: tách «Đã duyệt» thành «Khối đã duyệt» (chờ Ban KD) và «Ban KD đã duyệt». Ban từ chối → «Từ chối». */
export type Bucket = 'approved' | 'khoi_ok' | 'pending' | 'reapproval' | 'need_pay' | 'rejected';
export const BUCKET_ORDER: Bucket[] = ['approved', 'khoi_ok', 'pending', 'reapproval', 'need_pay', 'rejected'];
export const BUCKET_LABEL: Record<Bucket, string> = { approved: 'Ban KD đã duyệt', khoi_ok: 'Khối đã duyệt', pending: 'Chờ GĐK duyệt', reapproval: 'Chờ GĐK duyệt lại', need_pay: ST_META.need_pay.label, rejected: ST_META.rejected.label };
export const bucketOf = (k: StageKey): Bucket => (k === 'ban_pending' || k === 'ban_reapproval' ? 'khoi_ok' : k === 'ban_rejected' ? 'rejected' : k);
export type BucketSplit = { total: number; n: number } & Record<Bucket, { n: number; amount: number }>;
export function splitByBucket(rows: { line: NsLine; s?: Partial<Support> | null; status: string }[]): BucketSplit {
  const o: any = { total: 0, n: 0 };
  for (const b of BUCKET_ORDER) o[b] = { n: 0, amount: 0 };
  for (const r of rows) { const b = bucketOf(stageOf(r.status as St5, r.line, r.s)); const a = Number(r.line.amount) || 0; o[b].n++; o[b].amount += a; o.total += a; o.n++; }
  return o;
}
