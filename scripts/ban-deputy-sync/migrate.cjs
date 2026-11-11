#!/usr/bin/env node
/**
 * One-time Ban role sync migration.
 *   node scripts/ban-deputy-sync/migrate.cjs --db=staging --dry-run
 *   node scripts/ban-deputy-sync/migrate.cjs --db=staging --apply
 *   node scripts/ban-deputy-sync/migrate.cjs --db=live --dry-run   (READ-ONLY counts; never --apply on live from this task)
 *   node scripts/ban-deputy-sync/migrate.cjs --db=staging --rollback --from=<backup.json>
 *
 * Actions:
 *  A) Clear leaderEmail+leaderName on Bans whose leader email matches no user (and no leaderUid).
 *  B) Backfill users.assignedBanKds for every deputyUid and every resolved leaderUid.
 *  C) Report (do NOT change) truong_ban_kd users who lead no Ban.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../node_modules/firebase-tools/lib');
const { requireAuth } = require(path.join(ROOT, 'requireAuth'));
const apiv2 = require(path.join(ROOT, 'apiv2'));

const args = process.argv.slice(2);
const get = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = (k) => args.includes(`--${k}`);
const dbKey = get('db', 'staging'); // staging | live
const DB_ID = dbKey === 'live' ? 'chiphi-mkt' : 'chiphi-mkt-staging';
const DB = `projects/app-api-login-1b95b/databases/${DB_ID}`;
const APPLY = has('apply');
const ROLLBACK = has('rollback');
const FROM = get('from', '');
const OUT_DIR = path.resolve(__dirname, `../../../backups/ban-deputy-sync-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);

if (dbKey === 'live' && APPLY) {
  console.error('REFUSE: --apply on live is blocked in this script. Dry-run only on live.');
  process.exit(2);
}

const val = (v) => {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) {
    const o = {};
    for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = val(x);
    return o;
  }
  return null;
};
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, x] of Object.entries(v)) fields[k] = enc(x);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
};

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const acct = require(path.join(ROOT, 'auth')).getGlobalDefaultAccount();
  await requireAuth({ user: acct.user, tokens: acct.tokens });
  const c = new apiv2.Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true });

  const all = async (col) => {
    const out = []; let pt;
    do {
      const q = { pageSize: 300 }; if (pt) q.pageToken = pt;
      const r = (await c.get(`/${DB}/documents/${col}`, { queryParams: q })).body;
      out.push(...(r.documents || [])); pt = r.nextPageToken;
    } while (pt);
    return out.map((d) => {
      const o = { id: d.name.split('/').pop(), __name: d.name };
      for (const [k, v] of Object.entries(d.fields || {})) o[k] = val(v);
      return o;
    });
  };

  if (ROLLBACK) {
    if (!FROM || !fs.existsSync(FROM)) { console.error('Need --from=<backup.json>'); process.exit(1); }
    const bak = JSON.parse(fs.readFileSync(FROM, 'utf8'));
    console.log('Rollback from', FROM, 'writes', (bak.writes || []).length);
    for (const w of bak.writes || []) {
      const mask = Object.keys(w.fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
      await c.patch(`/${w.name}?${mask}`, {
        fields: Object.fromEntries(Object.entries(w.fields).map(([k, v]) => [k, enc(v)])),
      });
    }
    console.log('Rollback done');
    return;
  }

  const bans = await all('ban_kd');
  const users = await all('users');
  const active = users.filter((u) => !u.mergedInto && !u.linkedToUid);
  const byId = new Map(active.map((u) => [u.id, u]));
  const byUid = new Map(active.filter((u) => u.uid).map((u) => [u.uid, u]));
  const byEmail = new Map();
  for (const u of active) {
    const em = (u.email || '').toLowerCase().trim();
    if (em) { if (!byEmail.has(em)) byEmail.set(em, []); byEmail.get(em).push(u); }
  }
  const resolve = (id) => byId.get(id) || byUid.get(id) || null;
  const userIdsOf = (u) => [u.uid, u.id, u.migratedFromUid].filter((x) => typeof x === 'string' && x);
  const leads = (b, u) => {
    const ids = userIdsOf(u);
    const em = (u.email || '').toLowerCase().trim();
    return (b.leaderUid && ids.includes(b.leaderUid))
      || (b.leaderId && ids.includes(b.leaderId))
      || (em && b.leaderEmail && b.leaderEmail.toLowerCase().trim() === em);
  };

  const plan = {
    db: DB_ID, mode: APPLY ? 'apply' : 'dry-run', at: new Date().toISOString(),
    clearStaleLeaderEmail: [],
    backfillAssigned: [],
    reportTruongNoLead: [],
    counts: {},
  };
  const writes = []; // for backup/rollback: { name, fields: previous values }

  // A) stale leader emails
  for (const b of bans) {
    if (b.leaderUid) continue;
    if (!b.leaderEmail) continue;
    const em = String(b.leaderEmail).toLowerCase().trim();
    const hits = byEmail.get(em) || [];
    if (hits.length) continue;
    plan.clearStaleLeaderEmail.push({ banId: b.id, hadEmail: true, hadName: !!b.leaderName });
    writes.push({
      name: b.__name,
      fields: { leaderEmail: b.leaderEmail || '', leaderName: b.leaderName || '' },
      apply: { leaderEmail: '', leaderName: '' },
    });
  }

  // B) backfill assigned for deputies + leaders
  const ensureAssigned = (u, banId, reason) => {
    const cur = new Set([
      ...(typeof u.assignedBanKd === 'string' && u.assignedBanKd ? [u.assignedBanKd] : []),
      ...(Array.isArray(u.assignedBanKds) ? u.assignedBanKds.filter(Boolean) : []),
    ]);
    if (cur.has(banId)) return;
    const next = [...cur, banId];
    plan.backfillAssigned.push({ userId: u.id, banId, reason, role: u.role || '(none)' });
    writes.push({
      name: u.__name,
      fields: { assignedBanKd: u.assignedBanKd || '', assignedBanKds: Array.isArray(u.assignedBanKds) ? u.assignedBanKds : [] },
      apply: { assignedBanKd: next[0] || banId, assignedBanKds: next },
      _userId: u.id,
    });
    // mutate local so later bans accumulate
    u.assignedBanKd = next[0] || banId;
    u.assignedBanKds = next;
  };

  for (const b of bans) {
    const deps = Array.isArray(b.deputyUids) ? b.deputyUids.filter(Boolean) : [];
    for (const d of deps) {
      const u = resolve(d);
      if (u) ensureAssigned(u, b.id, 'deputy');
    }
    if (b.leaderUid) {
      const u = resolve(b.leaderUid);
      if (u) ensureAssigned(u, b.id, 'leader');
    }
  }

  // C) report only
  for (const u of active) {
    if ((u.role || '') !== 'truong_ban_kd') continue;
    const any = bans.some((b) => leads(b, u));
    if (!any) plan.reportTruongNoLead.push({ userId: u.id, hasAssigned: !!(u.assignedBanKd || (u.assignedBanKds || []).length) });
  }

  plan.counts = {
    bans: bans.length,
    usersActive: active.length,
    clearStaleLeaderEmail: plan.clearStaleLeaderEmail.length,
    backfillAssigned: plan.backfillAssigned.length,
    reportTruongNoLead: plan.reportTruongNoLead.length,
    writeOps: writes.length,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const planPath = path.join(OUT_DIR, `plan-${DB_ID}-${stamp}.json`);
  const bakPath = path.join(OUT_DIR, `backup-${DB_ID}-${stamp}.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  fs.writeFileSync(bakPath, JSON.stringify({ db: DB_ID, writes: writes.map(({ name, fields }) => ({ name, fields })) }, null, 2));
  console.log(JSON.stringify({ ...plan.counts, planPath, bakPath, apply: APPLY }, null, 2));

  if (!APPLY) {
    console.error('Dry-run only. Re-run with --apply on staging to write.');
    return;
  }

  for (const w of writes) {
    const fields = w.apply;
    const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    await c.patch(`/${w.name}?${mask}`, {
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])),
    });
  }
  console.error('Applied', writes.length, 'updates. Rollback: node scripts/ban-deputy-sync/migrate.cjs --db=' + dbKey + ' --rollback --from=' + bakPath);
})().catch((e) => { console.error('ERR', e.message || e); process.exit(1); });
