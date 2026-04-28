import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TEST_PORTS: Record<string, number> = {
  storage: 5446,
  api: 5447,
};

function findRepoRoot(startDir = process.cwd()): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

function getWorkspacePackageKey(cwd = process.cwd()): string {
  const root = findRepoRoot(cwd);
  const rel = path.relative(root, cwd);
  const parts = rel.split(path.sep);
  if ((parts[0] === 'packages' || parts[0] === 'apps') && parts[1]) return parts[1];
  return 'default';
}

export function getTestPostgresPort(): number {
  const explicit = parseInt(process.env.T3X_TEST_PG_PORT || '', 10);
  if (Number.isFinite(explicit)) return explicit;

  const packageKey = getWorkspacePackageKey();
  return DEFAULT_TEST_PORTS[packageKey] ?? 5446;
}

export function getTestPostgresDataDir(): string {
  if (process.env.T3X_TEST_PG_DATA_DIR) return process.env.T3X_TEST_PG_DATA_DIR;

  const packageKey = getWorkspacePackageKey();
  return `.t3x/test-pg-data/${packageKey}`;
}

export function resolveRepoRelativePath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  return path.resolve(findRepoRoot(), inputPath);
}
