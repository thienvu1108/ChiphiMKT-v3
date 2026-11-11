/** Trạng thái dòng Ngân sách Ban (Quản lý Ban KD › Ngân sách Ban). Nhãn duyệt dùng chung SUPPORT_LABEL. */
import { SUPPORT_LABEL, type SupportStatus } from './support';
/** na = dòng NS không thuộc diện duyệt hỗ trợ; legacy = NS Khối cũ (block_budgets); unknown = không tải được trạng thái (thiếu quyền). */
export type BanBudgetStatus = SupportStatus | 'na' | 'legacy' | 'unknown';
export const BAN_BUDGET_STATUSES: BanBudgetStatus[] = ['approved', 'pending', 'reapproval', 'need_pay', 'rejected', 'na', 'legacy', 'unknown'];
export const BAN_BUDGET_STATUS_LABEL: Record<BanBudgetStatus, string> = { ...SUPPORT_LABEL, na: 'Không cần duyệt', legacy: 'NS cũ (không duyệt)', unknown: 'Chưa rõ' };
