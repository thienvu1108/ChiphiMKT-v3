import { describe, expect, it } from 'vitest';
import { handleBackupRequest } from '../api/backup/github/[action]';

function call(action: string, opts: { method?: string; authorization?: string } = {}) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const req: any = {
      method: opts.method || 'POST',
      url: `/api/backup/github/${action}`,
      query: { action },
      headers: opts.authorization ? { authorization: opts.authorization } : {},
      body: {},
    };
    const res: any = {
      setHeader() {},
      status(code: number) {
        this.code = code;
        return this;
      },
      json(body: any) {
        resolve({ status: this.code, body });
      },
    };
    void handleBackupRequest(req, res);
  });
}

describe('GitHub backup API auth guard', () => {
  for (const action of ['test', 'sync', 'sync-code', 'deploy-status']) {
    it(`${action}: 401 without Firebase ID token`, async () => {
      const r = await call(action);
      expect(r.status).toBe(401);
      expect(r.body.success).toBe(false);
    });
  }

  it('401 with a malformed ID token', async () => {
    const r = await call('sync', { authorization: 'Bearer not-a-jwt' });
    expect(r.status).toBe(401);
  });

  it('405 for non-POST and 404 for unknown action', async () => {
    expect((await call('test', { method: 'GET' })).status).toBe(405);
    expect((await call('drop-database')).status).toBe(404);
  });
});
