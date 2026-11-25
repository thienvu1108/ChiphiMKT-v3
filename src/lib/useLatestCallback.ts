import { useCallback, useRef } from 'react';

/** Hàm ổn định (identity không đổi) luôn chạy closure của lần render mới nhất → không bao giờ đọc props/state cũ. */
export function useLatestCallback<A extends any[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}
