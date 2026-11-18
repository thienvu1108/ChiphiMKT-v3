/** Thông tin chính sách hỗ trợ Marketing mới & Core team theo dự án.
 * Nguồn: Thông báo v/v Chính sách hỗ trợ MKT mới & Thành lập core team theo dự án.
 * Nội dung tĩnh (chỉ xem) — hiển thị ở trang «Thông tin Hỗ trợ». */
import React from 'react';

const Stat: React.FC<{ value: string; unit?: string; title: string; desc?: string; tone?: 'navy' | 'orange' | 'plain' }> = ({ value, unit, title, desc, tone = 'plain' }) => {
  const toneCls = tone === 'navy'
    ? 'bg-[#0F2A4A] text-white border-[#0F2A4A]'
    : tone === 'orange'
      ? 'bg-orange-50 text-orange-950 border-orange-200'
      : 'bg-[var(--mh-surface)] text-[var(--mh-text)] border-[var(--mh-border)]';
  const valCls = tone === 'navy' ? 'text-white' : 'text-[#E4572E]';
  const titleCls = tone === 'navy' ? 'text-white' : 'text-[var(--mh-text)]';
  const descCls = tone === 'navy' ? 'text-white/80' : 'text-[var(--mh-text-2)]';
  return (
    <div className={`rounded-xl border p-3.5 shadow-sm ${toneCls}`}>
      <div className="flex items-baseline gap-1">
        <span className={`text-3xl font-black tabular-nums leading-none ${valCls}`}>{value}</span>
        {unit && <span className={`text-[12px] font-bold ${descCls}`}>{unit}</span>}
      </div>
      <div className={`mt-1 text-[13px] font-extrabold ${titleCls}`}>{title}</div>
      {desc && <div className={`text-[11px] mt-0.5 ${descCls}`}>{desc}</div>}
    </div>
  );
};

const Highlight: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="rounded-xl border border-[var(--mh-border)] bg-[var(--mh-surface-2)] p-3.5">
    <div className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--mh-text)]"><span aria-hidden>{icon}</span>{title}</div>
    <div className="text-[12px] text-[var(--mh-text-2)] mt-1 leading-relaxed">{children}</div>
  </div>
);

const Check: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex gap-2 text-[13px] text-[var(--mh-text)] leading-relaxed">
    <span className="mt-0.5 shrink-0 text-emerald-600 font-black" aria-hidden>✓</span>
    <span>{children}</span>
  </li>
);

const SectionHead: React.FC<{ no: string; title: string; apply: string; range?: string }> = ({ no, title, apply, range }) => (
  <div className="border-b border-[var(--mh-border)] pb-3 mb-4">
    <div className="flex items-center gap-2.5">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#0F2A4A] text-white text-[13px] font-black shrink-0">{no}</span>
      <h3 className="text-[18px] sm:text-[20px] font-black text-[var(--mh-text)]">{title}</h3>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#EAF1FB] text-[#0F2A4A] px-2.5 py-1 text-[12px] font-bold">📅 {apply}</span>
      {range && <span className="inline-flex items-center rounded-lg bg-orange-100 text-orange-800 px-2.5 py-1 text-[12px] font-bold">{range}</span>}
    </div>
  </div>
);

export const MktPolicyInfo: React.FC = () => {
  return (
    <div className="space-y-4" data-testid="vn-mkt-policy-info">
      {/* Tiêu đề thông báo */}
      <div className="rounded-2xl border border-[var(--mh-border)] bg-gradient-to-br from-[#0F2A4A] to-[#14365F] text-white p-5 shadow-md">
        <div className="text-[11px] font-bold tracking-widest text-white/70">MAYHOMES · THÔNG BÁO</div>
        <h2 className="text-[22px] sm:text-[26px] font-black mt-1 leading-tight">Chính sách hỗ trợ Marketing mới<br className="hidden sm:block" /> và thành lập core team theo từng dự án</h2>
        <p className="text-[13px] text-white/85 mt-2 max-w-3xl">Tập trung nguồn lực cho đội ngũ kinh doanh gắn bó với dự án, nâng hiệu quả triển khai và hạn chế lạm dụng chính sách ưu đãi.</p>
      </div>

      {/* 01 — Hỗ trợ Marketing */}
      <div className="rounded-2xl border border-[var(--mh-border)] bg-[var(--mh-surface)] p-4 sm:p-5 shadow-sm">
        <SectionHead no="01" title="Hỗ trợ Marketing" apply="Áp dụng từ kỳ kinh doanh tháng 12/2026" range="21/11/2026 – 20/12/2026" />
        <p className="text-[13px] text-[var(--mh-text-2)] mb-3">Điểm thi đua và mức hỗ trợ được tính theo <b>từng sale</b>.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat tone="navy" value="50%" title="Mức hỗ trợ cơ sở" desc="Áp dụng cho tất cả dự án." />
          <Stat value="30" unit="buổi/tháng" title="Công chấm tối thiểu" desc="Điều kiện để được hỗ trợ." />
          <Stat value="20" unit="triệu đồng/sale" title="Trần hỗ trợ Marketing" />
          <Stat tone="orange" value="+3,5" unit="triệu đồng" title="Thưởng theo điểm thi đua" desc="Mỗi 05 điểm tăng thêm khi điểm thi đua trên 10." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Highlight icon="👥" title="Gộp ngân sách · Tối đa 02 sale/nhóm">Các sale cùng dự án được gộp ngân sách để chạy chung một chiến dịch Marketing.</Highlight>
          <Highlight icon="🗂️" title="Bãi bỏ các quy định cũ">Mức hỗ trợ Marketing trước đây và quy định về tỷ lệ tối thiểu, tối đa giữa ngân sách thực chạy và ngân sách đăng ký.</Highlight>
        </div>
      </div>

      {/* 02 — Core team theo từng dự án */}
      <div className="rounded-2xl border border-[var(--mh-border)] bg-[var(--mh-surface)] p-4 sm:p-5 shadow-sm">
        <SectionHead no="02" title="Core team theo từng dự án" apply="Áp dụng từ ngày 17/11/2026" />
        <p className="text-[13px] text-[var(--mh-text-2)] mb-4">Mỗi dự án lập <b>01 core team</b> gồm các sale tập trung và tích cực nhất.</p>

        <div className="mb-4">
          <div className="text-[14px] font-extrabold text-[var(--mh-text)] mb-2 border-l-4 border-[#0F2A4A] pl-2">Điều kiện tham gia</div>
          <ul className="space-y-1.5">
            <Check>Tập trung bán hàng, nắm vững và hiểu sâu về dự án.</Check>
            <Check>Trưởng Ban Kinh doanh xét duyệt dựa trên hiểu biết về dự án, mức độ tập trung, việc tham gia sự kiện và lan tỏa dự án.</Check>
            <Check>Mỗi người tham gia tối đa 01 core team và được bán nhiều dự án.</Check>
            <Check>Khi core team đủ thành viên, sale đạt chuẩn đăng ký sau vào danh sách chờ hoặc đăng ký core team của dự án khác.</Check>
          </ul>
        </div>

        <div className="mb-4">
          <div className="text-[14px] font-extrabold text-[var(--mh-text)] mb-2 border-l-4 border-[#E4572E] pl-2">Quyền lợi core team</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Stat tone="navy" value="+10–30%" title="Tăng mức hỗ trợ Marketing" desc="Theo đánh giá và đề xuất của Trưởng Ban Kinh doanh." />
            <Stat value="30" unit="triệu đồng/sale" title="Trần hỗ trợ Marketing" desc="Có thể cao hơn." />
          </div>
          <div className="mt-3">
            <Highlight icon="👥" title="Gộp ngân sách · Tối đa 03 sale/nhóm">Các sale thuộc cùng core team được gộp ngân sách để triển khai chung một chiến dịch Marketing. <b className="text-[#E4572E]">Không gộp ngân sách giữa sale trong và ngoài core team.</b></Highlight>
          </div>
          <ul className="space-y-1.5 mt-3">
            <Check>Đồng phục, phù hiệu riêng theo dự án (nếu có), theo đề xuất của Trưởng Ban Kinh doanh.</Check>
            <Check>Đào tạo và sự kiện đặc biệt dành riêng cho core team.</Check>
            <Check>Các chế độ hỗ trợ riêng khác theo quy định của Công ty.</Check>
          </ul>
        </div>

        <div>
          <div className="text-[14px] font-extrabold text-[var(--mh-text)] mb-2 border-l-4 border-[#0F2A4A] pl-2">Trách nhiệm triển khai</div>
          <div className="rounded-xl border border-[var(--mh-border)] overflow-hidden divide-y divide-[var(--mh-border)]">
            {[
              ['Trưởng Ban Kinh doanh', 'Đề xuất định biên và danh sách thành viên phù hợp từng dự án. Quản lý chặt, cập nhật danh sách theo thực tế, bảo đảm chất lượng, tính tập trung và tinh thần tích cực.'],
              ['Giám đốc Khối và Giám đốc Kinh doanh', 'Được đăng ký tham gia core team. Quan tâm, hỗ trợ hoạt động, sự kiện và chiến dịch của dự án có sale mình quản lý tham gia core team.'],
              ['Sale tham gia core team', 'Triển khai quyết liệt, chuyên sâu hoạt động dự án. Tham gia đầy đủ, tích cực các sự kiện và chiến dịch. Chủ động đào tạo, chia sẻ, lan tỏa thông tin dự án.'],
            ].map(([who, duty]) => (
              <div key={who} className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 sm:gap-3 p-3 bg-[var(--mh-surface)]">
                <div className="text-[13px] font-bold text-[var(--mh-text)]">{who}</div>
                <div className="text-[12px] text-[var(--mh-text-2)] leading-relaxed">{duty}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lời kết */}
      <div className="rounded-2xl border border-[var(--mh-border)] bg-[#EAF1FB] p-4 text-[12px] text-[#0F2A4A] leading-relaxed">
        Công ty đề nghị Giám đốc Khối, Giám đốc Kinh doanh, Trưởng Ban Kinh doanh, các bộ phận liên quan và toàn thể nhân viên kinh doanh nghiêm túc triển khai. Kịp thời phản ánh vướng mắc về Công ty để xem xét và giải quyết. <b>Trân trọng thông báo.</b>
      </div>
    </div>
  );
};
