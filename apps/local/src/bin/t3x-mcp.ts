#!/usr/bin/env node

import { getLocalPaths } from '../runtime/paths.js';
import { readRuntimeState } from '../runtime/pid.js';
import { runNodeScript } from '../runtime/spawn.js';

const paths = getLocalPaths();
const runtimeState = await readRuntimeState(paths);

if (runtimeState) {
  process.env.T3X_DATA_DIR ??= runtimeState.dataDir;
}

await runNodeScript({
  name: 't3x-mcp',
  entryPath: paths.mcpEntryPath,
  args: process.argv.slice(2),
  env: process.env,
});
