#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 't3x-local-smoke-'));
const packDir = path.join(tempRoot, 'packs');
const installDir = path.join(tempRoot, 'install');
const homeDir = path.join(tempRoot, 'home');
const dataDir = path.join(tempRoot, 'data');
const apiPort = process.env.T3X_LOCAL_SMOKE_API_PORT ?? '8041';
const webPort = process.env.T3X_LOCAL_SMOKE_WEB_PORT ?? '3041';
const runtimeMirror = path.join(repoRoot, 'apps', 'local', 'runtime-artifacts');

const packageDirs = [path.join('packages', 'yops'), path.join('apps', 'local')];

try {
  await fs.mkdir(packDir, { recursive: true });
  await fs.mkdir(installDir, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });

  for (const relativeDir of packageDirs) {
    run('npm', ['pack', '--json', '--pack-destination', packDir], {
      cwd: path.join(repoRoot, relativeDir),
    });
  }

  const tarballs = (await fs.readdir(packDir))
    .filter((name) => name.endsWith('.tgz'))
    .sort()
    .map((name) => path.join(packDir, name));

  const localTarball = tarballs.find((filePath) => filePath.includes('t3x-dev-local-'));
  const yopsTarball = tarballs.find((filePath) => filePath.includes('t3x-dev-yops-'));

  if (!localTarball) {
    throw new Error(`Could not find @t3x-dev/local tarball in ${packDir}`);
  }
  if (!yopsTarball) {
    throw new Error(`Could not find @t3x-dev/yops tarball in ${packDir}`);
  }

  run('npm', ['init', '-y'], { cwd: installDir });
  run('npm', ['install', yopsTarball, localTarball], {
    cwd: installDir,
    env: {
      ...process.env,
      T3X_LOCAL_RUNTIME_MIRROR: runtimeMirror,
    },
  });

  const runtimeEnv = {
    ...process.env,
    HOME: homeDir,
    T3X_DATA_DIR: dataDir,
  };

  run('npm', ['exec', '--', 't3x-local', 'doctor'], {
    cwd: installDir,
    env: runtimeEnv,
  });
  run('npm', ['exec', '--', 't3x-local', 'start', '--api-port', apiPort, '--web-port', webPort], {
    cwd: installDir,
    env: runtimeEnv,
  });
  run('npm', ['exec', '--', 't3x', 'health'], {
    cwd: installDir,
    env: runtimeEnv,
  });
  run('npm', ['exec', '--', 't3x-local', 'doctor'], {
    cwd: installDir,
    env: runtimeEnv,
  });
  run('npm', ['exec', '--', 't3x-local', 'stop'], {
    cwd: installDir,
    env: runtimeEnv,
  });
  run('npm', ['exec', '--', 't3x-local', 'reset'], {
    cwd: installDir,
    env: runtimeEnv,
  });

  console.log(`[smoke-local-install] Passed in ${installDir}`);
} finally {
  if (process.env.T3X_LOCAL_SMOKE_KEEP_TEMP !== '1') {
    await fs.rm(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`[smoke-local-install] Kept temp dir ${tempRoot}`);
  }
}

function run(command, args, options) {
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
}
