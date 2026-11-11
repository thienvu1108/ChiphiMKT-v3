const https = require('https');
const config = require('../firebase-applet-config.json');

function signIn(email, password) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ email, password, returnSecureToken: true });
    const req = https.request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.write(postData);
    req.end();
  });
}

function signUp(email, password) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ email, password, returnSecureToken: true });
    const req = https.request(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.write(postData);
    req.end();
  });
}

async function run() {
  const email = `testuser_${Date.now()}@example.com`;
  const pass = 'TestPassword123!';
  const res = await signUp(email, pass);
  console.log('SignUp status:', res.status, res.body);

  if (!res.body.idToken) return;

  const idToken = res.body.idToken;
  const dbId = config.firestoreDatabaseId;
  const projectId = config.projectId;

  let allDocs = [];
  let pageToken = '';

  do {
    let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/budgets?pageSize=300`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, {
        headers: { Authorization: `Bearer ${idToken}` }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    if (data.documents) {
      allDocs = allDocs.concat(data.documents);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  console.log('\nTotal budgets in Firestore:', allDocs.length);

  const parsed = allDocs.map(d => {
    const fields = d.fields || {};
    const obj = { id: d.name.split('/').pop() };
    for (const [k, v] of Object.entries(fields)) {
      if (v.stringValue !== undefined) obj[k] = v.stringValue;
      else if (v.integerValue !== undefined) obj[k] = Number(v.integerValue);
      else if (v.doubleValue !== undefined) obj[k] = Number(v.doubleValue);
      else if (v.timestampValue !== undefined) obj[k] = v.timestampValue;
      else if (v.booleanValue !== undefined) obj[k] = v.booleanValue;
      else obj[k] = JSON.stringify(v);
    }
    return obj;
  });

  console.log('\n--- MATCHING BUDGETS FOR 13.11 / MAY13.11 OR LUMIERE ---');
  const matches = parsed.filter(b => {
    const s = JSON.stringify(b).toLowerCase();
    return s.includes('13.11') || s.includes('lumiere');
  });

  matches.forEach(b => {
    console.log(JSON.stringify(b, null, 2));
  });
}

run().catch(console.error);
