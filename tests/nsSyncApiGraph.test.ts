import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const entry = join(root, 'api/ns-sync/[action].ts');
const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g;

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = join(dirname(fromFile), spec);
  const candidates = [base];
  if (spec.endsWith('.js')) candidates.push(base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx');
  else candidates.push(base + '.ts', base + '.tsx', base + '.js', join(base, 'index.ts'));
  for (const candidate of candidates) {
    const normalized = normalize(candidate);
    if (existsSync(normalized)) return normalized;
  }
  return normalize(base);
}

function collect(start: string) {
  const files: string[] = [];
  const missing: string[] = [];
  const srcImports: { file: string; spec: string }[] = [];
  const queue = [start];
  const seen = new Set<string>();
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) {
      missing.push(file);
      continue;
    }
    files.push(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (spec.includes('/src/') || spec.includes('\\src\\') || /(^|\/)src\//.test(spec)) {
        srcImports.push({ file: file.slice(root.length + 1).replaceAll('\\', '/'), spec });
      }
      const resolved = resolveImport(file, spec);
      if (!resolved) continue;
      if (!resolved.startsWith(normalize(root))) continue;
      queue.push(resolved);
    }
  }
  return { files, missing, srcImports };
}

describe('ns-sync API module graph', () => {
  it('does not import from src/ (Vercel serverless cannot bundle those paths)', () => {
    const { files, missing, srcImports } = collect(entry);
    expect(missing, `unresolved local imports:\n${missing.join('\n')}`).toEqual([]);
    expect(files.length).toBeGreaterThan(5);
    expect(srcImports, `src imports in API graph:\n${srcImports.map((x) => `${x.file} -> ${x.spec}`).join('\n')}`).toEqual([]);
  });
});
