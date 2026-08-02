import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const REPOSITORY_SOURCE_ROOTS = [
  'components/generation',
  'components/sources',
  'components/workspaces',
  'hooks/sourceThreads',
  'hooks/sources',
  'hooks/workspaces',
] as const;

function sourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe('repository Source and Generation ownership', () => {
  it('keeps repository-owned source surfaces independent of legacy Chat UI', () => {
    const forbiddenImports = [
      '@/components/chat/',
      '@/hooks/conversations/useConversationChat',
      '@/infrastructure/chat',
      '@/infrastructure/conversations',
      '@/infrastructure/pins',
      '@/infrastructure/turns',
      "import * as api from '@/infrastructure'",
    ];
    const violations: string[] = [];

    for (const root of REPOSITORY_SOURCE_ROOTS) {
      for (const file of sourceFiles(join(SRC, root))) {
        const body = readFileSync(file, 'utf8');
        for (const forbiddenImport of forbiddenImports) {
          if (body.includes(forbiddenImport)) {
            violations.push(
              `${relative(SRC, file).replaceAll('\\', '/')}: imports ${forbiddenImport}`
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('routes the repository generation hook through neutral capabilities', () => {
    const hook = readFileSync(
      join(SRC, 'hooks/sourceThreads/useSourceThreadGeneration.ts'),
      'utf8'
    );

    expect(hook).toContain("from '@/infrastructure/generation'");
    expect(hook).toContain("from '@/infrastructure/sourceThreads'");
    expect(hook).not.toMatch(/\bapi\.(?:chat|chatStream|createConversation|createTurn)\b/);

    const historyHook = readFileSync(join(SRC, 'hooks/conversations/useChatHistory.ts'), 'utf8');
    expect(historyHook).toContain("from '@/infrastructure/sourceThreads'");
    expect(historyHook).not.toContain("import * as api from '@/infrastructure'");
  });
});
