import { parseCurrencyFormula } from './acceptanceUtils';

export interface AcceptanceRecord {
  id: string;
  month: string;
  teamId?: string;
  teamName?: string;
  teamCode?: string;
  blockId?: string;
  blockCode?: string;
  blockName?: string;
  gdkdName?: string;
  implementerName?: string;
  projectId?: string;
  projectName?: string;
  projectCode?: string;
  banKdId?: string;
  banKdName?: string;

  // Group 1: DIGITAL CHẠY (Chưa VAT)
  digitalFb?: number;
  digitalZalo?: number;
  digitalTiktok?: number;
  digitalKhac?: number;
  digitalTotalChuaVat?: number;
  digitalTotalSauVat?: number; // Cột K

  // Group 2: THẺ VISA CÔNG TY (Chưa VAT)
  visaFb?: number;
  visaZalo?: number;
  visaTiktok?: number;
  visaDangTin?: number;
  visaTotalChuaVat?: number;
  visaTotalSauVat?: number; // Cột Q

  // Group 3: ĐĂNG TIN CÔNG TY
  dangTinCtyChuaVat?: number; // Cột R
  dangTinCtySauVat?: number; // Cột S (8% VAT)

  // Group 4: CÁ NHÂN CHẠY NGOÀI (TẤT CẢ LẤY SỐ TRƯỚC VAT)
  caNhanFb?: number;
  caNhanDangTin?: number;
  caNhanZalo?: number;
  caNhanGoogle?: number;
  caNhanTiktok?: number;
  caNhanNativeAds?: number;
  caNhanUCall?: number;
  hoaDonTien?: number;
  hoaDonLines?: { amount: number; note?: string }[];
  hoaDonNo?: number;
  caNhanTotal?: number; // Cột Y

  // Cột: Cá Nhân nạp tiền qua công ty
  caNhanNapTienQuaCty?: number;
  caNhanNapTienCty?: number;

  // Group 5: TỔNG
  grandTotal?: number; // Cột Z (K + Q + S + Y + Cá nhân nạp tiền qua công ty)

  // Group 6:
  caNhanNopTien?: number; // Cột AA: Số Lead
  status?: string; // Cột AB
  notes?: string; // Cột AC

  // Legacy compatibility fields
  fbDigitalChuaVat?: number;
  facebookCost?: number;
  digitalCost?: number;
  caNhanCost?: number;
  otherCost?: number;
  fbVisaCostChuaVat?: number;
  visaCost?: number;
  dangTinCaNhanCost?: number;
  dangTinCongTyChuaVat?: number;
  postingCost?: number;
  zaloCost?: number;
  googleCost?: number;
  tiktokCost?: number;
  totalCost?: number;
  afterAcceptanceCost?: number;
  beforeAcceptanceCost?: number;

  costBreakdowns?: any;
  editHistory?: any[];
  createdAt?: any;
  createdBy?: string;
  updatedAt?: any;
  updatedBy?: string;
  isDraft?: boolean;
}

export interface ParsedFormulaResult {
  total: number;
  items: { amount: number; label: string }[];
  displayString: string;
}

export interface ComputedRowValues {
  dFb: number;
  dZalo: number;
  dTiktok: number;
  dKhac: number;
  dTotalChuaVat: number;
  dTotalSauVat: number; // K (10% FB, Tiktok, Khác; 8% Zalo)

  vFb: number;
  vZalo: number;
  vTiktok: number;
  vDangTin: number;
  vTotalChuaVat: number;
  vTotalSauVat: number; // Q (10% FB, Tiktok; 8% Zalo, Đăng tin)

  dtCtyChuaVat: number;
  dtCtySauVat: number; // S (8% VAT)

  cnFb: number;
  cnDangTin: number;
  cnZalo: number;
  cnGoogle: number;
  cnTiktok: number;
  cnNativeAds: number;
  cnUCall: number;
  cnTotal: number; // Y (Tổng cá nhân)

  cnNapTienCty: number; // Cá Nhân nạp tiền qua công ty

  grandTotal: number; // Z (K + Q + S + Y + cnNapTienCty)
  hoaDonTien: number;
  hoaDonNo: number;
  cnNopTien: number; // AA
}
