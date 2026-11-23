import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const RULES = readFileSync('firestore.rules', 'utf8');
const [H, P] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid, { email: uid + '@x.com', email_verified: true }).firestore();
const seed = (p: string, d: any) => env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), p), d); });
const inv = (mime: string) => ({ acceptanceId: 'a-none', fileId: 'abcdefghijKLMN_12', name: 'MAYHOMES - HD - x.csv', origName: 'x.csv', mime, size: 10, webViewLink: 'https://drive.google.com/file/d/x/view', path: 'a/b', order: 1, teamId: '', uploadedBy: 'sa', uploadedByName: 'SA', uploadedAt: '2026-11-07T00:00:00.000Z' });

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-nt-invoice-csv', firestore: { rules: RULES, host: H, port: Number(P) } }); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed('users/sa', { uid: 'sa', role: 'super_admin', email: 'sa@x.com', vnOnboarding: { status: 'approved' } }); });

describe('acceptanceInvoices csv', () => {
  it('allows application/pdf (baseline)', async () => { await assertSucceeds(setDoc(doc(as('sa'), 'acceptanceInvoices/i-pdf'), inv('application/pdf'))); });
  it('allows text/csv for the same role that can create PDFs', async () => { await assertSucceeds(setDoc(doc(as('sa'), 'acceptanceInvoices/i-csv'), inv('text/csv'))); });
  it('still rejects text/html', async () => { await assertFails(setDoc(doc(as('sa'), 'acceptanceInvoices/i-html'), inv('text/html'))); });
  it('still rejects text/csvx (regex is anchored)', async () => { await assertFails(setDoc(doc(as('sa'), 'acceptanceInvoices/i-csvx'), inv('text/csvx'))); });
});
