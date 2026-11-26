#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stopProcessGroups } from './lib/stopProcessGroups.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawArgs = process.argv.slice(2);
// `pnpm run <script> -- ...` preserves a transport-level `--`. Drop only that
// leading separator when another option/separator follows, while retaining the
// direct `node tools/full-e2e.mjs -- <playwright args>` form.
const normalizedArgs =
  rawArgs[0] === '--' && rawArgs[1]?.startsWith('--') ? rawArgs.slice(1) : rawArgs;
const separatorIndex = normalizedArgs.indexOf('--');
const runnerArgs = separatorIndex >= 0 ? normalizedArgs.slice(0, separatorIndex) : normalizedArgs;
const playwrightArgs = separatorIndex >= 0 ? normalizedArgs.slice(separatorIndex + 1) : [];
const skipBuild = runnerArgs.includes('--skip-build');
const keepData = runnerArgs.includes('--keep-data') || process.env.T3X_E2E_KEEP_DATA === '1';
const authEnabled = runnerArgs.includes('--auth-enabled');
const allowExternal = process.env.T3X_E2E_ALLOW_EXTERNAL === '1';
const isolatedMcp = process.env.T3X_E2E_MCP_ISOLATED === '1';
const unknownArgs = runnerArgs.filter(
  (arg) => !['--skip-build', '--keep-data', '--auth-enabled'].includes(arg)
);

if (unknownArgs.length > 0) {
  throw new Error(`Unknown full E2E runner argument(s): ${unknownArgs.join(', ')}`);
}

if (isolatedMcp && (!authEnabled || process.env.DATABASE_URL || process.env.T3X_E2E_DATA_DIR)) {
  throw new Error(
    'Isolated MCP qualification requires authentication and a fresh embedded database.'
  );
}

const oauthDelegation = isolatedMcp && process.env.T3X_E2E_MCP_PHASE === 'oauth-delegation';
const mcpPort = process.env.T3X_E2E_MCP_PORT ?? '8317';
let oauthWebDir;
const apiPort = process.env.T3X_E2E_API_PORT ?? '8100';
const webPort = process.env.T3X_E2E_WEB_PORT ?? '3100';
const runnerPort = process.env.T3X_E2E_RUNNER_PORT ?? '8200';
const pgPort = process.env.T3X_E2E_PG_PORT ?? '5545';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const runnerUrl = `http://127.0.0.1:${runnerPort}`;
const artifactDir = path.resolve(
  repoRoot,
  process.env.T3X_E2E_ARTIFACT_DIR ??
    (authEnabled ? 'test-results/full-e2e-auth' : 'test-results/full-e2e')
);
const configuredDataDir = process.env.T3X_E2E_DATA_DIR;
const dataDir =
  configuredDataDir ?? (await fsp.mkdtemp(path.join(os.tmpdir(), 't3x-full-e2e-data-')));
const ownsDataDir = configuredDataDir === undefined;
const startedAt = new Date().toISOString();
const children = [];
let stopping;
let dataRetained = true;

await fsp.mkdir(artifactDir, { recursive: true });

const runtimeEnv = {
  ...process.env,
  API_PORT: apiPort,
  API_URL: apiUrl,
  AUTH_DISABLED: authEnabled ? 'false' : 'true',
  HOST: '127.0.0.1',
  T3X_API_URL: apiUrl,
  NEXT_PUBLIC_AUTH_DISABLED: authEnabled ? 'false' : 'true',
  PORT: apiPort,
  RUNNER_HOST: '127.0.0.1',
  RUNNER_SERVICE_TOKEN: process.env.RUNNER_SERVICE_TOKEN ?? 't3x-e2e-runner-token',
  RUNNER_URL: runnerUrl,
  T3X_DATA_DIR: dataDir,
  T3X_ENGINE_URL: apiUrl,
  T3X_E2E_ARTIFACT_DIR: artifactDir,
  T3X_E2E_EXTERNAL_SERVERS: '1',
  T3X_E2E_FULL: '1',
  T3X_E2E_AUTH_ENABLED: authEnabled ? '1' : '0',
  T3X_PG_PORT: pgPort,
  TRUST_PROXY: '1',
  WEBUI_PORT: webPort,
  WEBUI_URL: webUrl,
};

if (oauthDelegation) {
  const callbackPort = process.env.T3X_E2E_MCP_CALLBACK_PORT ?? '38497';
  const callback = `http://127.0.0.1:${callbackPort}/oauth/callback`;
  Object.assign(runtimeEnv, {
    T3X_MCP_OAUTH_ISSUER: webUrl,
    T3X_MCP_RESOURCE_URL: `http://127.0.0.1:${mcpPort}/mcp`,
    T3X_MCP_OAUTH_SECRET: randomBytes(32).toString('base64url'),
    T3X_MCP_OAUTH_CLIENTS: JSON.stringify([
      {
        client_id: 't3x-qualification-chat',
        client_name: 'Qualification Chat',
        redirect_uris: [callback],
      },
    ]),
    T3X_E2E_MCP_CALLBACK_URL: callback,
  });
}

if (runtimeEnv.T3X_E2E_MCP_PHASE === 'repository-runs') {
  const webhookPort = process.env.T3X_E2E_WEBHOOK_PORT ?? '18267';
  runtimeEnv.N8N_WEBHOOK_URL = `http://127.0.0.1:${webhookPort}/webhook`;
  runtimeEnv.RUNNER_CALLBACK_URL = `${runnerUrl}/callbacks/n8n`;
  runtimeEnv.T3X_REPOSITORY_RUN_WEBHOOKS = JSON.stringify({
    configured_run_fixture: 'evaluate-v1',
  });
}

if (!allowExternal) {
  Object.assign(runtimeEnv, {
    ANTHROPIC_API_KEY: '',
    GOOGLE_AI_STUDIO_KEY: '',
    GOOGLE_API_KEY: '',
    N8N_API_KEY: '',
    OPENAI_API_KEY: '',
  });
}

let testExitCode = 1;
let status = 'failed';
let caughtError = null;
let interruptExitCode;
let activeCommand;
const interruption = new AbortController();

const interrupt = (signal) => {
  if (interruptExitCode !== undefined) return;
  interruptExitCode = signal === 'SIGINT' ? 130 : 143;
  interruption.abort(new Error(`Run cancelled by ${signal}.`));
  void stopChildren().catch((error) =>
    console.error(`[full-e2e] Shutdown failed: ${error.message}`)
  );
};
process.once('SIGINT', () => interrupt('SIGINT'));
process.once('SIGTERM', () => interrupt('SIGTERM'));

try {
  await assertPortAvailable(Number(apiPort), 'API', 'T3X_E2E_API_PORT');
  await assertPortAvailable(Number(webPort), 'WebUI', 'T3X_E2E_WEB_PORT');
  await assertPortAvailable(Number(runnerPort), 'Runner', 'T3X_E2E_RUNNER_PORT');
  if (oauthDelegation) {
    await assertPortAvailable(Number(mcpPort), 'MCP', 'T3X_E2E_MCP_PORT');
    await assertPortAvailable(
      Number(new URL(runtimeEnv.T3X_E2E_MCP_CALLBACK_URL).port),
      'OAuth client',
      'T3X_E2E_MCP_CALLBACK_PORT'
    );
  }
  if (!runtimeEnv.DATABASE_URL) {
    await assertPortAvailable(Number(pgPort), 'embedded PostgreSQL', 'T3X_E2E_PG_PORT');
  }

  if (!skipBuild) {
    await runCommand('pnpm', ['build:api-server'], runtimeEnv);
    if (oauthDelegation)
      await runCommand(
        'pnpm',
        ['exec', 'turbo', 'run', 'build', '--filter=@t3x-dev/mcp', '--filter=@t3x-dev/runner'],
        runtimeEnv
      );
    else await runCommand('pnpm', ['build:webui'], runtimeEnv);
  }

  if (runtimeEnv.DATABASE_URL) {
    // External test databases do not get the embedded runtime's bootstrap.
    // Migrate explicitly before starting the API, whose runtime role does no DDL.
    const { migratePostgresStorage } = await import('../packages/storage/dist/index.js');
    await migratePostgresStorage({ connectionString: runtimeEnv.DATABASE_URL });
  }

  const runner = startLoggedProcess('runner', 'node', ['apps/runner/dist/server.js'], {
    ...runtimeEnv,
    PORT: runnerPort,
  });
  children.push(runner);
  await waitForUrl(`${runnerUrl}/health`, runner, 90_000);

  const apiEntry =
    isolatedMcp && runtimeEnv.T3X_E2E_MCP_PHASE === 'transition-statement'
      ? 'tools/fixtures/mcp-statement-api.mjs'
      : 'apps/api/dist/index.js';
  const api = startLoggedProcess(
    'api',
    'node',
    [
      path.join(repoRoot, 'tools/dev-package-runner.mjs'),
      'api',
      'node',
      path.join(repoRoot, apiEntry),
    ],
    {
      ...runtimeEnv,
      PORT: apiPort,
    },
    isolatedMcp ? dataDir : repoRoot
  );
  children.push(api);
  await waitForUrl(`${apiUrl}/health`, api, 90_000);
  if (isolatedMcp) {
    const anonymous = await fetch(`${apiUrl}/api/v1/projects`, {
      signal: AbortSignal.any([interruption.signal, AbortSignal.timeout(5000)]),
    });
    await anonymous.body?.cancel();
    if (anonymous.status !== 401)
      throw new Error('MCP qualification API did not require credentials.');
  }

  let web;
  if (oauthDelegation) {
    const mcp = startLoggedProcess('mcp', 'node', ['apps/mcp/dist/index.js'], {
      ...runtimeEnv,
      T3X_TRANSPORT: 'http',
      T3X_API_URL: `${apiUrl}/api`,
      T3X_MCP_BACKEND: 'api',
      PORT: mcpPort,
    });
    children.push(mcp);
    await waitForUrl(`http://127.0.0.1:${mcpPort}/health`, mcp, 90_000);
    // A separate checkout of the Web sources isolates Next's generated types and build files
    // from a running developer preview. The API, MCP, issuer and database are all local to this run.
    const outputRoot = path.join(repoRoot, 'test-results');
    await fsp.mkdir(outputRoot, { recursive: true });
    oauthWebDir = await fsp.mkdtemp(path.join(outputRoot, 'oauth-web-'));
    const webSource = path.join(repoRoot, 'apps/web');
    for (const item of [
      'src',
      'public',
      'package.json',
      'tsconfig.json',
      'next-env.d.ts',
      'next.config.ts',
      'postcss.config.mjs',
    ]) {
      await fsp.cp(path.join(webSource, item), path.join(oauthWebDir, item), { recursive: true });
    }
    await fsp.symlink(
      path.join(webSource, 'node_modules'),
      path.join(oauthWebDir, 'node_modules'),
      'junction'
    );
    web = startLoggedProcess(
      'webui',
      'node',
      [
        path.join(webSource, 'node_modules/next/dist/bin/next'),
        'dev',
        oauthWebDir,
        '--hostname',
        '127.0.0.1',
        '--port',
        webPort,
      ],
      { ...runtimeEnv, HOSTNAME: '127.0.0.1', PORT: webPort }
    );
  } else {
    web = startLoggedProcess(
      'webui',
      'pnpm',
      ['--filter', 't3x-webui', 'start', '--hostname', '127.0.0.1'],
      { ...runtimeEnv, HOSTNAME: '127.0.0.1', PORT: webPort }
    );
  }
  children.push(web);
  await waitForUrl(webUrl, web, 90_000);

  testExitCode = await runCommand(
    'pnpm',
    ['--filter', 't3x-webui', 'exec', 'playwright', 'test', ...playwrightArgs],
    runtimeEnv,
    { allowFailure: true }
  );
  status = testExitCode === 0 ? 'passed' : 'failed';
} catch (error) {
  caughtError = error instanceof Error ? error : new Error(String(error));
  console.error(`[full-e2e] ${caughtError.message}`);
} finally {
  try {
    await stopChildren();
    if (oauthWebDir) await fsp.rm(oauthWebDir, { recursive: true, force: true });
    if (ownsDataDir && !keepData) {
      await fsp.rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      dataRetained = false;
    } else if (keepData) {
      console.log(`[full-e2e] Kept data directory: ${dataDir}`);
    }
  } catch (error) {
    const cleanupError = error instanceof Error ? error : new Error(String(error));
    caughtError = caughtError
      ? new Error(`${caughtError.message}; cleanup: ${cleanupError.message}`)
      : cleanupError;
    status = 'failed';
    console.error(`[full-e2e] Cleanup failed: ${cleanupError.message}`);
  }

  const summary = {
    schema_version: 1,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: interruptExitCode === undefined ? status : 'cancelled',
    auth_enabled: authEnabled,
    test_exit_code: testExitCode,
    ...(interruptExitCode !== undefined && { interrupt_exit_code: interruptExitCode }),
    api_url: apiUrl,
    webui_url: webUrl,
    runner_url: runnerUrl,
    data_dir: dataRetained ? dataDir : null,
    error: caughtError?.message ?? null,
    artifacts: {
      api_log: path.join(artifactDir, 'api.log'),
      runner_log: path.join(artifactDir, 'runner.log'),
      webui_log: path.join(artifactDir, 'webui.log'),
      playwright_html: path.join(artifactDir, 'html'),
      playwright_json: path.join(artifactDir, 'results.json'),
      playwright_junit: path.join(artifactDir, 'junit.xml'),
    },
  };
  await fsp.writeFile(
    path.join(artifactDir, 'run-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`
  );
}

process.exitCode = interruptExitCode ?? (caughtError ? 1 : testExitCode);

async function assertPortAvailable(port, label, envName) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${envName} must be a valid TCP port; received ${String(port)}.`);
  }

  const isAvailable = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => resolve(true));
    });
  });

  if (!isAvailable) {
    throw new Error(
      `${label} port ${port} is already in use. Stop its process or choose ${envName}.`
    );
  }
}

async function waitForUrl(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    interruption.signal.throwIfAborted();
    if (child.exitCode !== null) {
      throw new Error(`${child.label} exited before ${url} became ready (code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(url, { signal: interruption.signal });
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        console.log(`[full-e2e] ${child.label} ready at ${url}`);
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      interruption.signal.throwIfAborted();
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `${child.label} did not become ready at ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function startLoggedProcess(label, command, args, env, cwd = repoRoot) {
  interruption.signal.throwIfAborted();
  const logPath = path.join(artifactDir, `${label}.log`);
  const log = fs.createWriteStream(logPath, { flags: 'w' });
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== 'win32',
    env,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.label = label;
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.once('error', (error) => {
    console.error(`[full-e2e] ${label} process error: ${error.message}`);
  });
  child.once('close', (code, signal) => {
    log.end();
    console.log(`[full-e2e] ${label} stopped (${signal ?? code ?? 'unknown'}).`);
  });
  console.log(`[full-e2e] Started ${label}; log: ${logPath}`);
  return child;
}

async function runCommand(command, args, env, { allowFailure = false } = {}) {
  interruption.signal.throwIfAborted();
  console.log(`[full-e2e] Running: ${command} ${args.join(' ')}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      detached: process.platform !== 'win32',
      env,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
    activeCommand = child;
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      if (activeCommand === child && !interruption.signal.aborted) activeCommand = undefined;
      if (signal) {
        reject(new Error(`${command} terminated by ${signal}.`));
        return;
      }
      resolve(exitCode ?? 1);
    });
  });

  interruption.signal.throwIfAborted();
  if (code !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${code}.`);
  }
  return code;
}

function stopChildren() {
  stopping ??= stopProcessGroups(activeCommand ? [...children, activeCommand] : children);
  return stopping;
}
