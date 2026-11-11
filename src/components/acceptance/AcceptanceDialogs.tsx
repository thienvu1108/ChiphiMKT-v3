import React from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Calculator, 
  Trash2, 
  Upload, 
  History, 
  ShieldCheck, 
  AlertCircle, 
  CornerDownRight, 
  FileSpreadsheet,
  CheckCircle2
} from 'lucide-react';
import { parseCurrencyFormula } from './acceptanceUtils';
import { AmountLinesEditor } from './AmountLinesEditor';
import { itemsToLines, linesToFormula } from '../../lib/amountLines';

interface DialogsProps {
  // Calculator
  isCalculatorOpen: boolean;
  setIsCalculatorOpen: (open: boolean) => void;
  activeCalculatorField?: string | null;
  calculatorFieldNameVN: string;
  calculatorInput: string;
  setCalculatorInput: (val: string) => void;
  calculatorUpdateFn: ((val: string) => void) | null;
  formatCurrency: (amount: number) => string;

  // Finalize (optional / deprecated)
  isFinalizeDialogOpen?: boolean;
  setIsFinalizeDialogOpen?: (open: boolean) => void;
  itemToFinalize?: any;
  onConfirmFinalize?: () => void;

  // Delete
  isDeleteDialogOpen: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
  itemToDeleteId?: string | null;
  onConfirmDelete: () => void;

  // Bulk Delete
  isBulkDeleteDialogOpen: boolean;
  setIsBulkDeleteDialogOpen: (open: boolean) => void;
  selectedCount: number;
  onConfirmBulkDelete: () => void;

  // Final Delete (optional)
  isDeleteFinalDialogOpen?: boolean;
  setIsDeleteFinalDialogOpen?: (open: boolean) => void;
  itemFinalToDeleteId?: string | null;
  onConfirmDeleteFinal?: () => void;

  // History
  isHistoryDialogOpen: boolean;
  setIsHistoryDialogOpen: (open: boolean) => void;
  historyTargetRecord: any;

}

export const AcceptanceDialogs: React.FC<DialogsProps> = ({
  isCalculatorOpen,
  setIsCalculatorOpen,
  activeCalculatorField,
  calculatorFieldNameVN,
  calculatorInput,
  setCalculatorInput,
  calculatorUpdateFn,
  formatCurrency,

  isFinalizeDialogOpen = false,
  setIsFinalizeDialogOpen = (_open?: boolean) => {},
  itemToFinalize = null,
  onConfirmFinalize = () => {},

  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  onConfirmDelete,

  isBulkDeleteDialogOpen,
  setIsBulkDeleteDialogOpen,
  selectedCount,
  onConfirmBulkDelete,

  isDeleteFinalDialogOpen = false,
  setIsDeleteFinalDialogOpen = (_open?: boolean) => {},
  onConfirmDeleteFinal = () => {},

  isHistoryDialogOpen,
  setIsHistoryDialogOpen,
  historyTargetRecord
}) => {
  const isLeadField = activeCalculatorField === 'caNhanNopTien' || (calculatorFieldNameVN && calculatorFieldNameVN.toLowerCase().includes('lead'));
  const parsedCalc = parseCurrencyFormula(calculatorInput);

  return (
    <>
      {/* 📊 1. Chi tiết khoản chi (nhiều số tiền + ghi chú) — thay máy tính công thức cũ */}
      <AmountLinesEditor
        open={isCalculatorOpen}
        title={isLeadField ? `Lead · ${calculatorFieldNameVN || ''}`.trim() : (calculatorFieldNameVN || 'Khoản chi')}
        initial={itemsToLines(parseCurrencyFormula(calculatorInput).items)}
        onClose={() => setIsCalculatorOpen(false)}
        onSave={(lines) => {
          const raw = linesToFormula(lines);
          setCalculatorInput(raw);
          if (calculatorUpdateFn) calculatorUpdateFn(raw);
          setIsCalculatorOpen(false);
        }}
      />

      {/* 🔒 2. Finalize Acceptance Confirmation Dialog */}
      <Dialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6 bg-[var(--mh-surface)] border-none shadow-2xl">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-[var(--mh-text)]">
                Chốt số liệu nghiệm thu
              </h3>
              <p className="text-xs text-[var(--mh-text-2)] font-medium">
                Dòng nghiệm thu của <span className="font-bold text-[var(--mh-text)]">{itemToFinalize?.teamName}</span> - Dự án <span className="font-bold text-[var(--mh-text)]">{itemToFinalize?.projectName}</span> sẽ được chuyển vào danh sách Đã chốt số liệu.
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsFinalizeDialogOpen(false)}
                className="rounded-xl font-bold text-xs"
              >
                Hủy
              </Button>
              <Button
                onClick={onConfirmFinalize}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs px-5 shadow-md shadow-emerald-100"
              >
                Xác nhận chốt
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🗑️ 3. Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6 bg-[var(--mh-surface)] border-none shadow-2xl">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-[var(--mh-text)]">
                Xác nhận xóa bản ghi
              </h3>
              <p className="text-xs text-[var(--mh-text-2)] font-medium">
                Hành động này không thể hoàn tác. Bạn có chắc chắn muốn xóa bản ghi nghiệm thu này không?
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(false)}
                className="rounded-xl font-bold text-xs"
              >
                Hủy
              </Button>
              <Button
                onClick={onConfirmDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs px-5 shadow-md shadow-rose-100"
              >
                Xác nhận xóa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🗑️ 4. Bulk Delete Dialog */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6 bg-[var(--mh-surface)] border-none shadow-2xl">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-[var(--mh-text)]">
                Xóa đồng loạt ({selectedCount} dòng)
              </h3>
              <p className="text-xs text-[var(--mh-text-2)] font-medium">
                Bạn có chắc chắn muốn xóa toàn bộ <span className="font-bold text-rose-600">{selectedCount}</span> bản ghi đã chọn không?
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsBulkDeleteDialogOpen(false)}
                className="rounded-xl font-bold text-xs"
              >
                Hủy
              </Button>
              <Button
                onClick={onConfirmBulkDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs px-5 shadow-md shadow-rose-100"
              >
                Xóa ngay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🗑️ 5. Final Delete Dialog */}
      <Dialog open={isDeleteFinalDialogOpen} onOpenChange={setIsDeleteFinalDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6 bg-[var(--mh-surface)] border-none shadow-2xl">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-[var(--mh-text)]">
                Xóa bản ghi Đã chốt
              </h3>
              <p className="text-xs text-[var(--mh-text-2)] font-medium">
                Bạn có chắc chắn muốn xóa bản ghi đã chốt số liệu này không?
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsDeleteFinalDialogOpen(false)}
                className="rounded-xl font-bold text-xs"
              >
                Hủy
              </Button>
              <Button
                onClick={onConfirmDeleteFinal}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs px-5 shadow-md shadow-rose-100"
              >
                Xóa vĩnh viễn
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 📜 6. History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="sm:max-w-[550px] rounded-3xl p-6 bg-[var(--mh-surface)] border-none shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--mh-surface-2)] flex items-center justify-center text-[var(--mh-text)]">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--mh-text)]">
                  Lịch sử cập nhật & chỉnh sửa
                </h3>
                <p className="text-xs font-semibold text-[var(--mh-text-2)]">
                  {historyTargetRecord?.teamName || historyTargetRecord?.teamCode} - {historyTargetRecord?.projectName} ({historyTargetRecord?.month})
                </p>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {(!historyTargetRecord?.editHistory || historyTargetRecord.editHistory.length === 0) ? (
                <div className="text-center py-8 text-xs text-[var(--mh-text-3)] font-medium">
                  Chưa có lịch sử thay đổi nào được ghi nhận cho bản ghi này.
                </div>
              ) : (
                historyTargetRecord.editHistory.map((hist: any, hIdx: number) => (
                  <div key={hIdx} className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-2xl p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[var(--mh-text)]">
                        {hist.editorName || hist.editorEmail || 'Người dùng'}
                      </span>
                      <span className="text-[10px] text-[var(--mh-text-3)] font-mono">
                        {hist.timestamp ? new Date(hist.timestamp).toLocaleString('vi-VN') : ''}
                      </span>
                    </div>
                    {hist.action && (
                      <Badge variant="outline" className="text-[9px] font-bold">
                        {hist.action}
                      </Badge>
                    )}
                    {hist.changes && Object.keys(hist.changes).length > 0 && (
                      <div className="space-y-1 pt-1">
                        {Object.entries(hist.changes).map(([k, v]: [string, any], cIdx) => (
                          <div key={cIdx} className="flex items-center gap-1.5 text-[11px] text-[var(--mh-text-2)]">
                            <CornerDownRight className="w-3 h-3 text-[var(--mh-text-3)] shrink-0" />
                            <span className="font-semibold text-[var(--mh-text)]">{k}:</span>
                            <span className="line-through text-[var(--mh-text-3)]">{String(v.old || '0')}</span>
                            <span>→</span>
                            <span className="font-bold text-indigo-600">{String(v.new || '0')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setIsHistoryDialogOpen(false)}
                className="rounded-xl font-bold text-xs"
              >
                Đóng
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
};
