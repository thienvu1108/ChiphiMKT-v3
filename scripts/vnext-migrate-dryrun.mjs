#!/usr/bin/env node
// DRY-RUN ONLY. Lập kế hoạch backfill users.teamId từ users.teamName (khớp teams.name).
// Không kết nối Firestore, không ghi gì. Đầu vào: file JSON export {users:[{id,teamId,teamName}], teams:[{id,name,status}]}.
// Dùng: node scripts/vnext-migrate-dryrun.mjs export.json > plan.json
import fs from 'node:fs';
const [, , file] = process.argv;
if (!file) { console.error('usage: vnext-migrate-dryrun.mjs <export.json>'); process.exit(1); }
const { users = [], teams = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));
const norm = (s) => String(s || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const byName = new Map();
for (const t of teams) { const k = norm(t.name); byName.set(k, [...(byName.get(k) || []), t.id]); }
const plan = { set: [], ambiguous: [], noMatch: [], alreadyOk: 0 };
for (const u of users) {
  if (u.teamId) { plan.alreadyOk++; continue; }
  if (!u.teamName) continue;
  const ids = byName.get(norm(u.teamName)) || [];
  if (ids.length === 1) plan.set.push({ uid: u.id, teamName: u.teamName, teamId: ids[0] });
  else if (ids.length > 1) plan.ambiguous.push({ uid: u.id, teamName: u.teamName, candidates: ids });
  else plan.noMatch.push({ uid: u.id, teamName: u.teamName });
}
console.log(JSON.stringify({ summary: { set: plan.set.length, ambiguous: plan.ambiguous.length, noMatch: plan.noMatch.length, alreadyOk: plan.alreadyOk }, ...plan }, null, 1));
