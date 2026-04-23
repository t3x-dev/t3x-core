/**
 * CLI help smoke test.
 *
 * Shells out to the built binary with --help and asserts exit 0 plus the
 * presence of the core subcommands. Catches regressions where the CLI fails
 * to boot or silently loses a command group.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname → apps/cli/src/__tests__  →  ../../dist/index.js
const BIN = join(__dirname, '..', '..', 'dist', 'index.js');

function commandIsListed(helpOutput: string, commandName: string): boolean {
  const pattern = new RegExp(`^\\s{2}${commandName}(?:\\b|\\|)`, 'm');
  return pattern.test(helpOutput);
}

describe('t3x --help', () => {
  it('prints usage and exits 0', () => {
    if (!existsSync(BIN)) {
      throw new Error(
        `CLI binary not built at ${BIN}; run \`pnpm --filter @t3x-dev/cli build\` first.`
      );
    }

    const out = execFileSync('node', [BIN, '--help'], { encoding: 'utf8' });

    // Commander prints "Usage: t3x ..." at the top.
    expect(out.toLowerCase()).toMatch(/usage/);
    expect(out).not.toContain('--api-url');
    expect(out).not.toContain('--api-key');

    // Action-group commands (kubectl-style) registered in apps/cli/src/index.ts.
    const expected = [
      'list',
      'show',
      'create',
      'generate',
      'commit',
      'auth',
      'config',
      'extract',
      'yops',
    ];
    for (const cmd of expected) {
      expect(commandIsListed(out, cmd), `help missing "${cmd}"\n---\n${out}`).toBe(true);
    }

    const hidden = [
      'delete',
      'restore',
      'diff',
      'merge',
      'health',
      'status',
      'share',
      'gate',
      'export',
      'import',
      'schema',
      'validate',
      'compose',
      'switch-branch',
      'current-branch',
    ];
    for (const cmd of hidden) {
      expect(commandIsListed(out, cmd), `help should hide "${cmd}"\n---\n${out}`).toBe(false);
    }
  });

  it('shows only first-stage subcommands in grouped help', () => {
    if (!existsSync(BIN)) {
      throw new Error(
        `CLI binary not built at ${BIN}; run \`pnpm --filter @t3x-dev/cli build\` first.`
      );
    }

    const listHelp = execFileSync('node', [BIN, 'list', '--help'], { encoding: 'utf8' });
    expect(commandIsListed(listHelp, 'drafts')).toBe(true);
    expect(commandIsListed(listHelp, 'projects')).toBe(false);
    expect(commandIsListed(listHelp, 'commits')).toBe(false);
    expect(commandIsListed(listHelp, 'branches')).toBe(false);
    expect(commandIsListed(listHelp, 'leaves')).toBe(false);

    const showHelp = execFileSync('node', [BIN, 'show', '--help'], { encoding: 'utf8' });
    expect(commandIsListed(showHelp, 'draft')).toBe(true);
    expect(commandIsListed(showHelp, 'project')).toBe(false);
    expect(commandIsListed(showHelp, 'commit')).toBe(false);
    expect(commandIsListed(showHelp, 'leaf')).toBe(false);
    expect(commandIsListed(showHelp, 'content')).toBe(false);

    const createHelp = execFileSync('node', [BIN, 'create', '--help'], { encoding: 'utf8' });
    expect(commandIsListed(createHelp, 'project')).toBe(true);
    expect(commandIsListed(createHelp, 'leaf')).toBe(true);
    expect(commandIsListed(createHelp, 'branch')).toBe(false);

    const generateHelp = execFileSync('node', [BIN, 'generate', '--help'], { encoding: 'utf8' });
    expect(commandIsListed(generateHelp, 'leaf')).toBe(true);
  });
});
