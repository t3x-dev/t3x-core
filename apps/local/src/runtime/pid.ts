import fs from 'node:fs/promises';
import path from 'node:path';
import type { LocalPaths } from './paths.js';

const STATE_SCHEMA_VERSION = 1;

export interface RuntimeState {
  schemaVersion: number;
  startedAt: string;
  dataDir: string;
  apiPort: number;
  webPort: number;
  apiPid: number;
  webPid: number;
  apiUrl: string;
  webUrl: string;
  apiHealthUrl: string;
  webHealthUrl: string;
  apiLogPath: string;
  webLogPath: string;
}

export interface RuntimeMetadataPaths {
  runtimeRoot: string;
  logsDir: string;
  stateFilePath: string;
  apiPidFilePath: string;
  webPidFilePath: string;
  apiLogPath: string;
  webLogPath: string;
}

export interface RuntimeProcessStatus {
  apiRunning: boolean;
  webRunning: boolean;
}

export function getRuntimeMetadataPaths(paths: LocalPaths): RuntimeMetadataPaths {
  return {
    runtimeRoot: paths.localRuntimeRoot,
    logsDir: path.join(paths.localRuntimeRoot, 'logs'),
    stateFilePath: path.join(paths.localRuntimeRoot, 'state.json'),
    apiPidFilePath: path.join(paths.localRuntimeRoot, 'api.pid'),
    webPidFilePath: path.join(paths.localRuntimeRoot, 'web.pid'),
    apiLogPath: path.join(paths.localRuntimeRoot, 'logs', 'api.log'),
    webLogPath: path.join(paths.localRuntimeRoot, 'logs', 'web.log'),
  };
}

export async function ensureRuntimeMetadataDirs(paths: LocalPaths): Promise<RuntimeMetadataPaths> {
  const metadataPaths = getRuntimeMetadataPaths(paths);
  await fs.mkdir(metadataPaths.runtimeRoot, { recursive: true });
  await fs.mkdir(metadataPaths.logsDir, { recursive: true });
  return metadataPaths;
}

export async function readRuntimeState(paths: LocalPaths): Promise<RuntimeState | null> {
  const { stateFilePath } = getRuntimeMetadataPaths(paths);

  try {
    const raw = await fs.readFile(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw) as RuntimeState;

    if (parsed.schemaVersion !== STATE_SCHEMA_VERSION) {
      return null;
    }

    return parsed;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function writeRuntimeState(paths: LocalPaths, state: RuntimeState): Promise<void> {
  const metadataPaths = await ensureRuntimeMetadataDirs(paths);

  await Promise.all([
    fs.writeFile(metadataPaths.stateFilePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8'),
    fs.writeFile(metadataPaths.apiPidFilePath, `${state.apiPid}\n`, 'utf8'),
    fs.writeFile(metadataPaths.webPidFilePath, `${state.webPid}\n`, 'utf8'),
  ]);
}

export async function clearRuntimeState(paths: LocalPaths): Promise<void> {
  const metadataPaths = getRuntimeMetadataPaths(paths);

  await Promise.all([
    fs.rm(metadataPaths.stateFilePath, { force: true }),
    fs.rm(metadataPaths.apiPidFilePath, { force: true }),
    fs.rm(metadataPaths.webPidFilePath, { force: true }),
  ]);
}

export function getRuntimeProcessStatus(state: RuntimeState): RuntimeProcessStatus {
  return {
    apiRunning: isProcessRunning(state.apiPid),
    webRunning: isProcessRunning(state.webPid),
  };
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isPermissionError(error);
  }
}

export async function terminatePid(
  pid: number,
  signal: NodeJS.Signals = 'SIGTERM',
  timeoutMs = 5000
): Promise<'stopped' | 'not-running'> {
  if (!isProcessRunning(pid)) {
    return 'not-running';
  }

  process.kill(pid, signal);
  const stopped = await waitForPidExit(pid, timeoutMs);

  if (stopped) {
    return 'stopped';
  }

  process.kill(pid, 'SIGKILL');
  await waitForPidExit(pid, 2000);
  return 'stopped';
}

async function waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return true;
    }

    await sleep(200);
  }

  return !isProcessRunning(pid);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isFileNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isPermissionError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'EPERM'
  );
}
