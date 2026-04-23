#!/usr/bin/env node

import { getLocalPaths } from '../runtime/paths.js';
import { readRuntimeState } from '../runtime/pid.js';
import { runNodeScript } from '../runtime/spawn.js';

const paths = getLocalPaths();
const runtimeState = await readRuntimeState(paths);

if (runtimeState) {
  process.env.T3X_API_URL ??= `${runtimeState.apiUrl}/api`;
  process.env.T3X_WEB_URL ??= runtimeState.webUrl;
}

await runNodeScript({
  name: 't3x',
  entryPath: paths.cliEntryPath,
  args: process.argv.slice(2),
  env: process.env,
});
