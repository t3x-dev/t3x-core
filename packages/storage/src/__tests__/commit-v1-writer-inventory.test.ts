import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import inventoryJson from '../../contracts/commit-v1-writer-inventory.json';

type WriterInventory = {
  schema_version: number;
  purpose: string;
  target: {
    writable_format: string;
    legacy_v1: string;
    tracking_issue: string;
  };
  dispositions: unknown[];
  writers: unknown[];
};

const inventory = inventoryJson as WriterInventory;
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const scannedRoots = ['apps', 'packages'];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const files: string[] = [];
  for (const entry of entries) {
    if (['dist', 'node_modules', '__tests__'].includes(entry)) continue;
    const absolute = `${directory}/${entry}`;
    const metadata = await stat(absolute);
    if (metadata.isDirectory()) {
      files.push(...(await sourceFiles(absolute)));
    } else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\.(?:ts|tsx)$/.test(entry)) {
      files.push(absolute);
    }
  }
  return files;
}

function repositoryPath(absolute: string): string {
  return absolute.slice(repositoryRoot.length + 1);
}

describe('CommitV1 writer inventory', () => {
  it('pins the CommitV2 hard cut and an empty writer inventory', () => {
    expect(inventory.schema_version).toBe(1);
    expect(inventory.target).toEqual({
      writable_format: 't3x/commit/v2',
      legacy_v1: 'unsupported',
      tracking_issue: '#1308',
    });
    expect(inventory.dispositions).toEqual([]);
    expect(inventory.writers).toEqual([]);
  });

  it('fails when any production CommitV1 writer appears', async () => {
    const files = (
      await Promise.all(scannedRoots.map((root) => sourceFiles(`${repositoryRoot}/${root}`)))
    ).flat();
    const discovered: string[] = [];
    for (const file of files) {
      if (/\bcreateCommit\s*\(/.test(await readFile(file, 'utf8'))) {
        discovered.push(repositoryPath(file));
      }
    }
    expect(discovered.sort()).toEqual([]);
  });
});
