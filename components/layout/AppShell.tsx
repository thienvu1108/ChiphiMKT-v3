import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileCheck,
  Wallet,
  Layers,
  Receipt,
  History,
  Building2,
  Briefcase,
  Users,
  FileText,
  RefreshCw,
  ShieldCheck,
  MessageCircle,
  Search,
  Bell,
  MoreHorizontal,
  X,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  Home,
  Settings,
  User as UserIcon,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NAV_GROUP_LABELS } from '@/lib/routes';

export type ShellNavItem = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  visible?: boolean;
  /** For admin deep-links */
  adminSubTab?: string;
  group?: string;
  /** When true, navigates to admin + this sub */
  isAdminLink?: boolean;
};

type Props = {
  children: React.ReactNode;
  menuItems: ShellNavItem[];
  activeTab: string;
  adminSubTab?: string;
  onNavigate: (tab: string, adminSubTab?: string) => void;
  userName?: string | null;
  userEmail?: string | null;
  roleBadges?: React.ReactNode;
  screenTitle?: string;
  pendingSupportCount?: number;
  onLogout?: () => void;
  /** Mở hộp «Đổi tên» của chính mình (menu tài khoản). */
  onRenameSelf?: () => void;
  onOpenKyc?: () => void;
  onOpenSearch?: () => void;
  /** Hide the global search (roles locked to a single screen). */
  hideSearch?: boolean;
  periodLabel?: string;
  periodRange?: string;
  /** Chuông thông báo v-next (thay nút chuông cũ mở «Hỗ trợ»). */
  bellNode?: React.ReactNode;
};

const ICON_BY_VALUE: Record<string, React.ComponentType<{ className?: string }>> = {
  home: LayoutDashboard,
  'report-nt': FileCheck,
  budgets: Wallet,
  'block-budgets': Layers,
  'reciprocal-budgets': Receipt,
  history: History,
  'block-mgmt': Building2,
  'bankd-mgmt': Briefcase,
  'process-mkt': FileText,
  'process-doiung': RefreshCw,
  admin: ShieldCheck,
  support: MessageCircle,
  register: Wallet,
  'team-register': Wallet,
  'team-weekly': FileText,
  projects: Building2,
  teams: Users,
  users: UserIcon,
  permissions: ShieldCheck,
  settings: Settings,
};

function groupOf(value: string, adminSub?: string): string {
  if (value === 'home') return 'overview';
  if (value === 'report-nt') return 'ops';
  if (value === 'admin' && ['register', 'block-budgets', 'reciprocal-budgets'].includes(adminSub || '')) return 'ops';
  // budgets + history deliberately not in Vận hành sidebar
  if (['block-mgmt', 'bankd-mgmt'].includes(value)) return 'mgmt';
  if (['process-mkt', 'process-doiung'].includes(value)) return 'process';
  if (value === 'admin' && ['projects', 'teams', 'acceptance'].includes(adminSub || '')) return 'catalog';
  if (value === 'admin') return 'system';
  if (value === 'support') return 'other';
  return 'other';
}

export function AppShell({
  children,
  menuItems,
  activeTab,
  adminSubTab,
  onNavigate,
  userName,
  userEmail,
  roleBadges,
  screenTitle,
  pendingSupportCount = 0,
  onLogout,
  onRenameSelf,
  onOpenKyc,
  onOpenSearch,
  hideSearch = false,
  periodLabel,
  periodRange,
  bellNode,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Flatten + enrich with group for sidebar (top-level menu + promoted admin ops)
  const sidebarItems: ShellNavItem[] = menuItems
    .filter((m) => m.visible !== false)
    .map((m) => ({
      ...m,
      group: m.group || groupOf(m.value, m.adminSubTab),
      icon: m.icon || ICON_BY_VALUE[m.value] || LayoutDashboard,
    }));

  const isActive = (item: ShellNavItem) => {
    if (item.isAdminLink || item.adminSubTab) {
      return activeTab === 'admin' && adminSubTab === (item.adminSubTab || item.value);
    }
    if (item.value === 'admin') {
      // Generic admin only active when not on a promoted ops sub
      return (
        activeTab === 'admin' &&
        !['budgets', 'register', 'block-budgets', 'reciprocal-budgets'].includes(adminSubTab || '')
      );
    }
    // team-register / team-weekly: active when that quick item was chosen (or legacy team-mgmt + matching hint via value equality).
    return activeTab === item.value;
  };

  const handleNav = (item: ShellNavItem) => {
    if (item.isAdminLink || item.adminSubTab) {
      onNavigate('admin', item.adminSubTab || item.value);
    } else {
      onNavigate(item.value);
    }
    setMoreOpen(false);
  };

  const groups = ['overview', 'ops', 'mgmt', 'process', 'catalog', 'system', 'other'];

  const initials = (userName || userEmail || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || 'U';

  // Bottom nav primary 4 + more («mục chọn nhanh» trên mobile)
  const canOpenSupport = sidebarItems.some((i) => i.value === 'support');
  const bottomPrimary = (() => {
    const byVal = (v: string) => sidebarItems.find((i) => i.value === v);
    // NVKD / GĐKD: ưu tiên Đăng ký MKT + Báo cáo tuần (deep-link vào Phòng KD).
    const reg = byVal('team-register');
    const weekly = byVal('team-weekly');
    if (reg || weekly) {
      const team = byVal('team-mgmt');
      const rest = sidebarItems.filter((i) => !['team-register', 'team-weekly', 'team-mgmt'].includes(i.value));
      return [reg, weekly, team, ...rest].filter(Boolean).slice(0, 4) as ShellNavItem[];
    }
    const home = byVal('home');
    const nt = byVal('report-nt');
    // Prefer Ngân sách Khối over generic Ngân sách (removed from Vận hành)
    const budgetItem: ShellNavItem | undefined =
      sidebarItems.find((i) => i.adminSubTab === 'block-budgets') ||
      sidebarItems.find((i) => i.adminSubTab === 'budgets');
    // Only offer "Thông báo" when the role can open Hỗ trợ (support permission).
    const support = byVal('support');
    const primary = [home, nt, budgetItem, support ? { ...support, label: 'Thông báo', icon: Bell } : undefined].filter(
      Boolean,
    ) as ShellNavItem[];
    // Roles with a short menu (e.g. GĐ Khối → only "Quản lý Khối"): show exactly their items.
    return primary.length > 0 ? primary : sidebarItems.slice(0, 4);
  })();
  const bottomCols = Math.min(bottomPrimary.length, 4) + 1;

  return (
    <div className="mh-app min-h-screen bg-[var(--mh-bg,var(--mh-bg))] text-[var(--mh-text,var(--mh-text))]">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'mh-side hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-40 bg-[var(--mh-surface,#fff)] border-r border-[var(--mh-border,var(--mh-border))] transition-all duration-200',
          collapsed ? 'w-[72px]' : 'w-[248px]',
        )}
      >
        <div className={cn('flex items-center gap-2.5 px-3 pt-3.5 pb-3', collapsed && 'justify-center')}>
          <div className="w-[34px] h-[34px] rounded-[9px] bg-[var(--mh-navy)] grid place-items-center shrink-0">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                d="M3 18V7l5 6 4-6 4 6 5-6v11"
                fill="none"
                stroke="#fff"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-extrabold text-[15px] text-[var(--mh-navy)] leading-tight tracking-wide">
                MAYHOMES
              </div>
              <div className="text-[11px] text-[var(--mh-text-3)] truncate">Marketing Cost Control</div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3 custom-scrollbar">
          {groups.map((g) => {
            const items = sidebarItems.filter((i) => (i.group || 'other') === g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-1">
                {!collapsed && NAV_GROUP_LABELS[g] && (
                  <div className="text-[10.5px] tracking-[0.08em] text-[var(--mh-text-3)] font-semibold px-2.5 pt-3 pb-1.5 uppercase">
                    {NAV_GROUP_LABELS[g]}
                  </div>
                )}
                {items.map((item) => {
                  const Icon = item.icon;
                  const on = isActive(item);
                  return (
                    <button
                      key={`${item.value}-${item.adminSubTab || ''}`}
                      type="button"
                      title={item.label}
                      onClick={() => handleNav(item)}
                      className={cn(
                        'w-full flex items-center gap-2.5 h-9 rounded-lg text-[13.5px] font-medium transition-colors',
                        collapsed ? 'justify-center px-0' : 'px-2.5',
                        on
                          ? 'bg-[var(--mh-navy-50)] text-[var(--mh-navy)] font-semibold'
                          : 'text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]',
                      )}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="truncate">{item.label}</span>
                          {item.badge !== undefined && item.badge > 0 && (
                            <span className="ml-auto text-[11px] bg-[var(--mh-err)] text-white rounded-full px-1.5 py-0.5 leading-none">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[var(--mh-border)] p-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="w-full flex items-center justify-center gap-2 h-8 rounded-lg text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)] text-xs"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span>Thu gọn</span>}
          </button>
          {!collapsed && (
            <div className="px-2.5 pt-2 pb-1 text-[11.5px] text-[var(--mh-text-3)] leading-snug">
              Phát triển bởi Thiên Vũ – Digital Marketing MAYHOMES
              <br />
              <a
                href="https://zalo.me/0854642555"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--mh-navy)] hover:underline"
              >
                Zalo hỗ trợ 0854.642.555
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div
        className={cn(
          'min-h-screen min-w-0 flex flex-col transition-[margin] duration-200',
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-[248px]',
        )}
      >
        {/* Desktop top bar */}
        <header className="mh-top hidden lg:flex sticky top-0 z-30 h-14 items-center gap-3 px-6 bg-[var(--mh-surface)]/92 backdrop-blur border-b border-[var(--mh-border)]">
          {!hideSearch ? (
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex-1 max-w-[520px] flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--mh-border)] bg-[#F8FAFC] text-[var(--mh-text-3)] text-[13px] min-w-[220px]"
          >
            <Search className="w-4 h-4" />
            <span className="truncate">Tìm dự án, team, mã team, Ban KD, người dùng…</span>
            <kbd className="ml-auto text-[11px] border border-[var(--mh-border)] rounded px-1.5 py-0.5 bg-[var(--mh-surface)] text-[var(--mh-text-2)]">
              Ctrl K
            </kbd>
          </button>
          ) : (
            <div className="flex-1 max-w-[520px] min-w-[220px] text-[13px] font-semibold text-[var(--mh-text)] truncate">
              {screenTitle}
            </div>
          )}

          {(periodLabel || periodRange) && (
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--mh-border)] bg-[var(--mh-surface)] text-[13px] whitespace-nowrap">
              <span className="text-[var(--mh-text-2)]">Kỳ marketing</span>
              {periodLabel && <b className="text-[var(--mh-navy)]">{periodLabel}</b>}
              {periodRange && <span className="text-[var(--mh-text-2)] text-xs">{periodRange}</span>}
            </div>
          )}

          {bellNode ? bellNode : canOpenSupport && (
          <button
            type="button"
            onClick={() => onNavigate('support')}
            className="relative h-9 w-9 grid place-items-center rounded-lg text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]"
            title="Thông báo / Hỗ trợ"
          >
            <Bell className="w-[18px] h-[18px]" />
            {pendingSupportCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--mh-accent)] border-2 border-white" />
            )}
          </button>
          )}

          <div className="flex items-center gap-2.5 ml-auto">
            <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-[var(--mh-navy)] to-[#3F6FD1] text-white grid place-items-center font-bold text-[13px]">
              {initials}
            </div>
            <div className="hidden xl:block leading-tight">
              <div className="text-[13px] font-semibold">{userName}</div>
              <div className="text-[11px] text-[var(--mh-text-2)]">{roleBadges || userEmail}</div>
            </div>
            {onRenameSelf && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRenameSelf}
                className="h-9 px-2 text-[12px] text-[var(--mh-text-2)] hover:text-[var(--mh-navy)] hover:bg-[var(--mh-navy-50)]"
                title="Đổi tên của tôi"
                data-testid="shell-rename-self"
              >
                <Pencil className="w-4 h-4 mr-1" />Đổi tên
              </Button>
            )}
            {onOpenKyc && (
              <Button variant="ghost" size="sm" onClick={onOpenKyc} className="h-9 px-2 text-[12px] text-[var(--mh-text-2)] hover:text-[var(--mh-navy)] hover:bg-[var(--mh-navy-50)]" title="Thông tin thanh toán (CCCD / STK)" data-testid="shell-kyc">
                💳<span className="ml-1 hidden 2xl:inline">Thanh toán</span>
              </Button>
            )}
            {onLogout && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onLogout}
                className="h-9 w-9 text-[var(--mh-text-3)] hover:text-[var(--mh-err)] hover:bg-red-50"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
          </div>
        </header>

        {/* Mobile top bar */}
        <header className="mh-mtop lg:hidden sticky top-0 z-30 flex items-center gap-2.5 h-[52px] px-3.5 bg-[var(--mh-surface)] border-b border-[var(--mh-border)]">
          <div className="w-[30px] h-[30px] rounded-lg bg-[var(--mh-navy)] grid place-items-center shrink-0">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M3 18V7l5 6 4-6 4 6 5-6v11"
                fill="none"
                stroke="#fff"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="font-bold text-base truncate">{screenTitle || 'ChiphiMKT'}</div>
          <div className="ml-auto flex gap-1">
            {!hideSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="h-9 w-9 grid place-items-center rounded-lg text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]"
            >
              <Search className="w-[18px] h-[18px]" />
            </button>
            )}
            {bellNode ? bellNode : canOpenSupport && (
            <button
              type="button"
              onClick={() => onNavigate('support')}
              className="relative h-9 w-9 grid place-items-center rounded-lg text-[var(--mh-text-2)] hover:bg-[var(--mh-surface-2)]"
            >
              <Bell className="w-[18px] h-[18px]" />
              {pendingSupportCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--mh-accent)] border-2 border-white" />
              )}
            </button>
            )}
          </div>
        </header>

        {/* Fill the full content width next to the sidebar (no max-width cap: a left-aligned
            1440px cap used to leave an empty gray column on wide/zoomed-out windows). */}
        <main className="mh-content flex-1 w-full min-w-0 px-3.5 py-3.5 md:px-6 md:py-6 pb-24 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="mh-bnav lg:hidden fixed left-0 right-0 bottom-0 z-40 grid min-h-16 h-[calc(64px+env(safe-area-inset-bottom))] bg-[var(--mh-surface,#fff)] border-t border-[var(--mh-border,var(--mh-border))] pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${bottomCols}, minmax(0, 1fr))` }}
      >
        {bottomPrimary.slice(0, 4).map((item) => {
          const Icon = item.icon || Home;
          const on = isActive(item);
          return (
            <button
              key={`bn-${item.value}-${item.adminSubTab || ''}`}
              type="button"
              onClick={() => handleNav(item)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium min-h-11 touch-manipulation cursor-pointer',
                on ? 'text-[var(--mh-navy,var(--mh-navy))] font-bold bg-[var(--mh-navy-50,var(--mh-navy-50))]' : 'text-[var(--mh-text-2,var(--mh-text-2))]',
              )}
            >
              {on && (
                <span className="absolute top-0 w-7 h-[3px] rounded-b bg-[var(--mh-navy)]" />
              )}
              <Icon className="w-[22px] h-[22px]" />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-2 left-[52%] text-[9.5px] bg-[var(--mh-accent)] text-white rounded-full px-1 leading-tight">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            'relative flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium min-h-11 touch-manipulation cursor-pointer',
            moreOpen ? 'text-[var(--mh-navy,var(--mh-navy))] font-bold bg-[var(--mh-navy-50,var(--mh-navy-50))]' : 'text-[var(--mh-text-2,var(--mh-text-2))]',
          )}
        >
          <Menu className="w-[22px] h-[22px]" />
          <span>Thêm</span>
        </button>
      </nav>

      {/* Mobile "Thêm" drawer */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-[var(--mh-text)]/50" onClick={() => setMoreOpen(false)} />
          <div className="relative mt-auto w-full max-h-[min(75dvh,80vh)] bg-[var(--mh-surface,#fff)] rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-200 overflow-hidden flex flex-col overscroll-contain pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--mh-border)]">
              <div className="font-bold text-[15px]">Menu thêm</div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="h-11 w-11 grid place-items-center rounded-lg hover:bg-[var(--mh-surface-2,var(--mh-surface-2))] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-1 pb-8">
              <div className="px-2 py-2 mb-2 rounded-xl bg-[var(--mh-navy-50)]/60 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[var(--mh-navy)] text-white grid place-items-center font-bold text-xs">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{userName}</div>
                  <div className="text-[11px] text-[var(--mh-text-2)] truncate">{userEmail}</div>
                </div>
              </div>
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const on = isActive(item);
                return (
                  <button
                    key={`more-${item.value}-${item.adminSubTab || ''}`}
                    type="button"
                    onClick={() => handleNav(item)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-3 min-h-11 rounded-xl text-[13px] font-medium cursor-pointer',
                      on ? 'bg-[var(--mh-navy-50,var(--mh-navy-50))] text-[var(--mh-navy,var(--mh-navy))] font-semibold' : 'text-[var(--mh-text,var(--mh-text))] hover:bg-[var(--mh-bg,var(--mh-bg))]',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="ml-auto text-[11px] bg-[var(--mh-err)] text-white rounded-full px-1.5">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              {onRenameSelf && (
                <button
                  type="button"
                  onClick={() => { setMoreOpen(false); onRenameSelf(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-[var(--mh-navy)] hover:bg-[var(--mh-navy-50)] mt-2"
                  data-testid="shell-rename-self-m"
                >
                  <Pencil className="w-4 h-4" />
                  Đổi tên của tôi
                </button>
              )}
              {onOpenKyc && (
                <button type="button" onClick={() => { setMoreOpen(false); onOpenKyc(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-[var(--mh-navy)] hover:bg-[var(--mh-navy-50)] mt-2" data-testid="shell-kyc-m">
                  💳 Thông tin thanh toán của tôi
                </button>
              )}
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-[var(--mh-err)] hover:bg-red-50 mt-2"
                >
                  <LogOut className="w-4 h-4" />
                  Đăng xuất
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppShell;
