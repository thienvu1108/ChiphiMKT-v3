import React, { useState } from 'react';
import { 
  FileText, Link, HelpCircle, Phone, Mail, MapPin, Building2, CheckCircle2, 
  XCircle, AlertTriangle, ArrowRight, Copy, Check, Users, ShieldAlert, FileSpreadsheet, 
  Download, Laptop, Send, ExternalLink, QrCode, Award, Coins, Calendar, DollarSign, Percent, Briefcase, ShieldCheck, Receipt, Sparkles, Clock, Calculator, Landmark
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';

export function MktProcessManager() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [activeSubTab, setActiveSubTab] = useState<'policy' | 'process'>('policy');
  const [checklist, setChecklist] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false,
    4: false,
    5: false
  });

  // Calculator states
  const [calcBudget, setCalcBudget] = useState<string>('20,000,000');
  const [calcCost, setCalcCost] = useState<string>('18,000,000');
  const [calcPoints, setCalcPoints] = useState<string>('35');
  const [calcSales, setCalcSales] = useState<string>('1');

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã sao chép ${label}!`);
  };

  const steps = [
    { id: 1, title: 'Đăng ký Ngân sách', date: 'Lần 1: 15-20 | Lần 2: 01-05', color: 'amber' },
    { id: 2, title: 'Lập Báo cáo MKT', date: 'Ngày 21 - 25', color: 'blue' },
    { id: 3, title: 'Nghiệm thu Tài khoản', date: 'Ngày 25 - 31', color: 'indigo' },
    { id: 4, title: 'Nộp Hồ sơ Bản cứng', date: 'Trước ngày 05', color: 'emerald' }
  ];

  const handleToggleCheck = (index: number) => {
    setChecklist(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const allChecked = Object.values(checklist).every(v => v === true);

  // Dynamic calculator processing
  const costNum = parseFloat(calcCost.replace(/[^0-9]/g, '')) || 0;
  const budgetNum = parseFloat(calcBudget.replace(/[^0-9]/g, '')) || 0;
  const pointsNum = parseFloat(calcPoints) || 0;
  const salesNum = parseFloat(calcSales) || 0;

  // Tính tỷ lệ thực tế so với ngân sách đăng ký
  const budgetRatio = budgetNum > 0 ? (costNum / budgetNum) * 100 : 0;
  const isRatioValid = budgetRatio >= 70 && budgetRatio <= 150;

  let baseRate = isRatioValid ? 0.6 : 0.4;
  let limit = 0;
  let bonus = 0;
  let formulaDesc = '';
  let groupDesc = '';

  if (isRatioValid) {
    if (pointsNum >= 30) {
      limit = 20000000 * salesNum;
      const additionalPoints = Math.max(0, pointsNum - 30);
      bonus = Math.floor(additionalPoints / 10) * 7000000;
      formulaDesc = 'Chi phí thực tế hợp lệ (70% - 150% ngân sách) -> Đạt mức hỗ trợ 60% + Thưởng thêm';
      groupDesc = `Cơ bản 60% (Trần giới hạn tối đa cơ bản 20 triệu VNĐ/Sale x ${salesNum} Sale = ${limit.toLocaleString('vi-VN')} VNĐ) + Thưởng thêm ${Math.floor(additionalPoints / 10)} lần x 7 triệu VNĐ (+${bonus.toLocaleString('vi-VN')} VNĐ)`;
    } else {
      limit = 15000000 * salesNum;
      bonus = 0;
      formulaDesc = 'Chi phí thực tế hợp lệ (70% - 150% ngân sách) -> Đạt mức hỗ trợ cơ bản 60%';
      groupDesc = `Hỗ trợ 60% chi phí chạy, giới hạn tối đa 15 triệu VNĐ/Sale x ${salesNum} Sale = ${limit.toLocaleString('vi-VN')} VNĐ`;
    }
  } else {
    limit = 15000000 * salesNum;
    bonus = 0;
    formulaDesc = 'Ngoài khoảng 70% - 150% ngân sách -> Chỉ được hỗ trợ 40%, không nhận Bonus';
    groupDesc = `Chi phí thực tế (${budgetRatio.toFixed(1)}% ngân sách) nằm ngoài khoảng 70% - 150% -> Phạt giảm tỷ lệ hỗ trợ xuống 40% trên thực tế và không được thưởng Bonus thêm. Giới hạn tối đa cơ bản 15 triệu VNĐ/Sale x ${salesNum} Sale = ${limit.toLocaleString('vi-VN')} VNĐ`;
  }

  const calculatedBase = costNum * baseRate;
  const acceptedBase = Math.min(calculatedBase, limit);
  let finalSuggested = acceptedBase + bonus;

  const rawSuggestedBeforeCap = finalSuggested;
  let isCappedAt100 = false;
  if (finalSuggested > costNum) {
    finalSuggested = costNum;
    isCappedAt100 = true;
  }

  const handleCostChange = (val: string) => {
    const numeric = val.replace(/[^0-9]/g, '');
    if (numeric === '') {
      setCalcCost('');
      return;
    }
    const num = parseInt(numeric, 10);
    setCalcCost(num.toLocaleString('vi-VN'));
  };

  const handleBudgetChange = (val: string) => {
    const numeric = val.replace(/[^0-9]/g, '');
    if (numeric === '') {
      setCalcBudget('');
      return;
    }
    const num = parseInt(numeric, 10);
    setCalcBudget(num.toLocaleString('vi-VN'));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Banner Cover Page 1 */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-[#102A43] to-slate-950 rounded-[2.5rem] p-8 md:p-12 text-white border border-slate-800 shadow-xl shadow-slate-950/10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent opacity-70 pointer-events-none" />
        <div className="relative flex flex-col items-center text-center space-y-6 max-w-4xl mx-auto">
          {/* Logo Placeholder */}
          <div className="flex items-center gap-2 mb-2">
            <span className="p-3 bg-amber-500 text-slate-950 rounded-2xl font-black text-xl tracking-wider shadow-lg shadow-amber-500/20 font-mono">
              MAYHOMES
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight uppercase font-sans">
            Quy Trình Nghiệm Thu &amp; <br />
            <span className="text-amber-400 bg-clip-text">Hỗ Trợ Chi Phí Marketing</span>
          </h1>
          <p className="text-[var(--mh-text-3)] font-medium max-w-2xl text-sm md:text-base leading-relaxed">
            Quy chuẩn vận hành, cấu trúc báo cáo và quy định tài chính dành cho <strong className="text-white">Khối Kinh Doanh</strong>.
          </p>
          <div className="pt-2">
            <Badge className="bg-slate-800/80 hover:bg-slate-800 text-[var(--mh-text-3)] border border-slate-700/80 py-1.5 px-4 rounded-full text-xs font-bold font-mono tracking-wider">
              Ban hành bởi Bộ phận Digital Marketing
            </Badge>
          </div>
        </div>
      </div>

      {/* Sub-Tab Selector Card */}
      <div className="bg-[var(--mh-surface-2)] p-1.5 rounded-[2rem] border border-[var(--mh-border)]/50 max-w-lg mx-auto flex items-center justify-between gap-1 shadow-inner">
        <button 
          onClick={() => setActiveSubTab('policy')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 sm:px-6 rounded-2xl text-xs sm:text-sm font-black transition-all ${
            activeSubTab === 'policy' 
              ? 'bg-amber-505 bg-amber-500 text-slate-950 shadow-md font-extrabold translate-y-[-1px]' 
              : 'text-[var(--mh-text-2)] hover:text-slate-950 hover:bg-[var(--mh-surface-2)]'
          }`}
        >
          <Award className="w-4 h-4 shrink-0 text-slate-950" /> Chính sách hỗ trợ MKT
        </button>
        <button 
          onClick={() => setActiveSubTab('process')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 sm:px-6 rounded-2xl text-xs sm:text-sm font-black transition-all ${
            activeSubTab === 'process' 
              ? 'bg-slate-905 bg-slate-900 text-white shadow-md font-extrabold translate-y-[-1px]' 
              : 'text-[var(--mh-text-2)] hover:text-slate-950 hover:bg-[var(--mh-surface-2)]'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" /> Quy trình nghiệm thu
        </button>
      </div>

      {activeSubTab === 'policy' ? (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Section I: Mức Hỗ trợ */}
          <div className="bg-[var(--mh-surface)] rounded-[2.5rem] border border-[var(--mh-border)] shadow-md overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-6 md:p-8 text-white flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-xs font-black uppercase tracking-widest text-amber-100 bg-[var(--mh-surface)]/10 px-3 py-1 rounded-full">Phần I</span>
                <h2 className="text-xl md:text-2xl font-black">MỨC HỖ TRỢ &amp; ĐIỂM THI ĐUA MARKETING</h2>
                <p className="text-xs text-amber-50 font-medium">Hỗ trợ tối đa 100% chi phí thực chạy dựa trên đầu điểm thi đua</p>
              </div>
              <Badge className="bg-[var(--mh-surface)] text-amber-700 hover:bg-amber-50 py-1.5 px-4 text-xs font-bold rounded-xl shrink-0 shadow-sm font-mono uppercase tracking-wider">
                Hỗ trợ: 60% – 100%
              </Badge>
            </div>

            <div className="p-6 md:p-8 space-y-8">
              {/* Core Policies Bullet Notes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] p-5 rounded-2xl flex items-start gap-3">
                  <span className="p-2.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-xl mt-0.5">
                    <Percent className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wider">Mức hỗ trợ chính</h4>
                    <p className="text-xs font-medium text-[var(--mh-text-2)] mt-1 leading-relaxed">
                      Từ <strong className="text-[var(--mh-text)]">60% đến tối đa 100%</strong> chi phí thực chạy quảng cáo.
                    </p>
                  </div>
                </div>

                <div className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] p-5 rounded-2xl flex items-start gap-3">
                  <span className="p-2.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-xl mt-0.5">
                    <Clock className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wider">Điều kiện tiên quyết</h4>
                    <p className="text-xs font-medium text-[var(--mh-text-2)] mt-1 leading-relaxed">
                      Cán bộ nhân viên (CBNV) phải chấm đủ <strong className="text-[var(--mh-text)]">30 buổi công</strong>.
                    </p>
                  </div>
                </div>

                <div className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] p-5 rounded-2xl flex items-start gap-3">
                  <span className="p-2.5 bg-purple-50 border border-purple-200 text-purple-600 rounded-xl mt-0.5">
                    <Award className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wider">Thi đua tính theo</h4>
                    <p className="text-xs font-medium text-[var(--mh-text-2)] mt-1 leading-relaxed">
                      Căn cứ điểm thi đua được <strong className="text-[var(--mh-text)]">tính theo đầu GĐKD</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Infographic Table */}
              <div className="border border-[var(--mh-border)] rounded-3xl overflow-hidden bg-[var(--mh-surface-2)]/50 p-1">
                <div className="bg-slate-900 text-white p-4 flex items-center justify-between gap-2 border-b">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Bảng Thang Điểm &amp; Giới Hạn Chi Trả
                  </h3>
                  <span className="text-[10px] bg-slate-800 py-1 px-2.5 rounded-md font-mono text-[var(--mh-text-3)]">MAYHOMES 2026</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-[var(--mh-surface)]">
                  {/* Tier 1 */}
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-center bg-[var(--mh-surface-2)] p-3.5 border rounded-2xl shadow-xs">
                      <span className="font-mono text-xs font-black text-amber-600 bg-amber-50 py-1 px-3 border border-amber-200 rounded-lg">MỐC 01</span>
                      <strong className="text-[var(--mh-text)] text-sm font-black">Từ 0 – 30 Điểm</strong>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-2 border-b border-[var(--mh-border)]">
                        <span className="text-[var(--mh-text-2)] font-semibold">Tỷ lệ hỗ trợ:</span>
                        <strong className="text-[var(--mh-text)] font-extrabold">60% mức hỗ trợ cơ bản</strong>
                      </div>
                      <div className="flex justify-between py-2 border-b border-[var(--mh-border)]">
                        <span className="text-[var(--mh-text-2)] font-semibold">Hạn mức chi trả tối đa:</span>
                        <strong className="text-amber-600 font-black text-sm">15.000.000 VNĐ / Sale</strong>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-[var(--mh-text-2)] font-semibold">Điều kiện lao động:</span>
                        <span className="text-[var(--mh-text)] font-bold bg-[var(--mh-surface-2)] px-2 py-0.5 rounded-sm">Chấm đủ 30 công</span>
                      </div>
                    </div>
                  </div>

                  {/* Tier 2 */}
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-center bg-[var(--mh-surface-2)] p-3.5 border rounded-2xl shadow-xs">
                      <span className="font-mono text-xs font-black text-blue-600 bg-blue-50 py-1 px-3 border border-blue-200 rounded-lg">MỐC 02</span>
                      <strong className="text-[var(--mh-text)] text-sm font-black">Từ 30 Điểm Trở Lên</strong>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-2 border-b border-[var(--mh-border)]">
                        <span className="text-[var(--mh-text-2)] font-semibold">Tỷ lệ hỗ trợ:</span>
                        <strong className="text-[var(--mh-text)] font-extrabold">60% cơ bản + BONUS Thêm</strong>
                      </div>
                      <div className="flex justify-between py-2 border-b border-[var(--mh-border)]">
                        <span className="text-[var(--mh-text-2)] font-semibold">Hạn mức cơ bản:</span>
                        <strong className="text-blue-600 font-black text-sm">20.000.000 VNĐ / Sale</strong>
                      </div>
                      <div className="flex justify-between py-2 border-b border-[var(--mh-border)]">
                        <span className="text-[var(--mh-text-2)] font-semibold">Cơ chế Bonus Thêm:</span>
                        <strong className="text-emerald-600 font-bold text-right">+7.000.000 VNĐ cho mỗi 10 điểm tăng thêm (+10đ = +7TR)</strong>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-[var(--mh-text-2)] font-semibold">Ghi chú trần:</span>
                        <span className="text-[var(--mh-text-2)] font-medium text-right leading-relaxed">Giới hạn 20M/Sale không bao gồm phần Bonus thêm</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 text-amber-900 border-t border-[var(--mh-border)] p-4.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold rounded-b-3xl">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-amber-200 rounded-lg text-amber-900 font-black">✓</span>
                    <span>Quy định: Tổng mức hỗ trợ không vượt quá 100% chi phí thực tế chạy Marketing.</span>
                  </div>
                </div>
              </div>

              {/* Clawback Warning Notice */}
              <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                <span className="p-2.5 bg-rose-100 border border-rose-200 text-rose-600 rounded-xl mt-0.5 shrink-0 animate-pulse">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="text-xs font-black uppercase text-rose-800 tracking-wider">⚠️ Quy định cấn trừ khi phát sinh căn hủy:</h4>
                  <p className="text-xs font-semibold text-rose-950 mt-1 leading-relaxed">
                    Trường hợp căn phát sinh <strong className="text-rose-900">HỦY ở kỳ/tháng kế tiếp</strong>, phần điểm thi đua đã ghi nhận trước đó sẽ <strong className="text-rose-900 underline">bị trừ bù trực tiếp vào kỳ tính điểm tiếp theo</strong> để làm căn cứ chính xác xác định mức thưởng thêm tương ứng.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* DYNAMIC CALCULATOR COMPONENT */}
          <div className="bg-gradient-to-br from-[#102a43] via-[#1a365d] to-[#0f172a] rounded-[2.5rem] p-6 md:p-8 text-white border border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center gap-3">
              <span className="p-3 bg-[var(--mh-surface)]/10 text-amber-400 rounded-2xl">
                <Calculator className="w-6 h-6 animate-pulse" />
              </span>
              <div>
                <h3 className="text-lg font-black uppercase tracking-wider text-amber-400">CÔNG CỤ TÍNH MỨC HỖ TRỢ MARKETING DỰ TÍNH</h3>
                <p className="text-xs text-[var(--mh-text-3)] font-medium">Phỏng duyệt ngân sách được hỗ trợ dựa trên chính sách thi đua của năm 2026</p>
              </div>
            </div>

            <div className="bg-slate-950/40 p-6 rounded-3xl border border-white/5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              
              {/* Inputs */}
              <div className="lg:col-span-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--mh-text-3)] uppercase tracking-wider block">1. Ngân sách Đăng ký MKT (VNĐ):</label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={calcBudget}
                      onChange={(e) => handleBudgetChange(e.target.value)}
                      placeholder="Nhập ngân sách đăng ký..."
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-slate-100 text-sm font-mono font-bold focus:ring-2 focus:ring-amber-500/30 focus:outline-hidden"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--mh-text-2)]">VNĐ</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--mh-text-3)] uppercase tracking-wider block">2. Chi phí Thực tế Chạy MKT (VNĐ):</label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={calcCost}
                      onChange={(e) => handleCostChange(e.target.value)}
                      placeholder="Nhập thực chi..."
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-slate-100 text-sm font-mono font-bold focus:ring-2 focus:ring-amber-500/30 focus:outline-hidden"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--mh-text-2)]">VNĐ</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--mh-text-3)] uppercase tracking-wider block">3. Đầu Điểm Thi Đua Đạt Được (GĐKD):</label>
                  <div className="relative">
                    <input 
                      type="number"
                      value={calcPoints}
                      onChange={(e) => setCalcPoints(e.target.value)}
                      placeholder="Nhập số điểm..."
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-slate-100 text-sm font-mono font-bold focus:ring-2 focus:ring-amber-500/30 focus:outline-hidden"
                      min="0"
                      max="1000"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--mh-text-2)]">Điểm</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--mh-text-3)] uppercase tracking-wider block">4. Số lượng sale chấm công đủ 30 công:</label>
                  <div className="relative">
                    <input 
                      type="number"
                      value={calcSales}
                      onChange={(e) => setCalcSales(e.target.value)}
                      placeholder="Nhập số lượng sale..."
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-2xl px-4 py-3 text-slate-100 text-sm font-mono font-bold focus:ring-2 focus:ring-amber-500/30 focus:outline-hidden"
                      min="0"
                      max="500"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--mh-text-2)]">Sale</span>
                  </div>
                </div>
              </div>

              {/* Arrow divider */}
              <div className="lg:col-span-1 flex justify-center text-[var(--mh-text-2)] font-black">
                <ArrowRight className="w-6 h-6 rotate-90 lg:rotate-0 text-[var(--mh-text-2)]" />
              </div>

              {/* Outputs */}
              <div className="lg:col-span-6 bg-slate-950/80 rounded-2xl p-5 border border-slate-800/80 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 bg-amber-500/10 text-amber-400 rounded-bl-2xl font-black text-[9px] uppercase font-mono tracking-widest border-l border-b border-amber-500/10">
                  KẾT QUẢ ĐỐI SOÁT DỰ KIẾN
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black tracking-widest text-[var(--mh-text-3)] uppercase font-mono block">Mốc Đạt Được</span>
                  <div className={`text-xs font-bold flex items-center gap-1.5 ${isRatioValid ? 'text-amber-400' : 'text-red-400'}`}>
                    <span className={`inline-block w-2 h-2 rounded-full animate-ping ${isRatioValid ? 'bg-amber-500' : 'bg-red-500'}`} />
                    {formulaDesc}
                  </div>
                </div>

                <div className="divide-y divide-slate-800 space-y-3 pt-1 text-xs">
                  <div className="flex justify-between py-2 pt-0">
                    <span className="text-[var(--mh-text-3)] font-medium">Chi tiết tính toán:</span>
                    <span className="text-[var(--mh-text-3)] font-bold text-right max-w-[240px] leading-relaxed">{groupDesc}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-[var(--mh-text-3)] font-medium">Tỷ lệ thực tế / ngân sách:</span>
                    <span className={`font-mono font-extrabold ${isRatioValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {budgetRatio.toFixed(1)}% {isRatioValid ? '(Hợp lệ từ 70% đến 150%)' : '(Không hợp lệ: ngoài khoảng 70% - 150%)'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-[var(--mh-text-3)] font-medium">Hỗ trợ cơ bản áp dụng:</span>
                    <span className="text-[var(--mh-text-3)] font-bold font-mono">{(baseRate * 100)}% trên thực tế</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-[var(--mh-text-3)] font-medium">Mức hỗ trợ sau trần tối đa:</span>
                    <span className="text-[var(--mh-text-3)] font-bold font-mono">{acceptedBase.toLocaleString('vi-VN')} VNĐ</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-[var(--mh-text-3)] font-medium">Phần thưởng thêm (Bonus):</span>
                    <span className="text-emerald-400 font-black font-mono">+{bonus.toLocaleString('vi-VN')} VNĐ</span>
                  </div>

                  {isCappedAt100 && (
                    <div className="bg-red-500/15 text-red-300 p-2.5 rounded-xl text-[10.5px] font-bold leading-relaxed border border-red-500/20">
                      ⚠️ Lưu ý: Tổng chi phí được trần chặn bằng 100% chi phí chạy thực tế ({costNum.toLocaleString('vi-VN')} VNĐ) do tổng hỗ trợ đề xuất ban đầu ({rawSuggestedBeforeCap.toLocaleString('vi-VN')} VNĐ) vượt quá chi phí thực chạy.
                    </div>
                  )}

                  <div className="flex justify-between py-2 border-t border-slate-800">
                    <strong className="text-[var(--mh-text-3)] font-extrabold uppercase">Ước tính số nhận:</strong>
                    <strong className="text-amber-400 font-black text-lg font-mono">{finalSuggested.toLocaleString('vi-VN')} VNĐ</strong>
                  </div>
                </div>
                <div className="text-[11px] text-[var(--mh-text-3)] text-center italic mt-3 pt-2.5 border-t border-slate-800/80">
                  * Công cụ tính chỉ mang tính chất tham khảo.
                </div>
              </div>
            </div>
          </div>

          {/* Section II: Cơ Chế Cộng Điểm Sự Kiện */}
          <div id="mkt-event-points-sec" className="bg-[var(--mh-surface)] rounded-[2.5rem] border border-[var(--mh-border)] shadow-md p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <span className="p-3 bg-amber-50 text-amber-600 rounded-2xl shadow-xs">
                <Sparkles className="w-5 h-5 text-amber-600" />
              </span>
              <div>
                <h3 id="mkt-section-ii-title" className="text-base font-black text-slate-950 uppercase">II. CƠ CHẾ CỘNG ĐIỂM SỰ KIỆN</h3>
                <p className="text-xs text-[var(--mh-text-2)] font-medium font-sans">Ghi nhận điểm số tham gia chương trình thực chạy</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div id="mkt-event-card-1" className="border border-amber-100 bg-amber-50/10 p-5 rounded-2xl space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5 font-sans text-xs">
                  <div className="font-extrabold text-[#112a43] text-xs uppercase tracking-wider">01. Hệ thống SALEPRO</div>
                  <p className="text-[var(--mh-text-2)] leading-relaxed font-semibold">
                    Nhân sự kinh doanh tham gia các sự kiện được mở và ghi nhận trên hệ thống SALEPRO.
                  </p>
                </div>
                <Badge className="bg-slate-900 text-white font-mono text-[9px] w-fit font-black rounded-md tracking-wider">SALEPRO SYSTEM</Badge>
              </div>

              <div id="mkt-event-card-2" className="border border-[var(--mh-border)] bg-[var(--mh-surface-2)] p-5 rounded-2xl space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5 font-sans text-xs">
                  <div className="font-extrabold text-[var(--mh-text)] text-xs uppercase tracking-wider">02. Đề xuất từ GĐDA</div>
                  <p className="text-[var(--mh-text-2)] leading-relaxed font-semibold">
                    Giám đốc dự án có trách nhiệm tổng hợp danh sách, đề xuất mức cộng điểm và trình phê duyệt để làm căn cứ ghi nhận và đối soát.
                  </p>
                </div>
                <Badge className="bg-amber-100 text-amber-900 font-mono text-[9px] w-fit font-bold rounded-md">DUYỆT ĐỀ XUẤT</Badge>
              </div>
            </div>
          </div>

          {/* Section III: Quy Trình Nghiệm Thu &amp; Thanh Toán */}
          <div id="mkt-payout-process-sec" className="bg-[var(--mh-surface)] rounded-[2.5rem] border border-[var(--mh-border)] shadow-md p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[var(--mh-border)] pb-4">
              <div className="flex items-center gap-3">
                <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl shadow-xs">
                  <Clock className="w-5 h-5 text-blue-600" />
                </span>
                <div>
                  <h3 id="mkt-section-iii-title" className="text-base font-black text-slate-950 uppercase font-sans">III. QUY TRÌNH NGHIỆM THU VÀ THANH TOÁN</h3>
                  <p className="text-xs text-[var(--mh-text-2)] font-medium font-sans">Quy định chu kỳ thực hiện &amp; thời hạn hạch toán chi phí</p>
                </div>
              </div>
              <Badge className="bg-slate-900 text-white border-none font-black font-mono text-xs py-1.5 px-3 rounded-lg leading-snug h-auto max-w-full whitespace-normal break-words text-left shrink">
                📅 Kỳ nghiệm thu: Từ ngày 21 tháng trước đến ngày 20 tháng sau
              </Badge>
            </div>

            <div className="bg-[var(--mh-surface-2)] border rounded-2.5xl p-5 space-y-2">
              <span className="text-[10px] uppercase font-mono font-black text-[var(--mh-text-3)] tracking-wider">KỲ NGHIỆM THU:</span>
              <p className="font-mono text-xs text-[var(--mh-text)] font-black bg-[var(--mh-surface)] border border-[var(--mh-border)] px-3.5 py-2 rounded-xl inline-block shadow-xs">
                🗓️ Ví dụ: 21/05/2026 – 20/06/2026
              </p>
            </div>

            {/* Steps Steps Table matching Page 2 PDF */}
            <div className="border border-[var(--mh-border)] rounded-3xl overflow-x-auto overscroll-contain bg-[var(--mh-surface)] shadow-xs [-webkit-overflow-scrolling:touch]">
              <Table id="mkt-process-table" className="min-w-[640px]">
                <TableHeader className="bg-slate-900 hover:bg-slate-900 border-b border-[var(--mh-border)]">
                  <TableRow>
                    <TableHead className="w-16 text-center text-[11px] font-black uppercase tracking-wider text-slate-100">BƯỚC</TableHead>
                    <TableHead className="w-48 text-[11px] font-black uppercase tracking-wider text-slate-100">BỘ PHẬN XỬ LÝ</TableHead>
                    <TableHead className="text-[11px] font-black uppercase tracking-wider text-slate-100">NỘI DUNG THỰC HIỆN</TableHead>
                    <TableHead className="w-48 text-[11px] font-black uppercase tracking-wider text-slate-100">THỜI GIAN THỰC HIỆN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs font-sans">
                  <TableRow className="hover:bg-[var(--mh-surface-2)]/40 border-[var(--mh-border)]">
                    <TableCell className="text-center font-mono font-black text-[var(--mh-text)]">01</TableCell>
                    <TableCell className="font-extrabold text-[#112a43]">Digital Marketing</TableCell>
                    <TableCell className="font-medium text-[var(--mh-text-2)] leading-relaxed">
                      Tiếp nhận số liệu tổng hợp, đối soát và thực hiện nghiệm thu.
                    </TableCell>
                    <TableCell className="font-extrabold text-amber-600 font-mono">
                      Từ ngày <span className="font-sans font-black text-[var(--mh-text)]">21</span> đến ngày <span className="font-sans font-black text-[var(--mh-text)]">25</span> hàng tháng
                    </TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-[var(--mh-surface-2)]/40 border-[var(--mh-border)]">
                    <TableCell className="text-center font-mono font-black text-[var(--mh-text)]">02</TableCell>
                    <TableCell className="font-extrabold text-[#112a43] leading-relaxed">
                      <div>Digital Marketing</div>
                      <div className="text-[var(--mh-text-3)] font-bold">&amp; Team KD</div>
                    </TableCell>
                    <TableCell className="font-semibold text-[var(--mh-text-2)] leading-relaxed space-y-2">
                      <div className="bg-indigo-50/40 p-2.5 rounded-lg border border-indigo-100/40">
                        <strong className="text-indigo-900 block font-bold mb-0.5">• Digital Marketing:</strong>
                        Gửi số liệu tổng hợp cho Phòng Kế toán.
                      </div>
                      <div className="bg-blue-50/40 p-2.5 rounded-lg border border-blue-100/40">
                        <strong className="text-blue-900 block font-bold mb-0.5">• Team KD:</strong>
                        Nộp đề nghị thanh toán về Phòng Kế toán.
                        <div className="text-[var(--mh-text-3)] text-[11px] mt-0.5 font-medium italic">
                          (Đối với các chi nhánh tỉnh, nộp cho Hành chính tại Chi nhánh).
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-extrabold text-blue-600 font-mono">
                      Trước ngày <span className="font-sans font-black text-[var(--mh-text)]">30</span> hàng tháng
                    </TableCell>
                  </TableRow>

                  <TableRow className="hover:bg-[var(--mh-surface-2)]/40 border-[var(--mh-border)]">
                    <TableCell className="text-center font-mono font-black text-[var(--mh-text)]">03</TableCell>
                    <TableCell className="font-extrabold text-[#112a43]">Kế toán</TableCell>
                    <TableCell className="font-medium text-[var(--mh-text-2)] leading-relaxed">
                      Thực hiện thanh toán hỗ trợ Marketing theo đúng hồ sơ và số liệu đã được nghiệm thu.
                    </TableCell>
                    <TableCell className="font-extrabold text-emerald-600 font-mono">
                      Trước ngày <span className="font-sans font-black text-[var(--mh-text)]">10</span> của tháng kế tiếp
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Warning late blocks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div id="mkt-warning-card-1" className="bg-amber-50/15 border border-amber-200/60 p-4.5 rounded-2xl flex items-start gap-3 shadow-xs">
                <span className="p-2 bg-amber-100 text-amber-700 rounded-lg text-lg shrink-0 leading-none">⚠️</span>
                <div className="text-xs font-sans">
                  <strong className="text-amber-950 block font-bold mb-0.5">Lưu ý gửi hồ sơ muộn:</strong>
                  <span className="text-[var(--mh-text-2)] font-semibold leading-relaxed">Các trường hợp gửi hồ sơ muộn sẽ được chuyển sang tháng sau.</span>
                </div>
              </div>

              <div id="mkt-warning-card-2" className="bg-rose-50/15 border border-rose-200/60 p-4.5 rounded-2xl flex items-start gap-3 shadow-xs">
                <span className="p-2 bg-rose-100 text-rose-700 rounded-lg text-lg shrink-0 leading-none">🚫</span>
                <div className="text-xs font-sans">
                  <strong className="text-rose-950 block font-bold mb-0.5">Yêu cầu thời gian nộp hồ sơ:</strong>
                  <span className="text-[var(--mh-text-2)] font-semibold leading-relaxed">Hai tháng liên tiếp chậm gửi hồ sơ sẽ bị cắt hỗ trợ.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section IV: Nguyên Tắc Hồ Sơ Nhận Chi Phí MKT */}
          <div id="mkt-docs-principles-sec" className="bg-[var(--mh-surface)] rounded-[2.5rem] border border-[var(--mh-border)] shadow-md p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--mh-border)] pb-4">
              <span className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shadow-xs">
                <Receipt className="w-5 h-5 text-indigo-600" />
              </span>
              <div>
                <h3 id="mkt-section-iv-title" className="text-base font-black text-slate-950 uppercase font-sans">IV. NGUYÊN TẮC HỒ SƠ CHỨNG TỪ NHẬN HỖ TRỢ MKT</h3>
                <p className="text-xs text-[var(--mh-text-2)] font-medium">Quyết định thủ tục nhận kinh phí hỗ trợ theo dòng hoa hồng liên kết</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Group A: Pháp nhân */}
              <div id="mkt-docs-group-corporate" className="border border-[var(--mh-border)] bg-[var(--mh-surface-2)]/30 p-5 rounded-2.5xl space-y-4">
                <div className="flex items-center gap-2 bg-slate-900 text-white py-1.5 px-3 rounded-lg w-fit text-[11px] font-black uppercase tracking-wider font-mono">
                  <Landmark className="w-3.5 h-3.5" /> 1. CÁC TEAM NHẬN HOA HỒNG QUA PHÁP NHÂN
                </div>
                <p className="text-xs text-[var(--mh-text)] font-bold leading-relaxed font-sans">
                  Các team nhận Hoa hồng qua pháp nhân thì Hỗ trợ MKT yêu cầu nhận qua pháp nhân.
                </p>

                <div className="space-y-3 mt-4 text-xs font-sans">
                  {/* Case 1 */}
                  <div className="bg-[var(--mh-surface)] border rounded-2xl p-4.5 space-y-2 shadow-xs">
                    <strong className="text-blue-600 block font-black">• Trường hợp 1: Nhận Hỗ trợ MKT theo hình thức “Xuất hóa đơn Marketing”</strong>
                    <p className="text-[var(--mh-text-2)] leading-relaxed font-semibold">Nhân sự/Team thực hiện lập đầy đủ bộ hồ sơ hỗ trợ Marketing bao gồm:</p>
                    <div className="space-y-1.5 pl-4 text-[var(--mh-text-2)] font-semibold font-sans">
                      <div className="flex items-center gap-2"><span className="text-amber-500 font-bold">o</span> Hợp đồng.</div>
                      <div className="flex items-center gap-2"><span className="text-amber-500 font-bold">o</span> Phiếu đăng ký tham gia chương trình.</div>
                      <div className="flex items-center gap-2"><span className="text-amber-500 font-bold">o</span> Biên bản nghiệm thu.</div>
                      <div className="flex items-center gap-2"><span className="text-amber-500 font-bold">o</span> Hoá đơn.</div>
                    </div>
                  </div>

                  {/* Case 2 */}
                  <div className="bg-[var(--mh-surface)] border rounded-2xl p-4.5 space-y-1 shadow-xs">
                    <strong className="text-indigo-600 block font-black">• Trường hợp 2: Nhận Hỗ trợ MKT theo hình thức “Hoa hồng môi giới bổ sung”</strong>
                    <p className="text-[var(--mh-text-2)] leading-relaxed font-semibold">
                      Khoản chi phí Marketing sẽ được bổ sung vào hoa hồng của căn mà pháp nhân đã xuất hóa đơn cho Công ty trong năm 2026.
                    </p>
                  </div>
                </div>
              </div>

              {/* Group B: Cá nhân */}
              <div id="mkt-docs-group-individual" className="border border-[var(--mh-border)] bg-[var(--mh-surface-2)]/30 p-5 rounded-2.5xl space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 bg-slate-900 text-white py-1.5 px-3 rounded-lg w-fit text-[11px] font-black uppercase tracking-wider font-mono">
                    <Users className="w-3.5 h-3.5" /> 2. CÁC TEAM NHẬN HOA HỒNG QUA CÁ NHÂN
                  </div>
                  
                  <div className="space-y-3 font-sans text-xs leading-relaxed">
                    <p className="text-[var(--mh-text)] font-bold">
                      Nhận hỗ trợ thông qua tài khoản cá nhân:
                    </p>
                    <div className="bg-[var(--mh-surface)] border p-5 rounded-2xl space-y-2.5 shadow-xs font-sans">
                      <p className="text-[var(--mh-text-2)] font-semibold leading-relaxed">
                        Người nhận hỗ trợ Marketing phải là Sale đã từng nhận hoa hồng từ Công ty trong năm 2026 hoặc là Sale có phát sinh giao dịch bán hàng trong tháng xét duyệt Marketing.
                      </p>
                    </div>
                  </div>
                </div>

                <div id="mkt-policy-footer-badge" className="bg-amber-100/60 border border-amber-200 text-amber-900 p-3.5 rounded-xl text-center text-[11px] font-bold mt-4">
                  ⚡ Thời gian áp dụng: 21/05/2026
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>


      {/* Stepper Timeline Navigation */}
      <div className="bg-[var(--mh-surface)]/90 backdrop-blur border border-[var(--mh-border)]/80 p-5 rounded-[2rem] shadow-md">
        <h3 className="text-sm font-black text-[var(--mh-text)] uppercase tracking-widest mb-6 flex items-center gap-2 px-1">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" /> Sơ đồ quy trình 4 bước chính
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s, index) => {
            const isActive = activeStep === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveStep(s.id)}
                className={`relative group text-left p-5 rounded-2xl border transition-all duration-300 w-full overflow-hidden ${
                  isActive 
                    ? 'border-amber-500 bg-amber-50/40 shadow-md shadow-amber-500/5 translate-y-[-2px]' 
                    : 'border-[var(--mh-border)] hover:border-[var(--mh-border-strong)] bg-[var(--mh-surface)] hover:bg-[var(--mh-surface-2)]/65'
                }`}
              >
                {/* Accent strip */}
                <div className={`absolute top-0 left-0 right-0 h-1 transition-all ${
                  isActive ? 'bg-amber-500' : 'bg-[var(--mh-border)] group-hover:bg-slate-300'
                }`} />

                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className={`text-[11px] font-black uppercase tracking-wider ${
                    isActive ? 'text-amber-600' : 'text-[var(--mh-text-3)]'
                  }`}>
                    Bước {s.id}
                  </span>
                  <Badge variant="outline" className={`text-[10px] font-bold ${
                    isActive ? 'bg-amber-100 text-amber-800 border-ambient/20' : 'text-[var(--mh-text-2)]'
                  }`}>
                    {s.date}
                  </Badge>
                </div>

                <div className="font-bold text-slate-950 mt-3 text-sm md:text-base pr-4">
                  {s.title}
                </div>

                {index < 3 && (
                  <ArrowRight className="hidden lg:block absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mh-text-3)] opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Interactive Interactive Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Step details: col-span-8 */}
        <div className="lg:col-span-8 space-y-6">
          {activeStep === 1 && (
            <div className="bg-[var(--mh-surface)] rounded-[2rem] border border-[var(--mh-border)] shadow-md overflow-hidden animate-in fade-in duration-300">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-6 md:p-8 text-white flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-black uppercase tracking-widest text-amber-100 bg-[var(--mh-surface)]/10 px-3 py-1 rounded-full">Bước 1</span>
                  <h2 className="text-xl md:text-2xl font-black">ĐĂNG KÝ HỖ TRỢ CHI PHÍ</h2>
                  <p className="text-xs text-amber-50 font-medium">Cấu hình ngân sách dự toán trước chu kỳ</p>
                </div>
                <Badge className="bg-[var(--mh-surface)] text-amber-700 hover:bg-amber-50 py-1 px-3 text-xs font-bold rounded-lg shrink-0 shadow-sm font-mono">
                  Lần 1: 15 - 20 | Lần 2: 01 - 05 hàng tháng
                </Badge>
              </div>

              <div className="p-6 md:p-8 space-y-6">
                {/* Link Box */}
                <div className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-2xl p-5 md:p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Laptop className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-[var(--mh-text)]">Cổng đăng ký trực tuyến (giữ nguyên)</h4>
                      <p className="text-[11px] text-[var(--mh-text-2)] font-medium">Hệ thống ghi nhận tờ trình tự động</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch gap-2">
                    <div className="bg-[var(--mh-surface)] border rounded-xl px-4 py-3 flex-1 flex items-center justify-between font-mono text-xs font-bold text-[var(--mh-text-2)] select-all overflow-x-auto">
                      https://chiphi.mayhomes.net/
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => handleCopy('https://chiphi.mayhomes.net/', 'Cổng đăng ký')}
                        variant="outline"
                        className="rounded-xl shrink-0"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button 
                        asChild 
                        nativeButton={false} 
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold font-mono tracking-wide flex-1 sm:flex-initial"
                      >
                        <a href="https://chiphi.mayhomes.net/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                          MỞ LINK <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-[11px] text-indigo-700 font-semibold bg-indigo-50/60 p-3 rounded-lg border border-indigo-100">
                    <span className="shrink-0 text-amber-500 mt-0.5 animate-bounce">🚨</span>
                    <p>
                      <strong>Lưu ý quan trọng:</strong> Sao chép đường dẫn (Copy link) này và dán mở trên các trình duyệt web trực tiếp như <strong>Google Chrome hoặc Safari</strong>. <strong className="text-rose-600">TUYỆT ĐỐI KHÔNG</strong> mở trực tiếp thông qua trình duyệt nội bộ của ứng dụng Zalo để tránh lỗi form và phiên làm việc cookie.
                    </p>
                  </div>
                </div>

                {/* 3 Core Rules */}
                <div className="space-y-4 pt-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--mh-text-2)]">Quy tắc đăng ký ngân sách mới</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border border-emerald-200/80 bg-emerald-50/15 p-4 rounded-2xl flex flex-col justify-between space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </span>
                        <span className="text-xs font-extrabold uppercase text-emerald-800 tracking-wider">Lần 1: Đăng ký</span>
                      </div>
                      <p className="text-[11px] font-semibold leading-relaxed text-[var(--mh-text)]">
                        Thời gian đăng ký ban đầu từ <strong>ngày 15 hàng tháng</strong> đến ngày <strong>20 hàng tháng</strong>.
                      </p>
                    </div>

                    <div className="border border-blue-200/80 bg-blue-50/15 p-4 rounded-2xl flex flex-col justify-between space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-blue-100 text-blue-600 rounded-lg shrink-0">
                          <Laptop className="w-4 h-4" />
                        </span>
                        <span className="text-xs font-extrabold uppercase text-blue-800 tracking-wider">Lần 2: Cập nhật</span>
                      </div>
                      <p className="text-[11px] font-semibold leading-relaxed text-[var(--mh-text)]">
                        Thời gian cập nhật, điều chỉnh từ <strong>ngày 01 tháng tiếp theo</strong> đến ngày <strong>05 tháng tiếp theo</strong>.
                      </p>
                    </div>

                    <div className="border border-amber-200/80 bg-amber-50/15 p-4 rounded-2xl flex flex-col justify-between space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-amber-100 text-amber-600 rounded-lg shrink-0">
                          <AlertTriangle className="w-4 h-4" />
                        </span>
                        <span className="text-xs font-extrabold uppercase text-amber-800 tracking-wider">So khớp thực tế</span>
                      </div>
                      <p className="text-[11px] font-semibold leading-relaxed text-[var(--mh-text)]">
                        Kết thúc kỳ, thực tế nằm trong khoảng <strong>70% - 150%</strong> ngân sách &rarr; hỗ trợ <strong>60% thực tế + Bonus</strong>. Ngoài khoảng này &rarr; hỗ trợ <strong>40% thực tế</strong> (Không có Bonus).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="bg-[var(--mh-surface)] rounded-[2rem] border border-[var(--mh-border)] shadow-md overflow-hidden animate-in fade-in duration-300">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 md:p-8 text-white flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-black uppercase tracking-widest text-blue-100 bg-[var(--mh-surface)]/10 px-3 py-1 rounded-full">Bước 2</span>
                  <h2 className="text-xl md:text-2xl font-black">LẬP BÁO CÁO CO-MKT (.PPTX)</h2>
                  <p className="text-xs text-blue-50 font-medium">Báo cáo hiệu quả chất lượng theo mẫu kiểm toán</p>
                </div>
                <Badge className="bg-[var(--mh-surface)] text-blue-700 hover:bg-blue-50 py-1 px-3 text-xs font-bold rounded-lg shrink-0 shadow-sm font-mono">
                  Ngày 21 - 25 Hàng Tháng
                </Badge>
              </div>

              <div className="p-6 md:p-8 space-y-6">
                
                {/* Two-Column Drive & Zalo info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Google Drive Card */}
                  <div className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl w-10 h-10 flex items-center justify-center">
                        <Download className="w-5 h-5" />
                      </div>
                      <h4 className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wider">Thư viện Biểu mẫu chuẩn</h4>
                      <p className="text-[11px] leading-relaxed text-[var(--mh-text-2)] font-medium">
                        Tải trọn bộ tài liệu: File Mẫu Báo Cáo Slide (.PPTX), Đề Nghị Thanh Toán, Bảng Kê Chi Tiết.
                      </p>
                    </div>
                    <Button variant="outline" className="w-full bg-[var(--mh-surface)] border-[var(--mh-border)] text-blue-600 hover:text-blue-700 font-bold rounded-xl mt-2 flex items-center gap-2">
                      <ExternalLink className="w-3.5 h-3.5" /> Truy cập Google Drive
                    </Button>
                  </div>

                  {/* Zalo Card */}
                  <div className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl w-10 h-10 flex items-center justify-center">
                        <Send className="w-5 h-5" />
                      </div>
                      <h4 className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wider">Nộp hồ sơ mềm</h4>
                      <p className="text-[11px] leading-relaxed text-[var(--mh-text-2)] font-medium">
                        Gửi file mềm đã lập hoàn tất trực tiếp qua Zalo để kiểm duyệt cấu trúc kỹ thuật.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Button 
                        onClick={() => handleCopy('0854642555', 'Số điện thoại Zalo')}
                        variant="outline" 
                        className="flex-1 font-mono text-xs font-bold py-1 px-2 h-9 rounded-xl border-[var(--mh-border)]"
                      >
                        SĐT: 0854.64.2555
                      </Button>
                      <Badge className="bg-sky-600 hover:bg-sky-700 text-white font-black py-1.5 px-3 rounded-lg text-[10px] uppercase font-mono">
                        QTV: THIÊN VŨ
                      </Badge>
                    </div>
                  </div>

                </div>

                {/* Structure visual Tree */}
                <div className="border border-[var(--mh-border)] rounded-2xl p-5 space-y-3 bg-[var(--mh-surface-2)]/50">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--mh-text-2)]">Cấu trúc báo cáo phân cấp bắt buộc</h4>
                  
                  <div className="space-y-2 font-mono text-xs font-bold text-[var(--mh-text)]">
                    <div className="flex items-center gap-2 bg-[var(--mh-surface)] border p-3 rounded-xl shadow-xs">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">1</span>
                      <span>Mức 1:</span>
                      <span className="text-blue-600 font-extrabold uppercase">TÊN DỰ ÁN</span>
                    </div>

                    <div className="ml-6 flex items-center gap-2 bg-[var(--mh-surface)] border p-3 rounded-xl shadow-xs">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">2</span>
                      <span>Mức 2:</span>
                      <span className="text-indigo-600">CÁC KÊNH CHẠY SỐ</span>
                      <span className="font-normal text-[10px] text-[var(--mh-text-3)] font-sans italic">(VD: Facebook, Google, Tiktok)</span>
                    </div>

                    <div className="ml-12 flex items-center gap-2 bg-[var(--mh-surface)] border p-3 rounded-xl shadow-xs">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">3</span>
                      <span>Mức 3:</span>
                      <span className="text-emerald-600">CHI TIẾT TỪNG TÀI KHOẢN</span>
                      <span className="font-normal text-[10px] text-[var(--mh-text-3)] font-sans italic">(Bảng kê chi tiết tiền, nội dung, thời gian chạy)</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="bg-[var(--mh-surface)] rounded-[2rem] border border-[var(--mh-border)] shadow-md overflow-hidden animate-in fade-in duration-300">
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 md:p-8 text-white flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-black uppercase tracking-widest text-indigo-100 bg-[var(--mh-surface)]/10 px-3 py-1 rounded-full">Bước 3</span>
                  <h2 className="text-xl md:text-2xl font-black">NGHIỆM THU TÀI KHOẢN</h2>
                  <p className="text-xs text-indigo-50 font-medium">Đối soát nghiệp vụ phần mềm giám sát chiến dịch quảng cáo</p>
                </div>
                <Badge className="bg-[var(--mh-surface)] text-indigo-700 hover:bg-indigo-50 py-1 px-3 text-xs font-bold rounded-lg shrink-0 shadow-sm font-mono">
                  Ngày 25 - 31 Hàng Tháng
                </Badge>
              </div>

              <div className="p-6 md:p-8 space-y-6">
                
                {/* Software Box */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-2xl p-4 bg-[var(--mh-surface-2)] text-center space-y-2">
                    <div className="font-black text-[var(--mh-text)] text-xs uppercase tracking-wide">Công cụ 01</div>
                    <div className="font-black font-sans text-sky-600 text-base">Ultraview</div>
                    <div className="text-[10px] font-medium text-[var(--mh-text-3)]">Hỗ trợ kết nối Windows</div>
                  </div>

                  <div className="border rounded-2xl p-4 bg-[var(--mh-surface-2)] text-center space-y-2">
                    <div className="font-black text-[var(--mh-text)] text-xs uppercase tracking-wide">Công cụ 02</div>
                    <div className="font-black font-sans text-amber-600 text-base">Google Remote</div>
                    <div className="text-[10px] font-medium text-[var(--mh-text-3)]">Vận hành đa nền tảng</div>
                  </div>
                </div>

                {/* 3 Conditions */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--mh-text-2)]">3 Điều kiện Tiên quyết tuyệt đối</h4>
                  
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-3 bg-emerald-50/20 p-3.5 rounded-xl border border-emerald-100 text-emerald-950 font-sans text-xs font-semibold">
                      <span className="shrink-0 p-1 bg-emerald-500 text-white rounded-full mt-0.5">
                        <Check className="w-3 h-3" />
                      </span>
                      <div>
                        Trận dữ liệu tài khoản hiển thị chính xác: Chi phí thực tế khớp chu kỳ báo cáo, khung thời gian đối chiếu và phân phối nội dung đã cam kết.
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-emerald-50/20 p-3.5 rounded-xl border border-emerald-100 text-emerald-950 font-sans text-xs font-semibold">
                      <span className="shrink-0 p-1 bg-emerald-500 text-white rounded-full mt-0.5">
                        <Check className="w-3 h-3" />
                      </span>
                      <div>
                        Kênh hotline hiển thị trên các nội dung quảng cáo <strong>CHẮC CHẮN 100%</strong> phải là số hotline chính thức cấp của nhân sự Mayhomes.
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-rose-50/20 p-3.5 rounded-xl border border-rose-100 text-rose-950 font-sans text-xs font-semibold">
                      <span className="shrink-0 p-1 bg-rose-500 text-white rounded-full mt-0.5">
                        <XCircle className="w-3 h-3" />
                      </span>
                      <div>
                        <strong>TUYỆT ĐỐI KHÔNG NGHIỆM THU</strong> đối với các dải tài khoản quảng cáo đang bị khóa, bị vô hiệu hóa hoặc không còn khả năng đăng nhập truy xuất trực tiếp.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Campaign Naming Standard */}
                <div className="border-2 border-dashed border-indigo-100 rounded-3xl p-5 space-y-4 bg-indigo-50/10">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                      <Users className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-black uppercase text-indigo-800 tracking-wider">Tiêu chuẩn đặt tên chiến dịch</span>
                  </div>

                  <div className="bg-[var(--mh-surface)] border rounded-2xl p-4 text-center font-mono text-sm font-extrabold text-[#102A43] tracking-wide border-indigo-200">
                    [MAYHOMES] + [TÊN ĐỘI] + [DỰ ÁN]
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-emerald-50/50 border border-emerald-200 p-3.5 rounded-xl">
                      <div className="font-extrabold text-emerald-800 mb-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> NÊN (Mẫu Chuẩn)
                      </div>
                      <div className="font-mono font-bold text-[var(--mh-text)] bg-[var(--mh-surface)] p-2 rounded border mt-1 select-all text-center">
                        Mayhomes - MAY01.1 - OCP23
                      </div>
                    </div>

                    <div className="bg-rose-50/50 border border-rose-200 p-3.5 rounded-xl">
                      <div className="font-extrabold text-rose-800 mb-1 flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" /> KHÔNG NÊN (Sai Lỗi)
                      </div>
                      <div className="font-mono font-bold text-[var(--mh-text-3)] bg-[var(--mh-surface)]/40 p-2 rounded border border-dashed mt-1 text-center line-through">
                        MH - MAY01.1 - OCP23
                      </div>
                      <p className="text-[10px] text-rose-600 font-bold mt-1.5 italic">Lỗi nghiêm trọng: Viết tắt chữ Mayhomes</p>
                    </div>
                  </div>

                  <div className="bg-rose-950 text-rose-100 p-3.5 rounded-xl text-center text-[11px] font-bold">
                    🚫 TUYỆT ĐỐI NGHIÊM CẤM: Hành vi đổi tên đổi nhãn chiến dịch cũ từ đơn vị/đại lý khác sang nhãn Mayhomes. Vi phạm sẽ bị tước quyền lợi nghiệm thu ngay lập tức!
                  </div>
                </div>

                {/* Zalo Match Group */}
                <div className="bg-[var(--mh-surface-2)] border p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex gap-3 items-center">
                    <span className="p-3 bg-sky-100 text-sky-600 rounded-xl font-black font-mono text-sm leading-none shrink-0">Zalo</span>
                    <div>
                      <h5 className="font-extrabold text-[var(--mh-text)] text-sm">Nhóm Zalo Lịch Nghiệm Thu</h5>
                      <p className="text-[11px] text-[var(--mh-text-3)] font-medium">Báo lịch trực tuyến định kỳ hàng tuần</p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto shrink-0">
                    <Button 
                      onClick={() => handleCopy('https://zalo.me/g/qtcgqe642', 'Nhóm Zalo Nghiệm Thu')}
                      variant="outline" 
                      className="rounded-xl flex-1 md:flex-initial"
                    >
                      Copy Link Group
                    </Button>
                    <Button asChild nativeButton={false} className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold flex-1 md:flex-initial">
                      <a href="https://zalo.me/g/qtcgqe642" target="_blank" rel="noopener noreferrer">
                        Tham gia nhóm
                      </a>
                    </Button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeStep === 4 && (
            <div className="bg-[var(--mh-surface)] rounded-[2rem] border border-[var(--mh-border)] shadow-md overflow-hidden animate-in fade-in duration-300">
              <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-6 md:p-8 text-white flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-black uppercase tracking-widest text-emerald-100 bg-[var(--mh-surface)]/10 px-3 py-1 rounded-full">Bước 4</span>
                  <h2 className="text-xl md:text-2xl font-black">NỘP HỒ SƠ BẢN CỨNG</h2>
                  <p className="text-xs text-emerald-50 font-medium">Nộp chứng từ trực tiếp để bộ phận tài vụ làm hồ sơ thanh quyết toán</p>
                </div>
                <Badge className="bg-[var(--mh-surface)] text-emerald-700 hover:bg-emerald-50 py-1 px-3 text-xs font-bold rounded-lg shrink-0 shadow-sm font-mono">
                  Trước Ngày 05 Tháng Sau
                </Badge>
              </div>

              <div className="p-6 md:p-8 space-y-6">
                
                {/* Document checklist inside folder */}
                <div className="bg-[var(--mh-surface-2)] border p-6 rounded-3xl space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--mh-text-2)] flex items-center gap-2">
                    📂 Tủ Hồ sơ thanh quyết toán chuẩn:
                  </h4>

                  <div className="space-y-3 font-sans text-xs text-[var(--mh-text)] font-bold">
                    <div className="flex items-center gap-3 bg-[var(--mh-surface)] p-3 border rounded-xl shadow-xs">
                      <span className="p-1 bg-emerald-500 text-white rounded-md shrink-0">
                        <FileText className="w-4 h-4" />
                      </span>
                      <div className="flex-1">
                        <h6>File báo cáo MKT bản giấy</h6>
                        <p className="text-[10px] text-[var(--mh-text-3)] font-normal">Đã có ký xác nhận thẩm duyệt trực tiếp từ đại diện Team Digital</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 bg-[var(--mh-surface)] p-3 border rounded-xl shadow-xs">
                      <span className="p-1 bg-emerald-500 text-white rounded-md shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </span>
                      <div className="flex-1">
                        <h6>Bảng kê chi tiết các hạng mục thanh toán</h6>
                        <p className="text-[10px] text-[var(--mh-text-3)] font-normal">Liệt kê rõ ràng số tham chiếu và số liệu chiến dịch thực tế</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 bg-[var(--mh-surface)] p-3 border rounded-xl shadow-xs">
                      <span className="p-1 bg-emerald-500 text-white rounded-md shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                      <div className="flex-1">
                        <h6>Giấy Đề nghị thanh toán văn bản mẫu</h6>
                        <p className="text-[10px] text-[var(--mh-text-3)] font-normal">Ký tươi, ghi rõ người thụ hưởng và các đề xuất thanh toán</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-emerald-800 font-bold italic text-center pt-2">
                    💡 Lưu ý: Anh/Chị bắt buộc phải scan thành tệp PDF đối với Giấy Đề nghị thanh toán và đính kèm gửi cùng file báo cáo mềm!
                  </p>
                </div>

                {/* Contacts according to regions page 8 */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[var(--mh-text-2)]">Đầu mối đại diện nhận hồ sơ theo vùng</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Region North */}
                    <div className="border border-[var(--mh-border)] bg-[var(--mh-surface)] rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-3 bg-teal-500/10 text-teal-800 rounded-bl-xl font-bold font-mono text-[10px] uppercase">
                        Miền Bắc &amp; Trung
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-extrabold text-[var(--mh-text-2)]">Khu vực:</div>
                        <h5 className="font-extrabold text-[var(--mh-text)] text-sm">Hà Nội, Hải Phòng, Thanh Hóa, Nha Trang, Quảng Ninh</h5>
                      </div>
                      <div className="border-t pt-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-[var(--mh-surface-2)] flex items-center justify-center font-extrabold text-[var(--mh-text)] text-xs shadow-inner">
                             Hồng 
                          </div>
                          <div>
                            <h6 className="font-black text-[var(--mh-text)] text-xs">Ms. Hồng</h6>
                            <p className="text-[10px] text-[var(--mh-text-3)] font-mono">0343.251.535</p>
                          </div>
                        </div>
                        <Button 
                          onClick={() => handleCopy('0343251535', 'SĐT Ms Hồng')} 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 rounded-lg text-emerald-600 font-bold"
                        >
                          Copy SĐT
                        </Button>
                      </div>
                    </div>

                    {/* Region South */}
                    <div className="border border-[var(--mh-border)] bg-[var(--mh-surface)] rounded-2xl p-5 space-y-4 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-3 bg-indigo-500/10 text-indigo-800 rounded-bl-xl font-bold font-mono text-[10px] uppercase">
                        Miền Nam
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-extrabold text-[var(--mh-text-2)]">Khu vực:</div>
                        <h5 className="font-extrabold text-[var(--mh-text)] text-sm">Chi Nhánh Miền Nam</h5>
                      </div>
                      <div className="border-t pt-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-[var(--mh-surface-2)] flex items-center justify-center font-extrabold text-[var(--mh-text)] text-xs shadow-inner">
                            Nhung
                          </div>
                          <div>
                            <h6 className="font-black text-[var(--mh-text)] text-xs">Ms. Hồng Nhung</h6>
                            <p className="text-[10px] text-[var(--mh-text-3)] font-mono">Đầu mối phụ trách</p>
                          </div>
                        </div>
                        <Badge className="bg-indigo-100 text-indigo-800 font-bold font-mono text-[9px] py-0.5 rounded-md border-none">
                          MIỀN NAM
                        </Badge>
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Quy Định Tài Chính Card (Page 9) */}
          <div className="bg-[var(--mh-surface)] rounded-[2rem] border border-[var(--mh-border)] shadow-md p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <span className="p-3 bg-[var(--mh-surface-2)] text-[var(--mh-text)] rounded-2xl shadow-sm">
                <Building2 className="w-6 h-6" />
              </span>
              <div>
                <h3 className="text-lg font-black text-[var(--mh-text)] uppercase">Thông tin Hóa đơn VAT Mayhomes</h3>
                <p className="text-xs text-[var(--mh-text-2)] font-medium">Bắt buộc lập chính xác thông tin pháp lý của Công ty</p>
              </div>
            </div>

            {/* Corporate VAT Card Visual (Page 9) */}
            <div className="bg-slate-900 text-white rounded-3xl p-6 relative overflow-hidden border border-slate-800 shadow-lg select-all">
              <div className="absolute bottom-0 right-0 translate-x-10 translate-y-10 w-44 h-44 rounded-full bg-slate-800/20 blur-3xl" />
              
              <div className="space-y-4 font-sans text-xs relative">
                <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black tracking-wider uppercase text-amber-500">Mẫu hóa đơn GTGT</span>
                    <h5 className="font-black text-sm text-slate-100">CÔNG TY CP KINH DOANH BĐS MAYHOMES</h5>
                  </div>
                  <Badge variant="outline" className="border-amber-500/30 text-amber-500 text-[10px] py-0 font-mono">
                    MST: 0110347195
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 font-sans text-[11px] leading-relaxed text-[var(--mh-text-3)]">
                  <div className="space-y-2">
                    <div>
                      <strong className="text-[var(--mh-text-3)] block text-[9.5px] uppercase font-black">Địa chỉ pháp lý:</strong>
                      <span>SB24-30, Sao Biển 24, KĐT Vinhomes Ocean Park, Xã Gia Lâm, Thành phố Hà Nội, Việt Nam.</span>
                    </div>
                    <div>
                      <strong className="text-[var(--mh-text-3)] block text-[9.5px] uppercase font-black">Đại diện pháp luật:</strong>
                      <span className="font-bold text-white">Đặng Thị Phước Hạnh</span> <span className="text-[var(--mh-text-3)] font-normal text-[10px] italic">(Tổng Giám Đốc)</span>
                    </div>
                  </div>

                  <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                    <div>
                      <strong className="text-amber-500 block text-[9.5px] uppercase font-black">Số tài khoản ngân hàng:</strong>
                      <span className="font-mono font-bold text-sm text-white select-all">16868168</span>
                    </div>
                    <div>
                      <strong className="text-[var(--mh-text-3)] block text-[9.5px] uppercase font-black">Mở tại Ngân hàng:</strong>
                      <span>Techcombank – Chi Nhánh Hà Nội</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-3 flex flex-col sm:flex-row justify-between gap-2 items-stretch sm:items-center text-[11.5px]">
                  <div className="font-semibold text-[var(--mh-text-3)]">
                    📧 Email nhận hóa đơn mềm: <strong className="text-slate-100 font-mono">ketoanhoadon@mayhomes.vn</strong>
                  </div>
                  <Button 
                    onClick={() => handleCopy('ketoanhoadon@mayhomes.vn', 'Email nhận HĐ')}
                    size="sm" 
                    className="bg-slate-800 hover:bg-slate-700 text-white rounded-lg gap-1.5 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" /> Sao chép Email
                  </Button>
                </div>
              </div>
            </div>

            {/* Email title protocol */}
            <div className="border border-[var(--mh-border)] rounded-2xl p-4 md:p-5 bg-[var(--mh-surface-2)] space-y-2 text-xs">
              <h5 className="font-extrabold text-[var(--mh-text)]">Cú pháp Tiêu đề Email bắt buộc:</h5>
              <div className="bg-[var(--mh-surface)] border rounded-xl p-3 text-center font-mono font-black text-[var(--mh-text)] tracking-wider">
                Mã nhóm_Tên nhóm_Số Hóa đơn
              </div>
              <p className="text-[10px] text-[var(--mh-text-3)] font-semibold italic">
                * Note quan trọng: Riêng đối với kênh đăng tin, Anh/Chị bắt buộc phải gửi đính kèm đầy đủ hình ảnh/ảnh chụp bài đăng thực tế.
              </p>
            </div>

            {/* Bds.com specific warning Page 10 */}
            <div className="border-2 border-rose-500/20 bg-rose-50/15 rounded-3xl p-5 md:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="p-2.5 bg-rose-500 text-white rounded-2xl shrink-0 mt-0.5 animate-pulse">
                  <ShieldAlert className="w-5 h-5" />
                </span>
                <div className="space-y-1">
                  <h4 className="font-black text-sm text-rose-900 uppercase">
                    LƯU Ý RIÊNG: KÊNH ĐĂNG TIN BĐS.COM
                  </h4>
                  <p className="text-[10.5px] font-bold text-rose-700 bg-rose-100/65 py-0.5 px-2 rounded-md inline-block">
                    ⚡ Quy định áp dụng chính thức từ ngày: 21/05/2026
                  </p>
                </div>
              </div>

              <div className="bg-[var(--mh-surface)] border border-rose-300 p-4 rounded-2xl shadow-sm text-center">
                <p className="text-xs font-black text-rose-900 leading-relaxed">
                  CÔNG TY SẼ CHÍNH THỨC <span className="bg-rose-100 text-rose-600 px-1 py-0.5 rounded">NGỪNG HỖ TRỢ</span> CHI PHÍ ĐĂNG TIN ĐỐI VỚI CÁC TÀI KHOẢN NẠP TIỀN QUA <span className="text-red-600 underline">TÀI KHOẢN CÁ NHÂN</span>.
                </p>
                <p className="text-[10.5px] font-semibold text-[var(--mh-text-2)] mt-2">
                  Vui lòng khẩn trương chuẩn bị và triển khai phương án chuyển đổi từ bây giờ!
                </p>
              </div>

              <div className="p-4 bg-[var(--mh-surface-2)] border rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold text-[var(--mh-text)]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-900" />
                  <span>Đăng ký chung BẮT BUỘC qua nhóm Zalo Công ty</span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto shrink-0">
                  <Button 
                    onClick={() => handleCopy('https://zalo.me/g/vyfmvn754', 'Group Zalo bds.com')}
                    size="sm" 
                    variant="outline" 
                    className="flex-1 sm:flex-initial"
                  >
                    Copy Link
                  </Button>
                  <Button asChild nativeButton={false} size="sm" className="bg-slate-900 hover:bg-slate-900 text-white flex-1 sm:flex-initial">
                    <a href="https://zalo.me/g/vyfmvn754" target="_blank" rel="noopener noreferrer">
                      Vào Group
                    </a>
                  </Button>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Sidebar: checklist checklist & final acceptance checklist: col-span-4 */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Last Check checklist Card Page 11 */}
          <div className="bg-gradient-to-b from-[#102A43] to-slate-900 text-[var(--mh-text-3)] rounded-[2.5rem] border border-slate-800 shadow-xl p-6 md:p-8 space-y-6">
            <div className="space-y-1 text-center">
              <span className="text-amber-500 p-2.5 bg-slate-800 rounded-3xl inline-block shadow-lg shadow-slate-950/40">
                <QrCode className="w-6 h-6" />
              </span>
              <h3 className="text-lg font-black text-white uppercase tracking-wider pt-2">KIỂM TRA LẦN CUỐI</h3>
              <p className="text-[11px] text-[var(--mh-text-3)] font-medium">Khi đạt đủ 5 checklist này, hồ sơ của bạn đã trong trạng thái sãn sàng chờ duyệt!</p>
            </div>

            <div className="space-y-3 pt-2">
              {[
                { id: 1, text: 'Tôi đã đăng ký ngân sách hỗ trợ trên web trước mốc ngày 20 chưa?' },
                { id: 2, text: 'File báo cáo (.PPTX) đã phân chia chính xác cấu trúc phân cấp (Dự án > Kênh > Tài khoản) chưa?' },
                { id: 3, text: 'Tên chiến dịch quảng cáo đã chỉnh sửa đúng định dạng mẫu chuẩn [Mayhomes] + [Tên đội] + [Dự án] chưa?' },
                { id: 4, text: 'Hotline được cài đặt chạy Ads CÓ PHẢI là số thuộc cấp quyền của nhân sự Mayhomes không?' },
                { id: 5, text: 'Các hạng mục giao dịch trên 5 triệu đồng đã được chuyển thẳng trực tiếp từ ngân hàng Mayhomes sang nhà cung cấp (Vendor) chưa?' }
              ].map((item) => {
                const checked = checklist[item.id];
                return (
                  <button
                    key={item.id}
                    onClick={() => handleToggleCheck(item.id)}
                    className={`w-full flex items-start gap-3 p-3.5 rounded-2xl text-left border transition-all ${
                      checked 
                        ? 'bg-amber-500/10 border-amber-500/40 text-white' 
                        : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-950/60 text-[var(--mh-text-3)]'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border mt-0.5 transition-all duration-300 ${
                      checked 
                        ? 'bg-amber-500 border-amber-400 text-slate-950 scale-110' 
                        : 'border-slate-700 bg-slate-900/50'
                    }`}>
                      {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </span>
                    <span className="text-xs font-semibold leading-relaxed leading-[1.45]">
                      {item.id}. {item.text}
                    </span>
                  </button>
                );
              })}
            </div>

            {allChecked ? (
              <div className="bg-emerald-500/20 border-2 border-emerald-500 text-emerald-300 p-4 rounded-2xl text-center font-bold text-xs leading-relaxed animate-bounce duration-500 mt-4">
                🎉 HỒ SƠ ĐÃ HOÀN HẢO! <br/>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white">Sẵn sàng nộp và chờ duyệt quyết toán</span>
              </div>
            ) : (
              <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl text-center text-[10px] text-[var(--mh-text-2)] font-bold tracking-widest uppercase">
                Vui lòng check đủ 5 mục chứng từ
              </div>
            )}
          </div>

          {/* Quick FAQ / Contacts info */}
          <div className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-[2rem] p-6 space-y-4 shadow-sm">
            <h4 className="text-xs font-black uppercase text-[var(--mh-text-2)] tracking-wider">Hỗ trợ khẩn cấp</h4>
            
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 p-2.5 bg-[var(--mh-surface)] border rounded-xl">
                <span className="font-extrabold text-[var(--mh-text)]">Digital Marketing</span>
                <Badge className="bg-[var(--mh-border)] hover:bg-[var(--mh-border)] text-[var(--mh-text)] border-none font-bold font-mono">zalo/hotline</Badge>
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 bg-[var(--mh-surface)] border rounded-xl">
                <span className="font-extrabold text-[var(--mh-text)]">Phòng Kế toán</span>
                <Badge className="bg-[var(--mh-border)] hover:bg-[var(--mh-border)] text-[var(--mh-text)] border-none font-bold font-mono">quyết toán nước</Badge>
              </div>
            </div>

            <p className="text-[10px] leading-relaxed text-[var(--mh-text-3)] italic text-center pt-1">
              "Mọi thắc mắc xin vui lòng liên hệ Bộ phận Digital Marketing hoặc Phòng Kế toán."
            </p>
          </div>

        </div>

      </div>
      </>
      )}

    </div>
  );
}
