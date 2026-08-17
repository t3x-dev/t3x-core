import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const workspaceRoots = ['apps', 'packages'];

function workspacePackageJsonPaths() {
  return workspaceRoots.flatMap((root) => {
    const rootPath = path.join(repoRoot, root);
    return readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootPath, entry.name, 'package.json'))
      .filter((packagePath) => existsSync(packagePath));
  });
}

test('every TypeScript workspace package declares an isolated typecheck script', () => {
  const missing = workspacePackageJsonPaths()
    .filter((packagePath) => existsSync(path.join(path.dirname(packagePath), 'tsconfig.json')))
    .filter((packagePath) => {
      const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
      return typeof manifest.scripts?.typecheck !== 'string';
    })
    .map((packagePath) => path.relative(repoRoot, packagePath));

  assert.deepEqual(missing, []);
});
