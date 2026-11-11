import React from 'react';

/** Shared section sub-menu (MAYHOMES Corporate Clean) for Quản lý Ban KD / Khối / Phòng KD.
 *  Mobile (<768): wrap all items in a 2–3 col grid of ≥44px buttons — no horizontal scroll.
 *  Desktop: horizontal row (wrap if needed), unchanged prominence.
 */
export type SectionTabItem = {
  id: string;
  label: string;
  short?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  hidden?: boolean;
  testId?: string;
};

export function SectionTabs({
  items, value, onChange, ariaLabel, title, aside, sticky = true, className = '',
}: {
  items: (SectionTabItem | null | false | undefined)[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  title?: string;
  aside?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  const list = items.filter((t): t is SectionTabItem => !!t && !t.hidden);
  const cols = list.length <= 2 ? 2 : list.length === 3 ? 3 : list.length === 4 ? 2 : 3;

  return (
    <div data-testid="vn-section-tabs" className={`${sticky ? 'sticky top-0 z-30' : ''} mb-3 ${className}`}>
      <div className="bg-[var(--mh-surface,#fff)]/95 backdrop-blur-md border border-[var(--mh-border,var(--mh-border))] rounded-2xl shadow-[0_4px_16px_-6px_rgba(15,27,45,0.18)]">
        {(title || aside) && (
          <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
            {title && (
              <p className="text-[11px] font-extrabold text-[var(--mh-text-2,var(--mh-text-2))] uppercase tracking-wider">
                {title}
              </p>
            )}
            {aside}
          </div>
        )}
        <div
          role="tablist"
          aria-label={ariaLabel}
          data-cols={cols}
          className={
            cols === 2
              ? 'p-2 gap-1.5 grid grid-cols-2 md:flex md:flex-wrap md:items-center'
              : 'p-2 gap-1.5 grid grid-cols-3 md:flex md:flex-wrap md:items-center'
          }
        >
            {list.map((t) => {
              const on = t.id === value;
              const Ic = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-testid={t.testId}
                  onClick={() => onChange(t.id)}
                  className={`min-h-11 md:h-11 px-2.5 md:px-4 rounded-xl text-[12px] sm:text-[13px] md:text-[14px] touch-manipulation cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mh-navy,var(--mh-navy))]/40 inline-flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2 text-center md:text-left md:whitespace-nowrap w-full md:w-auto md:shrink-0 ${
                    on
                      ? 'bg-[var(--mh-navy,var(--mh-navy))] text-white font-bold shadow-md shadow-[var(--mh-navy,var(--mh-navy))]/25'
                      : 'bg-[var(--mh-bg,var(--mh-bg))] text-[var(--mh-text,var(--mh-text))] font-semibold border border-[var(--mh-border,var(--mh-border))] hover:bg-[var(--mh-navy-50,var(--mh-navy-50))] hover:text-[var(--mh-navy,var(--mh-navy))]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 max-w-full">
                    {Ic && (
                      <Ic
                        className={`w-[18px] h-[18px] shrink-0 ${on ? 'text-white' : 'text-[var(--mh-navy,var(--mh-navy))]'}`}
                      />
                    )}
                    <span className="truncate leading-tight">
                      {t.short ? (
                        <>
                          <span className="md:hidden">{t.short}</span>
                          <span className="hidden md:inline">{t.label}</span>
                        </>
                      ) : (
                        t.label
                      )}
                    </span>
                    {t.badge != null && t.badge !== '' && t.badge !== 0 && (
                      <span
                        className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black inline-flex items-center justify-center shrink-0 ${
                          on ? 'bg-[var(--mh-surface)]/25 text-white' : 'bg-[var(--mh-accent,var(--mh-accent))] text-white'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
