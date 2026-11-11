import fs from 'fs';
import path from 'path';

const SRC_PROJECT = 'gen-lang-client-0981668352';
const SRC_DB = 'ai-studio-6d0a1d82-a103-48ce-8f31-9a8bb46f4741';
const DST_PROJECT = 'app-api-login-1b95b';
const DST_DB = 'chiphi-mkt';
const STORE = path.join(process.env.HOME, '.config/configstore/firebase-tools.json');
const log = (...a) => console.error(...a);

async function refreshToken() {
  const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const tokens = store.tokens;
  if (Date.now() < (tokens.expires_at || 0) - 60000 && tokens.access_token) return tokens.access_token;
  const params = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'jdzWJ8aWSgtWJUhStnI1rv4U',
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json();
  tokens.access_token = data.access_token;
  tokens.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
  store.tokens = tokens;
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
  return data.access_token;
}

async function api(method, url, body) {
  const token = await refreshToken();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}

const dbPath = (p, d) => `projects/${p}/databases/${d}`;

(async () => {
  const byEmail = new Map(); // email -> {oldUid, email}
  let pageToken;
  const base = `https://firestore.googleapis.com/v1/${dbPath(SRC_PROJECT, SRC_DB)}/documents/users`;
  do {
    let url = `${base}?pageSize=300`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const data = await api('GET', url);
    for (const doc of data.documents || []) {
      const id = decodeURIComponent(doc.name.split('/').pop());
      const email = doc.fields?.email?.stringValue?.trim()?.toLowerCase();
      if (!email) continue;
      // Prefer newest / keep first — if duplicate emails, keep last seen
      byEmail.set(email, { oldUid: id, email });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  log('unique emails', byEmail.size);
  const writes = [...byEmail.entries()].map(([email, v]) => {
    const emailIndexId = email.replace(/@/g, '_at_').replace(/\./g, '_dot_');
    return {
      update: {
        name: `${dbPath(DST_PROJECT, DST_DB)}/documents/usersByEmail/${emailIndexId}`,
        fields: {
          email: { stringValue: email },
          oldUid: { stringValue: v.oldUid },
          migratedAt: { timestampValue: new Date().toISOString() },
        },
      },
    };
  });

  const url = `https://firestore.googleapis.com/v1/${dbPath(DST_PROJECT, DST_DB)}/documents:batchWrite`;
  for (let i = 0; i < writes.length; i += 100) {
    const chunk = writes.slice(i, i + 100);
    // dedupe within chunk by name
    const seen = new Set();
    const unique = [];
    for (const w of chunk) {
      if (seen.has(w.update.name)) continue;
      seen.add(w.update.name);
      unique.push(w);
    }
    await api('POST', url, { writes: unique });
    log('wrote', Math.min(i + 100, writes.length), '/', writes.length);
  }
  fs.writeFileSync('/tmp/usersByEmail-stats.json', JSON.stringify({ uniqueEmails: byEmail.size }, null, 2));
  log('DONE usersByEmail', byEmail.size);
})().catch((e) => { console.error(e); process.exit(1); });
