import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { isolatedEnv } from '../mcp-qualification.mjs';

for (const [signal, expectedCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  test(
    `full E2E preserves ${signal} while a child command is running`,
    {
      skip: process.platform === 'win32',
      timeout: 15_000,
    },
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 't3x-e2e-interrupt-'));
      const server = createServer().listen(0, '127.0.0.1');
      await once(server, 'listening');
      const port = String(server.address().port);
      await new Promise((resolve) => server.close(resolve));

      await writeFile(
        path.join(directory, 'pnpm'),
        `#!/usr/bin/env node
const watchdog = setTimeout(() => process.exit(1), 2000);
process.on('SIGTERM', () => {
  clearTimeout(watchdog);
  console.log('fixture build stopped');
});
console.log('fixture build started');
`,
        { mode: 0o700 }
      );
      const child = spawn(process.execPath, ['tools/full-e2e.mjs', '--auth-enabled'], {
        cwd: new URL('../..', import.meta.url),
        env: {
          ...isolatedEnv(process.env),
          PATH: `${directory}${path.delimiter}${process.env.PATH}`,
          T3X_E2E_ARTIFACT_DIR: directory,
          T3X_E2E_API_PORT: port,
          T3X_E2E_WEB_PORT: port,
          T3X_E2E_RUNNER_PORT: port,
          T3X_E2E_PG_PORT: port,
        },
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const closed = once(child, 'close');
      const stdout = createInterface({ input: child.stdout });
      let interrupted = false;
      let buildStopped = false;
      stdout.on('line', (line) => {
        if (line === 'fixture build started') interrupted = child.kill(signal);
        if (line === 'fixture build stopped') buildStopped = true;
      });
      try {
        const [code] = await closed;
        assert.ok(interrupted);
        assert.equal(code, expectedCode);
        assert.ok(buildStopped);
        const summary = JSON.parse(
          await readFile(path.join(directory, 'run-summary.json'), 'utf8')
        );
        assert.equal(summary.status, 'cancelled');
        assert.equal(summary.interrupt_exit_code, expectedCode);
        assert.equal(summary.data_dir, null);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
}
