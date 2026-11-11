/**
 * Dry-run: liệt kê user đang là Phó Ban (ban_kd.deputyUids) nhưng role !== pho_ban_kd.
 * Không ghi Firestore. Chạy: node scripts/dry-run-pho-ban-role.mjs [--project chiphi-mkt-staging]
 */
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const project = (() => {
  const i = process.argv.indexOf('--project');
  return i >= 0 ? process.argv[i + 1] : 'chiphi-mkt-staging';
})();

function init() {
  const saPaths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    '/workspace/secrets/chiphi-staging-sa.json',
    '/workspace/secrets/firebase-sa.json',
  ].filter(Boolean);
  for (const p of saPaths) {
    if (p && existsSync(p)) {
      initializeApp({ credential: cert(JSON.parse(readFileSync(p, 'utf8'))), projectId: project });
      return;
    }
  }
  initializeApp({ credential: applicationDefault(), projectId: project });
}

init();
const db = getFirestore();
const bans = await db.collection('ban_kd').get();
const deputyToBans = new Map();
for (const d of bans.docs) {
  const data = d.data() || {};
  const deps = Array.isArray(data.deputyUids) ? data.deputyUids : [];
  for (const uid of deps) {
    if (!uid) continue;
    if (!deputyToBans.has(uid)) deputyToBans.set(uid, []);
    deputyToBans.get(uid).push({ id: d.id, name: data.name || d.id });
  }
}
console.log(`Project=${project} bans=${bans.size} uniqueDeputies=${deputyToBans.size}`);
const rows = [];
for (const [uid, blist] of deputyToBans) {
  const uref = await db.collection('users').doc(uid).get();
  let user = uref.exists ? uref.data() : null;
  let userId = uid;
  if (!user) {
    const q = await db.collection('users').where('uid', '==', uid).limit(1).get();
    if (!q.empty) { user = q.docs[0].data(); userId = q.docs[0].id; }
  }
  const role = user?.role || '(missing user doc)';
  if (role === 'pho_ban_kd') continue;
  rows.push({
    uid,
    userId,
    email: user?.email || '',
    fullName: user?.fullName || '',
    role,
    bans: blist.map((b) => b.name).join(' | '),
    wouldSetRole: ['super_admin', 'admin', 'mod', 'accountant', 'gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'gdda'].includes(role)
      ? '(keep role)'
      : 'pho_ban_kd',
  });
}
rows.sort((a, b) => String(a.email).localeCompare(String(b.email)));
console.log(JSON.stringify({ dryRun: true, count: rows.length, rows }, null, 2));
console.log('No writes performed.');
