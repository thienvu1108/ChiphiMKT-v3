import React, { useState } from 'react';
import { 
  Calendar, CheckCircle2, ChevronRight, Copy, Phone, FileText, 
  ArrowRight, CreditCard, Building2, AlertTriangle, Clock, 
  CheckSquare, ShieldCheck, DollarSign, Receipt, FileSpreadsheet, 
  Info, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function DoiUngProcessManager() {
  const [activeStep, setActiveStep] = useState<number>(1);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã sao chép ${label}: ${text}`);
  };

  return (
    <div id="doi-ung-process-container" className="space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Header Banner - Matches Mayhomes official brand */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 rounded-[2.5rem] p-8 md:p-12 text-white border border-slate-800 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col items-center text-center space-y-5 max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3.5 py-1 rounded-full text-xs font-black tracking-widest uppercase font-mono">
              MAYHOMES • NGUỒN CUỘC SỐNG TINH HOA
            </span>
            <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 py-1 px-3 rounded-full text-[10px] uppercase font-bold tracking-wider">
              Áp dụng chính thức
            </Badge>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight uppercase font-sans text-white">
            QUY TRÌNH TẠM ỨNG &amp; QUYẾT TOÁN<br />
            <span className="text-amber-400 bg-clip-text">CHI PHÍ HỖ TRỢ MARKETING</span>
          </h1>
          <p className="text-[var(--mh-text-3)] font-semibold text-xs sm:text-sm md:text-base max-w-3xl leading-relaxed">
            DÀNH CHO CÁC KHỐI KINH DOANH
          </p>

          <div className="p-3.5 sm:p-4 bg-[var(--mh-surface)]/10 backdrop-blur-md rounded-2xl border border-white/15 text-[var(--mh-text-3)] text-xs sm:text-sm font-medium leading-relaxed max-w-2xl text-center">
            Nhằm thống nhất việc <strong>đăng ký</strong>, <strong>tạm ứng</strong> và <strong>quyết toán</strong> chi phí hỗ trợ Marketing cho các Khối Kinh doanh, Công ty thực hiện quy trình 5 bước chuẩn hóa dưới đây.
          </div>

          {/* Quick Contact Bar */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-4 py-2 rounded-xl text-xs">
              <span className="text-[var(--mh-text-3)]">Đầu mối phụ trách:</span>
              <strong className="text-white">Mr. Nguyên - Trợ lý Chủ tịch</strong>
            </div>
            <Button
              id="copy-hotline-btn"
              onClick={() => handleCopy('0397040303', 'Số điện thoại Mr. Nguyên')}
              className="bg-amber-500 hover:bg-amber-600 text-[var(--mh-text)] font-black text-xs h-9 px-4 rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              <Phone className="w-3.5 h-3.5" /> 0397.040.303 (Sao chép)
            </Button>
          </div>
        </div>
      </div>

      {/* 5-Step Process Timeline Cards */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-[var(--mh-text)] tracking-tight flex items-center gap-2">
              <CheckSquare className="w-6 h-6 text-indigo-600" />
              Chi tiết 5 Bước Trong Quy Trình Hỗ Trợ Marketing
            </h2>
            <p className="text-xs text-[var(--mh-text-2)] font-medium mt-0.5">
              Thực hiện đúng thời hạn và đầy đủ hồ sơ theo quy định của Ban Lãnh Đạo Mayhomes
            </p>
          </div>
        </div>

        {/* Step 01 */}
        <div id="step-01-card" className="bg-[var(--mh-surface)] rounded-3xl border border-[var(--mh-border)] shadow-sm overflow-hidden hover:border-indigo-300 transition-all">
          <div className="p-6 md:p-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--mh-border)] pb-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-indigo-600 text-white font-black text-base flex items-center justify-center font-mono shadow-md shadow-indigo-200">
                  01
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-[var(--mh-text)] uppercase tracking-tight">
                      ĐĂNG KÝ KẾ HOẠCH MARKETING
                    </h3>
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold">
                      Bước 1
                    </Badge>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3.5 h-3.5" /> Từ ngày 14 - 19 hàng tháng
                  </span>
                </div>
              </div>
              <Badge className="bg-amber-50 text-amber-800 border-amber-200 self-start sm:self-center font-mono text-xs px-3 py-1 font-bold">
                Hạn chót: 12h00 ngày 19
              </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              <div className="space-y-3 bg-[var(--mh-surface-2)] p-5 rounded-2xl border border-[var(--mh-border)]">
                <h4 className="text-xs font-black text-[var(--mh-text)] uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" /> Nội dung đăng ký của các Khối:
                </h4>
                <p className="text-xs text-[var(--mh-text-2)] leading-relaxed font-medium">
                  Các Khối tiến hành đăng ký Kế hoạch Marketing tháng tiếp theo trực tiếp trên hệ thống hoặc theo link đăng ký, bao gồm:
                </p>
                <ul className="space-y-2 text-xs text-[var(--mh-text)] font-semibold pl-1">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                    <span><strong>Ngân sách Marketing</strong> chi tiết theo từng dự án;</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                    <span><strong>Dự kiến hiệu quả Marketing</strong> của từng dự án (KPI, số lead, lượt tiếp cận);</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                    <span><strong>Phòng Kinh doanh / Đội nhóm</strong> phụ trách trực tiếp thực hiện.</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-3 bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-600" /> Quy trình tiếp nhận &amp; Phê duyệt:
                  </h4>
                  <div className="space-y-3 mt-3 text-xs text-indigo-900 font-medium">
                    <div className="p-3 bg-[var(--mh-surface)] rounded-xl border border-indigo-100">
                      <p className="font-bold text-[var(--mh-text)]">Các Khối gửi Bảng Ngân sách đăng ký:</p>
                      <p className="text-[var(--mh-text-2)] mt-0.5">
                        Gửi cho <strong>Mr. Nguyên - Trợ lý CT (0397040303)</strong> chậm nhất <strong>12h00 ngày 19 hàng tháng</strong>.
                      </p>
                    </div>
                    <div className="p-3 bg-[var(--mh-surface)] rounded-xl border border-indigo-100">
                      <p className="font-bold text-[var(--mh-text)]">Mr. Nguyên - Trợ lý Chủ tịch:</p>
                      <p className="text-[var(--mh-text-2)] mt-0.5">
                        Tổng hợp Ngân sách đăng ký và trình <strong>Ban Lãnh Đạo (BLĐ) phê duyệt</strong> chậm nhất <strong>18h00 ngày 20 hàng tháng</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 02 - SPECIFIC FOCUS REQUESTED */}
        <div id="step-02-card" className="bg-[var(--mh-surface)] rounded-3xl border-2 border-amber-300 shadow-md overflow-hidden relative">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-2 flex items-center justify-between text-xs font-black uppercase tracking-wider">
            <span className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> MỤC 02: QUY ĐỊNH TẠM ỨNG CHI PHÍ HỖ TRỢ MARKETING
            </span>
            <span className="bg-[var(--mh-surface)]/20 px-2.5 py-0.5 rounded-full text-[10px]">Trọng tâm quy trình</span>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--mh-border)] pb-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-amber-500 text-white font-black text-base flex items-center justify-center font-mono shadow-md shadow-amber-200">
                  02
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[var(--mh-text)] uppercase tracking-tight">
                    TẠM ỨNG CHI PHÍ HỖ TRỢ MARKETING
                  </h3>
                  <span className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3.5 h-3.5" /> Ngày 21 - 25 hàng tháng (Phòng Kế toán nhận hồ sơ &amp; tạm ứng)
                  </span>
                </div>
              </div>
              <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 font-mono text-xs px-3 py-1 font-bold">
                Tối đa 60% Ngân sách duyệt
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Rule 1 */}
              <div className="bg-amber-50/60 border border-amber-200/80 p-5 rounded-2xl space-y-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white font-black text-xs flex items-center justify-center">
                  60%
                </div>
                <h4 className="text-xs font-black text-[var(--mh-text)] uppercase">Xuất Hóa Đơn Tạm Ứng</h4>
                <p className="text-xs text-[var(--mh-text-2)] leading-relaxed font-medium">
                  Căn cứ ngân sách Marketing đã được BLĐ phê duyệt, các Khối thực hiện <strong>xuất hóa đơn hỗ trợ Marketing tạm ứng</strong>, <strong>tối đa 60% ngân sách được duyệt</strong> và gửi hồ sơ về Phòng Kế toán để thực hiện thanh toán.
                </p>
              </div>

              {/* Rule 2 */}
              <div className="bg-rose-50/60 border border-rose-200/80 p-5 rounded-2xl space-y-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500 text-white font-black text-xs flex items-center justify-center">
                  100%
                </div>
                <h4 className="text-xs font-black text-[var(--mh-text)] uppercase">Hạn Mức Trần Tạm Ứng</h4>
                <p className="text-xs text-[var(--mh-text-2)] leading-relaxed font-medium">
                  <strong>Số tạm ứng trong kỳ không vượt quá 100% chi phí được duyệt của tháng trước</strong>. Đảm bảo tỷ lệ an toàn thanh khoản và kiểm soát ngân sách vận hành.
                </p>
              </div>

              {/* Rule 3 */}
              <div className="bg-sky-50/60 border border-sky-200/80 p-5 rounded-2xl space-y-2">
                <div className="w-8 h-8 rounded-xl bg-sky-600 text-white font-black text-xs flex items-center justify-center">
                  21-25
                </div>
                <h4 className="text-xs font-black text-[var(--mh-text)] uppercase">Lịch Nhận Hồ Sơ &amp; Tạm Ứng</h4>
                <p className="text-xs text-[var(--mh-text-2)] leading-relaxed font-medium">
                  <strong>Từ ngày 21 - 25 hàng tháng</strong>, phòng Kế toán tiếp nhận hồ sơ, kiểm tra tính hợp lệ và thực hiện chi tạm ứng theo đúng quy định.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 03 */}
        <div id="step-03-card" className="bg-[var(--mh-surface)] rounded-3xl border border-[var(--mh-border)] shadow-sm overflow-hidden hover:border-indigo-300 transition-all">
          <div className="p-6 md:p-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--mh-border)] pb-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-blue-600 text-white font-black text-base flex items-center justify-center font-mono shadow-md shadow-blue-200">
                  03
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-[var(--mh-text)] uppercase tracking-tight">
                      BÁO CÁO VÀ NGHIỆM THU CHI PHÍ THỰC TẾ
                    </h3>
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold">
                      Bước 3
                    </Badge>
                  </div>
                  <span className="text-xs font-bold text-blue-600 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3.5 h-3.5" /> Từ ngày 21 đến ngày 31 của tháng tiếp theo
                  </span>
                </div>
              </div>
              <Badge className="bg-[var(--mh-surface-2)] text-[var(--mh-text)] border-[var(--mh-border)] font-mono text-xs px-3 py-1 font-bold">
                Nghiệm thu MKT
              </Badge>
            </div>

            <div className="bg-blue-50/40 p-5 rounded-2xl border border-blue-100 space-y-3">
              <p className="text-xs sm:text-sm text-[var(--mh-text)] leading-relaxed font-semibold">
                <strong>Từ ngày 21 đến ngày 31 của tháng tiếp theo</strong>, các Ban Kinh doanh tiến hành <strong>Nghiệm thu MKT</strong> và gửi <strong>Báo cáo chi phí Marketing thực tế phát sinh trong kỳ</strong> theo từng Dự án cho <strong>Mr. Nguyên</strong> để kiểm tra, đối chiếu số liệu và tổng hợp.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="bg-[var(--mh-surface)] p-3.5 rounded-xl border border-blue-100 text-xs text-[var(--mh-text-2)]">
                  <span className="font-bold text-[var(--mh-text)] block mb-1">Nội dung đối chiếu:</span>
                  Chi phí quảng cáo thực tế, chứng từ hóa đơn, dữ liệu nghiệm thu theo từng dự án và đội nhóm trực thuộc.
                </div>
                <div className="bg-[var(--mh-surface)] p-3.5 rounded-xl border border-blue-100 text-xs text-[var(--mh-text-2)]">
                  <span className="font-bold text-[var(--mh-text)] block mb-1">Đầu mối tổng hợp:</span>
                  Mr. Nguyên kiểm tra tính hợp lệ trước khi chuyển sang Phòng Tài chính - Kế toán để quyết toán.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 04 - SPECIFIC FOCUS REQUESTED */}
        <div id="step-04-card" className="bg-[var(--mh-surface)] rounded-3xl border-2 border-orange-400 shadow-md overflow-hidden relative">
          <div className="bg-gradient-to-r from-orange-600 to-rose-600 text-white px-6 py-2 flex items-center justify-between text-xs font-black uppercase tracking-wider">
            <span className="flex items-center gap-2">
              <Receipt className="w-4 h-4" /> MỤC 04: QUYẾT TOÁN CHI PHÍ MARKETING – NGÀY 10 HÀNG THÁNG
            </span>
            <span className="bg-[var(--mh-surface)]/20 px-2.5 py-0.5 rounded-full text-[10px]">Trọng tâm quy trình</span>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--mh-border)] pb-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-orange-600 text-white font-black text-base flex items-center justify-center font-mono shadow-md shadow-orange-200">
                  04
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[var(--mh-text)] uppercase tracking-tight">
                    QUYẾT TOÁN CHI PHÍ MARKETING
                  </h3>
                  <span className="text-xs font-bold text-rose-600 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3.5 h-3.5" /> <strong>NGÀY 10 HÀNG THÁNG</strong>
                  </span>
                </div>
              </div>
              <div className="bg-rose-50 border border-rose-200 px-4 py-1.5 rounded-xl text-center">
                <span className="text-[10px] text-rose-500 font-bold block uppercase font-mono">Mốc quyết toán</span>
                <span className="text-xs font-black text-rose-700">NGÀY 10 HÀNG THÁNG</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-2xl text-xs text-[var(--mh-text)] leading-relaxed font-medium">
                Căn cứ kết quả nghiệm thu, <strong>Mr. Nguyên</strong> tổng hợp hồ sơ và chuyển <strong>Phòng TC-KT</strong> lập bảng chi phí hỗ trợ Marketing thực tế và trình BLĐ phê duyệt theo quy định.
              </div>

              <div className="text-xs font-black text-[var(--mh-text)] uppercase tracking-wider pl-1">
                Phương án xử lý sau khi được Ban Lãnh Đạo phê duyệt:
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Case 1 */}
                <div className="bg-emerald-50/70 border border-emerald-200 p-5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">▲</span>
                    <h4 className="text-xs font-black text-emerald-950 uppercase">
                      Chi phí thực tế CAO HƠN số đã tạm ứng
                    </h4>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed font-semibold pl-8">
                    Khối thực hiện <strong>xuất hóa đơn bổ sung</strong> cho phần chênh lệch phát sinh để Phòng Kế toán giải ngân thanh toán bù.
                  </p>
                </div>

                {/* Case 2 */}
                <div className="bg-amber-50/70 border border-amber-200 p-5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-600 text-white text-xs font-black flex items-center justify-center">▼</span>
                    <h4 className="text-xs font-black text-amber-950 uppercase">
                      Chi phí thực tế THẤP HƠN số đã tạm ứng
                    </h4>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed font-semibold pl-8">
                    Khối thực hiện <strong>điều chỉnh giảm / hoàn trả phần chênh lệch</strong> theo hướng dẫn trực tiếp của Phòng Kế toán.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 05 - SPECIFIC FOCUS REQUESTED */}
        <div id="step-05-card" className="bg-[var(--mh-surface)] rounded-3xl border-2 border-indigo-400 shadow-md overflow-hidden relative">
          <div className="bg-gradient-to-r from-indigo-700 to-blue-800 text-white px-6 py-2 flex items-center justify-between text-xs font-black uppercase tracking-wider">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> MỤC 05: NGUYÊN TẮC THỰC HIỆN
            </span>
            <span className="bg-[var(--mh-surface)]/20 px-2.5 py-0.5 rounded-full text-[10px]">Quy định bắt buộc</span>
          </div>

          <div className="p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-3 border-b border-[var(--mh-border)] pb-4">
              <span className="w-10 h-10 rounded-2xl bg-indigo-600 text-white font-black text-base flex items-center justify-center font-mono shadow-md shadow-indigo-200">
                05
              </span>
              <div>
                <h3 className="text-base sm:text-lg font-black text-[var(--mh-text)] uppercase tracking-tight">
                  NGUYÊN TẮC THỰC HIỆN BẮT BUỘC
                </h3>
                <p className="text-xs font-semibold text-[var(--mh-text-2)]">
                  Điều kiện tiên quyết để được giải ngân tạm ứng và quyết toán Marketing
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              {/* Principle 1 */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="text-xs leading-relaxed">
                  <strong className="text-emerald-950 font-bold block mb-0.5">
                    1. Điều kiện phát sinh căn và ký hợp đồng môi giới:
                  </strong>
                  <span className="text-[var(--mh-text)] font-medium">
                    Thực hiện tạm ứng cho các Khối <strong>đã có phát sinh căn ký HĐMB tại Mayhomes</strong> và <strong>đã ký Hợp đồng môi giới BĐS</strong> với Công ty.
                  </span>
                </div>
              </div>

              {/* Principle 2 */}
              <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-2xl flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="text-xs leading-relaxed">
                  <strong className="text-rose-950 font-bold block mb-0.5">
                    2. Chặn tạm ứng nếu chưa hoàn tất quyết toán tháng trước:
                  </strong>
                  <span className="text-[var(--mh-text)] font-semibold">
                    <strong>Không giải ngân / tạm ứng Marketing tháng tiếp theo</strong> đối với Khối chưa hoàn tất quyết toán tháng trước, trừ trường hợp đặc biệt được Ban Lãnh Đạo phê duyệt.
                  </span>
                </div>
              </div>

              {/* Principle 3 */}
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Receipt className="w-4 h-4" />
                </div>
                <div className="text-xs leading-relaxed">
                  <strong className="text-blue-950 font-bold block mb-0.5">
                    3. Tiêu chuẩn hồ sơ thanh toán:
                  </strong>
                  <span className="text-[var(--mh-text)] font-medium">
                    Sau khi hồ sơ <strong>đầy đủ và hợp lệ</strong>, Phòng Kế toán thực hiện thanh toán theo đúng quy định.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Request & Contact Note */}
      <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="space-y-1">
            <h4 className="text-sm md:text-base font-black text-amber-400 uppercase tracking-wide">
              Đề nghị phối hợp thực hiện nghiêm túc
            </h4>
            <p className="text-xs text-[var(--mh-text-3)] font-medium max-w-2xl leading-relaxed">
              Đề nghị các <strong>Khối Kinh doanh</strong>, <strong>Ban Kinh doanh</strong> và <strong>Phòng Kế toán</strong> phối hợp thực hiện đúng thời hạn và đầy đủ hồ sơ theo quy định trên.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 bg-slate-800/90 border border-slate-700 p-3 rounded-2xl">
            <div className="text-right">
              <span className="text-[10px] uppercase font-mono text-[var(--mh-text-3)] block">Thông tin liên hệ</span>
              <strong className="text-xs font-bold text-white">Mr. Nguyên - Trợ lý Chủ tịch</strong>
            </div>
            <Button
              id="call-hotline-btn"
              onClick={() => handleCopy('0397040303', 'SĐT Mr. Nguyên')}
              className="bg-amber-500 hover:bg-amber-600 text-[var(--mh-text)] font-black text-xs h-9 px-3.5 rounded-xl flex items-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5" /> 0397.040.303
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
