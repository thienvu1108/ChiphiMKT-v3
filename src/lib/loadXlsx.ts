import type * as XLSXNamespace from 'xlsx';

type XLSXModule = typeof XLSXNamespace;

let cached: XLSXModule | null = null;

/** Dynamically load the xlsx library (keeps it out of the login/entry chunk). */
export async function loadXlsx(): Promise<XLSXModule> {
  if (!cached) {
    cached = await import('xlsx');
  }
  return cached;
}
