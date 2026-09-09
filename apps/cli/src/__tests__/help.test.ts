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
const HELP_PROCESS_TIMEOUT_MS = 10_000;
const HELP_TEST_TIMEOUT_MS = 30_000;

function commandIsListed(helpOutput: string, commandName: string): boolean {
  const pattern = new RegExp(`^\\s{2}${commandName}(?:\\b|\\|)`, 'm');
  return pattern.test(helpOutput);
}

function runCliHelp(args: string[]): string {
  return execFileSync('node', [BIN, ...args], {
    encoding: 'utf8',
    timeout: HELP_PROCESS_TIMEOUT_MS,
  });
}

describe('t3x --help', () => {
  it(
    'prints usage and exits 0',
    () => {
      if (!existsSync(BIN)) {
        throw new Error(
          `CLI binary not built at ${BIN}; run \`pnpm --filter @t3x-dev/cli build\` first.`
        );
      }

      const out = runCliHelp(['--help']);

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
        'transition',
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
    },
    HELP_TEST_TIMEOUT_MS
  );

  it(
    'shows only first-stage subcommands in grouped help',
    () => {
      if (!existsSync(BIN)) {
        throw new Error(
          `CLI binary not built at ${BIN}; run \`pnpm --filter @t3x-dev/cli build\` first.`
        );
      }

      const listHelp = runCliHelp(['list', '--help']);
      expect(commandIsListed(listHelp, 'projects')).toBe(true);
      expect(commandIsListed(listHelp, 'commits')).toBe(false);
      expect(commandIsListed(listHelp, 'branches')).toBe(false);
      expect(commandIsListed(listHelp, 'leaves')).toBe(false);

      const showHelp = runCliHelp(['show', '--help']);
      expect(commandIsListed(showHelp, 'project')).toBe(true);
      expect(commandIsListed(showHelp, 'commit')).toBe(false);
      expect(commandIsListed(showHelp, 'leaf')).toBe(false);
      expect(commandIsListed(showHelp, 'content')).toBe(false);

      const createHelp = runCliHelp(['create', '--help']);
      expect(commandIsListed(createHelp, 'project')).toBe(true);
      expect(commandIsListed(createHelp, 'leaf')).toBe(true);
      expect(commandIsListed(createHelp, 'branch')).toBe(false);

      const generateHelp = runCliHelp(['generate', '--help']);
      expect(commandIsListed(generateHelp, 'leaf')).toBe(true);
    },
    HELP_TEST_TIMEOUT_MS
  );

  it(
    'shows the complete Transition lifecycle command group',
    () => {
      if (!existsSync(BIN)) {
        throw new Error(
          `CLI binary not built at ${BIN}; run \`pnpm --filter @t3x-dev/cli build\` first.`
        );
      }

      const transitionHelp = runCliHelp(['transition', '--help']);
      for (const command of [
        'propose',
        'inspect',
        'verify',
        'attach-statement',
        'decide',
        'commit',
      ]) {
        expect(
          commandIsListed(transitionHelp, command),
          `transition help missing "${command}"\n---\n${transitionHelp}`
        ).toBe(true);
      }

      const proposeHelp = runCliHelp(['transition', 'propose', '--help']);
      expect(proposeHelp).toContain('--kind <kind>');
      expect(proposeHelp).toContain('--operations-json <json>');
      expect(proposeHelp).toContain('--extraction-candidate-id <id>');
      expect(proposeHelp).toContain('--artifact-json <json>');
      expect(proposeHelp).toContain('--root-json <json>');
      expect(proposeHelp).toContain('--commit-id <id>');

      const attachHelp = runCliHelp(['transition', 'attach-statement', '--help']);
      expect(attachHelp).toContain('--predicate-type <type>');
      expect(attachHelp).toContain('--predicate-json <json>');
      expect(attachHelp).toContain('--subjects <roles>');
    },
    HELP_TEST_TIMEOUT_MS
  );
});
