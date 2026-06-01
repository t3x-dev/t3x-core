#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertRuntimeLayout,
  ensureDir,
  fileExists,
  getLocalPackageDir,
  getPlatformKey,
  getRepoRoot,
  getRuntimeArtifactFileName,
  getRuntimeArtifactsDir,
  readJson,
} from './runtime-helpers.mjs';

const packageDir = getLocalPackageDir();
const repoRoot = getRepoRoot();
const localPackageJson = await readJson(path.join(packageDir, 'package.json'));
const platformKey = process.env.T3X_LOCAL_RUNTIME_PLATFORM ?? getPlatformKey();
const artifactDir = path.resolve(
  process.env.T3X_LOCAL_RUNTIME_OUTPUT_DIR ?? getRuntimeArtifactsDir(packageDir)
);
const artifactFileName = getRuntimeArtifactFileName(localPackageJson.version, platformKey);
const artifactPath = path.join(artifactDir, artifactFileName);
const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), 't3x-local-runtime-'));

const sources = {
  apiDist: path.join(repoRoot, 'apps', 'api', 'dist'),
  cliDist: path.join(repoRoot, 'apps', 'cli', 'dist'),
  mcpDist: path.join(repoRoot, 'apps', 'mcp', 'dist'),
  webStandalone: path.join(repoRoot, 'apps', 'web', '.next', 'standalone'),
  webStatic: path.join(repoRoot, 'apps', 'web', '.next', 'static'),
  webPublic: path.join(repoRoot, 'apps', 'web', 'public'),
};

const missingSources = [];
for (const [label, sourcePath] of Object.entries(sources)) {
  if (!(await fileExists(sourcePath))) {
    missingSources.push(`${label}: ${sourcePath}`);
  }
}

if (missingSources.length > 0) {
  throw new Error(
    'Missing runtime build outputs. Build API and Web before preparing the runtime tarball.\n' +
      missingSources.join('\n')
  );
}

try {
  await ensureDir(path.join(stagingDir, 'api'));
  await ensureDir(path.join(stagingDir, 'cli'));
  await ensureDir(path.join(stagingDir, 'mcp'));
  await ensureDir(path.join(stagingDir, 'web'));
  await ensureDir(artifactDir);

  await fs.cp(sources.apiDist, path.join(stagingDir, 'api', 'dist'), { recursive: true });
  await fs.cp(sources.cliDist, path.join(stagingDir, 'cli', 'dist'), { recursive: true });
  await fs.cp(sources.mcpDist, path.join(stagingDir, 'mcp', 'dist'), { recursive: true });
  await fs.cp(sources.webStandalone, path.join(stagingDir, 'web', 'standalone'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  await fs.cp(sources.webStatic, path.join(stagingDir, 'web', 'static'), { recursive: true });
  await fs.cp(sources.webPublic, path.join(stagingDir, 'web', 'public'), { recursive: true });

  await assertRuntimeLayout(stagingDir);

  const tarResult = spawnSync('tar', ['-czf', artifactPath, '-C', stagingDir, '.'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (tarResult.status !== 0) {
    throw new Error(`tar failed with exit code ${String(tarResult.status)}`);
  }

  console.log(`[prepare-runtime] Wrote ${artifactPath}`);
} finally {
  await fs.rm(stagingDir, { recursive: true, force: true });
}
