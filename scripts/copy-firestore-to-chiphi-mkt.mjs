import fs from 'fs';
import path from 'path';

const SRC_PROJECT = 'gen-lang-client-0981668352';
const SRC_DB = 'ai-studio-6d0a1d82-a103-48ce-8f31-9a8bb46f4741';
const DST_PROJECT = 'app-api-login-1b95b';
const DST_DB = 'chiphi-mkt';
const STORE = path.join(process.env.HOME, '.config/configstore/firebase-tools.json');
const log = (...a) => { console.error(...a); };

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
  if (!data.access_token) throw new Error('token refresh failed: ' + JSON.stringify(data));
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
  let data; try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`${res.status} ${text.slice(0,300)}`); }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(data).slice(0,500)}`);
  return data;
}

const dbPath = (project, db) => `projects/${project}/databases/${db}`;

async function listCollections(project, db) {
  const data = await api('POST', `https://firestore.googleapis.com/v1/${dbPath(project, db)}/documents:listCollectionIds`, { pageSize: 300 });
  return data.collectionIds || [];
}

async function batchWrite(writes) {
  if (!writes.length) return;
  const url = `https://firestore.googleapis.com/v1/${dbPath(DST_PROJECT, DST_DB)}/documents:batchWrite`;
  for (let i = 0; i < writes.length; i += 100) {
    const chunk = writes.slice(i, i + 100);
    let attempt = 0;
    for (;;) {
      try {
        await api('POST', url, { writes: chunk });
        break;
      } catch (e) {
        attempt++;
        log('batch retry', attempt, String(e.message).slice(0, 200));
        if (attempt >= 8) throw e;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
}

async function copyCollection(collectionPath) {
  let count = 0;
  let pageToken;
  let writes = [];
  const emailWrites = [];
  const base = `https://firestore.googleapis.com/v1/${dbPath(SRC_PROJECT, SRC_DB)}/documents/${collectionPath}`;
  do {
    let url = `${base}?pageSize=100`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const data = await api('GET', url);
    for (const doc of data.documents || []) {
      const id = decodeURIComponent(doc.name.split('/').pop());
      writes.push({
        update: {
          name: `${dbPath(DST_PROJECT, DST_DB)}/documents/${collectionPath}/${id}`,
          fields: doc.fields || {},
        },
      });
      count++;
      if (collectionPath === 'users') {
        const email = doc.fields?.email?.stringValue?.trim()?.toLowerCase();
        if (email) {
          const emailIndexId = email.replace(/@/g, '_at_').replace(/\./g, '_dot_');
          emailWrites.push({
            update: {
              name: `${dbPath(DST_PROJECT, DST_DB)}/documents/usersByEmail/${emailIndexId}`,
              fields: {
                email: { stringValue: email },
                oldUid: { stringValue: id },
                migratedAt: { timestampValue: new Date().toISOString() },
              },
            },
          });
        }
      }
      if (writes.length >= 100) {
        await batchWrite(writes);
        writes = [];
        log(`  ${collectionPath}: ${count}`);
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  if (writes.length) await batchWrite(writes);
  if (emailWrites.length) {
    await batchWrite(emailWrites);
    log(`  usersByEmail += ${emailWrites.length}`);
  }
  log(`  ${collectionPath}: DONE ${count}`);
  return count;
}

const stats = {};
(async () => {
  log(`Copy ${SRC_PROJECT}/${SRC_DB} → ${DST_PROJECT}/${DST_DB}`);
  const cols = await listCollections(SRC_PROJECT, SRC_DB);
  log('Collections:', cols.join(', '));
  for (const c of cols) {
    stats[c] = await copyCollection(c);
  }
  fs.writeFileSync('/tmp/firestore-copy-stats.json', JSON.stringify({ stats, at: new Date().toISOString() }, null, 2));
  log('DONE', JSON.stringify(stats));
})().catch((e) => { console.error(e); process.exit(1); });
