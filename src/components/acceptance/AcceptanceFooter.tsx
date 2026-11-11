import React from 'react';
import { TableFooter, TableRow, TableCell } from '@/components/ui/table';
import { getRowComputed } from './acceptanceUtils';

interface FooterProps {
  records: any[];
  formatCurrency: (amount: number) => string;
}

export const AcceptanceFooter: React.FC<FooterProps> = React.memo(({ records, formatCurrency }) => {
  const totals = React.useMemo(() => {
    return (records || []).reduce((acc, item) => {
      const comp = getRowComputed(item);
      return {
        dFb: acc.dFb + comp.dFb,
        dZalo: acc.dZalo + comp.dZalo,
        dTiktok: acc.dTiktok + comp.dTiktok,
        dKhac: acc.dKhac + comp.dKhac,
        dTotalChuaVat: acc.dTotalChuaVat + comp.dTotalChuaVat,
        dTotalSauVat: acc.dTotalSauVat + comp.dTotalSauVat,

        vFb: acc.vFb + comp.vFb,
        vZalo: acc.vZalo + comp.vZalo,
        vTiktok: acc.vTiktok + comp.vTiktok,
        vDangTin: acc.vDangTin + comp.vDangTin,
        vTotalChuaVat: acc.vTotalChuaVat + comp.vTotalChuaVat,
        vTotalSauVat: acc.vTotalSauVat + comp.vTotalSauVat,

        dtCtyChuaVat: acc.dtCtyChuaVat + comp.dtCtyChuaVat,
        dtCtySauVat: acc.dtCtySauVat + comp.dtCtySauVat,

        cnFb: acc.cnFb + comp.cnFb,
        cnDangTin: acc.cnDangTin + comp.cnDangTin,
        cnZalo: acc.cnZalo + comp.cnZalo,
        cnGoogle: acc.cnGoogle + comp.cnGoogle,
        cnTiktok: acc.cnTiktok + comp.cnTiktok,
        cnNativeAds: acc.cnNativeAds + comp.cnNativeAds,
        cnUCall: acc.cnUCall + comp.cnUCall,
        cnTotal: acc.cnTotal + comp.cnTotal,

        cnNapTienCty: acc.cnNapTienCty + comp.cnNapTienCty,

        grandTotal: acc.grandTotal + comp.grandTotal,
        hoaDonTien: acc.hoaDonTien + comp.hoaDonTien,
        hoaDonNo: acc.hoaDonNo + comp.hoaDonNo,
        cnNopTien: acc.cnNopTien + comp.cnNopTien
      };
    }, {
      dFb: 0, dZalo: 0, dTiktok: 0, dKhac: 0, dTotalChuaVat: 0, dTotalSauVat: 0,
      vFb: 0, vZalo: 0, vTiktok: 0, vDangTin: 0, vTotalChuaVat: 0, vTotalSauVat: 0,
      dtCtyChuaVat: 0, dtCtySauVat: 0,
      cnFb: 0, cnDangTin: 0, cnZalo: 0, cnGoogle: 0, cnTiktok: 0, cnNativeAds: 0, cnUCall: 0, cnTotal: 0,
      cnNapTienCty: 0,
      grandTotal: 0, hoaDonTien: 0, hoaDonNo: 0, cnNopTien: 0
    });
  }, [records]);

  const fmt = (val: number) => formatCurrency(val).replace(' đ', '');

  return (
    <TableFooter className="bg-[var(--mh-surface-2)] font-black border-t-2 border-[var(--mh-border-strong)] z-10 sticky bottom-0">
      <TableRow className="border-t border-[var(--mh-border-strong)] text-[11px]">
        {/* Col STT + THÁNG + KHỐI + MÃ TEAM + GĐKD + NGƯỜI PHỤ TRÁCH + DỰ ÁN = 7 cols */}
        <TableCell colSpan={7} className="text-right font-black text-[var(--mh-text)] text-xs px-3 bg-[var(--mh-surface-2)] md:sticky md:left-0 md:z-20">
          <div data-testid="vn-acc-footer-total">TỔNG CỘNG ({records.length} bản ghi đang lọc):</div>
          <div className="text-[10px] font-semibold text-[var(--mh-text-2)]">Trước VAT {fmt(totals.dTotalChuaVat + totals.vTotalChuaVat + totals.dtCtyChuaVat + totals.cnTotal + totals.cnNapTienCty)} · VAT {fmt(totals.grandTotal - (totals.dTotalChuaVat + totals.vTotalChuaVat + totals.dtCtyChuaVat + totals.cnTotal + totals.cnNapTienCty))}</div>
        </TableCell>

        {/* Col TỔNG — after DỰ ÁN */}
        <TableCell className="text-right font-mono text-xs font-black text-rose-900 bg-rose-100">{fmt(totals.grandTotal)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-black text-orange-950 bg-orange-100">{fmt(totals.hoaDonTien)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-black text-orange-950 bg-orange-200">{fmt(totals.hoaDonNo)}</TableCell>

        {/* Group 1: DIGITAL CHẠY (Chưa VAT) */}
        <TableCell className="text-right font-mono text-xs font-bold text-sky-900 bg-sky-50/50">{fmt(totals.dFb)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-sky-900 bg-sky-50/50">{fmt(totals.dZalo)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-sky-900 bg-sky-50/50">{fmt(totals.dTiktok)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-sky-900 bg-sky-50/50">{fmt(totals.dKhac)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-black text-sky-950 bg-sky-100/70">{fmt(totals.dTotalChuaVat)}</TableCell>
        {/* Col K: DIGITAL CHẠY (SAU VAT) */}
        <TableCell className="text-right font-mono text-xs font-black text-sky-950 bg-sky-200/80">{fmt(totals.dTotalSauVat)}</TableCell>

        {/* Group 2: THẺ VISA CÔNG TY (Chưa VAT) */}
        <TableCell className="text-right font-mono text-xs font-bold text-emerald-900 bg-emerald-50/50">{fmt(totals.vFb)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-emerald-900 bg-emerald-50/50">{fmt(totals.vZalo)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-emerald-900 bg-emerald-50/50">{fmt(totals.vTiktok)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-emerald-900 bg-emerald-50/50">{fmt(totals.vDangTin)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-black text-emerald-950 bg-emerald-100/70">{fmt(totals.vTotalChuaVat)}</TableCell>
        {/* Col Q: THẺ VISA CÔNG TY (SAU VAT) */}
        <TableCell className="text-right font-mono text-xs font-black text-indigo-950 bg-indigo-100/80">{fmt(totals.vTotalSauVat)}</TableCell>

        {/* Group 3: ĐĂNG TIN CÔNG TY */}
        <TableCell className="text-right font-mono text-xs font-bold text-indigo-900 bg-indigo-50/50">{fmt(totals.dtCtyChuaVat)}</TableCell>
        {/* Col S: ĐĂNG TIN CÔNG TY (SAU VAT 8%) */}
        <TableCell className="text-right font-mono text-xs font-black text-indigo-950 bg-indigo-100/80">{fmt(totals.dtCtySauVat)}</TableCell>

        {/* Group 4: CÁ NHÂN CHẠY NGOÀI */}
        <TableCell className="text-right font-mono text-xs font-bold text-amber-900 bg-amber-50/50">{fmt(totals.cnFb)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-amber-900 bg-amber-50/50">{fmt(totals.cnDangTin)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-amber-900 bg-amber-50/50">{fmt(totals.cnZalo)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-amber-900 bg-amber-50/50">{fmt(totals.cnGoogle)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-amber-900 bg-amber-50/50">{fmt(totals.cnTiktok)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-amber-900 bg-amber-50/50">{fmt(totals.cnNativeAds)}</TableCell>
        <TableCell className="text-right font-mono text-xs font-bold text-amber-900 bg-amber-50/50">{fmt(totals.cnUCall)}</TableCell>
        {/* Col Y: CÁ NHÂN TỔNG */}
        <TableCell className="text-right font-mono text-xs font-black text-amber-950 bg-amber-100/80">{fmt(totals.cnTotal)}</TableCell>

        {/* CỘT: CÁ NHÂN NẠP TIỀN QUA CÔNG TY */}
        <TableCell className="text-right font-mono text-xs font-black text-violet-950 bg-violet-100/80">{fmt(totals.cnNapTienCty)}</TableCell>

        {/* Col AA: SỐ LEAD */}
        <TableCell className="text-right font-mono text-xs font-black text-cyan-950 bg-cyan-100/70">{(totals.cnNopTien || 0).toLocaleString('vi-VN')}</TableCell>

        {/* Col AB, AC, Actions */}
        <TableCell colSpan={2} className="bg-[var(--mh-surface-2)]"></TableCell>
        <TableCell className="md:sticky md:right-0 bg-[var(--mh-surface-2)] md:shadow-l"></TableCell>
      </TableRow>
    </TableFooter>
  );
});
