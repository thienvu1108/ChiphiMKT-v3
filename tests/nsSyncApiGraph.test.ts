import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const entry = join(root, 'api/ns-sync/[action].ts');
const SPEC_RE = /(?:from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"])/g;

function specs(text: string): string[] {
  return [...text.matchAll(SPEC_RE)].map((m) => m[1] || m[2]);
}

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
  const extless: { file: string; spec: string }[] = [];
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
    for (const spec of specs(text)) {
      const rel = file.slice(root.length + 1).replaceAll('\\', '/');
      if (spec.includes('/src/') || spec.includes('\\src\\') || /(^|\/)src\//.test(spec)) {
        srcImports.push({ file: rel, spec });
      }
      if (spec.startsWith('.') && !/\.(?:js|ts|tsx|json|mjs|cjs)$/.test(spec)) {
        extless.push({ file: rel, spec });
      }
      const resolved = resolveImport(file, spec);
      if (!resolved) continue;
      if (!resolved.startsWith(normalize(root))) continue;
      queue.push(resolved);
    }
  }
  return { files, missing, srcImports, extless };
}

describe('ns-sync API module graph', () => {
  it('does not import from src/ and uses explicit .js extensions (Vercel ESM)', () => {
    const { files, missing, srcImports, extless } = collect(entry);
    expect(missing, `unresolved local imports:\n${missing.join('\n')}`).toEqual([]);
    expect(files.length).toBeGreaterThan(5);
    expect(srcImports, `src imports in API graph:\n${srcImports.map((x) => `${x.file} -> ${x.spec}`).join('\n')}`).toEqual([]);
    expect(extless, `extensionless relative imports:\n${extless.map((x) => `${x.file} -> ${x.spec}`).join('\n')}`).toEqual([]);
  });
});
