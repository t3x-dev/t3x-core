import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type CommitWriterInventory = {
  schema_version: number;
  issue: string;
  target: string;
  writers: string[];
};

type RefWriterInventory = {
  schema_version: number;
  issue: string;
  target: string;
  direct_mutators: string[];
  legacy_helper_callers: string[];
};

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const commitInventoryPath = fileURLToPath(
  new URL('../../contracts/commit-v1-writer-inventory.json', import.meta.url)
);
const refInventoryPath = fileURLToPath(
  new URL('../../contracts/ref-writer-inventory.json', import.meta.url)
);
const sourceExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const ignoredDirectories = new Set([
  '.git',
  '.next',
  '.turbo',
  '__tests__',
  'dist',
  'e2e',
  'node_modules',
]);

async function productionSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) ? [] : productionSourceFiles(path);
      }
      if (
        !entry.isFile() ||
        !sourceExtensions.has(extname(entry.name)) ||
        /(?:^|\.)test\.[^.]+$/.test(entry.name) ||
        /(?:^|\.)spec\.[^.]+$/.test(entry.name)
      ) {
        return [];
      }
      return [path];
    })
  );
  return files.flat();
}

async function matchingFiles(pattern: RegExp): Promise<string[]> {
  const roots = [resolve(repositoryRoot, 'apps'), resolve(repositoryRoot, 'packages')];
  const files = (await Promise.all(roots.map(productionSourceFiles))).flat();
  const matches: string[] = [];
  for (const path of files) {
    if (pattern.test(await readFile(path, 'utf8'))) {
      matches.push(relative(repositoryRoot, path));
    }
  }
  return matches.sort();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

describe('CommitV1 and ref writer inventory', () => {
  it('keeps the executable CommitV1 writer inventory exact while #1308 drives it to zero', async () => {
    const inventory = await readJson<CommitWriterInventory>(commitInventoryPath);
    expect(inventory).toMatchObject({ schema_version: 1, issue: '#1308' });
    expect(inventory.writers).toEqual([...inventory.writers].sort());
    await expect(matchingFiles(/\bcreateCommit\s*\(/)).resolves.toEqual(inventory.writers);
  });

  it('keeps direct ref mutations and the legacy head helper exhaustively named', async () => {
    const inventory = await readJson<RefWriterInventory>(refInventoryPath);
    expect(inventory).toMatchObject({ schema_version: 1, issue: '#1308' });
    expect(inventory.direct_mutators).toEqual([...inventory.direct_mutators].sort());
    expect(inventory.legacy_helper_callers).toEqual([...inventory.legacy_helper_callers].sort());
    await expect(matchingFiles(/\.set\(\s*\{\s*headCommitHash\b/)).resolves.toEqual(
      inventory.direct_mutators
    );
    await expect(matchingFiles(/\bupdateBranchHead\s*\(/)).resolves.toEqual(
      inventory.legacy_helper_callers
    );
  });
});
