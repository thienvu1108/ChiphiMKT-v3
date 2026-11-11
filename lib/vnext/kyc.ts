/**
 * Thông tin thanh toán hỗ trợ MKT (CCCD / STK / Ngân hàng) — B1.
 * Lưu RIÊNG ở userKyc/{uid} (không nằm trong users/{uid} vì users đọc được rộng, kể cả GĐKD).
 * Ai đọc được (firestore.rules): chính user, Admin, Kế toán, GĐ Khối / Trợ lý Khối của Khối user đang thuộc.
 * GĐKD KHÔNG đọc được (kể cả thành viên Phòng mình).
 */
export const KYC_COLLECTION = 'userKyc';

export type KycAccount = { id: string; bankName: string; bankAccount: string; accountHolder: string };
/** bankAccount/bankName/accountHolder ở cấp gốc = tài khoản MẶC ĐỊNH (giữ tương thích dữ liệu cũ 1 tài khoản). accounts: tối đa 3. */
export type Kyc = { uid: string; cccd: string; bankAccount: string; bankName: string; accountHolder: string; accounts?: KycAccount[]; defaultAccountId?: string; fullName?: string; updatedAt?: string; updatedBy?: string };
export const MAX_ACCOUNTS = 3;

/** Danh sách tài khoản (dữ liệu cũ chỉ có 1 tài khoản ở cấp gốc → coi là tài khoản mặc định 'a1'). */
export function accountsOf(k?: Partial<Kyc> | null): KycAccount[] {
  if (!k) return [];
  if (Array.isArray(k.accounts) && k.accounts.length) return k.accounts.slice(0, MAX_ACCOUNTS);
  if (k.bankAccount) return [{ id: 'a1', bankName: k.bankName || '', bankAccount: k.bankAccount, accountHolder: k.accountHolder || '' }];
  return [];
}
export function defaultAccount(k?: Partial<Kyc> | null): KycAccount | null {
  const a = accountsOf(k);
  return a.find((x) => x.id === k?.defaultAccountId) || a[0] || null;
}
/** Tìm tài khoản theo snapshot trên dòng NS (id; không còn → khớp đuôi STK; cuối cùng mặc định). */
export function accountForLine(k: Partial<Kyc> | null | undefined, snap?: PayAccountSnap | null): KycAccount | null {
  const a = accountsOf(k);
  if (snap) return a.find((x) => x.id === snap.id) || a.find((x) => x.bankAccount.endsWith(snap.tail) && x.bankName === snap.bankName) || null;
  return defaultAccount(k);
}
/** Snapshot lưu trên ns_lines — KHÔNG có STK đầy đủ (ns_lines GĐKD đọc được): chỉ id, ngân hàng, 4 số cuối. */
export type PayAccountSnap = { id: string; bankName: string; tail: string };
export const snapOf = (a: KycAccount): PayAccountSnap => ({ id: a.id, bankName: a.bankName, tail: digits(a.bankAccount).slice(-4) });
export const snapLabel = (s?: PayAccountSnap | null) => (s ? `${s.bankName} ••${s.tail}` : '');
export function validateAccounts(list: KycAccount[]): string {
  if (!list.length) return 'Cần ít nhất 1 tài khoản';
  if (list.length > MAX_ACCOUNTS) return `Tối đa ${MAX_ACCOUNTS} tài khoản`;
  for (const [i, a] of list.entries()) { const e = validateKyc({ cccd: '000000000000', ...a }); if (Object.keys(e).length) return `Tài khoản ${i + 1}: ${Object.values(e)[0]}`; }
  const nums = list.map((a) => digits(a.bankAccount) + '|' + a.bankName.trim().toLowerCase());
  if (new Set(nums).size !== nums.length) return 'Có tài khoản bị trùng';
  return '';
}

export const VN_BANKS = [
  'Vietcombank', 'VietinBank', 'BIDV', 'Agribank', 'Techcombank', 'MB Bank', 'ACB', 'VPBank', 'Sacombank', 'TPBank',
  'HDBank', 'VIB', 'SHB', 'SeABank', 'OCB', 'MSB', 'Eximbank', 'LPBank', 'Nam A Bank', 'Bac A Bank', 'ABBANK',
  'VietABank', 'PVcomBank', 'Saigonbank', 'Kienlongbank', 'BaoViet Bank', 'NCB', 'PGBank', 'VietBank', 'GPBank',
  'Cake by VPBank', 'Timo', 'TNEX', 'Shinhan Bank', 'Woori Bank', 'UOB', 'Standard Chartered', 'HSBC', 'Public Bank',
];

export const digits = (s: any) => String(s ?? '').replace(/\D/g, '');

export function validateKyc(k: { cccd?: string; bankAccount?: string; bankName?: string; accountHolder?: string }): Record<string, string> {
  const e: Record<string, string> = {};
  const cccd = digits(k.cccd), acc = digits(k.bankAccount), bank = String(k.bankName || '').trim();
  if (!/^\d{12}$/.test(cccd)) e.cccd = 'Số CCCD gồm đúng 12 chữ số';
  if (!/^\d{6,20}$/.test(acc)) e.bankAccount = 'Số tài khoản gồm 6–20 chữ số';
  if (bank.length < 2 || bank.length > 100) e.bankName = 'Chọn hoặc nhập tên ngân hàng';
  const holder = normHolder(k.accountHolder);
  if (holder.length < 2 || holder.length > 100) e.accountHolder = 'Nhập tên chủ tài khoản (như trên thẻ / app ngân hàng)';
  return e;
}

/** Tên chủ TK: tự VIẾT HOA, giữ dấu, gộp khoảng trắng. */
export const normHolder = (s: any) => String(s ?? '').normalize('NFC').toLocaleUpperCase('vi-VN').replace(/\s+/g, ' ').trim();

export function normalizeKyc(k: { cccd?: string; bankAccount?: string; bankName?: string; accountHolder?: string }) {
  return { cccd: digits(k.cccd), bankAccount: digits(k.bankAccount), bankName: String(k.bankName || '').trim().replace(/\s+/g, ' '), accountHolder: normHolder(k.accountHolder) };
}

/** Có ít nhất 1 STK hợp lệ (điều kiện để NS MKT được tính là đã duyệt). */
export const hasPayInfo = (k: any): boolean => accountsOf(k).some((a) => /^[0-9]{6,20}$/.test(String(a.bankAccount || '')));
export const isKycComplete = (k: any) => !!k && Object.keys(validateKyc(k)).length === 0;

/** Che bớt khi hiển thị trong danh sách (đầy đủ chỉ khi bấm Hiện / xuất Excel). */
export const maskTail = (s: any, keep = 4) => { const d = String(s || ''); return d.length <= keep ? d : '•'.repeat(Math.min(8, d.length - keep)) + d.slice(-keep); };

/** Ai được XEM CCCD/STK của người khác (khớp firestore.rules; GĐKD không). */
export function canSeeOthersKyc(role: string): boolean {
  return ['admin', 'super_admin', 'accountant', 'gd_khoi', 'tro_ly_khoi'].includes(role);
}
