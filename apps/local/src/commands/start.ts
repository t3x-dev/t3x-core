import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildApiEnv,
  buildWebEnv,
  DEFAULT_API_PORT,
  type ResolvedStartOptions,
  resolveStartOptions,
} from '../runtime/env.js';
import { waitForHttpOk } from '../runtime/health.js';
import {
  formatMissingArtifacts,
  getLocalPaths,
  getMissingStartArtifacts,
  type LocalPaths,
} from '../runtime/paths.js';
import {
  clearRuntimeState,
  ensureRuntimeMetadataDirs,
  getRuntimeProcessStatus,
  type RuntimeState,
  readRuntimeState,
  writeRuntimeState,
} from '../runtime/pid.js';
import { assertPortAvailable } from '../runtime/ports.js';
import { type SpawnedProcess, spawnNodeScript, terminateProcess } from '../runtime/spawn.js';
import { buildIntroDemoUrl } from '../runtime/urls.js';
import { assertVersionLockOrThrow } from '../runtime/version-check.js';

export interface StartCommandOptions {
  dataDir?: string;
  apiPort?: number;
  webPort?: number;
  verbose?: boolean;
}

const TEXT_RUNTIME_EXTENSIONS = new Set(['.html', '.js', '.json', '.mjs']);
const BAKED_API_URL_PATTERNS = [
  {
    from: 'http://localhost:8000',
    to: (apiPort: number) => `http://localhost:${apiPort}`,
  },
  {
    from: 'http://127.0.0.1:8000',
    to: (apiPort: number) => `http://127.0.0.1:${apiPort}`,
  },
] as const;

interface RuntimeRewriteStats {
  filesScanned: number;
  filesUpdated: number;
  replacements: number;
}

export async function runStartCommand(input: StartCommandOptions = {}): Promise<RuntimeState> {
  const paths = getLocalPaths();
  assertVersionLockOrThrow(paths, 't3x-local start');
  const options = resolveStartOptions(input, paths, process.env);
  const missing = getMissingStartArtifacts(paths);

  if (missing.length > 0) {
    throw new Error(formatMissingArtifacts(missing, paths));
  }

  const existingState = await readRuntimeState(paths);
  if (existingState) {
    const status = getRuntimeProcessStatus(existingState);

    if (status.apiRunning || status.webRunning) {
      throw new Error(
        '[t3x-local] Local runtime is already running. ' +
          `API pid=${existingState.apiPid}, Web pid=${existingState.webPid}. ` +
          'Run `t3x-local doctor` or `t3x-local stop` first.'
      );
    }

    await clearRuntimeState(paths);
  }

  await Promise.all([
    assertPortAvailable(options.apiPort, 'API'),
    assertPortAvailable(options.webPort, 'Web'),
  ]);

  const metadataPaths = await ensureRuntimeMetadataDirs(paths);
  let apiProcess: SpawnedProcess | null = null;
  let webProcess: SpawnedProcess | null = null;

  try {
    await prepareWebRuntime(paths, options);
    apiProcess = spawnApi(paths, options, metadataPaths.apiLogPath);
    webProcess = spawnWeb(paths, options, metadataPaths.webLogPath);

    if (!apiProcess.child.pid || !webProcess.child.pid) {
      throw new Error('[t3x-local] Failed to capture child process IDs for the local runtime');
    }

    const runtimeState = buildRuntimeState(
      options,
      metadataPaths.apiLogPath,
      metadataPaths.webLogPath,
      {
        apiPid: apiProcess.child.pid,
        webPid: webProcess.child.pid,
      }
    );

    await clearRuntimeState(paths);
    await Promise.all([
      writeRuntimeState(paths, runtimeState),
      waitForHttpOk(runtimeState.apiHealthUrl, { label: 'API' }),
      waitForHttpOk(runtimeState.webHealthUrl, { label: 'Web' }),
    ]);

    for (const message of formatStartedRuntimeMessages({
      ...runtimeState,
      stateFilePath: metadataPaths.stateFilePath,
      verbose: input.verbose === true,
    })) {
      console.log(message);
    }
    return runtimeState;
  } catch (error) {
    await Promise.all([
      apiProcess ? terminateProcess(apiProcess) : Promise.resolve(),
      webProcess ? terminateProcess(webProcess) : Promise.resolve(),
      clearRuntimeState(paths),
    ]);
    throw error;
  }
}

export interface StartedRuntimeMessageInput {
  apiPid: number;
  webPid: number;
  apiUrl: string;
  webUrl: string;
  dataDir: string;
  stateFilePath: string;
  apiLogPath: string;
  webLogPath: string;
  verbose?: boolean;
}

export function formatStartedRuntimeMessages(input: StartedRuntimeMessageInput): string[] {
  const messages = [
    `[t3x-local] Started WebUI at ${input.webUrl}`,
    `[t3x-local] Demo: ${buildIntroDemoUrl(input.webUrl)}`,
  ];

  if (input.verbose) {
    messages.push(
      `[t3x-local] Started API pid ${input.apiPid} at ${input.apiUrl}`,
      `[t3x-local] Started Web pid ${input.webPid} at ${input.webUrl}`,
      `[t3x-local] Data dir: ${input.dataDir}`,
      `[t3x-local] State file: ${input.stateFilePath}`,
      `[t3x-local] Logs: ${input.apiLogPath} | ${input.webLogPath}`
    );
  } else {
    messages.push('[t3x-local] Run `t3x-local doctor` for API, log, and state details.');
  }

  return messages;
}

function buildRuntimeState(
  options: ResolvedStartOptions,
  apiLogPath: string,
  webLogPath: string,
  pids: { apiPid: number; webPid: number }
): RuntimeState {
  return {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    dataDir: options.dataDir,
    apiPort: options.apiPort,
    webPort: options.webPort,
    apiPid: pids.apiPid,
    webPid: pids.webPid,
    apiUrl: `http://localhost:${options.apiPort}`,
    webUrl: `http://localhost:${options.webPort}`,
    apiHealthUrl: `http://127.0.0.1:${options.apiPort}/health`,
    webHealthUrl: `http://127.0.0.1:${options.webPort}/health`,
    apiLogPath,
    webLogPath,
  };
}

function spawnApi(
  paths: LocalPaths,
  options: ResolvedStartOptions,
  logPath: string
): SpawnedProcess {
  console.log('[t3x-local] Starting API...');
  return spawnNodeScript({
    name: 'api',
    entryPath: paths.apiEntryPath,
    cwd: paths.repoRoot ?? paths.packageDir,
    detached: true,
    env: buildApiEnv(process.env, options),
    stderrPath: logPath,
    stdoutPath: logPath,
  });
}

function spawnWeb(
  paths: LocalPaths,
  options: ResolvedStartOptions,
  logPath: string
): SpawnedProcess {
  console.log('[t3x-local] Starting Web...');

  const runtimeDir = `${paths.localRuntimeRoot}/web`;
  const webEntryPath = `${runtimeDir}/apps/web/server.js`;

  return spawnNodeScript({
    name: 'web',
    entryPath: webEntryPath,
    cwd: runtimeDir,
    detached: true,
    env: buildWebEnv(process.env, options),
    stderrPath: logPath,
    stdoutPath: logPath,
  });
}

async function prepareWebRuntime(paths: LocalPaths, options: ResolvedStartOptions): Promise<void> {
  const runtimeDir = `${paths.localRuntimeRoot}/web`;
  const runtimeNextDir = `${runtimeDir}/apps/web/.next`;

  await fs.rm(runtimeDir, { recursive: true, force: true });
  await fs.cp(paths.webStandaloneDir, runtimeDir, {
    recursive: true,
    verbatimSymlinks: true,
  });
  await fs.mkdir(runtimeNextDir, { recursive: true });
  await fs.cp(paths.webStaticDir, `${runtimeNextDir}/static`, { recursive: true });
  await fs.cp(paths.webPublicDir, `${runtimeDir}/apps/web/public`, { recursive: true });

  const rewriteStats = await rewriteBakedWebApiUrls(runtimeDir, options.apiPort);
  validateRewriteOutcome(rewriteStats, options.apiPort);
  await assertNoBakedApiUrlResidue(runtimeDir, options.apiPort);

  if (rewriteStats.replacements > 0) {
    console.log(
      `[t3x-local] Rewrote ${rewriteStats.replacements} baked Web API URL occurrence(s) ` +
        `across ${rewriteStats.filesUpdated} file(s).`
    );
  }
}

async function rewriteBakedWebApiUrls(
  runtimeDir: string,
  apiPort: number
): Promise<RuntimeRewriteStats> {
  const stats: RuntimeRewriteStats = {
    filesScanned: 0,
    filesUpdated: 0,
    replacements: 0,
  };

  await rewriteRuntimeTree(runtimeDir, apiPort, stats);
  return stats;
}

async function rewriteRuntimeTree(
  currentDir: string,
  apiPort: number,
  stats: RuntimeRewriteStats
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await rewriteRuntimeTree(entryPath, apiPort, stats);
        return;
      }

      if (!shouldRewriteRuntimeFile(entryPath)) {
        return;
      }

      stats.filesScanned += 1;
      const original = await fs.readFile(entryPath, 'utf8');
      const rewritten = replaceBakedApiUrls(original, apiPort);

      if (rewritten === original) {
        return;
      }

      stats.filesUpdated += 1;
      stats.replacements += countApiUrlReplacements(original, apiPort);
      await fs.writeFile(entryPath, rewritten);
    })
  );
}

function shouldRewriteRuntimeFile(filePath: string): boolean {
  return TEXT_RUNTIME_EXTENSIONS.has(path.extname(filePath));
}

function replaceBakedApiUrls(source: string, apiPort: number): string {
  let rewritten = source;

  for (const pattern of BAKED_API_URL_PATTERNS) {
    rewritten = rewritten.replaceAll(pattern.from, pattern.to(apiPort));
  }

  return rewritten;
}

function countApiUrlReplacements(source: string, apiPort: number): number {
  let replacements = 0;

  for (const pattern of BAKED_API_URL_PATTERNS) {
    if (pattern.from === pattern.to(apiPort)) {
      continue;
    }

    replacements += countOccurrences(source, pattern.from);
  }

  return replacements;
}

function countOccurrences(source: string, needle: string): number {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let cursor = 0;

  while (cursor < source.length) {
    const next = source.indexOf(needle, cursor);
    if (next === -1) {
      break;
    }

    count += 1;
    cursor = next + needle.length;
  }

  return count;
}

function validateRewriteOutcome(stats: RuntimeRewriteStats, apiPort: number): void {
  if (apiPort === DEFAULT_API_PORT) {
    return;
  }

  if (stats.replacements === 0) {
    throw new Error(
      '[t3x-local] The copied Web runtime does not contain the expected baked API URL. ' +
        'Refuse to start with a non-default `--api-port` because the browser bundle may still ' +
        `call http://localhost:${DEFAULT_API_PORT}. Rebuild apps/web or use the default API port.`
    );
  }
}

async function assertNoBakedApiUrlResidue(runtimeDir: string, apiPort: number): Promise<void> {
  if (apiPort === DEFAULT_API_PORT) {
    return;
  }

  const residue = await findBakedApiUrlResidue(runtimeDir);
  if (residue.length === 0) {
    return;
  }

  const details = residue.map(({ filePath, url }) => `- ${filePath}: ${url}`).join('\n');
  throw new Error(
    '[t3x-local] Refuse to start because the copied Web runtime still contains baked API URLs ' +
      `for port ${DEFAULT_API_PORT}.\n${details}`
  );
}

async function findBakedApiUrlResidue(
  currentDir: string
): Promise<Array<{ filePath: string; url: string }>> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const residue: Array<{ filePath: string; url: string }> = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      residue.push(...(await findBakedApiUrlResidue(entryPath)));
      continue;
    }

    if (!shouldRewriteRuntimeFile(entryPath)) {
      continue;
    }

    const contents = await fs.readFile(entryPath, 'utf8');

    for (const pattern of BAKED_API_URL_PATTERNS) {
      if (contents.includes(pattern.from)) {
        residue.push({ filePath: entryPath, url: pattern.from });
      }
    }
  }

  return residue;
}
