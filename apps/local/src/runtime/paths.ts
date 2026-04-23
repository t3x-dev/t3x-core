import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export type RuntimeSource = 'workspace' | 'installed';

export interface LocalPaths {
  packageDir: string;
  repoRoot: string | null;
  appHomeDir: string;
  defaultDataDir: string;
  localRuntimeRoot: string;
  runtimeManifestPath: string;
  installedRuntimeDir: string;
  runtimeSource: RuntimeSource;
  apiEntryPath: string;
  webStandaloneDir: string;
  webStandaloneServerPath: string;
  webStaticDir: string;
  webPublicDir: string;
  cliEntryPath: string;
  mcpEntryPath: string;
}

export interface MissingArtifact {
  label: string;
  path: string;
}

export function getLocalPaths(): LocalPaths {
  const packageDir = findLocalPackageDir(path.dirname(fileURLToPath(import.meta.url)));
  const repoRoot = findRepoRoot(packageDir);
  const appHomeDir = resolveAppHomeDir(repoRoot);
  const runtimeManifestPath = path.join(packageDir, 'runtime-manifest.json');
  const installedRuntimeDir = resolveInstalledRuntimeDir(packageDir);
  const runtimeSource = resolveRuntimeSource(repoRoot, installedRuntimeDir);

  return {
    packageDir,
    repoRoot,
    appHomeDir,
    defaultDataDir: path.join(appHomeDir, 'pg-data'),
    localRuntimeRoot: path.join(appHomeDir, 'local-runtime'),
    runtimeManifestPath,
    installedRuntimeDir,
    runtimeSource,
    apiEntryPath:
      runtimeSource === 'installed'
        ? path.join(installedRuntimeDir, 'api', 'dist', 'index.js')
        : path.join(assertRepoRoot(repoRoot), 'apps', 'api', 'dist', 'index.js'),
    webStandaloneDir:
      runtimeSource === 'installed'
        ? path.join(installedRuntimeDir, 'web', 'standalone')
        : path.join(assertRepoRoot(repoRoot), 'apps', 'web', '.next', 'standalone'),
    webStandaloneServerPath:
      runtimeSource === 'installed'
        ? path.join(installedRuntimeDir, 'web', 'standalone', 'apps', 'web', 'server.js')
        : path.join(
            assertRepoRoot(repoRoot),
            'apps',
            'web',
            '.next',
            'standalone',
            'apps',
            'web',
            'server.js'
          ),
    webStaticDir:
      runtimeSource === 'installed'
        ? path.join(installedRuntimeDir, 'web', 'static')
        : path.join(assertRepoRoot(repoRoot), 'apps', 'web', '.next', 'static'),
    webPublicDir:
      runtimeSource === 'installed'
        ? path.join(installedRuntimeDir, 'web', 'public')
        : path.join(assertRepoRoot(repoRoot), 'apps', 'web', 'public'),
    cliEntryPath: resolvePackageBinEntry({
      packageName: '@t3x-dev/cli',
      binName: 't3x',
      repoRoot,
      workspaceRelativeDir: path.join('apps', 'cli'),
    }),
    mcpEntryPath: resolvePackageBinEntry({
      packageName: '@t3x-dev/mcp',
      binName: 't3x-mcp',
      repoRoot,
      workspaceRelativeDir: path.join('apps', 'mcp'),
    }),
  };
}

function findLocalPackageDir(startDir: string): string {
  let current = startDir;

  while (current !== path.dirname(current)) {
    const packageJsonPath = path.join(current, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
        name?: string;
      };

      if (packageJson.name === '@t3x-dev/local') {
        return current;
      }
    }

    current = path.dirname(current);
  }

  throw new Error(`Could not locate @t3x-dev/local package root above ${startDir}`);
}

export function getMissingStartArtifacts(paths: LocalPaths): MissingArtifact[] {
  const required: MissingArtifact[] = [
    { label: 'API runtime entry', path: paths.apiEntryPath },
    { label: 'Web standalone server', path: paths.webStandaloneServerPath },
    { label: 'Web static assets', path: paths.webStaticDir },
    { label: 'Web public assets', path: paths.webPublicDir },
  ];

  return required.filter((item) => !fs.existsSync(item.path));
}

export function formatMissingArtifacts(items: MissingArtifact[], paths: LocalPaths): string {
  const details = items.map((item) => `- ${item.label}: ${item.path}`).join('\n');
  const hint =
    paths.runtimeSource === 'installed'
      ? 'Reinstall `@t3x-dev/local`, or rerun the postinstall download with `T3X_LOCAL_RUNTIME_MIRROR` configured.'
      : 'Run `pnpm build:api-server` and `pnpm build:webui` from the repo root first.';

  return 'Missing local runtime artifacts required by `t3x-local start`.\n' + `${details}\n` + hint;
}

export function resolvePlatformKey(): string {
  return `${process.platform}-${process.arch}`;
}

function resolveRuntimeSource(repoRoot: string | null, installedRuntimeDir: string): RuntimeSource {
  if (process.env.T3X_LOCAL_RUNTIME_DIR) {
    return 'installed';
  }

  if (!repoRoot) {
    return 'installed';
  }

  return fs.existsSync(path.join(installedRuntimeDir, 'api', 'dist', 'index.js'))
    ? 'installed'
    : 'workspace';
}

function resolveAppHomeDir(repoRoot: string | null): string {
  if (repoRoot) {
    return path.join(repoRoot, '.t3x');
  }

  return path.join(os.homedir(), '.t3x');
}

function resolveInstalledRuntimeDir(packageDir: string): string {
  if (process.env.T3X_LOCAL_RUNTIME_DIR) {
    return path.resolve(process.env.T3X_LOCAL_RUNTIME_DIR);
  }

  return path.join(packageDir, 'runtime', resolvePlatformKey());
}

function findRepoRoot(startDir: string): string | null {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) &&
      fs.existsSync(path.join(current, 'apps', 'api', 'package.json')) &&
      fs.existsSync(path.join(current, 'apps', 'web', 'package.json')) &&
      fs.existsSync(path.join(current, 'apps', 'local', 'package.json'))
    ) {
      return current;
    }
    current = path.dirname(current);
  }

  return null;
}

function resolvePackageBinEntry(options: {
  packageName: string;
  binName: string;
  repoRoot: string | null;
  workspaceRelativeDir: string;
}): string {
  const installedPackageJsonPath = resolveInstalledPackageJson(options.packageName);

  if (installedPackageJsonPath) {
    return resolveBinFromPackageJson(installedPackageJsonPath, options.binName);
  }

  if (!options.repoRoot) {
    throw new Error(`Could not resolve installed package ${options.packageName}`);
  }

  return resolveBinFromPackageJson(
    path.join(options.repoRoot, options.workspaceRelativeDir, 'package.json'),
    options.binName
  );
}

function resolveInstalledPackageJson(packageName: string): string | null {
  try {
    const entryPath = require.resolve(packageName);
    return findNearestPackageJson(entryPath);
  } catch {
    return null;
  }
}

function resolveBinFromPackageJson(packageJsonPath: string, binName: string): string {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Missing package.json for ${binName}: ${packageJsonPath}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    bin?: string | Record<string, string>;
    name?: string;
  };

  const relativeEntry =
    typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName];

  if (!relativeEntry) {
    const packageName = packageJson.name ?? packageJsonPath;
    throw new Error(`Package ${packageName} does not declare a \`${binName}\` bin entry`);
  }

  return path.resolve(path.dirname(packageJsonPath), relativeEntry);
}

function findNearestPackageJson(startPath: string): string {
  let current = path.dirname(startPath);

  while (current !== path.dirname(current)) {
    const packageJsonPath = path.join(current, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath;
    }
    current = path.dirname(current);
  }

  throw new Error(`Could not locate package.json above ${startPath}`);
}

function assertRepoRoot(repoRoot: string | null): string {
  if (!repoRoot) {
    throw new Error('Workspace runtime source requested outside the monorepo');
  }

  return repoRoot;
}
