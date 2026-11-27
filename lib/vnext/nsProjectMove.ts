import { ntKey } from './onboarding.js';
import { ntPeriodKey } from './ntBudgetProjects.js';
import { isSupplement, suppKeySuffix, suppStatus } from './ntSupplement.js';
import { NsSyncError, type NsProjectNt, type NsProjectWeek } from './nsSync.js';

export function matchesMoveNt(row: Record<string, unknown>, projectId: string, period: string, accounts: Set<string>,
  source?: { id: string; teamId?: string }) {
  const status = String(row.status || '').normalize('NFC').toLowerCase().trim();
  return !row.isDraft && !['draft', 'nháp', 'bản nháp'].includes(status) && row.ntNoBudget !== true && !row.implementerManual
    && row.projectId === projectId && typeof row.implementerUid === 'string' && accounts.has(row.implementerUid)
    && (!source || (row.nsLineId ? row.nsLineId === source.id : !row.teamId || row.teamId === source.teamId))
    && ntPeriodKey(row.supplementFor || row.ntMonth || row.month) === period;
}

export function moveNtKeys(row: Record<string, unknown>, projectId: string) {
  const month = String(row.ntMonth || ntPeriodKey(row.month));
  const uid = String(row.implementerUid);
  const suffix = suppKeySuffix(row);
  return {
    month, uid,
    key: ntKey(month, uid, String(row.projectId)) + suffix,
    targetKey: ntKey(month, uid, projectId) + suffix,
  };
}

export function planMoveNt(id: string, row: Record<string, unknown>, keys: ReturnType<typeof moveNtKeys>,
  target: Record<string, unknown> | undefined, hasInvoice: boolean, hasImages: boolean): NsProjectNt {
  const canMove = !target || target.acceptanceId === id;
  return {
    id, ntNo: String(row.ntNo || ''), date: String(row.date || row.ntMonth || row.month || ''),
    project: String(row.projectName || row.projectId), status: suppStatus(row) || String(row.status || 'Đã nghiệm thu'),
    hasInvoice, hasImages, supplement: isSupplement(row), key: keys.key, targetKey: keys.targetKey, canMove,
    ...(!canMove ? { blockReason: `Khoá Nghiệm thu đích đã được bản ${target?.acceptanceId || 'không xác định'} giữ.` } : {}),
  };
}

export function planMoveWeek(id: string, dot: number, items: { projectId?: string }[], from: string, to: string): NsProjectWeek | null {
  const count = items.filter((item) => item?.projectId === from).length;
  if (!count) return null;
  const conflict = items.some((item) => item?.projectId === to);
  return { id, dot, count, conflict, ...(conflict ? { blockReason: `Đợt ${dot} đã có mục cho dự án đích.` } : {}) };
}

export function validateMoveChoices(nts: NsProjectNt[], choices: Record<string, 'move' | 'keep'> = {}) {
  if (Object.keys(choices).length !== nts.length || nts.some(({ id }) => !Object.hasOwn(choices, id))) {
    throw new NsSyncError(409, 'nt_choices_required', 'Hãy xác nhận lựa chọn cho từng bản Nghiệm thu trong bản xem trước.');
  }
  const reserved = new Set<string>();
  for (const nt of nts) {
    if (choices[nt.id] !== 'move') continue;
    if (!nt.canMove) throw new NsSyncError(409, 'nt_key_conflict', nt.blockReason!);
    if (reserved.has(nt.targetKey)) {
      throw new NsSyncError(409, 'nt_key_conflict', 'Hai bản Nghiệm thu được chọn trùng khoá đích. Hãy chọn Giữ nguyên cho một bản.');
    }
    reserved.add(nt.targetKey);
  }
}
