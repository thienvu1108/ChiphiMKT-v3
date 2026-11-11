/** Khởi tạo hồ sơ khi đăng nhập — tránh tạo «hồ sơ tạm» đè lên hồ sơ thật (pure).
 * Sự cố 04/11: getDoc trả «không tồn tại» từ cache IndexedDB / kênh Listen bị chặn trong khi
 * users/{uid} thật (role mod) vẫn còn → client ghi stub role 'user' (merge) → rules từ chối → màn Đăng ký. */
export type ServerProfile = Record<string, any> | null | 'error';

export type BootstrapDecision = 'use-client' | 'use-server' | 'create' | 'retry';

/** clientExists: getDoc; serverProfile: xác minh từ máy chủ (REST /api/users/me hoặc getDocFromServer). */
export function bootstrapDecision(i: { clientExists: boolean; serverProfile: ServerProfile }): BootstrapDecision {
  if (i.clientExists) return 'use-client';
  if (i.serverProfile === 'error') return 'retry';
  if (i.serverProfile && typeof i.serverProfile === 'object') return 'use-server';
  return 'create';
}

/** Sau khi tạo hồ sơ bị từ chối quyền: nếu máy chủ có hồ sơ → dùng nó, không hiện lỗi / không mở Đăng ký. */
export function afterCreateDenied(serverProfile: ServerProfile): 'use-server' | 'error' {
  return serverProfile && typeof serverProfile === 'object' ? 'use-server' : 'error';
}

/** Chuyển giá trị Firestore REST → JS (dùng cho /api/users/me). */
export function fromRestValue(v: any): any {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromRestValue);
  if ('mapValue' in v) return fromRestFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  return undefined;
}
export function fromRestFields(fields: Record<string, any> | undefined): Record<string, any> {
  return Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, fromRestValue(v)]));
}
