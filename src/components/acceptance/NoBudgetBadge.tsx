import React from 'react';
import { isNoBudgetRecord, noBudgetReasonText, NT_NOBUDGET_BADGE } from '../../../lib/vnext/ntNoBudget';

/** Badge đỏ «Ngoài ĐK NS» + lý do (tooltip và dòng nhỏ) cho Nghiệm thu bổ sung không có đăng ký NS. */
export function NoBudgetBadge({ rec, showReason = true }: { rec: any; showReason?: boolean }) {
  if (!isNoBudgetRecord(rec)) return null;
  const reason = noBudgetReasonText(rec);
  return (
    <div className="mt-0.5 flex flex-col items-start gap-0.5" data-testid="nt-nobudget-wrap">
      <span data-testid="nt-nobudget-badge" title={reason ? `Lý do: ${reason}` : NT_NOBUDGET_BADGE}
        className="inline-block rounded border border-red-300 bg-red-50 px-1.5 py-0 text-[10px] font-black text-red-700 whitespace-nowrap">{NT_NOBUDGET_BADGE}</span>
      {showReason && reason ? <span className="text-[10px] text-red-600 max-w-[220px] break-words" data-testid="nt-nobudget-reason-text">{reason}</span> : null}
    </div>
  );
}
