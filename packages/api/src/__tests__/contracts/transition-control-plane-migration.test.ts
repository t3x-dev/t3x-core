import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import inventoryJson from '../../../contracts/transition-control-plane-migration.json';

type FileToken = { file: string; token: string };
type Route = { method: string; path: string; source: string };
type CompatibilityContract = {
  id: string;
  state: string;
  routes: Route[];
  application_sources: string[];
  writer_sources: string[];
  consumers: FileToken[];
  migration_proofs?: FileToken[];
  replacement: string;
  removal_gate: string;
};

const inventory = inventoryJson as {
  schema_version: number;
  canonical: {
    route_source: string;
    application_sources: string[];
    writer_sources: string[];
    actions: Array<{
      id: string;
      method: string;
      path: string;
      scopes: string[];
      client_method: string;
    }>;
  };
  compatibility_contracts: CompatibilityContract[];
};
const repositoryRoot = fileURLToPath(new URL('../../../../..', import.meta.url));

async function repositoryFile(path: string): Promise<string> {
  return readFile(`${repositoryRoot}/${path}`, 'utf8');
}

async function productionTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const files: string[] = [];
  for (const entry of entries) {
    if (['dist', 'node_modules', '__tests__'].includes(entry)) continue;
    const absolute = `${directory}/${entry}`;
    const metadata = await stat(absolute);
    if (metadata.isDirectory()) {
      files.push(...(await productionTypeScriptFiles(absolute)));
    } else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\.(?:ts|tsx)$/.test(entry)) {
      files.push(absolute);
    }
  }
  return files;
}

function repositoryPath(absolute: string): string {
  return absolute.slice(repositoryRoot.length + 1);
}

describe('Transition control-plane migration inventory', () => {
  it('pins all six canonical actions, scopes, and shared-client methods', async () => {
    expect(inventory.schema_version).toBe(1);
    expect(inventory.canonical.actions.map((action) => action.id)).toEqual([
      'propose',
      'inspect',
      'verify',
      'statement',
      'decide',
      'commit',
    ]);

    const routeSource = await repositoryFile(inventory.canonical.route_source);
    const clientSource = await repositoryFile('packages/api-client/src/client.ts');
    for (const source of inventory.canonical.application_sources) {
      expect((await repositoryFile(source)).length, source).toBeGreaterThan(0);
    }
    for (const action of inventory.canonical.actions) {
      expect(routeSource, action.id).toContain(`method: '${action.method.toLowerCase()}'`);
      expect(routeSource, action.id).toContain(`path: '${action.path}'`);
      for (const scope of action.scopes) expect(routeSource, action.id).toContain(scope);
      expect(clientSource, action.id).toContain(action.client_method);
    }
  });

  it('keeps compatibility routes, consumers, and retirement gates explicit', async () => {
    for (const contract of inventory.compatibility_contracts) {
      expect(contract.replacement.length, contract.id).toBeGreaterThan(20);
      expect(contract.removal_gate.length, contract.id).toBeGreaterThan(20);
      for (const route of contract.routes) {
        const source = await repositoryFile(route.source);
        expect(source, `${contract.id}:${route.path}`).toContain(
          `method: '${route.method.toLowerCase()}'`
        );
        expect(source, `${contract.id}:${route.path}`).toContain(`path: '${route.path}'`);
      }
      for (const source of contract.application_sources) {
        expect((await repositoryFile(source)).length, `${contract.id}:${source}`).toBeGreaterThan(
          0
        );
      }
      for (const consumer of contract.consumers) {
        expect(await repositoryFile(consumer.file), `${contract.id}:${consumer.file}`).toContain(
          consumer.token
        );
      }
      for (const proof of contract.migration_proofs ?? []) {
        expect(await repositoryFile(proof.file), `${contract.id}:${proof.file}`).toContain(
          proof.token
        );
      }
    }
  });

  it('classifies every production caller of the CommitV2 storage primitive', async () => {
    const files = (
      await Promise.all(
        ['apps', 'packages'].map((root) => productionTypeScriptFiles(`${repositoryRoot}/${root}`))
      )
    ).flat();
    const primitiveDefinition = 'packages/storage/src/queries/transition-commits.ts';
    const discovered: string[] = [];
    for (const file of files) {
      const path = repositoryPath(file);
      if (path === primitiveDefinition) continue;
      if (/\bcreateTransitionCommit\s*\(/.test(await readFile(file, 'utf8'))) discovered.push(path);
    }

    const classified = [
      ...inventory.canonical.writer_sources,
      ...inventory.compatibility_contracts.flatMap((contract) => contract.writer_sources),
    ];
    expect(discovered.sort()).toEqual([...new Set(classified)].sort());
  });
});
