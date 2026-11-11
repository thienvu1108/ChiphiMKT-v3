#!/usr/bin/env node
/**
 * Migrate legacy Phó Ban (ban_kd.deputyUids) → users.role = pho_ban_kd.
 *   node scripts/pho-ban-role/migrate.cjs --db=staging --dry-run
 *   node scripts/pho-ban-role/migrate.cjs --db=staging --apply
 *   node scripts/pho-ban-role/migrate.cjs --db=live --dry-run   (READ-ONLY; --apply refused)
 *   node scripts/pho-ban-role/migrate.cjs --db=staging --rollback --from=<backup.json>
 *
 * Skips users whose role is in PRESERVE (Admin/GĐK/Trưởng/…).
 * Also ensures assignedBanKds includes the Ban id.
 * No PII in stdout summary (ids hashed count only in console; backup has fields for rollback).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../node_modules/firebase-tools/lib');
const { requireAuth } = require(path.join(ROOT, 'requireAuth'));
const apiv2 = require(path.join(ROOT, 'apiv2'));

const args = process.argv.slice(2);
const get = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const has = (k) => args.includes(`--${k}`);
const dbKey = get('db', 'staging');
const DB_ID = dbKey === 'live' ? 'chiphi-mkt' : 'chiphi-mkt-staging';
const DB = `projects/app-api-login-1b95b/databases/${DB_ID}`;
const APPLY = has('apply');
const ROLLBACK = has('rollback');
const FROM = get('from', '');
const OUT_DIR = path.resolve(__dirname, `../../../backups/pho-ban-role-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);

const PRESERVE = new Set([
  'super_admin', 'admin', 'mod', 'accountant', 'gd_khoi', 'tro_ly_khoi', 'truong_ban_kd', 'gdda', 'pho_ban_kd',
]);

if (dbKey === 'live' && APPLY && !has('apply-live-approved')) {
  console.error('REFUSE: --apply on live needs --apply-live-approved (Phong explicit).');
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
    if (dbKey === 'live' && !has('apply-live-approved')) { console.error('REFUSE: live rollback needs --apply-live-approved.'); process.exit(2); }
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
  const resolve = (id) => byId.get(id) || byUid.get(id) || null;

  const plan = {
    db: DB_ID, mode: APPLY ? 'apply' : 'dry-run', at: new Date().toISOString(),
    setRole: [],
    skipPreserve: [],
    missingUser: [],
    alreadyOk: [],
    counts: {},
  };
  const writes = [];

  // Aggregate deputy → bans
  const depMap = new Map(); // uid/docId → Set banId
  for (const b of bans) {
    const deps = Array.isArray(b.deputyUids) ? b.deputyUids.filter(Boolean) : [];
    for (const d of deps) {
      if (!depMap.has(d)) depMap.set(d, new Set());
      depMap.get(d).add(b.id);
    }
  }

  const seenUser = new Set();
  for (const [depKey, banIds] of depMap) {
    const u = resolve(depKey);
    if (!u) {
      plan.missingUser.push({ depKey, banCount: banIds.size });
      continue;
    }
    if (seenUser.has(u.id)) continue;
    seenUser.add(u.id);

    const role = String(u.role || 'user');
    const banList = [...banIds];
    if (role === 'pho_ban_kd') {
      // still ensure assignedBanKds
      const cur = new Set([
        ...(typeof u.assignedBanKd === 'string' && u.assignedBanKd ? [u.assignedBanKd] : []),
        ...(Array.isArray(u.assignedBanKds) ? u.assignedBanKds.filter(Boolean) : []),
      ]);
      const need = banList.filter((id) => !cur.has(id));
      if (!need.length) {
        plan.alreadyOk.push({ userId: u.id, banCount: banList.length });
        continue;
      }
      const next = [...cur, ...need];
      plan.setRole.push({ userId: u.id, fromRole: role, toRole: role, banCount: banList.length, assignedOnly: true });
      writes.push({
        name: u.__name,
        fields: { role, assignedBanKd: u.assignedBanKd || '', assignedBanKds: Array.isArray(u.assignedBanKds) ? u.assignedBanKds : [] },
        apply: { role, assignedBanKd: next[0] || '', assignedBanKds: next },
      });
      continue;
    }
    if (PRESERVE.has(role)) {
      plan.skipPreserve.push({ userId: u.id, role, banCount: banList.length });
      // still backfill assignedBan if missing
      const cur = new Set([
        ...(typeof u.assignedBanKd === 'string' && u.assignedBanKd ? [u.assignedBanKd] : []),
        ...(Array.isArray(u.assignedBanKds) ? u.assignedBanKds.filter(Boolean) : []),
      ]);
      const need = banList.filter((id) => !cur.has(id));
      if (need.length) {
        const next = [...cur, ...need];
        writes.push({
          name: u.__name,
          fields: { assignedBanKd: u.assignedBanKd || '', assignedBanKds: Array.isArray(u.assignedBanKds) ? u.assignedBanKds : [] },
          apply: { assignedBanKd: next[0] || '', assignedBanKds: next },
        });
      }
      continue;
    }

    const cur = new Set([
      ...(typeof u.assignedBanKd === 'string' && u.assignedBanKd ? [u.assignedBanKd] : []),
      ...(Array.isArray(u.assignedBanKds) ? u.assignedBanKds.filter(Boolean) : []),
    ]);
    const next = Array.from(new Set([...cur, ...banList]));
    plan.setRole.push({ userId: u.id, fromRole: role, toRole: 'pho_ban_kd', banCount: banList.length });
    writes.push({
      name: u.__name,
      fields: {
        role,
        assignedBanKd: u.assignedBanKd || '',
        assignedBanKds: Array.isArray(u.assignedBanKds) ? u.assignedBanKds : [],
      },
      apply: { role: 'pho_ban_kd', assignedBanKd: next[0] || '', assignedBanKds: next },
    });
  }

  // Role breakdown (no PII)
  const fromRoleCounts = {};
  for (const r of plan.setRole) {
    const k = r.fromRole || '(empty)';
    fromRoleCounts[k] = (fromRoleCounts[k] || 0) + 1;
  }
  const preserveRoleCounts = {};
  for (const r of plan.skipPreserve) {
    preserveRoleCounts[r.role] = (preserveRoleCounts[r.role] || 0) + 1;
  }

  plan.counts = {
    bans: bans.length,
    uniqueDeputyKeys: depMap.size,
    usersActive: active.length,
    setRoleToPhoBan: plan.setRole.filter((x) => x.toRole === 'pho_ban_kd' && x.fromRole !== 'pho_ban_kd').length,
    assignedBackfillOnly: plan.setRole.filter((x) => x.assignedOnly).length,
    skipPreserve: plan.skipPreserve.length,
    missingUser: plan.missingUser.length,
    alreadyOk: plan.alreadyOk.length,
    writeOps: writes.length,
    fromRoleCounts,
    preserveRoleCounts,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const planPath = path.join(OUT_DIR, `plan-${DB_ID}-${stamp}.json`);
  const bakPath = path.join(OUT_DIR, `backup-${DB_ID}-${stamp}.json`);
  // Plan file: strip nothing needed — userIds only (no email/name). OK for backup dir.
  fs.writeFileSync(planPath, JSON.stringify({
    ...plan,
    setRole: plan.setRole.map(({ userId, fromRole, toRole, banCount, assignedOnly }) => ({ userId, fromRole, toRole, banCount, assignedOnly })),
    skipPreserve: plan.skipPreserve.map(({ userId, role, banCount }) => ({ userId, role, banCount })),
    missingUser: plan.missingUser,
    alreadyOk: plan.alreadyOk.map(({ userId, banCount }) => ({ userId, banCount })),
  }, null, 2));
  fs.writeFileSync(bakPath, JSON.stringify({ db: DB_ID, writes: writes.map(({ name, fields }) => ({ name, fields })) }, null, 2));
  console.log(JSON.stringify({ ...plan.counts, planPath, bakPath, apply: APPLY, db: DB_ID }, null, 2));

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
  console.error('Applied', writes.length, 'updates. Rollback: node scripts/pho-ban-role/migrate.cjs --db=' + dbKey + ' --rollback --from=' + bakPath);
})().catch((e) => { console.error('ERR', e.message || e); process.exit(1); });
