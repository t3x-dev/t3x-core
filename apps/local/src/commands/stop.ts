import { getLocalPaths } from '../runtime/paths.js';
import {
  clearRuntimeState,
  getRuntimeProcessStatus,
  readRuntimeState,
  terminatePid,
} from '../runtime/pid.js';

export async function runStopCommand(): Promise<void> {
  const paths = getLocalPaths();
  const state = await readRuntimeState(paths);

  if (!state) {
    console.log('[t3x-local] No local runtime state file found. Nothing to stop.');
    return;
  }

  const before = getRuntimeProcessStatus(state);

  if (!before.apiRunning && !before.webRunning) {
    await clearRuntimeState(paths);
    console.log('[t3x-local] Runtime state was stale. Cleared local state files.');
    return;
  }

  const webResult = await terminatePid(state.webPid);
  const apiResult = await terminatePid(state.apiPid);

  await clearRuntimeState(paths);

  console.log(
    `[t3x-local] Web process ${state.webPid}: ${
      webResult === 'stopped' ? 'stopped' : 'not running'
    }`
  );
  console.log(
    `[t3x-local] API process ${state.apiPid}: ${
      apiResult === 'stopped' ? 'stopped' : 'not running'
    }`
  );
  console.log('[t3x-local] Cleared local runtime state.');
}
