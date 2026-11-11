// DRY-RUN (read-only): đếm item Báo cáo tuần không còn dòng NS live (cùng period + uid + projectId).
// Không in PII (không email/tên). Chỉ đếm + phân bổ theo period/dot.
// Dùng: DB=chiphi-mkt FIREBASE_SERVICE_ACCOUNT_LIVE=... node scripts/dryrun-weekly-orphans.cjs
// Cleanup plan (KHÔNG chạy trên live từ script này):
//  1) Backup weekly_reports (+ ns_lines) ra /workspace/backups/…
//  2) Staging: xoá NS thử → xác nhận item biến mất; hoặc chạy batch strip theo danh sách orphan
//  3) Prod: chỉ sau khi Phong duyệt, dùng cùng batch strip (Admin) — rollback = import lại backup
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_LIVE)) });
const db = getFirestore(process.env.DB || 'chiphi-mkt');

function live(l) {
  return l && !l.deleted && Number(l.amount) > 0;
}

(async () => {
  const nsSnap = await db.collection('ns_lines').get();
  const liveKeys = new Set(); // period|uid|projectId
  for (const d of nsSnap.docs) {
    const l = d.data();
    if (!live(l) || (l.kind !== 'user' && l.kind !== 'khoi') || !l.ownerUid || !l.period || !l.projectId) continue;
    liveKeys.add(`${l.period}|${l.ownerUid}|${l.projectId}`);
  }
  const wrSnap = await db.collection('weekly_reports').get();
  let orphanItems = 0, orphanDocs = 0, totalItems = 0, totalDocs = 0;
  const byPeriod = {};
  for (const d of wrSnap.docs) {
    const r = d.data() || {};
    if (r.deleted) continue;
    totalDocs++;
    const items = Array.isArray(r.items) ? r.items : [];
    let docOrphan = 0;
    for (const it of items) {
      totalItems++;
      const key = `${r.period}|${r.uid}|${it.projectId}`;
      if (!liveKeys.has(key)) {
        orphanItems++;
        docOrphan++;
        const pk = `${r.period || '?'}|dot${r.dot || '?'}`;
        byPeriod[pk] = (byPeriod[pk] || 0) + 1;
      }
    }
    if (docOrphan) orphanDocs++;
  }
  console.log(JSON.stringify({
    db: process.env.DB || 'chiphi-mkt',
    weeklyDocs: totalDocs,
    weeklyItems: totalItems,
    orphanItems,
    orphanDocs,
    byPeriodDot: byPeriod,
    note: 'orphan = item không có ns_lines live (kind user|khoi, amount>0, !deleted) cùng period+uid+projectId',
  }, null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
