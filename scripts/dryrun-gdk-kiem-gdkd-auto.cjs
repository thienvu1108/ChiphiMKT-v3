// DRY-RUN (read-only): liệt kê dòng NS kind 'user' do GĐ Khối / Trợ lý của chính Khối (blocks.directorUid/assistantUids) đăng ký,
// đang «Chờ duyệt» (chưa có nsSupport) → sau bản sửa sẽ hiển thị «Đã duyệt» (tự duyệt). KHÔNG ghi gì.
// Dùng: DB=chiphi-mkt-staging|chiphi-mkt FIREBASE_SERVICE_ACCOUNT_LIVE=... node scripts/dryrun-gdk-kiem-gdkd-auto.cjs [--backup out.json]
const admin = require('firebase-admin'); const { getFirestore } = require('firebase-admin/firestore'); const fs = require('fs');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_LIVE)) });
const db = getFirestore(process.env.DB || 'chiphi-mkt');
(async () => {
  const mgr = new Map();
  (await db.collection('blocks').get()).forEach((d) => { const b = d.data(); mgr.set(d.id, new Set([b.directorUid, ...(b.assistantUids || [])].filter(Boolean))); });
  const lines = await db.collection('ns_lines').where('kind', '==', 'user').get();
  const out = [];
  for (const d of lines.docs) {
    const l = d.data();
    if (l.deleted || !(Number(l.amount) > 0) || !l.blockId || !mgr.get(l.blockId)?.has(l.ownerUid)) continue;
    const s = await db.collection('nsSupport').doc(d.id).get();
    out.push({ id: d.id, period: l.period, blockId: l.blockId, teamId: l.teamId, amount: l.amount, support: s.exists ? s.data().status : 'none', line: l, supportDoc: s.exists ? s.data() : null });
  }
  const pend = out.filter((r) => r.support === 'none' || r.support === 'pending');
  console.log(`DB ${process.env.DB || 'chiphi-mkt'}: ${out.length} dòng GĐK/Trợ lý kiêm GĐKD; ${pend.length} đang chờ duyệt → tự duyệt sau bản sửa`);
  for (const r of out) console.log(r.id.slice(0, 12) + '…', r.period, 'block', r.blockId.slice(0, 6), r.amount, 'nsSupport:', r.support);
  const i = process.argv.indexOf('--backup'); if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
})();
