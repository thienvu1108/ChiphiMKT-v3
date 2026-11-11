import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const RULES = readFileSync('firestore.rules', 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const inv = (mime: string) => ({ acceptanceId: 'a-none', fileId: 'abcdefghijKLMN_12', name: 'MAYHOMES - HD - x', origName: 'x', mime, size: 10, webViewLink: 'https://drive.google.com/file/d/x/view', path: 'a/b', order: 1, teamId: '', uploadedBy: 'sa', uploadedByName: 'SA', uploadedAt: '2026-11-07T00:00:00.000Z' });

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-nt-invoice-mime', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed('users/sa', { uid: 'sa', role: 'super_admin', email: 'sa@x.com', vnOnboarding: { status: 'approved' } }); });

describe('acceptanceInvoices mime', () => {
  for (const m of ['application/pdf', 'image/jpeg', 'application/zip', 'application/x-zip-compressed', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) {
    it('allows ' + m, async () => { await assertSucceeds(setDoc(doc(as('sa'), 'acceptanceInvoices/i-' + m.length), inv(m))); });
  }
  it('rejects other mime', async () => { await assertFails(setDoc(doc(as('sa'), 'acceptanceInvoices/bad'), inv('text/html'))); });
});
