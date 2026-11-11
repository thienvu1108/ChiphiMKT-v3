# Kế hoạch đưa v-next lên live (CHƯA CHẠY)

Chỉ thực hiện sau khi anh Phong duyệt staging. Không có bước nào dưới đây đã chạy trên live.

## 0. Sao lưu
1. `gcloud firestore export gs://<bucket>/backup-$(date +%F) --database=chiphi-mkt` (managed export, đầy đủ).
2. Lưu bản `firestore.rules` đang chạy (Firebase Console → Rules → History) để rollback.

## 1. Dữ liệu
- Collection mới (`ns_lines`, `weekly_reports`, `acceptanceImages`, `acceptanceImageData`, `shareLinks`, `teamNotifications`): bắt đầu rỗng, không cần migrate.
- `users.teamId`: không bắt buộc (rules + UI có fallback theo `teamName`). Có thể backfill:
  `node scripts/vnext-migrate-dryrun.mjs export.json > plan.json`. Script chỉ lập kế hoạch, không ghi. Xem xét `ambiguous`/`noMatch` thủ công trước khi viết bước ghi.
- `teams.status`/`gdkdUids`: admin thiết lập trên UI sau khi go-live.
- `settings/global`: `nsUnlockedPeriods`, deadline, `ntDriveRootUrl` — admin nhập trên Cài đặt.

## 2. Thứ tự go-live
1. Backup (bước 0) → 2. Deploy rules (`firebase deploy --only firestore:rules`, DB chiphi-mkt) → 3. Merge PR → Vercel prod → 4. Smoke test các vai trò → 5. Rollback = rules cũ + redeploy commit trước.

## Go-live Nghiệm thu: bắt buộc Người phụ trách (16/10/2026)

- **Cấu hình:** `settings/global.ntImplementerRequiredFrom` (Firestore Timestamp = 00:00 giờ VN của ngày go-live). Admin đặt tại **Quản trị → Cài đặt → "Go-live Nghiệm thu: bắt buộc Người phụ trách từ ngày"** (để trống = chưa bắt buộc). Mặc định: **chưa đặt**, trên cả staging lẫn live.
- **Bản ghi cũ** (tạo trước mốc, không có cờ `ntRequired`): không bắt buộc, sửa như cũ.
- **Bản ghi mới** từ mốc:
  - UI chặn tạo khi chưa chọn Người phụ trách và ghi cờ `ntRequired: true`.
  - Sau đó không được bỏ trống Người phụ trách.
  - Nhập Excel và đồng bộ Google Sheet đã bị gỡ hẳn (xem mục dưới). Bản ghi mới chỉ tạo được trên màn Nghiệm thu MKT.
- **Rules** (`firestore.rules`, khối acceptances):
  - `ntCreateReqOk()`: sau mốc, create phải có `implementerUid` khác rỗng và `ntRequired == true`.
  - `ntUpdateReqOk()`: bản ghi có cờ thì không được để trống `implementerUid`.
- **Khi go-live:** đặt ngày trong Cài đặt rồi deploy rules (đã có sẵn trong `firestore.rules`).

## Bỏ Quy trình MKT / Quy trình đối ứng (16/10/2026)

- Menu và route `/quy-trinh-mkt` và `/quy-trinh-doi-ung` đã bị gỡ; URL cũ được chuyển về `/`.
- Người chờ duyệt chỉ thấy màn **Chờ duyệt** (`/cho-duyet`): form đăng ký hoặc trạng thái chờ.
- NVKD sau khi được duyệt vào Phòng KD sẽ vào thẳng **Quản lý Phòng KD → tab Đăng ký Ngân sách MKT** (`/quan-ly-phong-kd`).

## Gỡ Nhập Excel và đồng bộ Google Sheet (16/10/2026)

Dữ liệu cũ giữ nguyên: không xoá collection hay document nào, kể cả `settings/report_nt`. Xuất Excel vẫn giữ.

**Đã gỡ**
- **Nghiệm thu MKT:**
  - Hộp thoại "Nhập Excel" (AcceptanceDialogs) và handler `handleFileImport`.
  - Các prop/state import truyền qua AcceptanceManager và BanKdManagementView.
  - `handleImportAcceptancesCSV` cùng `canImport`.
- **Danh mục:** "Nhập Excel" Dự án (`handleImportProjectsCSV`) và Team (`handleImportTeamsCSV`).
- **Ngân sách / Chi phí:**
  - Hộp thoại nhập file và link Google Sheet.
  - `handleImportBudgetsCSV`, `handleImportBudgetsFromUrl`, `handleImportCostsCSV`, `handleImportCostsFromUrl`.
- **Hiệu quả MKT:** nút "Nhập từ Excel" và hộp thoại tương ứng (`handleImportEfficiency`, `handleImportEfficiencyFromUrl`).
- **Đồng bộ Google Sheet:**
  - `syncLogToGoogleSheets`: Nhật ký không còn tự đẩy sang Sheet.
  - `handleSyncReportNT`, `handleSyncAllLogs`.
  - Thẻ "Sao lưu sang Google Sheets" (`syncFullSystem`, `handleGoogleBackup`, link Sheet). Nút "Khôi phục toàn bộ" vẫn giữ.
  - Hằng `GOOGLE_SHEET_URL` và state `sheetUrl`.
- **Server dev (`server.ts`):** `/api/auth/google/url`, `/auth/google/callback` và `/api/backup/sheets`. Vercel không có endpoint hay cron Sheet nào.
- **Registry quyền:** `report_nt.import`, `report_nt.sync`, `register.import`, `actual.import`, `admin.projects.import`. Các bản role permissions đã lưu có thể còn chứa các key này, nhưng không còn tác dụng.
- **Giữ lại:**
  - Các nút "đồng bộ" nội bộ (mã Dự án/Team, quyền ngân sách, Khối): chỉ đồng bộ dữ liệu trong Firestore, không liên quan Sheet.
  - Sao lưu GitHub.
- **Test:** `tests/noImportSync.test.ts`.

## Sao lưu & khôi phục (Google Drive) + khuyến nghị PITR

- **Sao lưu Drive** (`api/backup-drive/[action].ts`, `lib/vnext/backup.ts`, Cài đặt → Sao lưu): xuất toàn bộ collection → `.zip` (JSON + `manifest.json` đếm bản ghi) lên `Sao lưu ChiphiMKT/<Năm>/Tháng <MM>/MAYHOMES - Backup - YYYY-MM-DD HHhMM.zip` (staging: thư mục `[STAGING]` + tiền tố `[STAGING]`). Giữ bản hằng ngày 30 ngày, bản đầu mỗi tháng 12 tháng; cũ hơn → Thùng rác Drive.
- **Cron** 02:13 VN (`13 19 * * *` UTC) — Vercel chỉ chạy cron trên deployment *production* của project. Chỉ chạy khi project có đủ `BACKUP_CRON_ENABLED=1`, `CRON_SECRET` và `FIREBASE_SERVICE_ACCOUNT` (thiếu → trả 200 skipped, no-op — live không đặt cờ nên merge không kích hoạt) (service account chỉ có `roles/datastore.user` với IAM condition giới hạn đúng database tương ứng). Thiếu → cron trả 503 và ghi lỗi, không ảnh hưởng nút «Sao lưu ngay» (dùng ID token Admin).
- **Khôi phục** (Admin): toàn bộ / theo collection / tháng / Phòng; xem trước số Thêm-Sửa-Xoá; tự sao lưu trước khi ghi; gõ `KHOI PHUC`; ghi theo lô 400; audit `RESTORE_BACKUP`. Không khôi phục `auditLogs`, `backupRuns`, `settings_private`, `driveOAuth`.
- **Khuyến nghị PITR**: bật Firestore Point-in-Time Recovery (giữ 7 ngày, độ phân giải phút) cho DB live `chiphi-mkt` trước go-live: `gcloud firestore databases update --database=chiphi-mkt --enable-pitr`. PITR khắc phục sự cố trong 7 ngày gần nhất (đọc snapshot `read_time` rồi export/managed import); bản Drive dùng cho lưu trữ dài hạn và khôi phục từng phần. Kết hợp thêm *scheduled managed export* ra GCS nếu cần bản sao hạ tầng độc lập Drive.

## Lịch sử thay đổi (changeLog) — staging
- `src/vnext/changeLogShim.ts` (alias `firebase/firestore` trong vite.config.ts): trước mỗi ghi/sửa/xoá vào collection quan trọng (`KEY_COLS` trong `lib/vnext/changeLog.ts`) ghi 1 entry `changeLog` {col, docId, op, before, patch, actor, actorName, at}. Chỉ bật với DB `*-staging`.
- Rules: append-only; `actor == auth.uid`, `at == request.time`, `before` phải trùng dữ liệu thật → không giả mạo. Chỉ Admin đọc; xoá chỉ entry > 365 ngày (Admin).
- Chi phí: +1 lượt đọc (before) + 1 lượt ghi mỗi thay đổi. Ghi log lỗi không chặn thao tác; ghi dữ liệu lỗi → entry đánh dấu `failed`.
- Giới hạn: không bắt buộc ở rules (giới hạn 20 lượt truy cập tài liệu/lô của rules), nên thao tác ghi từ server (khôi phục bản sao lưu, /api/users/ensure) hoặc client không qua app không được ghi; khôi phục bản sao lưu có audit riêng. Phương án đầy đủ hơn: Cloud Functions `onDocumentWrittenWithAuthContext` (cần bật Cloud Functions/Blaze cho project).
- Cài đặt → Lịch sử thay đổi: lọc theo dữ liệu/thao tác/người/ngày; «Khôi phục bản này» ghi lại trạng thái trước (gõ KHOI PHUC) + auditLogs `RESTORE_CHANGE`.
- Sao lưu hằng đêm kèm changeLog 36 giờ gần nhất; entry > 12 tháng được nén lên Drive `Sao lưu ChiphiMKT/[STAGING]/Lưu trữ changeLog/` rồi xoá khỏi Firestore.
