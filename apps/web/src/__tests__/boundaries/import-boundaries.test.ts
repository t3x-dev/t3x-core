import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Runtime L1-L4 import-boundary smoke.
 *
 * Biome's `noRestrictedImports` already enforces these invariants statically
 * (see apps/web/biome.json). This test encodes the same rules as a vitest
 * sweep so the architecture keeps holding even if the Biome config drifts or
 * someone introduces dynamic/aliased imports that slip past the linter.
 *
 * Layers (mirrors CLAUDE.md):
 *   L1 infrastructure/  — only layer allowed to call fetch()
 *   L2 domain/          — pure; no react / components / hooks / store /
 *                         queries / commands / infrastructure
 *   L3 hooks, store, queries, commands
 *       store/          — no commands, no infrastructure
 *   L4 components/      — no commands, no infrastructure (go via hooks/queries)
 */

const SRC = join(__dirname, '..', '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

const files = walk(SRC);

function extractImports(body: string): string[] {
  const re =
    /from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null = re.exec(body);
  while (m !== null) {
    const s = m[1] ?? m[2] ?? m[3];
    if (s) out.push(s);
    m = re.exec(body);
  }
  return out;
}

function layer(rel: string): string {
  if (rel === 'domain' || rel.startsWith('domain/')) return 'domain';
  if (rel === 'components' || rel.startsWith('components/')) return 'components';
  if (rel === 'hooks' || rel.startsWith('hooks/')) return 'hooks';
  if (rel === 'store' || rel.startsWith('store/')) return 'store';
  if (rel === 'queries' || rel.startsWith('queries/')) return 'queries';
  if (rel === 'commands' || rel.startsWith('commands/')) return 'commands';
  if (rel === 'infrastructure' || rel.startsWith('infrastructure/')) return 'infrastructure';
  return 'other';
}

function targetLayer(imp: string): string {
  // Only @/<layer>/... alias paths count; bare module specifiers are ignored
  // (except react, handled separately).
  if (!imp.startsWith('@/')) return 'external';
  return layer(imp.slice(2));
}

function forbidden(ownLayer: string, imp: string): string | null {
  const t = targetLayer(imp);
  if (ownLayer === 'domain') {
    if (
      imp === 'react' ||
      imp.startsWith('react/') ||
      imp === 'react-dom' ||
      imp.startsWith('react-dom/')
    ) {
      return 'domain imports react';
    }
    if (['components', 'hooks', 'store', 'queries', 'commands', 'infrastructure'].includes(t)) {
      return `domain imports ${t}`;
    }
  }
  if (ownLayer === 'store') {
    if (t === 'commands' || t === 'infrastructure') return `store imports ${t}`;
  }
  if (ownLayer === 'components') {
    if (t === 'commands' || t === 'infrastructure') return `components imports ${t} directly`;
  }
  return null;
}

describe('L1-L4 import boundaries', () => {
  it('every source file respects the layer hierarchy', () => {
    const violations: string[] = [];
    for (const f of files) {
      const rel = relative(SRC, f).replace(/\\/g, '/');
      if (rel.startsWith('__tests__/')) continue;
      if (rel.startsWith('app/')) continue;
      const own = layer(rel);
      if (own === 'other') continue;
      const body = readFileSync(f, 'utf8');
      for (const imp of extractImports(body)) {
        const v = forbidden(own, imp);
        if (v) violations.push(`${rel}: ${v} via "${imp}"`);
      }
    }
    expect(violations, `Boundary violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('only infrastructure/** contains literal fetch( calls', () => {
    const stripComments = (s: string): string =>
      // Drop /* block */ and // line comments so `fetch(` mentioned in
      // docstrings/commit-history notes doesn't falsely flag a file.
      s
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(SRC, f).replace(/\\/g, '/');
      if (rel.startsWith('__tests__/')) continue;
      // Next.js route handlers + server actions under app/ legitimately call
      // fetch() against upstream services.
      if (rel.startsWith('app/')) continue;
      if (rel.startsWith('infrastructure/')) continue;
      const body = stripComments(readFileSync(f, 'utf8'));
      if (/\bfetch\s*\(/.test(body)) offenders.push(rel);
    }
    expect(offenders, `Non-infrastructure files calling fetch():\n${offenders.join('\n')}`).toEqual(
      []
    );
  });

  it('keeps app-layer direct data access limited to the reviewed allowlist', () => {
    const stripComments = (s: string): string =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    const allowed = [
      'app/chat/project/[projectId]/leaf/page.tsx:import @/queries/project',
      'app/deploy/compare/page.tsx:import @/infrastructure',
      'app/deploy/eval/[runId]/page.tsx:import @/infrastructure',
      'app/deploy/eval/[runId]/page.tsx:import @/infrastructure/export/report',
      'app/deploy/layout.tsx:import @/infrastructure',
      'app/deploy/page.tsx:import @/infrastructure',
      'app/dev/db/page.tsx:literal fetch',
      'app/insights/page.tsx:import @/infrastructure',
      'app/insights/page.tsx:import @/infrastructure/commits',
      'app/project/[projectId]/page.tsx:import @/queries/project',
      'app/project/[projectId]/page.tsx:import @/queries/yschemaValidation',
      'app/project/[projectId]/settings/page.tsx:import @/queries/providers',
      'app/share/[token]/page.tsx:import @/infrastructure',
    ];

    const offenders = new Set<string>();
    for (const f of files) {
      const rel = relative(SRC, f).replace(/\\/g, '/');
      if (!rel.startsWith('app/')) continue;
      if (rel.startsWith('app/api/')) continue;
      if (rel.endsWith('/route.ts')) continue;
      const body = stripComments(readFileSync(f, 'utf8'));
      for (const imp of extractImports(body)) {
        if (imp.startsWith('@/infrastructure') || imp.startsWith('@/queries')) {
          offenders.add(`${rel}:import ${imp}`);
        }
      }
      if (/\bfetch\s*\(/.test(body)) {
        offenders.add(`${rel}:literal fetch`);
      }
    }

    expect([...offenders].sort()).toEqual(allowed.sort());
  });
});
