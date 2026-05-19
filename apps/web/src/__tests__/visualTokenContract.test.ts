import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'utils'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const FORBIDDEN_TAILWIND_COLOR =
  /\b(?:bg|text|border|ring|from|via|to|decoration|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d{1,3})?\b/g;
const FORBIDDEN_ABSOLUTE_TAILWIND_COLOR =
  /(?<![\w-])(?:bg|text|border|ring|from|via|to|decoration|fill|stroke|shadow)-(?:black|white)(?:\/\d{1,3})?\b/g;
const FORBIDDEN_TAILWIND_GRADIENT = /\bbg-gradient-to-[a-z]+\b/g;
const FORBIDDEN_LITERAL_HEX = /#[0-9a-fA-F]{6,8}\b/g;

const ALLOWED_FILES = new Set([
  // Logo glyphs are brand assets, not page or component color roles.
  'components/chat/sidebar/LogoIcon.tsx',
  'components/layout/Sidebar.tsx',
  // Theme helpers are allowed to define the static brand palette they export.
  'utils/theme.ts',
]);

function collectFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(fullPath, files);
      continue;
    }
    if (EXTENSIONS.has(path.extname(fullPath))) {
      files.push(fullPath);
    }
  }

  return files;
}

function lineNumberForOffset(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length;
}

describe('visual token contract', () => {
  it('keeps application UI classes on semantic tokens instead of naked Tailwind hues', () => {
    const violations: string[] = [];

    for (const scanDir of SCAN_DIRS) {
      for (const file of collectFiles(path.join(ROOT, scanDir))) {
        const relative = path.relative(ROOT, file);
        if (ALLOWED_FILES.has(relative)) continue;

        const content = readFileSync(file, 'utf8');
        for (const pattern of [
          FORBIDDEN_TAILWIND_COLOR,
          FORBIDDEN_ABSOLUTE_TAILWIND_COLOR,
          FORBIDDEN_TAILWIND_GRADIENT,
          FORBIDDEN_LITERAL_HEX,
        ]) {
          pattern.lastIndex = 0;
          for (const match of content.matchAll(pattern)) {
            violations.push(
              `${relative}:${lineNumberForOffset(content, match.index ?? 0)} ${match[0]}`
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('uses commit semantics for merge execution actions', () => {
    const mergeActionBar = readFileSync(
      path.join(ROOT, 'components/merge/MergeActionBar.tsx'),
      'utf8'
    );

    expect(mergeActionBar).toMatch(/<Button\s+variant="commit"[\s\S]*\{t\('mergeConfirm'\)\}/);
  });
});
