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

  // Test standard database '(default)' vs 'ai-studio-6d0a1d82-a103-48ce-8f31-9a8bb46f4741'
  for (const targetDb of [dbId, '(default)']) {
    console.log(`\n=== Testing Database: ${targetDb} ===`);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${targetDb}/documents:listCollectionIds`;
    
    const postData = JSON.stringify({});
    const req = https.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`Collections in ${targetDb}:`, body);
      });
    });
    req.write(postData);
    req.end();
  }
}

run().catch(console.error);
