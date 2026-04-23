import fs from 'node:fs/promises';
import { resolveStartOptions } from '../runtime/env.js';
import { getLocalPaths } from '../runtime/paths.js';
import { getRuntimeProcessStatus, readRuntimeState } from '../runtime/pid.js';
import { runStopCommand } from './stop.js';

export interface ResetCommandOptions {
  dataDir?: string;
  force?: boolean;
}

export async function runResetCommand(input: ResetCommandOptions = {}): Promise<void> {
  const paths = getLocalPaths();
  const state = await readRuntimeState(paths);
  const configured = resolveStartOptions({ dataDir: input.dataDir }, paths, process.env);
  const dataDir = input.dataDir ? configured.dataDir : (state?.dataDir ?? configured.dataDir);
  const processStatus = state ? getRuntimeProcessStatus(state) : null;

  if (processStatus && (processStatus.apiRunning || processStatus.webRunning)) {
    if (!input.force) {
      throw new Error(
        '[t3x-local] Local runtime is still running. Run `t3x-local stop` first or use `t3x-local reset --force`.'
      );
    }

    await runStopCommand();
  }

  await Promise.all([
    fs.rm(dataDir, { recursive: true, force: true }),
    fs.rm(paths.localRuntimeRoot, { recursive: true, force: true }),
  ]);

  console.log(`[t3x-local] Removed data dir: ${dataDir}`);
  console.log(`[t3x-local] Removed runtime dir: ${paths.localRuntimeRoot}`);
}
