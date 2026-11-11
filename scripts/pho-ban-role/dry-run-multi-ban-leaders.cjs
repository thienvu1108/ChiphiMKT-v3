#!/usr/bin/env node
/**
 * LIVE/staging READ-ONLY dry-run: count people who lead or are deputy of >1 Ban.
 * Counts only — no emails/names/uids in stdout. Never writes.
 *   node scripts/pho-ban-role/dry-run-multi-ban-leaders.cjs --db=live
 *   node scripts/pho-ban-role/dry-run-multi-ban-leaders.cjs --db=staging
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../node_modules/firebase-tools/lib');
const { requireAuth } = require(path.join(ROOT, 'requireAuth'));
const apiv2 = require(path.join(ROOT, 'apiv2'));

const args = process.argv.slice(2);
const get = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const dbKey = get('db', 'live');
const DB_ID = dbKey === 'live' ? 'chiphi-mkt' : 'chiphi-mkt-staging';
const DB = `projects/app-api-login-1b95b/databases/${DB_ID}`;

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

const normEmail = (e) => String(e || '').toLowerCase().trim();

(async () => {
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
    return out;
  };

  const banDocs = await all('ban_kd');
  // key → Set of banIds (key = uid or email:…)
  const leadMap = new Map();
  const depMap = new Map();
  const add = (map, key, banId) => {
    if (!key || !banId) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(banId);
  };

  let banCount = 0;
  for (const doc of banDocs) {
    banCount++;
    const id = doc.name.split('/').pop();
    const f = {};
    for (const [k, v] of Object.entries(doc.fields || {})) f[k] = val(v);
    const leaderUid = f.leaderUid || f.leaderId || '';
    const leaderEmail = normEmail(f.leaderEmail);
    if (leaderUid) add(leadMap, `uid:${leaderUid}`, id);
    else if (leaderEmail) add(leadMap, `email:${leaderEmail}`, id);
    const deps = Array.isArray(f.deputyUids) ? f.deputyUids : [];
    for (const d of deps) {
      if (!d) continue;
      const s = String(d);
      if (s.includes('@')) add(depMap, `email:${normEmail(s)}`, id);
      else add(depMap, `uid:${s}`, id);
    }
  }

  const multiLead = [...leadMap.values()].filter((s) => s.size > 1);
  const multiDep = [...depMap.values()].filter((s) => s.size > 1);
  // Also: people who are both Trưởng of one Ban and Phó of another (or same)
  // Without user docs we can only flag key overlap between leadMap and depMap
  let bothRoles = 0;
  for (const [k, leadBans] of leadMap) {
    const depBans = depMap.get(k);
    if (depBans && depBans.size) bothRoles++;
  }

  const hist = (arr) => {
    const h = {};
    for (const s of arr) h[s.size] = (h[s.size] || 0) + 1;
    return h;
  };

  const report = {
    dryRun: true,
    wrote: false,
    db: DB_ID,
    banCount,
    uniqueLeaders: leadMap.size,
    uniqueDeputies: depMap.size,
    multiBanLeaders: multiLead.length,
    multiBanDeputies: multiDep.length,
    peopleBothTruongAndPho: bothRoles,
    leaderBanCountHistogram: hist(multiLead.length ? multiLead : []),
    deputyBanCountHistogram: hist(multiDep.length ? multiDep : []),
    note: 'Counts only — no PII. Does not fix. Phong decides next.',
  };
  // Full histogram for all leaders (1+)
  const allLeadHist = {};
  for (const s of leadMap.values()) allLeadHist[s.size] = (allLeadHist[s.size] || 0) + 1;
  const allDepHist = {};
  for (const s of depMap.values()) allDepHist[s.size] = (allDepHist[s.size] || 0) + 1;
  report.leaderCountByBanCount = allLeadHist;
  report.deputyCountByBanCount = allDepHist;

  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
