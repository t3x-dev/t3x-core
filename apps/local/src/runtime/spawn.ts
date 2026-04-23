import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface SpawnNodeScriptOptions {
  name: string;
  entryPath: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  detached?: boolean;
  stdoutPath?: string;
  stderrPath?: string;
}

export interface SpawnedProcess {
  name: string;
  child: ChildProcess;
}

export interface ProcessExit {
  name: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

export function spawnNodeScript(options: SpawnNodeScriptOptions): SpawnedProcess {
  if (!fs.existsSync(options.entryPath)) {
    throw new Error(`[t3x-local] Missing ${options.name} entrypoint: ${options.entryPath}`);
  }

  const { stdio, openDescriptors } = buildStdio(options);
  const child = spawn(process.execPath, [options.entryPath, ...(options.args ?? [])], {
    cwd: options.cwd,
    detached: options.detached,
    env: options.env,
    stdio,
  });

  for (const descriptor of openDescriptors) {
    fs.closeSync(descriptor);
  }

  if (options.detached) {
    child.unref();
  }

  child.on('error', (error) => {
    console.error(`[t3x-local] Failed to start ${options.name}: ${error.message}`);
  });

  return {
    name: options.name,
    child,
  };
}

export async function runNodeScript(options: SpawnNodeScriptOptions): Promise<never> {
  const spawned = spawnNodeScript(options);
  const exit = await onProcessExit(spawned);

  if (exit.signal) {
    process.kill(process.pid, exit.signal);
    return new Promise<never>(() => {});
  }

  process.exit(exit.code ?? 1);
}

function buildStdio(options: SpawnNodeScriptOptions): {
  stdio: 'inherit' | ['ignore', number, number];
  openDescriptors: number[];
} {
  if (!options.stdoutPath && !options.stderrPath) {
    return {
      stdio: 'inherit',
      openDescriptors: [],
    };
  }

  const stdoutPath = options.stdoutPath ?? options.stderrPath;
  const stderrPath = options.stderrPath ?? options.stdoutPath;

  if (!stdoutPath || !stderrPath) {
    throw new Error(
      `[t3x-local] Both stdout and stderr log paths must be provided for ${options.name}`
    );
  }

  fs.mkdirSync(path.dirname(stdoutPath), { recursive: true });
  fs.mkdirSync(path.dirname(stderrPath), { recursive: true });

  const stdoutDescriptor = fs.openSync(stdoutPath, 'a');
  const stderrDescriptor = fs.openSync(stderrPath, 'a');

  return {
    stdio: ['ignore', stdoutDescriptor, stderrDescriptor],
    openDescriptors: [stdoutDescriptor, stderrDescriptor],
  };
}

export function onProcessExit(processInfo: SpawnedProcess): Promise<ProcessExit> {
  return new Promise((resolve) => {
    processInfo.child.once('exit', (code, signal) => {
      resolve({
        name: processInfo.name,
        code,
        signal,
      });
    });
  });
}

export async function terminateProcess(processInfo: SpawnedProcess): Promise<void> {
  if (processInfo.child.exitCode !== null || processInfo.child.signalCode !== null) {
    return;
  }

  processInfo.child.kill('SIGTERM');

  await Promise.race([
    onProcessExit(processInfo).then(() => undefined),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (processInfo.child.exitCode === null && processInfo.child.signalCode === null) {
          processInfo.child.kill('SIGKILL');
        }
        resolve();
      }, 5000);
    }),
  ]);
}
