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

    // Action-group commands (kubectl-style) registered in apps/cli/src/index.ts.
    const expected = [
      'list',
      'show',
      'create',
      'delete',
      'restore',
      'generate',
      'commit',
      'extract',
      'yops',
      'diff',
      'merge',
      'status',
      'schema',
      'validate',
    ];
    for (const cmd of expected) {
      expect(out, `help missing "${cmd}"\n---\n${out}`).toContain(cmd);
    }
  });
});
