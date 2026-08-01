#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const allowExternal = process.env.T3X_E2E_ALLOW_EXTERNAL === '1';
const unknownArgs = runnerArgs.filter((arg) => !['--skip-build', '--keep-data'].includes(arg));

if (unknownArgs.length > 0) {
  throw new Error(`Unknown full E2E runner argument(s): ${unknownArgs.join(', ')}`);
}

const apiPort = process.env.T3X_E2E_API_PORT ?? '8100';
const webPort = process.env.T3X_E2E_WEB_PORT ?? '3100';
const pgPort = process.env.T3X_E2E_PG_PORT ?? '5545';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const artifactDir = path.resolve(
  repoRoot,
  process.env.T3X_E2E_ARTIFACT_DIR ?? 'test-results/full-e2e'
);
const configuredDataDir = process.env.T3X_E2E_DATA_DIR;
const dataDir =
  configuredDataDir ?? (await fsp.mkdtemp(path.join(os.tmpdir(), 't3x-full-e2e-data-')));
const ownsDataDir = configuredDataDir === undefined;
const startedAt = new Date().toISOString();
const children = [];

await fsp.mkdir(artifactDir, { recursive: true });

const runtimeEnv = {
  ...process.env,
  API_PORT: apiPort,
  API_URL: apiUrl,
  AUTH_DISABLED: 'true',
  HOST: '127.0.0.1',
  NEXT_PUBLIC_API_URL: apiUrl,
  NEXT_PUBLIC_AUTH_DISABLED: 'true',
  PORT: apiPort,
  T3X_DATA_DIR: dataDir,
  T3X_E2E_ARTIFACT_DIR: artifactDir,
  T3X_E2E_EXTERNAL_SERVERS: '1',
  T3X_E2E_FULL: '1',
  T3X_PG_PORT: pgPort,
  WEBUI_PORT: webPort,
  WEBUI_URL: webUrl,
};

if (!allowExternal) {
  Object.assign(runtimeEnv, {
    ANTHROPIC_API_KEY: '',
    GOOGLE_AI_STUDIO_KEY: '',
    GOOGLE_API_KEY: '',
    N8N_API_KEY: '',
    OPENAI_API_KEY: '',
    RUNNER_BASE_URL: '',
  });
}

let testExitCode = 1;
let status = 'failed';
let caughtError = null;

const interrupt = (signal) => {
  void stopChildren().finally(() => {
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
  });
};
process.once('SIGINT', () => interrupt('SIGINT'));
process.once('SIGTERM', () => interrupt('SIGTERM'));

try {
  await assertPortAvailable(Number(apiPort), 'API', 'T3X_E2E_API_PORT');
  await assertPortAvailable(Number(webPort), 'WebUI', 'T3X_E2E_WEB_PORT');
  if (!runtimeEnv.DATABASE_URL) {
    await assertPortAvailable(Number(pgPort), 'embedded PostgreSQL', 'T3X_E2E_PG_PORT');
  }

  if (!skipBuild) {
    await runCommand('pnpm', ['build:api-server'], runtimeEnv);
    await runCommand('pnpm', ['build:webui'], runtimeEnv);
  }

  const api = startLoggedProcess(
    'api',
    'node',
    ['tools/dev-package-runner.mjs', 'api', 'node', 'apps/api/dist/index.js'],
    {
      ...runtimeEnv,
      PORT: apiPort,
    }
  );
  children.push(api);
  await waitForUrl(`${apiUrl}/health`, api, 90_000);

  const web = startLoggedProcess('webui', 'pnpm', ['--filter', 't3x-webui', 'start'], {
    ...runtimeEnv,
    HOSTNAME: '127.0.0.1',
    PORT: webPort,
  });
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
  await stopChildren();

  const summary = {
    schema_version: 1,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    test_exit_code: testExitCode,
    api_url: apiUrl,
    webui_url: webUrl,
    data_dir: keepData ? dataDir : null,
    error: caughtError?.message ?? null,
    artifacts: {
      api_log: path.join(artifactDir, 'api.log'),
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

  if (ownsDataDir && !keepData) {
    await fsp.rm(dataDir, { recursive: true, force: true });
  } else if (keepData) {
    console.log(`[full-e2e] Kept data directory: ${dataDir}`);
  }
}

if (caughtError) {
  process.exitCode = 1;
} else {
  process.exitCode = testExitCode;
}

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
    if (child.exitCode !== null) {
      throw new Error(`${child.label} exited before ${url} became ready (code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        console.log(`[full-e2e] ${child.label} ready at ${url}`);
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
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

function startLoggedProcess(label, command, args, env) {
  const logPath = path.join(artifactDir, `${label}.log`);
  const log = fs.createWriteStream(logPath, { flags: 'w' });
  const child = spawn(command, args, {
    cwd: repoRoot,
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
  console.log(`[full-e2e] Running: ${command} ${args.join(' ')}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by ${signal}.`));
        return;
      }
      resolve(exitCode ?? 1);
    });
  });

  if (code !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${code}.`);
  }
  return code;
}

async function stopChildren() {
  const active = children.filter((child) => child.exitCode === null && child.signalCode === null);
  for (const child of active) {
    signalChild(child, 'SIGTERM');
  }

  const deadline = Date.now() + 5000;
  while (
    Date.now() < deadline &&
    active.some((child) => child.exitCode === null && child.signalCode === null)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  for (const child of active) {
    if (child.exitCode === null && child.signalCode === null) {
      signalChild(child, 'SIGKILL');
    }
  }
}

function signalChild(child, signal) {
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('ESRCH')) {
      console.warn(`[full-e2e] Failed to stop ${child.label}: ${String(error)}`);
    }
  }
}
