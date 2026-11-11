import React from 'react';
import { cn } from '@/lib/utils';

export function KpiSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[10px] border border-[var(--mh-border)] bg-[var(--mh-surface)] p-4 space-y-3 animate-pulse">
          <div className="h-3 w-20 rounded bg-[var(--mh-surface-2)]" />
          <div className="h-7 w-28 rounded bg-[var(--mh-surface-2)]" />
          <div className="h-2.5 w-24 rounded bg-[var(--mh-surface-2)]" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-[10px] border border-[var(--mh-border)] bg-[var(--mh-surface)] overflow-hidden">
      <div className="h-11 bg-[var(--mh-navy-50)] border-b border-[var(--mh-border)] animate-pulse" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn('h-11 border-b border-[var(--mh-border)]/last:border-0 flex items-center gap-4 px-4 animate-pulse', i % 2 ? 'bg-[var(--mh-surface-2)]/40' : 'bg-[var(--mh-surface)]')}>
          <div className="h-3 w-32 rounded bg-[var(--mh-surface-2)]" />
          <div className="h-3 w-24 rounded bg-[var(--mh-surface-2)]" />
          <div className="ml-auto h-3 w-20 rounded bg-[var(--mh-surface-2)]" />
        </div>
      ))}
    </div>
  );
}

export function ScreenSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="h-7 w-48 rounded bg-[var(--mh-surface-2)] animate-pulse" />
      <KpiSkeleton />
      <TableSkeleton />
    </div>
  );
}
