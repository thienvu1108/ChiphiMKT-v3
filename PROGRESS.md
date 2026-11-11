
## 15/10 ~17:10 VN — Mốc Google Drive OAuth (staging)
- Env GOOGLE_DRIVE_OAUTH_CLIENT_ID/SECRET thêm vào Vercel chiphimkt-v2-staging (preview+production, sensitive, không in giá trị).
- Commit 76e4e31 + fix ESM import; rules deploy staging (chiphi-mkt-staging 15/10 16:58 VN; live chiphi-mkt vẫn 06/10).
- Deploy preview → alias chiphimkt-v2-staging.vercel.app. Smoke: status oauth:true, /api/drive/start không token → 401.

## 15/10 ~18:00 VN — Sửa nóng theo phản hồi Phong (staging)
- Tải ảnh: nút ⬆ Tải ảnh trên từng dòng bảng Nghiệm thu MKT chính (desktop) + trên thẻ mobile, Admin/Mod (vn.nt_images.upload). Mở modal tải ảnh (đường dẫn Drive + tên file). Commit 460b4cf, e1fe467.
- Người dùng mới: hồ sơ users/{uid} vẫn được tạo khi đăng nhập (đã kiểm tra trên emulator); thêm /api/users/ensure (ID token, rules self-create, không ghi đè) làm dự phòng; staging dùng memory cache (lỗi treo IndexedDB của SDK với người chưa duyệt).
- Lỗi chính: menu "Duyệt tài khoản" không có route → bấm vào bị đưa về Trang chủ. Đã thêm /duyet-tai-khoan + mục "Đã đăng nhập, chưa gửi đăng ký" (mới nhất trước).
- Deploy preview → alias staging. Rules không đổi.

## 15/10 ~18:30 VN — Sửa trắng trang người chờ duyệt (staging)
- Lỗi do 460b4cf: guard cũ "user → team-mgmt" giành với guard Quy trình MKT → React #185 (trắng trang) cho người chờ duyệt. Gộp thành một guard. Commit 7c174bb, đã deploy staging.
- Harness: hasText chỉ tính phần tử hiển thị (lỗi giả ke_toan mobile); mod_nt đóng dialog chia sẻ trước khi sang tab Gán (lỗi giả mod); thêm kiểm tra Tải ảnh ở bảng chính (admin/mod có, kế toán không); reseed fixtures trước lượt mobile của vai trò có ghi dữ liệu.
- Đang chạy lại full matrix 15 vai trò × 2 thiết bị.
- 19:40 Full matrix 19:18: 28/30 PASS; admin mobile cho-duyet/chuyen-truc-tiep (lại PASS 19:27 sau reseed), user mobile sua-ns (bảng tràn ngang mobile → sửa budgetViews overflow-x, PASS 19:36). Chạy xác nhận admin mobile.
- 19:44 admin mobile chạy lại PASS (13/13). Commit+push+deploy.
- 19:5x Deploy 85dd014 preview 1qss6t3yg → alias staging OK.
- 19:5x BAO-CAO + PR #5 cập nhật.
## 15/10 20:26 — Phản hồi: onboarding modal, khoá Khối Báo cáo Khối, NS Khối, toast BC tuần
- 20:3x Onboarding → modal chặn (vn-onboarding-modal), Chờ duyệt có nút đóng → banner.
- 20:4x Khối: khoiScope + KhoiVNext theo Khối đang chọn (gốc lỗi NS Khối: tab v-next bỏ qua Khối chọn ở đầu trang, luôn hiện blocks[0]); blockTeamIds; listener GĐK theo blockId; unit 113 pass
- rules: GĐK/Trợ lý chỉ đọc ns_lines/weekly Khối mình; rules 168/168
- 20:5x Toast portal + harness: popup, khoá Khối, chuỗi cross-role (x_*). Rebuild emu.
- 21:0x new desktop popup PASS
- 21:1x cross desktop 5/5 PASS. Chạy full matrix (run-all.sh) → matrix-full.log
- 21:3x Full run hỏng: đĩa đầy (firebase/firestore-debug.log 117GB từ emulator FINE log) → truncate, chạy lại với vòng truncate.
- 21:4x Emulator chết do đĩa đầy → khởi động lại, chạy lại full matrix
- 21:5x (executor) 262b52f đã push. Matrix đang chạy (tới mod). Deploy rules staging + preview.
- rules deploy chiphi-mkt-staging (firebase.staging.json) OK
- 22:0x Deploy 262b52f preview krd2l5177 → alias staging OK
- 22:2x matrix: tai-anh FAIL mod desktop+mobile; còn lại đang chạy (cross)
- 22:3x matrix ALLDONE: chỉ mod tai-anh FAIL (2 thiết bị); cross 10/10 PASS
- 22:5x tai-anh: lỗi do Drive chưa kết nối trong emulator (toast 'Tải ảnh lên Drive thất bại'), harness đánh SKIP
- 23:0x bao-cao-tuan toast PASS desktop+mobile (đo lại bằng observer). tai-anh mobile vẫn fail cùng nguyên nhân Drive.
- 23:1x BAO-CAO cập nhật
- PR #5 mô tả cập nhật
## 15/10 21:50 — Combobox tìm kiếm Dự án/Khối/Phòng
- SearchSelect + lib/viSearch + test
- legacy: SelectContent searchable + AcceptanceSearchableSelect dùng viSearch
- legacy filters normVi + sort; tsc OK
- commit+push ca2478d
- emu rebuild ca2478d; chạy matrix rút gọn
- deploy h0p0bdojd → alias staging OK
- 22:3x Drive staging: driveOAuth/main có (connectedAt 20:24 VN); status oauth:true
- smoke + search PASS; BAO-CAO cập nhật
## 15/10 22:27 — Người phụ trách searchable + đối chiếu NS/NT
- implementerOptions + buildReconcile
- smoke-nt-assign sẵn sàng
- commit 644228c push
- xoá Khối + teams lọc inactive + rules blocks delete chỉ admin
- NS Khối: Tất cả các Khối mặc định (Admin)
- trash Drive + smoke sẵn sàng
- commit c56b56e; rules staging; emu rebuild
- deploy https://chiphimkt-v2-staging-7h4vr8jhs-thien-vus-projects-6af77680.vercel.app → alias
- smoke: ns-khoi-tat-ca OK (ALL), xoa-khoi OK; nt picker mod OK; admin/gdkd NT smoke timeout (route/selector harness), doi-chieu-admin shot sai trang
- 22:52 tiếp: sửa smoke
- smoke NT/xoá khối xong
- commit ebbf43f card mobile
- smoke 6/6 + deploy https://chiphimkt-v2-staging-qluvzt8wg-thien-vus-projects-6af77680.vercel.app
- 23:21 steering: NT bắt buộc người phụ trách sau go-live; bỏ Quy trình; landing NS
- quy trình đã bỏ, matrix cập nhật; tiếp: NT cutoff
- NT cutoff code+rules xong, test 59 pass, tsc ok
- commit 57bbaab, rules staging, rebuild
- matrix: thêm mod_cutoff, user_landing, pend quy-trinh
- deploy https://chiphimkt-v2-staging-6014b653s-thien-vus-projects-6af77680.vercel.app alias
- emulator restart (auth chết)
- commit 940f54d deploy https://chiphimkt-v2-staging-fyt24jakh-thien-vus-projects-6af77680.vercel.app
- BAO-CAO + PR5 cập nhật
- 06:25 bỏ import Excel + đồng bộ Sheet
- import/sheet đã gỡ khỏi UI, registry; tsc ok
- server sheets gỡ, test noImportSync
- commit da7f5f3 deploy 
- deploy c1yh06a7p alias
- 06:45 bug layout sidebar giữa trang
- layout: tái hiện = artifact chụp toàn trang khi đang cuộn; không đổi code
- PR5 cập nhật
- 07:47 task: so sánh main vs v-next + mindmap
- SO-SANH md xong
- 08:25 task backup/restore Drive (staging)
- api backup-drive viết xong
- backup: BackupPanel UI added
- backup: rules backupRuns, vercel cron, tests/backup.test.ts (6 pass)
- backup: PITR doc
- backup: commit dc9f3ef pushed
- backup: deployed chwtv0gpp + rules staging
- backup: fix role deps, screenshots shots/final/sao-luu-*.png
- backup: deploy oqyixl1wo
- backup: PR #5 updated
- backup: cron no-op guard
- backup: deploy guard (preview)
## 08:56 Feedback round (upload state, cover, duyệt TK, tên ĐK, NS mất, backup cost)
- fb1 upload progress done
- fb2 cover info (web+pptx, share derives from records)
- fb4 name on approve + rules + test; fb3 pending
- fb3 approvals newest-first on top
- fb5 cause found: Homes May lines in old team A1.E11.3 hidden after re-registration into A4.E41.4 (data intact)
- fb5 old-team badge in MyRegistration
- fb6 numbers measured (live 11973 docs/15.9MB json; ~550 audit/day)
- changeLog: lib, shim(alias), rules+tests(52), ChangeLogPanel
- changeLog backup incremental+archive; harness rebuilt
- E2E desktop fb1-3 + changeLog OK
- committed
- deployed rules + https://chiphimkt-v2-staging-o7n0u2440-thien-vus-projects-6af77680.vercel.app
- PR+BAO-CAO updated
## 09:47 TONG-HOP review
- verify: features OK, tests 175 rules/137 unit
- TONG-HOP md written
