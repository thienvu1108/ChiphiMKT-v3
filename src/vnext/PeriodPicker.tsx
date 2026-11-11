import React, { useEffect, useRef } from 'react';
import { getPeriodOf, addPeriods, periodLabel, VNEXT_PERIOD_CUTOVER, now } from '../../lib/vnext/period';
import { openNsPeriods } from '../../lib/vnext/platform';
import { currentLocks, useLocks } from './locks';
import { Select } from './ui';

/** Kỳ đang MỞ đăng ký NS mới — chỉ theo «Thời gian MỞ» (vnLocks/current) + khoá kỳ đã qua. */
export const openCreatePeriods = () => openNsPeriods(currentLocks(), 'nsCreate', now().getTime());

export function periodOptions(_settings?: any, extraBack = 3) {
  const cur = getPeriodOf(now());
  const set = new Set<string>();
  for (let i = -extraBack; i <= 1; i++) set.add(addPeriods(cur, i));
  for (const p of openCreatePeriods()) set.add(p);
  set.add(VNEXT_PERIOD_CUTOVER);
  return [...set].filter((p) => p >= VNEXT_PERIOD_CUTOVER || p >= addPeriods(cur, -extraBack)).sort().reverse();
}

/** Mặc định: kỳ đang mở đăng ký mới (muộn nhất); không có → kỳ hiện tại. */
export const locksLoaded = () => 'pastLock' in currentLocks();
export function defaultPeriod(_settings?: any) {
  const open = locksLoaded() ? openCreatePeriods() : [];
  const cur = getPeriodOf(now());
  const p = open.length ? open[open.length - 1] : cur;
  return p < VNEXT_PERIOD_CUTOVER ? VNEXT_PERIOD_CUTOVER : p;
}

export function PeriodPicker({ value, onChange, db }: any) {
  const locks = useLocks(db);
  const touched = useRef(false);
  const openList = locksLoaded() ? openCreatePeriods() : [];
  const open = new Set(openList);
  // Lịch MỞ tải xong sau lần render đầu → nếu người dùng chưa tự chọn, nhảy tới kỳ đang mở đăng ký mới.
  useEffect(() => {
    if (!touched.current && openList.length && !open.has(value)) onChange(openList[openList.length - 1]);
  }, [locks]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (v: string) => { touched.current = true; onChange(v); };
  return <Select value={value} onChange={pick} options={periodOptions().map((p) => ({ value: p, label: periodLabel(p) + (open.has(p) ? ' · đang mở ĐK' : '') }))} aria-label="Kỳ" data-testid="vn-period-picker" />;
}
