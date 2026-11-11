const http = require('http');
const https = require('https');

function getToken() {
  return new Promise((resolve, reject) => {
    http.get('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body).access_token));
    }).on('error', reject);
  });
}

async function run() {
  const token = await getToken();
  const dbId = 'ai-studio-6d0a1d82-a103-48ce-8f31-9a8bb46f4741';
  const projectId = 'gen-lang-client-0981668352';

  // Fetch all documents with pagination
  let allDocs = [];
  let pageToken = '';

  do {
    let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/budgets?pageSize=300`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const data = await new Promise((resolve, reject) => {
      https.get(url, {
        headers: { Authorization: `Bearer ${token}` }
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

  console.log('Total budgets in Firestore:', allDocs.length);

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

  // Let's filter for team 13.11, MAY13.11, or LUMIERE
  console.log('\n--- ALL BUDGETS FOR TEAM 13.11 / MAY13.11 OR LUMIERE ---');
  const matches = parsed.filter(b => {
    const s = JSON.stringify(b).toLowerCase();
    return s.includes('13.11') || s.includes('lumiere');
  });

  matches.forEach(b => {
    console.log(JSON.stringify(b, null, 2));
  });

  // Also let's check month 7 (2026-07 / 07/2026) budgets
  console.log('\n--- ALL BUDGETS FOR MONTH 7 (07 or 2026-07 or 07/2026) ---');
  const m7Budgets = parsed.filter(b => {
    const m = String(b.month || '');
    return m.includes('07') || m.includes('7');
  });
  console.log('Month 7 total count:', m7Budgets.length);

  // Let's print any for month 7 with team 13.11 or Lumiere
  m7Budgets.filter(b => {
    const s = JSON.stringify(b).toLowerCase();
    return s.includes('13.11') || s.includes('lumiere');
  }).forEach(b => {
    console.log(JSON.stringify(b, null, 2));
  });
}

run().catch(console.error);
