#!/usr/bin/env node
/**
 * Merge duplicate users docs (same email, >1 doc) in chiphi-mkt.
 *
 *   node scripts/merge-duplicate-users.mjs --out <dir>            # DRY RUN (default): read-only, writes plan.json + plan.md
 *   node scripts/merge-duplicate-users.mjs --out <dir> --apply    # backs up every affected doc, then writes
 *
 * Options:
 *   --project app-api-login-1b95b --database chiphi-mkt   (defaults)
 *   --ownership=auto|all|none   repoint createdBy / subBudgets[].userId ownership refs.
 *                               auto (default): only when the kept profile is NOT admin-level
 *                               (admins already see/delete everything, history stays as recorded).
 *   --only=email1,email2        restrict to these emails
 *   --decisions=<file.json>     { "<email>": { "keepId": "...", "role": "..." } } human overrides
 *                               (required with --apply for groups flagged needsHumanDecision)
 *
 * Policy (dry-run plan explains each group):
 *   keep  = doc whose id == the email's live Firebase Auth UID in the project; if the person has no
 *           Auth account yet: the doc with the highest admin-assigned role (flagged for a human).
 *   role  = highest-ranked role among the docs (admin-assigned wins over the self-created 'user' stub);
 *           differing non-default role/scope values are flagged as conflicts.
 *   scope = assignedProjects/assignedBlock(s)/assignedBanKd(s) from the doc that supplied the role.
 *   profile fields (fullName/teamName/teamId/teamCode/displayName): kept doc's non-empty value, else
 *           the newest non-empty value from the others. createdAt = earliest.
 *   refs  = access refs (blocks.directorUid/assistantUids, ban_kd leader/members, teams *Uid,
 *           supportRequests.userId, usersByEmail.oldUid) always repointed; ownership refs per
 *           --ownership; history (auditLogs, *.updatedBy, *ByUid, restoredBy, reference-data
 *           createdBy) never rewritten.
 *   dropped docs: copied to users_merged_archive/{id} (+ mergedInto) then deleted.
 *
 * Apply safety: every write carries a currentDocument.updateTime precondition from the backup
 * read, so anything edited after the plan was made aborts that commit instead of being clobbered.
 * Auth: firebase-tools CLI login (same as other read-only tooling).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const argv = process.argv.slice(2);
const argVal = (k, d) => {
  if (typeof args[k] === 'string') return args[k];
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const PROJECT = argVal('project', 'app-api-login-1b95b');
const DATABASE = argVal('database', 'chiphi-mkt');
const OUT = path.resolve(argVal('out', `./merge-duplicate-users-${new Date().toISOString().slice(0, 10)}`));
const APPLY = Boolean(args.apply);
const OWNERSHIP = argVal('ownership', 'auto');
const ONLY = argVal('only', '') ? argVal('only', '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) : null;
const DECISIONS = argVal('decisions', '') ? JSON.parse(fs.readFileSync(argVal('decisions', ''), 'utf8')) : {};
const DB = `projects/${PROJECT}/databases/${DATABASE}`;
const log = (...a) => console.error(...a);

// ---------- firebase-tools auth ----------
function ftLib(p) {
  const candidates = [
    path.resolve('node_modules/firebase-tools/lib', p),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '../node_modules/firebase-tools/lib', p),
  ];
  for (const c of candidates) if (fs.existsSync(c + '.js')) return require(c);
  return require(`firebase-tools/lib/${p}`);
}
// --emulator=host:port: run against the Firestore emulator (tests / rehearsal). Auth lookups
// come from --auth-fixture=<json> ({ "<email>": "<uid>" }) instead of Identity Toolkit.
const EMULATOR = argVal('emulator', '');
const AUTH_FIXTURE = argVal('auth-fixture', '') ? JSON.parse(fs.readFileSync(argVal('auth-fixture', ''), 'utf8')) : null;
function fetchClient(prefix) {
  const call = async (method, p, body, opts = {}) => {
    const qs = opts.queryParams ? '?' + new URLSearchParams(opts.queryParams).toString() : '';
    const res = await fetch(`${prefix}/v1${p}${qs}`, { method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) { const e = new Error(`${res.status} ${text.slice(0, 300)}`); e.status = res.status; throw e; }
    return { body: json };
  };
  return { get: (p, o) => call('GET', p, null, o), post: (p, b) => call('POST', p, b) };
}
async function clients() {
  if (EMULATOR) {
    return {
      fs: fetchClient(`http://${EMULATOR}`),
      idt: { post: async (_p, req) => ({ body: { users: (req.email || []).filter((e) => AUTH_FIXTURE?.[e]).map((e) => ({ email: e, localId: AUTH_FIXTURE[e] })) } }) },
    };
  }
  const { requireAuth } = ftLib('requireAuth');
  const apiv2 = ftLib('apiv2');
  const acct = ftLib('auth').getGlobalDefaultAccount();
  if (!acct) throw new Error('Run `firebase login` first.');
  await requireAuth({ user: acct.user, tokens: acct.tokens });
  return {
    fs: new apiv2.Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true }),
    idt: new apiv2.Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v1', auth: true }),
  };
}

// ---------- Firestore REST value helpers ----------
const decode = (v) => {
  if (!v) return undefined;
  const [k, x] = Object.entries(v)[0];
  if (k === 'mapValue') return Object.fromEntries(Object.entries(x.fields || {}).map(([kk, vv]) => [kk, decode(vv)]));
  if (k === 'arrayValue') return (x.values || []).map(decode);
  if (k === 'integerValue') return Number(x);
  if (k === 'nullValue') return null;
  return x;
};
const docId = (name) => decodeURIComponent(name.split('/').pop());
const relPath = (name) => name.split('/documents/')[1];
const normEmail = (e) => String(e ?? '').trim().toLowerCase();
const emailIndexId = (e) => normEmail(e).replace(/@/g, '_at_').replace(/\./g, '_dot_');

function normRole(raw) {
  const r = String(raw ?? 'user').toLowerCase().trim();
  if (['super_admin', 'super admin'].includes(r)) return 'super_admin';
  if (['admin', 'quản trị', 'quan tri'].includes(r)) return 'admin';
  if (['mod', 'moderator', 'điều phối', 'dieu phoi'].includes(r)) return 'mod';
  if (['accountant', 'kế toán', 'ke toan'].includes(r)) return 'accountant';
  if (['gdda', 'gđda', 'giám đốc dự án'].includes(r)) return 'gdda';
  if (['gd_khoi', 'gdkhoi', 'gđ khối', 'giám đốc khối', 'giám đốc liên khối', 'gdk', 'gd khối', 'trưởng khối'].includes(r)) return 'gd_khoi';
  if (['tro_ly_khoi', 'trợ lý khối', 'tro ly khoi', 'tro_ly_gdkhoi', 'assistant_block'].includes(r)) return 'tro_ly_khoi';
  if (['gdkd', 'gđkd', 'giám đốc kinh doanh', 'gđ kinh doanh'].includes(r)) return 'gdkd';
  if (['assistant', 'trợ lý', 'tro ly'].includes(r)) return 'assistant';
  return 'user';
}
const RANK = { super_admin: 100, admin: 90, accountant: 70, mod: 60, gdda: 50, gd_khoi: 50, tro_ly_khoi: 40, gdkd: 40, assistant: 30, user: 0 };
const rank = (r) => RANK[normRole(r)] ?? 0;
const ADMIN_LEVEL = new Set(['super_admin', 'admin']);
const SCOPE = ['assignedProjects', 'assignedBlock', 'assignedBlocks', 'assignedBanKd', 'assignedBanKds'];
const PROFILE = ['fullName', 'displayName', 'teamName', 'teamId', 'teamCode'];
const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const ms = (v) => (typeof v === 'string' ? Date.parse(v) || 0 : 0);

// ---------- reference classification ----------
// Field path is the top-level field (array index / nested path stripped for the rule key).
function classify(col, field) {
  const top = field.split(/[.[]/)[0];
  if (col === 'auditLogs') return 'history';
  if (col === 'users') return field === 'migratedFromUid' ? 'history' : 'access';
  if (col === 'usersByEmail') return 'access';
  if (col === 'blocks' && ['directorUid', 'assistantUids'].includes(top)) return 'access';
  if (col === 'ban_kd' && ['leaderUid', 'leaderId', 'memberUids'].includes(top)) return 'access';
  if (col === 'teams' && /uid|leader|manager|director/i.test(top) && top !== 'createdBy') return 'access';
  if (col === 'supportRequests' && top === 'userId') return 'access';
  if (['budgets', 'costs', 'block_budgets', 'reciprocal_budgets', 'efficiencyReports', 'teamNotifications'].includes(col)
      && (top === 'createdBy' || (top === 'subBudgets' && field.endsWith('.userId')))) return 'ownership';
  return 'history';
}

// ---------- reads ----------
async function listAll(c, col) {
  const docs = [];
  let pageToken;
  do {
    const q = { pageSize: 300 };
    if (pageToken) q.pageToken = pageToken;
    const r = (await c.fs.get(`/${DB}/documents/${col}`, { queryParams: q })).body;
    docs.push(...(r.documents || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return docs;
}
async function getDoc(c, rel) {
  try { return (await c.fs.get(`/${DB}/documents/${rel}`)).body; } catch (e) { if (e.status === 404) return null; throw e; }
}

function* walk(v, p = '') {
  if (!v) return;
  const [k, x] = Object.entries(v)[0];
  if (k === 'mapValue') for (const [kk, vv] of Object.entries(x.fields || {})) yield* walk(vv, p ? `${p}.${kk}` : kk);
  else if (k === 'arrayValue') for (const [i, vv] of (x.values || []).entries()) yield* walk(vv, `${p}[${i}]`);
  else if (k === 'stringValue') yield [p, x];
}

// Replace every stringValue === from by `to` inside a REST value (returns a deep copy).
function replaceIn(v, from, to) {
  const [k, x] = Object.entries(v)[0];
  if (k === 'stringValue') return { stringValue: x === from ? to : x };
  if (k === 'mapValue') return { mapValue: { fields: Object.fromEntries(Object.entries(x.fields || {}).map(([kk, vv]) => [kk, replaceIn(vv, from, to)])) } };
  if (k === 'arrayValue') {
    const vals = (x.values || []).map((vv) => replaceIn(vv, from, to));
    // de-duplicate plain string arrays after repointing (assistantUids / memberUids)
    const seen = new Set();
    const out = vals.filter((vv) => !('stringValue' in vv) || (seen.has(vv.stringValue) ? false : (seen.add(vv.stringValue), true)));
    return { arrayValue: { values: out } };
  }
  return v;
}

(async () => {
  const c = await clients();
  fs.mkdirSync(OUT, { recursive: true });
  log(`${APPLY ? 'APPLY' : 'DRY-RUN'} on ${DB} → ${OUT}`);

  const users = await listAll(c, 'users');
  const byEmail = new Map();
  for (const d of users) {
    const e = normEmail(d.fields?.email?.stringValue);
    if (!e || (ONLY && !ONLY.includes(e))) continue;
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e).push(d);
  }
  const groups = [...byEmail.entries()].filter(([, v]) => v.length > 1).sort(([a], [b]) => a.localeCompare(b));
  log(`users=${users.length} duplicateEmails=${groups.length}`);
  if (!groups.length) { fs.writeFileSync(path.join(OUT, 'plan.json'), JSON.stringify({ groups: [] }, null, 2)); return; }

  // Live Auth accounts (read-only lookup).
  const emails = groups.map(([e]) => e);
  const h = { headers: { 'x-goog-user-project': PROJECT } };
  const authUsers = [];
  for (let i = 0; i < emails.length; i += 100) {
    const r = (await c.idt.post(`/projects/${PROJECT}/accounts:lookup`, { email: emails.slice(i, i + 100) }, h)).body;
    authUsers.push(...(r.users || []));
  }
  const liveByEmail = new Map(authUsers.map((u) => [normEmail(u.email), u]));

  // Reference scan across every collection.
  const dupIds = new Set(groups.flatMap(([, v]) => v.map((d) => docId(d.name))));
  const cols = (await c.fs.post(`/${DB}/documents:listCollectionIds`, { pageSize: 300 })).body.collectionIds || [];
  const refsById = new Map();
  const docsByRel = new Map();
  for (const col of cols) {
    if (col === 'users_merged_archive') continue;
    const docs = col === 'users' ? users : await listAll(c, col);
    for (const d of docs) {
      for (const [field, s] of walk({ mapValue: { fields: d.fields || {} } })) {
        if (!dupIds.has(s)) continue;
        if (col === 'users' && docId(d.name) === s && field === 'uid') continue;
        const ref = { collection: col, docId: docId(d.name), field, kind: classify(col, field) };
        if (!refsById.has(s)) refsById.set(s, []);
        refsById.get(s).push(ref);
        docsByRel.set(relPath(d.name), d);
      }
    }
    log(`  scanned ${col} (${docs.length})`);
  }

  const plan = { generatedAt: new Date().toISOString(), project: PROJECT, database: DATABASE, mode: APPLY ? 'apply' : 'dry-run', ownership: OWNERSHIP, groups: [] };
  for (const [email, docs] of groups) {
    const live = liveByEmail.get(email);
    const view = docs.map((d) => ({ id: docId(d.name), f: Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)])), raw: d }));
    const decision = DECISIONS[email] || {};
    const reasons = [];
    let keep = view.find((v) => decision.keepId && v.id === decision.keepId);
    if (keep) reasons.push('keepId from --decisions');
    if (!keep && live) { keep = view.find((v) => v.id === live.localId); if (keep) reasons.push('id == live Auth UID'); }
    let needsHumanDecision = false;
    const flags = [];
    if (!keep) {
      needsHumanDecision = !decision.keepId;
      keep = [...view].sort((a, b) => rank(b.f.role) - rank(a.f.role) || ms(b.f.updatedAt || b.f.createdAt) - ms(a.f.updatedAt || a.f.createdAt))[0];
      reasons.push(live ? `live Auth UID ${live.localId} has no users doc` : 'no Auth account in project yet (never signed in to v2)');
      reasons.push('fallback: highest admin-assigned role');
      flags.push('NO_LIVE_UID_DOC');
    }
    const others = view.filter((v) => v !== keep);
    // role / scope
    const roleSrc = [...view].sort((a, b) => rank(b.f.role) - rank(a.f.role) || (a === keep ? -1 : b === keep ? 1 : 0))[0];
    const roleValues = [...new Set(view.map((v) => normRole(v.f.role)))];
    const conflicts = [];
    if (roleValues.length > 1) conflicts.push({ field: 'role', values: Object.fromEntries(view.map((v) => [v.id, v.f.role ?? null])), chosen: decision.role || roleSrc.f.role });
    for (const k of SCOPE) {
      const vals = view.map((v) => JSON.stringify(Array.isArray(v.f[k]) ? [...v.f[k]].sort() : (v.f[k] ?? (k.endsWith('s') || k === 'assignedProjects' ? [] : ''))));
      if (new Set(vals.filter((x) => x !== '[]' && x !== '""')).size > 1) conflicts.push({ field: k, values: Object.fromEntries(view.map((v) => [v.id, v.f[k] ?? null])), chosen: roleSrc.f[k] ?? null });
    }
    if (conflicts.length && !decision.role) { needsHumanDecision = true; flags.push('ROLE_OR_SCOPE_CONFLICT'); }

    const setFields = {}; // REST values to write on keep
    const carried = [];
    const chosenRole = decision.role || roleSrc.f.role;
    if (normRole(chosenRole) !== normRole(keep.f.role) || (chosenRole ?? null) !== (keep.f.role ?? null)) {
      setFields.role = { stringValue: chosenRole };
      carried.push({ field: 'role', from: decision.role ? 'decision' : roleSrc.id, value: chosenRole });
    }
    if (roleSrc !== keep) {
      for (const k of SCOPE) {
        if (roleSrc.raw.fields?.[k] && JSON.stringify(roleSrc.f[k]) !== JSON.stringify(keep.f[k]) && !isEmpty(roleSrc.f[k])) {
          setFields[k] = roleSrc.raw.fields[k];
          carried.push({ field: k, from: roleSrc.id, value: roleSrc.f[k] });
        }
      }
    }
    for (const k of PROFILE) {
      if (!isEmpty(keep.f[k])) continue;
      const donor = others.filter((o) => !isEmpty(o.f[k])).sort((a, b) => ms(b.f.updatedAt || b.f.createdAt) - ms(a.f.updatedAt || a.f.createdAt))[0];
      if (donor) { setFields[k] = donor.raw.fields[k]; carried.push({ field: k, from: donor.id, value: donor.f[k] }); }
    }
    const earliest = view.filter((v) => v.raw.fields?.createdAt?.timestampValue).sort((a, b) => ms(a.f.createdAt) - ms(b.f.createdAt))[0];
    if (earliest && earliest !== keep && ms(earliest.f.createdAt) < ms(keep.f.createdAt)) {
      setFields.createdAt = earliest.raw.fields.createdAt;
      carried.push({ field: 'createdAt', from: earliest.id, value: earliest.f.createdAt });
    }
    for (const k of Object.keys(view.find((v) => v !== keep)?.f || {})) { /* other unknown fields are left on the archive copy */ }

    const keepRole = normRole(chosenRole);
    const repointOwnership = OWNERSHIP === 'all' || (OWNERSHIP === 'auto' && !ADMIN_LEVEL.has(keepRole));
    const refs = [];
    for (const o of others) {
      for (const r of refsById.get(o.id) || []) {
        if (r.collection === 'users' && r.docId === keep.id) continue; // keep.migratedFromUid history pointer
        if (r.collection === 'users' && others.some((x) => x.id === r.docId)) continue; // between dropped docs
        const action = r.kind === 'access' ? 'repoint' : r.kind === 'ownership' ? (repointOwnership ? 'repoint' : 'skip(ownership: kept profile is admin-level)') : 'keep(history)';
        refs.push({ ...r, from: o.id, to: keep.id, action });
      }
    }
    const summarize = (list) => Object.entries(list.reduce((m, r) => { const k = `${r.collection}.${r.field.split(/[.[]/)[0]}${r.field.includes('.userId') ? '[].userId' : ''} → ${r.action}`; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, n]) => `${k} ×${n}`);
    plan.groups.push({
      email,
      liveAuthUid: live?.localId || null,
      liveAuthLastLoginAt: live?.lastLoginAt ? new Date(Number(live.lastLoginAt)).toISOString() : null,
      keepId: keep.id,
      keepReason: reasons,
      drop: others.map((o) => ({ id: o.id, role: o.f.role ?? null, linkedToUid: o.f.linkedToUid ?? null, idIsLiveUid: o.id === live?.localId })),
      docs: view.map((v) => ({ id: v.id, role: v.f.role ?? null, assignedBlock: v.f.assignedBlock ?? null, assignedBlocks: v.f.assignedBlocks ?? null, assignedBanKd: v.f.assignedBanKd ?? null, assignedBanKds: v.f.assignedBanKds ?? null, assignedProjectsCount: (v.f.assignedProjects || []).length, teamName: v.f.teamName ?? null, teamId: v.f.teamId ?? null, fullName: v.f.fullName ?? null, createdAt: v.f.createdAt ?? null, updatedAt: v.f.updatedAt ?? null, migratedFromUid: v.f.migratedFromUid ?? null, uidField: v.f.uid ?? null, docUpdateTime: v.raw.updateTime })),
      carryToKeep: carried,
      conflicts,
      needsHumanDecision,
      flags,
      refSummary: summarize(refs),
      refs,
      _setFields: setFields,
    });
  }

  // ---------- human summary ----------
  const md = [`# Duplicate users merge plan (${plan.mode})`, '', `Generated ${plan.generatedAt} — ${DB}`, `Ownership refs: --ownership=${OWNERSHIP}`, '', `Duplicate emails: **${plan.groups.length}**`, ''];
  for (const g of plan.groups) {
    md.push(`## ${g.email}`, '', `- Live Auth UID: ${g.liveAuthUid || '— (no account in project yet)'}${g.liveAuthLastLoginAt ? ` (last login ${g.liveAuthLastLoginAt})` : ''}`);
    md.push(`- KEEP \`${g.keepId}\` (${g.keepReason.join('; ')})`);
    for (const d of g.drop) md.push(`- DROP \`${d.id}\` (role ${d.role}) → archived to users_merged_archive then deleted`);
    md.push('', '| doc | role | block(s) | ban KD | team | createdAt | updatedAt | migratedFrom |', '|---|---|---|---|---|---|---|---|');
    for (const d of g.docs) md.push(`| ${d.id}${d.id === g.keepId ? ' (keep)' : ''} | ${d.role} | ${[d.assignedBlock, ...(d.assignedBlocks || [])].filter(Boolean).join(',') || '–'} | ${[d.assignedBanKd, ...(d.assignedBanKds || [])].filter(Boolean).join(',') || '–'} | ${String(d.teamName ?? '–').replace(/\s+/g, ' ')} | ${d.createdAt ?? '–'} | ${d.updatedAt ?? '–'} | ${d.migratedFromUid ?? '–'} |`);
    md.push('', `- Carry to keep: ${g.carryToKeep.length ? g.carryToKeep.map((c2) => `${c2.field}=${JSON.stringify(c2.value)} (from ${c2.from})`).join('; ') : 'nothing'}`);
    md.push(`- Conflicts: ${g.conflicts.length ? g.conflicts.map((c2) => `${c2.field} ${JSON.stringify(c2.values)} → proposed ${JSON.stringify(c2.chosen)}`).join('; ') : 'none'}`);
    md.push(`- References: ${g.refSummary.length ? g.refSummary.join('; ') : 'none'}`);
    md.push(`- Needs human decision: ${g.needsHumanDecision ? `**YES** (${g.flags.join(', ')})` : 'no'}`, '');
  }
  // Individual refs only for writes; history / skipped refs are summarized (refSummary) to keep the plan small.
  const planOut = { ...plan, groups: plan.groups.map(({ _setFields, refs, ...g }) => ({ ...g, refsToRepoint: refs.filter((r) => r.action === 'repoint'), otherRefsNotRewritten: refs.filter((r) => r.action !== 'repoint').length })) };
  fs.writeFileSync(path.join(OUT, 'plan.json'), JSON.stringify(planOut, null, 2));
  fs.writeFileSync(path.join(OUT, 'plan.md'), md.join('\n'));
  log(`plan written: ${path.join(OUT, 'plan.json')} / plan.md`);

  if (!APPLY) { log('DRY-RUN only. Nothing written to Firestore.'); return; }

  // ---------- APPLY ----------
  const blocked = plan.groups.filter((g) => g.needsHumanDecision);
  if (blocked.length) {
    throw new Error(`Refusing --apply: ${blocked.length} group(s) need a human decision (${blocked.map((g) => g.email).join(', ')}). Pass --decisions=<file> or --only=<emails>.`);
  }
  // 1) Backup: fresh GET of every affected doc.
  const affected = new Set();
  for (const g of plan.groups) {
    affected.add(`users/${g.keepId}`);
    for (const d of g.drop) affected.add(`users/${d.id}`);
    for (const r of g.refs) if (r.action === 'repoint') affected.add(`${r.collection}/${r.docId}`);
  }
  const backup = {};
  for (const rel of affected) backup[rel] = await getDoc(c, rel);
  const backupFile = path.join(OUT, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 1));
  log(`backup written: ${backupFile} (${Object.keys(backup).length} docs)`);

  // 2) Build writes with updateTime preconditions.
  const writes = [];
  const pending = new Map(); // rel → { fields: {...}, mask: Set }
  const touch = (rel) => {
    if (!pending.has(rel)) pending.set(rel, { fields: JSON.parse(JSON.stringify(backup[rel]?.fields || {})), mask: new Set() });
    return pending.get(rel);
  };
  for (const g of plan.groups) {
    const k = touch(`users/${g.keepId}`);
    for (const [f, v] of Object.entries(g._setFields)) { k.fields[f] = v; k.mask.add(f); }
    k.fields.mergedFrom = { arrayValue: { values: g.drop.map((d) => ({ stringValue: d.id })) } }; k.mask.add('mergedFrom');
    k.fields.mergedAt = { timestampValue: new Date().toISOString() }; k.mask.add('mergedAt');
    for (const r of g.refs.filter((x) => x.action === 'repoint')) {
      const rel = `${r.collection}/${r.docId}`;
      const p = touch(rel);
      const top = r.field.split(/[.[]/)[0];
      p.fields[top] = replaceIn(p.fields[top], r.from, r.to);
      p.mask.add(top);
    }
  }
  for (const [rel, p] of pending) {
    if (!backup[rel]) throw new Error(`missing backup for ${rel}`);
    writes.push({
      update: { name: `${DB}/documents/${rel}`, fields: Object.fromEntries([...p.mask].map((f) => [f, p.fields[f]])) },
      updateMask: { fieldPaths: [...p.mask].map((f) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(f) ? f : `\`${f}\``)) },
      currentDocument: { updateTime: backup[rel].updateTime },
    });
  }
  for (const g of plan.groups) {
    for (const d of g.drop) {
      const b = backup[`users/${d.id}`];
      if (!b) continue;
      writes.push({ update: { name: `${DB}/documents/users_merged_archive/${d.id}`, fields: { ...b.fields, mergedInto: { stringValue: g.keepId }, mergedAt: { timestampValue: new Date().toISOString() }, originalUpdateTime: { timestampValue: b.updateTime } } }, currentDocument: { exists: false } });
      writes.push({ delete: `${DB}/documents/users/${d.id}`, currentDocument: { updateTime: b.updateTime } });
    }
  }
  // Ensure archive+delete land in the same commit: chunk at 450 keeping pairs together.
  let done = 0;
  for (let i = 0; i < writes.length; i += 450) {
    let chunk = writes.slice(i, i + 450);
    if (chunk.length === 450 && chunk[chunk.length - 1].update?.name?.includes('/users_merged_archive/')) { chunk = chunk.slice(0, -1); i -= 1; }
    await c.fs.post(`/${DB}/documents:commit`, { writes: chunk });
    done += chunk.length;
    log(`committed ${done}/${writes.length}`);
  }
  fs.writeFileSync(path.join(OUT, 'apply-result.json'), JSON.stringify({ appliedAt: new Date().toISOString(), writes: writes.length, backupFile }, null, 2));
  log('APPLY done.');
})().catch((e) => { console.error('ERR', e.status || '', e.message || e); process.exit(1); });
