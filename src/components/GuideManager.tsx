import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  CreditCard, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  HelpCircle, 
  ExternalLink, 
  Copy, 
  Printer, 
  Search, 
  Smartphone, 
  Globe, 
  Clock, 
  ChevronRight, 
  Check, 
  Sparkles, 
  Layers, 
  FileText, 
  Info, 
  Key, 
  RefreshCw, 
  Building2, 
  ShieldCheck,
  DollarSign,
  Lock,
  ArrowRight,
  Eye,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface GuideItem {
  id: string;
  title: string;
  category: 'fb-ads' | 'budget' | 'acceptance' | 'reciprocal';
  categoryLabel: string;
  badge?: string;
  readTime: string;
  updatedAt: string;
  description: string;
}

export function GuideManager() {
  const [selectedGuideId, setSelectedGuideId] = useState<string>('fb-add-card');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Interactive checklist state for Add Card FB
  const [fbChecklist, setFbChecklist] = useState<Record<string, boolean>>({
    step1_hasCard: false,
    step1_onlinePayment: false,
    step1_balance: false,
    step2_correctAccount: false,
    step3_cleanIP: false,
    step4_timezoneCurrency: false,
    step5_otpReady: false,
  });

  // Note customization by user
  const [customNote, setCustomNote] = useState<string>(() => {
    return localStorage.getItem('mayhomes_guide_fb_custom_note') || '';
  });
  const [isEditingNote, setIsEditingNote] = useState<boolean>(false);
  const [tempNote, setTempNote] = useState<string>('');

  const guides: GuideItem[] = [
    {
      id: 'fb-add-card',
      title: 'Hướng dẫn add thẻ vào tài khoản quảng cáo Facebook (Meta Ads)',
      category: 'fb-ads',
      categoryLabel: 'Quảng cáo Facebook',
      badge: 'Quan trọng & Mới',
      readTime: '4 phút',
      updatedAt: '28/09/2026',
      description: 'Quy trình chi tiết 5 bước thêm phương thức thanh toán Visa/Mastercard vào Trình quản lý quảng cáo FB, chống hold tiền và die tài khoản.'
    },
    {
      id: 'budget-registration',
      title: 'Hướng dẫn Đăng ký Ngân sách Marketing theo Khối / Ban KD',
      category: 'budget',
      categoryLabel: 'Ngân sách MKT',
      badge: 'Quy chuẩn',
      readTime: '3 phút',
      updatedAt: '20/09/2026',
      description: 'Thời hạn đăng ký 2 đợt trong tháng, cách phân bổ theo từng dự án và quy trình phê duyệt hạn mức ngân sách.'
    },
    {
      id: 'acceptance-sync',
      title: 'Hướng dẫn Lập & Nghiệm thu Chi phí MKT thực tế',
      category: 'acceptance',
      categoryLabel: 'Nghiệm thu MKT',
      badge: 'Đồng bộ tự động',
      readTime: '5 phút',
      updatedAt: '25/09/2026',
      description: 'Cách tổng hợp hóa đơn thẻ, xuất file đối soát từ Trình quản lý quảng cáo và đồng bộ bảng nghiệm thu vào hệ thống.'
    },
    {
      id: 'reciprocal-flow',
      title: 'Quy trình Đối ứng & Thanh toán Chi phí Marketing',
      category: 'reciprocal',
      categoryLabel: 'Quy trình Đối ứng',
      badge: 'Kế toán',
      readTime: '4 phút',
      updatedAt: '18/09/2026',
      description: 'Hồ sơ chứng từ cần nộp, chu kỳ thanh quyết toán đối ứng giữa Khối kinh doanh và Phòng Kế toán công ty.'
    }
  ];

  const filteredGuides = useMemo(() => {
    return guides.filter(g => {
      const matchCat = selectedCategory === 'all' || g.category === selectedCategory;
      const matchQuery = !searchQuery.trim() || 
        g.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        g.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [guides, selectedCategory, searchQuery]);

  const toggleCheck = (key: string) => {
    setFbChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyLink = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    toast.success(`Đã sao chép link ${label}!`);
  };

  const handleSaveCustomNote = () => {
    setCustomNote(tempNote);
    localStorage.setItem('mayhomes_guide_fb_custom_note', tempNote);
    setIsEditingNote(false);
    toast.success('Đã lưu ghi chú bổ sung nội bộ thành công!');
  };

  const handlePrint = () => {
    window.print();
  };

  const checklistProgress = useMemo(() => {
    const total = Object.keys(fbChecklist).length;
    const completed = Object.values(fbChecklist).filter(Boolean).length;
    return Math.round((completed / total) * 100);
  }, [fbChecklist]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-indigo-500/20">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-32 -bottom-20 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-xs font-bold tracking-wide">
              <BookOpen className="w-3.5 h-3.5 text-indigo-300" />
              <span>TRUNG TÂM TÀI LIỆU & HƯỚNG DẪN KỸ THUẬT</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Hướng Dẫn Sử Dụng & Quy Trình Marketing
            </h1>
            <p className="text-[var(--mh-text-3)] text-xs sm:text-sm max-w-2xl leading-relaxed">
              Tổng hợp cẩm nang thao tác chuẩn, quy chuẩn add thẻ thanh toán quảng cáo Facebook, quản lý ngân sách chiến dịch và đối soát nghiệm thu minh bạch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              onClick={handlePrint}
              variant="outline"
              size="sm"
              className="bg-[var(--mh-surface)]/10 hover:bg-[var(--mh-surface)]/20 border-white/20 text-white rounded-xl font-bold text-xs h-9"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              In / Xuất tài liệu
            </Button>
            <Button
              onClick={() => {
                setSelectedGuideId('fb-add-card');
                window.scrollTo({ top: 380, behavior: 'smooth' });
              }}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs h-9 shadow-lg shadow-indigo-600/30"
            >
              <CreditCard className="w-4 h-4 mr-1.5" />
              Xem Hướng dẫn Add Thẻ FB
            </Button>
          </div>
        </div>

        {/* Search & Categories Bar */}
        <div className="relative z-10 mt-6 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--mh-text-3)]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm tài liệu, quy trình, từ khóa..."
              className="h-10 pl-9.5 pr-4 bg-[var(--mh-surface)]/10 border-white/15 text-white placeholder:text-[var(--mh-text-3)] rounded-xl text-xs focus:ring-2 focus:ring-indigo-400 focus:bg-[var(--mh-surface)]/15"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-center gap-1.5 md:overflow-x-auto md:scrollbar-hide py-1">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'fb-ads', label: 'Quảng cáo Facebook' },
              { id: 'budget', label: 'Ngân sách MKT' },
              { id: 'acceptance', label: 'Nghiệm thu' },
              { id: 'reciprocal', label: 'Đối ứng' }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? 'bg-[var(--mh-surface)] text-[var(--mh-text)] shadow-md font-black'
                    : 'bg-[var(--mh-surface)]/5 hover:bg-[var(--mh-surface)]/10 text-[var(--mh-text-3)]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Navigation: Guide List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase text-[var(--mh-text-2)] tracking-wider">
              Danh sách cẩm nang ({filteredGuides.length})
            </span>
          </div>

          <div className="space-y-2.5">
            {filteredGuides.map((guide) => {
              const isSelected = selectedGuideId === guide.id;
              return (
                <div
                  key={guide.id}
                  onClick={() => setSelectedGuideId(guide.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer text-left relative ${
                    isSelected
                      ? 'bg-[var(--mh-surface)] border-indigo-500 shadow-md shadow-indigo-100 ring-2 ring-indigo-500/10'
                      : 'bg-[var(--mh-surface)]/80 hover:bg-[var(--mh-surface)] border-[var(--mh-border)]/80 hover:border-[var(--mh-border-strong)] shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      {guide.categoryLabel}
                    </span>
                    {guide.badge && (
                      <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                        {guide.badge}
                      </span>
                    )}
                  </div>

                  <h3 className={`text-sm font-black line-clamp-2 leading-snug mb-1.5 ${
                    isSelected ? 'text-indigo-950' : 'text-[var(--mh-text)]'
                  }`}>
                    {guide.title}
                  </h3>

                  <p className="text-[var(--mh-text-2)] text-xs line-clamp-2 leading-relaxed mb-3">
                    {guide.description}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-[var(--mh-text-3)] font-medium pt-2 border-t border-[var(--mh-border)]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[var(--mh-text-3)]" /> {guide.readTime}
                    </span>
                    <span className="flex items-center gap-1 text-indigo-600 font-bold">
                      Xem chi tiết <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Help Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 text-xs space-y-2.5">
            <div className="flex items-center gap-2 text-blue-900 font-black">
              <HelpCircle className="w-4 h-4 text-blue-600" />
              <span>Cần hỗ trợ kỹ thuật trực tiếp?</span>
            </div>
            <p className="text-[var(--mh-text-2)] leading-relaxed">
              Nếu gặp sự cố về thẻ bị gắn cờ, tài khoản quảng cáo bị vô hiệu hóa hoặc cần cấp quyền Business Manager dự án, vui lòng liên hệ bộ phận hỗ trợ MKT.
            </p>
            <div className="pt-1">
              <a
                href="#support"
                onClick={(e) => {
                  e.preventDefault();
                  toast.info('Vui lòng chuyển sang tab "Hỗ trợ kỹ thuật" trên menu chính để gửi phiếu yêu cầu!');
                }}
                className="inline-flex items-center gap-1.5 text-blue-700 font-bold hover:underline"
              >
                Gửi yêu cầu hỗ trợ ngay <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Right Content Area: Detailed Guide Display */}
        <div className="lg:col-span-8 space-y-6">
          {selectedGuideId === 'fb-add-card' && (
            <div className="bg-[var(--mh-surface)] rounded-3xl border border-[var(--mh-border)]/90 shadow-sm overflow-hidden divide-y divide-slate-100">
              {/* Guide Header */}
              <div className="p-6 sm:p-8 bg-gradient-to-b from-indigo-50/40 to-transparent space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-blue-600 hover:bg-blue-600 text-white font-bold text-xs px-2.5 py-1">
                    Meta Ads / Facebook Billing
                  </Badge>
                  <span className="text-xs font-semibold text-[var(--mh-text-2)] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Thời lượng đọc: ~4 phút
                  </span>
                  <span className="text-xs font-semibold text-[var(--mh-text-2)]">
                    • Cập nhật: 28/09/2026
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-[var(--mh-text)] leading-tight">
                  Hướng Dẫn Thêm Thẻ Thanh Toán (Add Thẻ) Vào Tài Khoản Quảng Cáo Facebook
                </h2>

                <p className="text-[var(--mh-text-2)] text-sm leading-relaxed">
                  Tài liệu chuẩn hóa dành riêng cho chuyên viên kinh doanh và marketing. Hướng dẫn chi tiết quy trình liên kết thẻ Visa / Mastercard vào trình quản lý quảng cáo Meta một cách an toàn, tránh bị hệ thống quét tạm giữ tiền (Hold tiền) hoặc khóa tài khoản bất thường.
                </p>

                {/* Direct Link Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-indigo-50/80 border border-indigo-200/70 rounded-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                      <ExternalLink className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-indigo-950">Link Cài Đặt Thanh Toán Meta Ads</div>
                      <div className="text-[11px] text-indigo-700 font-mono">adsmanager.facebook.com/billing_hub</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink('https://adsmanager.facebook.com/billing_hub', 'Link Billing Meta')}
                      className="bg-[var(--mh-surface)] hover:bg-indigo-50 border-indigo-200 text-indigo-700 text-xs font-bold h-8 rounded-xl"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      Sao chép link
                    </Button>
                    <a
                      href="https://adsmanager.facebook.com/billing_hub"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-3 h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      Mở Billing Hub <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Pre-flight Checklist */}
              <div className="p-6 sm:p-8 space-y-4 bg-[var(--mh-surface-2)]/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-black text-[var(--mh-text)] uppercase tracking-wide">
                      Bảng Kiểm Tra An Toàn Trước Khi Thao Tác (Checklist)
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-100/70 px-2.5 py-0.5 rounded-full">
                    Tiến độ: {checklistProgress}%
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { key: 'step1_hasCard', label: 'Thẻ Quốc tế hợp lệ: Visa, Mastercard, JCB (Debit hoặc Credit)' },
                    { key: 'step1_onlinePayment', label: 'Đã kích hoạt chức năng thanh toán Internet / E-commerce trong App ngân hàng' },
                    { key: 'step1_balance', label: 'Tài khoản có số dư tối thiểu từ 50.000đ - 100.000đ (để Facebook trừ phí test ~1$ và hoàn lại)' },
                    { key: 'step2_correctAccount', label: 'Đang mở đúng Tài khoản quảng cáo của dự án cần chạy (không add nhầm tk cá nhân)' },
                    { key: 'step3_cleanIP', label: 'Dùng IP mạng quen thuộc, tắt hoàn toàn VPN / 1.1.1.1 / Proxy lạ' },
                    { key: 'step4_timezoneCurrency', label: 'Kiểm tra kỹ Tiền tệ (VND / USD) và Múi giờ (GMT+7 Ho Chi Minh)' },
                    { key: 'step5_otpReady', label: 'Điện thoại nhận OTP hoặc ứng dụng Smart OTP ngân hàng đang sẵn sàng' }
                  ].map((item) => (
                    <label
                      key={item.key}
                      onClick={() => toggleCheck(item.key)}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer select-none transition-all ${
                        fbChecklist[item.key]
                          ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold'
                          : 'bg-[var(--mh-surface)] border-[var(--mh-border)] text-[var(--mh-text)] hover:border-[var(--mh-border-strong)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!fbChecklist[item.key]}
                        onChange={() => {}}
                        className="mt-0.5 rounded border-[var(--mh-border-strong)] text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="leading-snug">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 5-Step Detailed Walkthrough */}
              <div className="p-6 sm:p-8 space-y-8">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-[var(--mh-text)] uppercase tracking-wide flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    Quy Trình 5 Bước Add Thẻ Chi Tiết
                  </h3>
                  <p className="text-[var(--mh-text-2)] text-xs">
                    Thực hiện tuần tự từ bước 1 đến bước 5 để đảm bảo thẻ liên kết thành công ngay lần đầu tiên.
                  </p>
                </div>

                {/* Step 1 */}
                <div className="flex gap-4 items-start group">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
                    1
                  </div>
                  <div className="space-y-3 flex-1">
                    <div>
                      <h4 className="text-sm font-black text-[var(--mh-text)] group-hover:text-indigo-600 transition-colors">
                        Bước 1: Chuẩn bị thông tin thẻ & Cài đặt ngân hàng
                      </h4>
                      <p className="text-xs text-[var(--mh-text-2)] mt-1 leading-relaxed">
                        Kiểm tra các thông tin in trên mặt thẻ hoặc hiển thị trong ứng dụng ngân hàng số:
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-[var(--mh-surface-2)] p-3 rounded-xl border border-[var(--mh-border)] space-y-1">
                        <span className="font-bold text-[var(--mh-text)] flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-indigo-600" /> 16 Chữ số mặt trước thẻ
                        </span>
                        <p className="text-[var(--mh-text-2)] text-[11px]">
                          Dãy 16 số liền mạch in nổi trên thẻ hoặc số thẻ ảo trong App ngân hàng (ví dụ: 4123 4567 8901 2345).
                        </p>
                      </div>

                      <div className="bg-[var(--mh-surface-2)] p-3 rounded-xl border border-[var(--mh-border)] space-y-1">
                        <span className="font-bold text-[var(--mh-text)] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-600" /> Ngày hết hạn (MM/YY)
                        </span>
                        <p className="text-[var(--mh-text-2)] text-[11px]">
                          Tháng và năm thẻ hết hiệu lực (ví dụ: 08/29 nghĩa là tháng 08 năm 2029).
                        </p>
                      </div>

                      <div className="bg-[var(--mh-surface-2)] p-3 rounded-xl border border-[var(--mh-border)] space-y-1">
                        <span className="font-bold text-[var(--mh-text)] flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-indigo-600" /> Mã bảo mật CVV / CVC
                        </span>
                        <p className="text-[var(--mh-text-2)] text-[11px]">
                          3 chữ số ở mặt sau thẻ. <strong>Tuyệt đối không tiết lộ mã này cho bất kỳ ai!</strong>
                        </p>
                      </div>

                      <div className="bg-[var(--mh-surface-2)] p-3 rounded-xl border border-[var(--mh-border)] space-y-1">
                        <span className="font-bold text-[var(--mh-text)] flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-indigo-600" /> Mở khóa thanh toán online
                        </span>
                        <p className="text-[var(--mh-text-2)] text-[11px]">
                          Vào app ngân hàng &gt; Quản lý thẻ &gt; Bật "Thanh toán trực tuyến / Quốc tế" và nâng hạn mức thanh toán.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4 items-start group">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
                    2
                  </div>
                  <div className="space-y-3 flex-1">
                    <div>
                      <h4 className="text-sm font-black text-[var(--mh-text)] group-hover:text-indigo-600 transition-colors">
                        Bước 2: Truy cập Trình quản lý quảng cáo & Cài đặt thanh toán
                      </h4>
                      <p className="text-xs text-[var(--mh-text-2)] mt-1 leading-relaxed">
                        Mở trình duyệt trên máy tính (khuyến nghị dùng Google Chrome hoặc Microsoft Edge):
                      </p>
                    </div>

                    <div className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-2xl p-4 text-xs space-y-2">
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">A</span>
                        <div>
                          <strong>Cách 1 (Nhanh nhất):</strong> Mở trực tiếp đường link Billing:{' '}
                          <code className="text-indigo-600 bg-[var(--mh-surface)] px-2 py-0.5 rounded border border-indigo-200 font-mono">
                            https://adsmanager.facebook.com/billing_hub
                          </code>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">B</span>
                        <div>
                          <strong>Cách 2 (Thủ công):</strong> Truy cập{' '}
                          <span className="font-semibold text-[var(--mh-text)]">Trình quản lý quảng cáo (Ads Manager)</span> &gt; Bấm vào biểu tượng{' '}
                          <span className="font-semibold text-[var(--mh-text)]">Tất cả công cụ (All Tools - biểu tượng 3 dấu gạch ngang)</span> &gt; Chọn mục{' '}
                          <span className="font-semibold text-indigo-700">Lập hóa đơn & thanh toán (Billing & payments)</span>.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4 items-start group">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
                    3
                  </div>
                  <div className="space-y-3 flex-1">
                    <div>
                      <h4 className="text-sm font-black text-[var(--mh-text)] group-hover:text-indigo-600 transition-colors">
                        Bước 3: Chọn đúng Tài khoản quảng cáo & Bấm "Thêm phương thức thanh toán"
                      </h4>
                      <p className="text-xs text-[var(--mh-text-2)] mt-1 leading-relaxed">
                        Bước này rất quan trọng để tránh nạp thẻ vào nhầm tài khoản cá nhân thay vì tài khoản doanh nghiệp của dự án:
                      </p>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>Lưu ý tài khoản:</strong> Ở góc trên bên trái màn hình Billing, nhấp vào menu thả xuống và chọn chính xác{' '}
                          <strong>Tên tài khoản quảng cáo</strong> hoặc <strong>ID tài khoản</strong> dự án bạn được phân công.
                        </div>
                      </div>

                      <div className="p-3 bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-xl text-[var(--mh-text)]">
                        Chuyển sang tab <strong>Cài đặt thanh toán (Payment Settings)</strong> &gt; Nhấn nút{' '}
                        <span className="px-2 py-1 bg-blue-600 text-white rounded-md font-bold text-[11px] inline-block">
                          Thêm phương thức thanh toán
                        </span>{' '}
                        (Add Payment Method).
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-4 items-start group">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
                    4
                  </div>
                  <div className="space-y-3 flex-1">
                    <div>
                      <h4 className="text-sm font-black text-[var(--mh-text)] group-hover:text-indigo-600 transition-colors">
                        Bước 4: Kiểm tra Vị trí, Tiền tệ, Múi giờ & Điền thông tin thẻ
                      </h4>
                      <p className="text-xs text-[var(--mh-text-2)] mt-1 leading-relaxed">
                        Cửa sổ cấu hình thông tin tài khoản và thẻ thanh toán xuất hiện:
                      </p>
                    </div>

                    <div className="space-y-3 text-xs">
                      {/* Sub-item: Currency Check */}
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-950 space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          <span>Kiểm tra tiền tệ trước khi nhấn Tiếp tục (RẤT QUAN TRỌNG)</span>
                        </div>
                        <p className="text-[11px] text-rose-800 leading-relaxed">
                          - <strong>Vị trí:</strong> Chọn <strong>Việt Nam</strong>.<br />
                          - <strong>Đồng tiền:</strong> Chọn <strong>Đồng Việt Nam (VND)</strong> (hoặc USD tùy quy định dự án). <em>Lưu ý: Sau khi add thẻ xong sẽ không thể đổi tiền tệ được nữa nếu không tạo tài khoản mới!</em><br />
                          - <strong>Múi giờ:</strong> Chọn <strong>(GMT+07:00) Giờ Châu Á/Hồ Chí Minh</strong> hoặc Bangkok.
                        </p>
                      </div>

                      {/* Sub-item: Card details */}
                      <div className="bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-xl p-3 space-y-2 text-[var(--mh-text)]">
                        <div className="font-bold text-[var(--mh-text)]">Điền chính xác các trường thông tin thẻ:</div>
                        <ul className="list-disc pl-5 space-y-1 text-[11px]">
                          <li><strong>Chọn loại:</strong> Tích vào ô <strong>Thẻ tín dụng hoặc thẻ ghi nợ (Debit or Credit Card)</strong> &gt; Nhấn <strong>Tiếp (Next)</strong>.</li>
                          <li><strong>Tên trên thẻ:</strong> Nhập họ tên không dấu in trên thẻ (ví dụ: <code className="bg-[var(--mh-surface)] px-1.5 py-0.5 rounded border border-[var(--mh-border-strong)] font-bold">NGUYEN VAN A</code>).</li>
                          <li><strong>Số thẻ:</strong> Nhập dãy 16 chữ số liền nhau không dấu cách.</li>
                          <li><strong>MM/YY:</strong> Nhập 2 số tháng và 2 số năm hết hạn.</li>
                          <li><strong>CVV:</strong> Nhập 3 số bảo mật ở mặt sau thẻ.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex gap-4 items-start group">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
                    5
                  </div>
                  <div className="space-y-3 flex-1">
                    <div>
                      <h4 className="text-sm font-black text-[var(--mh-text)] group-hover:text-indigo-600 transition-colors">
                        Bước 5: Xác thực OTP bảo mật (3D-Secure) & Hoàn tất
                      </h4>
                      <p className="text-xs text-[var(--mh-text-2)] mt-1 leading-relaxed">
                        Sau khi nhấn <strong>Lưu (Save)</strong>, ngân hàng phát hành thẻ sẽ chuyển hướng sang trang xác nhận giao dịch:
                      </p>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Giao dịch thử nghiệm xác minh thẻ:</span>
                        </div>
                        <p className="text-[11px] text-emerald-800 leading-relaxed">
                          Facebook sẽ thực hiện trừ tạm thời <strong>khoảng 23.000đ - 70.000đ (tương đương 1$ - 3$)</strong> để kiểm tra thẻ có tiền và đang hoạt động. Số tiền này sẽ được hoàn trả lại tài khoản của bạn tự động trong vòng vài phút đến tối đa 48 giờ.
                        </p>
                      </div>

                      <div className="p-3 bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-xl text-[var(--mh-text)] text-[11px] leading-relaxed">
                        Nhập mã <strong>OTP từ tin nhắn SMS hoặc xác thực trên App Smart OTP ngân hàng</strong>. Sau khi xác nhận thành công, màn hình hiển thị biểu tượng thẻ đã được thêm vào mục <strong>Phương thức thanh toán hiện tại</strong>.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pro Tips & Warnings */}
              <div className="p-6 sm:p-8 space-y-4 bg-gradient-to-br from-amber-50/50 to-orange-50/50 border-t border-amber-200/60">
                <div className="flex items-center gap-2 text-amber-900 font-black">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                  <span className="text-sm uppercase tracking-wide">
                    Lưu Ý "Xương Máu" Để Tránh Bị Khóa Tài Khoản & Hold Tiền
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-[var(--mh-surface)] p-4 rounded-2xl border border-amber-200/80 shadow-sm space-y-2">
                    <span className="font-black text-rose-600 flex items-center gap-1.5">
                      ❌ Tuyệt đối không bật VPN / Fake IP
                    </span>
                    <p className="text-[var(--mh-text-2)] text-[11px] leading-relaxed">
                      Facebook sẽ tự động coi hành động add thẻ từ một địa chỉ IP nước ngoài hoặc IP proxy lạ là hành vi gian lận tài chính (Financial Fraud), dẫn đến tài khoản bị vô hiệu hóa ngay lập tức.
                    </p>
                  </div>

                  <div className="bg-[var(--mh-surface)] p-4 rounded-2xl border border-amber-200/80 shadow-sm space-y-2">
                    <span className="font-black text-rose-600 flex items-center gap-1.5">
                      ❌ Không add 1 thẻ vào nhiều tài khoản cùng lúc
                    </span>
                    <p className="text-[var(--mh-text-2)] text-[11px] leading-relaxed">
                      Nếu 1 thẻ ngân hàng được liên kết liên tiếp vào 3-5 tài khoản quảng cáo khác nhau trong cùng một ngày, Facebook sẽ đưa đầu số BIN thẻ vào danh sách đen (Blacklist).
                    </p>
                  </div>

                  <div className="bg-[var(--mh-surface)] p-4 rounded-2xl border border-amber-200/80 shadow-sm space-y-2">
                    <span className="font-black text-indigo-700 flex items-center gap-1.5">
                      💡 Mồi ngân sách nhỏ trong 24h đầu
                    </span>
                    <p className="text-[var(--mh-text-2)] text-[11px] leading-relaxed">
                      Với tài khoản và thẻ mới liên kết, hãy chạy chiến dịch đầu tiên với ngân sách <strong>50.000đ - 100.000đ/ngày</strong> để thẻ "cắn tiền" mượt mà rồi mới nâng ngân sách lớn.
                    </p>
                  </div>

                  <div className="bg-[var(--mh-surface)] p-4 rounded-2xl border border-amber-200/80 shadow-sm space-y-2">
                    <span className="font-black text-indigo-700 flex items-center gap-1.5">
                      🛡️ Cài đặt Giới hạn chi tiêu tài khoản
                    </span>
                    <p className="text-[var(--mh-text-2)] text-[11px] leading-relaxed">
                      Vào <em>Cài đặt thanh toán &gt; Giới hạn chi tiêu của tài khoản</em> &gt; Đặt mức chi tiêu tối đa đúng bằng ngân sách đã được phê duyệt để phòng tránh phát sinh ngoài ý muốn.
                    </p>
                  </div>
                </div>
              </div>

              {/* Troubleshooting FAQ Section */}
              <div className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-2 text-[var(--mh-text)] font-black">
                  <HelpCircle className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm uppercase tracking-wide">
                    Xử Lý Các Lỗi Thường Gặp Khi Add Thẻ Facebook
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-4 bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-2xl space-y-1.5">
                    <div className="font-black text-[var(--mh-text)] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Lỗi 1: "Thẻ bị từ chối / We could not process your payment method"
                    </div>
                    <p className="text-[var(--mh-text-2)] text-[11px] leading-relaxed pl-4">
                      <strong>Nguyên nhân & Cách khắc phục:</strong> Số dư trong thẻ dưới 50k, chưa bật thanh toán quốc tế, hoặc ngân hàng đang chặn giao dịch với Meta. Hãy kiểm tra lại app ngân hàng, đảm bảo số dư đủ và liên hệ tổng đài ngân hàng yêu cầu "Mở khóa giao dịch trực tuyến quốc tế cho Facebook".
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-2xl space-y-1.5">
                    <div className="font-black text-[var(--mh-text)] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Lỗi 2: "Tài khoản bị tạm giữ tiền (Temporary Hold Failed)"
                    </div>
                    <p className="text-[var(--mh-text-2)] text-[11px] leading-relaxed pl-4">
                      <strong>Nguyên nhân & Cách khắc phục:</strong> Thẻ bị hết tiền khi Facebook quét kiểm tra giữa chừng. Chỉ cần nạp đủ số tiền quảng cáo vào tài khoản ngân hàng và bấm nút <strong>"Thử lại thanh toán" (Retry Payment)</strong> hoặc <strong>"Xác minh thẻ"</strong> trong Ads Manager.
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--mh-surface-2)] border border-[var(--mh-border)] rounded-2xl space-y-1.5">
                    <div className="font-black text-[var(--mh-text)] flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Lỗi 3: Ngân hàng nào tại Việt Nam add thẻ Facebook mượt nhất?
                    </div>
                    <p className="text-[var(--mh-text-2)] text-[11px] leading-relaxed pl-4">
                      <strong>Khuyến nghị:</strong> Techcombank (Visa/Mastercard Debit), ACB, VPBank, MB Bank, Vietcombank, TPBank. Hạn chế sử dụng thẻ ảo không định danh hoặc các loại thẻ prepaid không có thông tin chủ thẻ rõ ràng.
                    </p>
                  </div>
                </div>
              </div>

              {/* Internal Custom Notes Section (User Editable) */}
              <div className="p-6 sm:p-8 space-y-4 bg-[var(--mh-surface-2)]/70 border-t border-[var(--mh-border)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-black uppercase text-[var(--mh-text)] tracking-wide">
                      Ghi Chú Bổ Sung & Quy Định Nội Bộ Riêng (Tùy Chỉnh)
                    </span>
                  </div>
                  {!isEditingNote ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTempNote(customNote);
                        setIsEditingNote(true);
                      }}
                      className="text-xs font-bold h-7.5 bg-[var(--mh-surface)] border-[var(--mh-border)]"
                    >
                      {customNote ? 'Sửa ghi chú' : '+ Thêm ghi chú nội bộ'}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingNote(false)}
                        className="text-xs h-7.5"
                      >
                        Hủy
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveCustomNote}
                        className="text-xs font-bold h-7.5 bg-indigo-600 text-white"
                      >
                        Lưu ghi chú
                      </Button>
                    </div>
                  )}
                </div>

                {isEditingNote ? (
                  <div className="space-y-2">
                    <textarea
                      value={tempNote}
                      onChange={(e) => setTempNote(e.target.value)}
                      placeholder="Nhập các quy định nội bộ riêng của dự án, hạn mức định mức thẻ, quy trình cấp quyền BM hoặc người phụ trách thẻ..."
                      rows={4}
                      className="w-full p-3 text-xs bg-[var(--mh-surface)] border border-[var(--mh-border)] rounded-xl focus:ring-2 focus:ring-indigo-500 font-sans"
                    />
                    <p className="text-[11px] text-[var(--mh-text-3)]">
                      Ghi chú này sẽ được lưu trên trình duyệt của bạn để tiện tra cứu khi làm việc.
                    </p>
                  </div>
                ) : customNote ? (
                  <div className="p-4 bg-[var(--mh-surface)] border border-[var(--mh-border)] rounded-2xl text-xs text-[var(--mh-text)] whitespace-pre-wrap leading-relaxed shadow-sm">
                    {customNote}
                  </div>
                ) : (
                  <div className="p-3 bg-[var(--mh-surface)]/60 border border-dashed border-[var(--mh-border-strong)] rounded-xl text-xs text-[var(--mh-text-2)] italic">
                    Chưa có ghi chú riêng. Bấm "Thêm ghi chú nội bộ" nếu công ty có quy định thêm về thẻ đối ứng, bàn giao via hoặc phân bổ hạn mức.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fallback for other guide items */}
          {selectedGuideId !== 'fb-add-card' && (
            <div className="bg-[var(--mh-surface)] rounded-3xl border border-[var(--mh-border)]/90 shadow-sm p-8 space-y-6">
              {(() => {
                const current = guides.find(g => g.id === selectedGuideId);
                return (
                  <>
                    <div className="space-y-2">
                      <Badge className="bg-indigo-600 text-white text-xs">{current?.categoryLabel}</Badge>
                      <h2 className="text-xl font-black text-[var(--mh-text)]">{current?.title}</h2>
                      <p className="text-[var(--mh-text-2)] text-xs">{current?.description}</p>
                    </div>

                    <div className="p-5 bg-[var(--mh-surface-2)] rounded-2xl border border-[var(--mh-border)] text-xs text-[var(--mh-text)] space-y-3 leading-relaxed">
                      <div className="font-bold text-[var(--mh-text)]">Tóm tắt các điểm then chốt:</div>
                      <ul className="list-disc pl-5 space-y-1.5">
                        <li>Thực hiện các thao tác theo đúng chu kỳ và hạn chót quy định tại mục Quy trình MKT.</li>
                        <li>Đảm bảo mọi số liệu nhập vào trùng khớp với bảng tính nghiệm thu chi tiết từ Google Sheets.</li>
                        <li>Trường hợp có thay đổi về ngân sách hoặc dự án, cần được lãnh đạo Khối / Ban KD phê duyệt trước khi gửi về Kế toán.</li>
                      </ul>
                    </div>

                    <div className="pt-2">
                      <Button
                        onClick={() => setSelectedGuideId('fb-add-card')}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
                      >
                        Quay lại Hướng dẫn Add Thẻ Facebook Ads
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
