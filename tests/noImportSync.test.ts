import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const files = ['src/AuthenticatedApp.tsx', 'src/components/AcceptanceManager.tsx', 'src/components/acceptance/AcceptanceDialogs.tsx', 'src/components/BanKdManagementView.tsx', 'server.ts'];

describe('v-next: đã gỡ Nhập Excel + đồng bộ Google Sheet', () => {
  it('không còn quyền import/sync trong registry', () => {
    const s = read('src/AuthenticatedApp.tsx');
    for (const k of ['report_nt.import', 'report_nt.sync', 'register.import', 'actual.import', 'admin.projects.import']) expect(s).not.toContain(`'${k}'`);
  });
  it('không còn input file Excel / handler import / sheet sync', () => {
    for (const f of files) {
      const s = read(f);
      expect(s, f).not.toMatch(/accept="\.(csv|xlsx)[^"]*"/);
      expect(s, f).not.toMatch(/accept="\.xlsx, \.xls/);
      expect(s, f).not.toMatch(/handleImport[A-Za-z]*(CSV|FromUrl)\b(?! *$)/m);
      expect(s, f).not.toMatch(/\/api\/backup\/sheets|\/api\/auth\/google|syncLogToGoogleSheets|syncFullSystem/);
    }
  });
});
