// Pure helpers for the arrayUnion/increment descriptors used by src/firestore-proxy.ts.
// Kept dependency-free so they can be unit-tested (tests/legacyFieldValues.test.ts).

export type MockFieldValue = { _type: 'arrayUnion' | 'increment'; value: any };

export function isMockFieldValue(v: any): v is MockFieldValue {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && (v._type === 'arrayUnion' || v._type === 'increment')
    && Object.prototype.hasOwnProperty.call(v, 'value');
}

/** Legacy malformed value written by the old proxy: `{ _type: 'arrayUnion', value: [...] }`. */
export function isLegacyArrayUnionMap(v: any): boolean {
  return isMockFieldValue(v) && v._type === 'arrayUnion' && Array.isArray(v.value);
}

function dedupePush(base: any[], items: any[]): any[] {
  const out = [...base];
  for (const item of items) {
    if (!out.some(existing => JSON.stringify(existing) === JSON.stringify(item))) out.push(item);
  }
  return out;
}

/** Turn legacy `{_type:'arrayUnion', value:[...]}` maps (top-level fields) into arrays for display. */
export function normalizeLegacyFieldValues<T = any>(data: T): T {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  let changed: Record<string, any> | null = null;
  for (const key of Object.keys(data as any)) {
    const v = (data as any)[key];
    if (isMockFieldValue(v)) {
      if (!changed) changed = { ...(data as any) };
      if (v._type === 'arrayUnion') {
        changed[key] = Array.isArray(v.value) ? v.value : (v.value == null ? [] : [v.value]);
      } else {
        changed[key] = typeof v.value === 'number' ? v.value : 0;
      }
    }
  }
  return (changed || data) as T;
}

export function evaluateMockFieldUpdate(updateVal: any, existingFieldVal: any) {
  if (isMockFieldValue(updateVal)) {
    if (updateVal._type === 'increment') {
      const current = typeof existingFieldVal === 'number'
        ? existingFieldVal
        : (isMockFieldValue(existingFieldVal) && typeof existingFieldVal.value === 'number' ? existingFieldVal.value : 0);
      return current + Number(updateVal.value || 0);
    }
    if (updateVal._type === 'arrayUnion') {
      const current = Array.isArray(existingFieldVal)
        ? existingFieldVal
        : (isLegacyArrayUnionMap(existingFieldVal) ? existingFieldVal.value : []);
      return dedupePush(current, Array.isArray(updateVal.value) ? updateVal.value : []);
    }
  }
  return updateVal;
}

export function arrayUnionKeys(data: any): string[] {
  if (!data || typeof data !== 'object') return [];
  return Object.keys(data).filter(k => !k.includes('.') && isMockFieldValue(data[k]) && data[k]._type === 'arrayUnion');
}

/**
 * Pure helper: given the current doc data and an update with arrayUnion descriptors,
 * return the update where fields whose CURRENT value is not a proper array (legacy
 * `{_type:'arrayUnion'}` map) are rewritten as a full array (old items + new items).
 * Fields that are already arrays (or missing) keep the descriptor -> real arrayUnion.
 */
export function healLegacyArrayUnionUpdate(current: any, data: any): any {
  const keys = arrayUnionKeys(data);
  if (!keys.length || !current) return data;
  let out: Record<string, any> | null = null;
  for (const key of keys) {
    const cur = current[key];
    if (cur === undefined || cur === null || Array.isArray(cur)) continue;
    if (!out) out = { ...data };
    out[key] = evaluateMockFieldUpdate(data[key], cur);
  }
  return out || data;
}

