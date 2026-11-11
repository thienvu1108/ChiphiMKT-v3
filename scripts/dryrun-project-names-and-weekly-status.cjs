// DRY-RUN (read-only): 
//  1) Đếm bản ghi có projectName đã lưu khác tên hiện hành (projects collection).
//  2) Đếm item Báo cáo tuần gắn projectId mà NS không reportable (Từ chối / Chờ duyệt / Cần duyệt lại) hoặc không còn NS live.
// Không in PII. Không ghi.
// Dùng: DB=chiphi-mkt FIREBASE_SERVICE_ACCOUNT_LIVE=... node scripts/dryrun-project-names-and-weekly-status.cjs
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_LIVE)) });
const db = getFirestore(process.env.DB || 'chiphi-mkt');

function live(l) { return l && !l.deleted && Number(l.amount) > 0; }

(async () => {
  const [projSnap, accSnap, budSnap, blkSnap, nsSnap, supSnap, wrSnap, blocksSnap] = await Promise.all([
    db.collection('projects').get(),
    db.collection('acceptances').select('projectId', 'projectName').get(),
    db.collection('budgets').select('projectId', 'projectName').get(),
    db.collection('block_budgets').select('projectId', 'projectName').get(),
    db.collection('ns_lines').get(),
    db.collection('nsSupport').get(),
    db.collection('weekly_reports').get(),
    db.collection('blocks').get(),
  ]);
  const liveName = new Map();
  for (const d of projSnap.docs) {
    const p = d.data();
    if (p.deleted === true) continue;
    if (p.name) liveName.set(d.id, String(p.name).trim());
  }
  const staleOf = (docs) => {
    let n = 0, withName = 0;
    for (const d of docs) {
      const x = d.data() || {};
      const stored = x.projectName != null ? String(x.projectName).trim() : '';
      if (!stored || !x.projectId) continue;
      withName++;
      const live = liveName.get(String(x.projectId));
      if (live && live !== stored) n++;
    }
    return { withStoredName: withName, staleVsLive: n };
  };

  // Khoi managers for auto-approve
  const khoiMgr = new Map();
  for (const d of blocksSnap.docs) {
    const b = d.data() || {};
    const ids = [b.directorUid, ...(Array.isArray(b.assistantUids) ? b.assistantUids : [])].filter(Boolean);
    if (ids.length) khoiMgr.set(d.id, new Set(ids));
  }
  const isAuto = (l) => l.kind === 'khoi' || (l.kind === 'user' && l.blockId && khoiMgr.get(l.blockId)?.has(l.ownerUid));
  const sup = new Map(supSnap.docs.map((d) => [d.id, d.data()]));
  function baseStatus(l) {
    const s = sup.get(l.id);
    if (isAuto(l) && !s) return 'approved';
    const st = s?.status === 'approved' || s?.status === 'rejected' ? s.status : 'pending';
    if (isAuto(l) && st === 'approved') return 'approved';
    // simplified: ignore reapproval/editedSince for dry-run count (conservative: treat approved as approved)
    return st;
  }
  // Đã duyệt / tự duyệt → reportable. Chờ STK ≈ approved khi thiếu STK (baseStatus vẫn approved trước bước pay).
  function isReportableLine(l) {
    return baseStatus(l) === 'approved';
  }

  const reportableKeys = new Set(); // period|uid|projectId
  let nsReportable = 0, nsExcluded = 0;
  const exclBy = { pending: 0, rejected: 0, other: 0 };
  for (const d of nsSnap.docs) {
    const l = { id: d.id, ...d.data() };
    if (!live(l) || (l.kind !== 'user' && l.kind !== 'khoi')) continue;
    const st = baseStatus(l);
    if (st === 'approved') {
      nsReportable++;
      reportableKeys.add(`${l.period}|${l.ownerUid}|${l.projectId}`);
    } else {
      nsExcluded++;
      if (st === 'pending') exclBy.pending++;
      else if (st === 'rejected') exclBy.rejected++;
      else exclBy.other++;
    }
  }

  let hiddenItems = 0, hiddenDocs = 0, hiddenRejected = 0;
  for (const d of wrSnap.docs) {
    const r = d.data() || {};
    if (r.deleted) continue;
    let hit = 0, rej = 0;
    for (const it of (r.items || [])) {
      const key = `${r.period}|${r.uid}|${it.projectId}`;
      if (!reportableKeys.has(key)) {
        hiddenItems++; hit++;
        // if there is a live NS for this key that is rejected
        // (approximate via scanning — skip detailed)
      }
    }
    if (hit) hiddenDocs++;
  }

  console.log(JSON.stringify({
    db: process.env.DB || 'chiphi-mkt',
    projectsLive: liveName.size,
    staleNames: {
      acceptances: staleOf(accSnap.docs),
      budgets: staleOf(budSnap.docs),
      block_budgets: staleOf(blkSnap.docs),
      note: 'ns_lines không lưu projectName',
    },
    weeklyNsFilter: {
      nsReportableLines: nsReportable,
      nsExcludedPendingOrRejected: nsExcluded,
      excludedByStatus: exclBy,
      weeklyItemsHiddenWithoutReportableNs: hiddenItems,
      weeklyDocsWithHiddenItems: hiddenDocs,
      note: 'Ẩn trên view; không xoá live. Chờ STK ≈ approved (thiếu STK) — đếm vào reportable khi baseStatus=approved/auto.',
    },
  }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
