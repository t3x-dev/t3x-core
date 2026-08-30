import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type InventorySource = {
  file: string;
  feature: string;
  status: string;
  observedCount: number;
  coveredCount?: number;
};

type Inventory = {
  version: number;
  patternVersion: number;
  scope: string[];
  excludedAdapterRoots: string[];
  totalObservedCalls: number;
  sources: InventorySource[];
};

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const inventoryPath = join(
  repositoryRoot,
  'packages/api/contracts/inference-invocation-inventory.json'
);
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as Inventory;

const invocationPattern =
  /\.generate(?:FromPrompt|Structured|WithTools)?\s*\(|generateLeafOutput\s*\(|generateWithFallback\s*\(|api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/;

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'dist' || entry.name === 'scripts')
        return [];
      return listTypeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function isExcludedAdapter(file: string): boolean {
  return inventory.excludedAdapterRoots.some(
    (root) => file === root || file.startsWith(`${root}/`)
  );
}

function countInvocationLines(file: string): number {
  return readFileSync(join(repositoryRoot, file), 'utf8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('export async function')
      ) {
        return false;
      }
      return invocationPattern.test(line);
    }).length;
}

function scanInvocationCounts(): Map<string, number> {
  const result = new Map<string, number>();
  for (const scope of inventory.scope) {
    for (const absoluteFile of listTypeScriptFiles(join(repositoryRoot, scope))) {
      const file = relative(repositoryRoot, absoluteFile);
      if (isExcludedAdapter(file)) continue;
      const count = countInvocationLines(file);
      if (count > 0) result.set(file, count);
    }
  }
  return result;
}

describe('server-side inference invocation inventory', () => {
  it('matches every direct model call so new bypasses fail qualification', () => {
    expect(inventory.version).toBe(1);
    expect(inventory.patternVersion).toBe(1);
    const declared = new Map(
      inventory.sources.map((source) => [source.file, source.observedCount])
    );
    const observed = scanInvocationCounts();

    expect(Object.fromEntries(observed)).toEqual(Object.fromEntries(declared));
    expect([...observed.values()].reduce((sum, count) => sum + count, 0)).toBe(
      inventory.totalObservedCalls
    );
  });

  it('records the first fully migrated call family', () => {
    const chat = inventory.sources.find(
      (source) => source.file === 'packages/api/src/routes/chat.openapi.ts'
    );
    expect(chat).toMatchObject({ status: 'migrated', coveredCount: 7, observedCount: 7 });
  });
});
