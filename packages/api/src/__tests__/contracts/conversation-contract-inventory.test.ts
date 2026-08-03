import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import inventoryJson from '../../../contracts/conversation-contract-inventory.json';

type Compatibility = 'retained' | 'compatibility' | 'removal_candidate';

interface RouteEntry {
  method: string;
  path: string;
  source: string;
}

interface ConsumerEntry {
  kind: string;
  file: string;
  token: string;
}

interface ContractEntry {
  id: string;
  owner: string;
  compatibility: Compatibility;
  removal_gate: string;
  routes: RouteEntry[];
  consumers: ConsumerEntry[];
}

interface RelatedModuleEntry {
  file: string;
  owner: string;
  compatibility: Compatibility;
  reason: string;
}

interface CallerGuard {
  symbol: string;
  allowed_files: string[];
}

interface KnownContractGap {
  id: string;
  method: string;
  path: string;
  client_file: string;
  client_token: string;
  live_consumer_file: string;
  live_consumer_token: string;
  resolution_gate: string;
}

interface RetiredRoute {
  method: string;
  path: string;
  reason: string;
}

interface ContractInventory {
  schema_version: number;
  compatibility_states: Compatibility[];
  route_modules: string[];
  contracts: ContractEntry[];
  related_modules: RelatedModuleEntry[];
  known_contract_gaps: KnownContractGap[];
  retired_routes: RetiredRoute[];
  deprecated_caller_guards: CallerGuard[];
}

const inventory = inventoryJson as ContractInventory;
const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../../../../..');
const productionConsumerRoots = [
  'apps/web/src',
  'packages/api-client/src',
  'packages/mcp/src',
] as const;

function repositoryPath(path: string): string {
  return resolve(repositoryRoot, path);
}

function endpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`;
}

function extractRoutes(source: string): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  const openApiRoute =
    /method:\s*['"](get|post|put|patch|delete)['"],\s*path:\s*['"]([^'"]+)['"]/gi;
  const directRoute =
    /\b[A-Za-z][A-Za-z0-9]*Routes\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gi;

  for (const match of source.matchAll(openApiRoute)) {
    routes.push({ method: match[1], path: match[2] });
  }
  for (const match of source.matchAll(directRoute)) {
    routes.push({ method: match[1], path: match[2] });
  }
  return routes;
}

function productionFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = resolve(directory, entry);
    if (entry === '__tests__' || entry === 'node_modules' || entry === 'dist') return [];
    if (statSync(absolute).isDirectory()) return productionFiles(absolute);
    if (!/\.(?:ts|tsx|mts)$/.test(entry) || /\.(?:test|spec)\./.test(entry)) return [];
    return [absolute];
  });
}

describe('conversation-adjacent contract inventory', () => {
  it('assigns every audited route exactly one owner and removal gate', () => {
    expect(inventory.schema_version).toBe(1);
    expect(inventory.compatibility_states).toEqual([
      'retained',
      'compatibility',
      'removal_candidate',
    ]);

    const declaredRoutes = inventory.contracts.flatMap((contract) =>
      contract.routes.map((route) => ({ contract, route }))
    );
    const declaredKeys = declaredRoutes.map(({ route }) => endpointKey(route.method, route.path));

    expect(new Set(declaredKeys).size).toBe(declaredKeys.length);
    for (const { contract, route } of declaredRoutes) {
      expect(contract.owner).not.toBe('');
      expect(contract.removal_gate).not.toBe('');
      expect(inventory.compatibility_states).toContain(contract.compatibility);
      expect(inventory.route_modules).toContain(route.source);
    }
  });

  it('matches the exact routes implemented by every audited capability module', () => {
    const implemented = inventory.route_modules.flatMap((sourceFile) => {
      const source = readFileSync(repositoryPath(sourceFile), 'utf8');
      return extractRoutes(source).map((route) => endpointKey(route.method, route.path));
    });
    const declared = inventory.contracts.flatMap((contract) =>
      contract.routes.map((route) => endpointKey(route.method, route.path))
    );

    expect([...new Set(implemented)].sort()).toEqual([...declared].sort());
  });

  it('classifies every route module that carries conversation identity', () => {
    const routesDirectory = repositoryPath('packages/api/src/routes');
    const classified = new Set([
      ...inventory.route_modules,
      ...inventory.related_modules.map((entry) => entry.file),
    ]);
    const conversationAware = readdirSync(routesDirectory)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => `packages/api/src/routes/${file}`)
      .filter((file) =>
        /conversation_id|conversationId|source_conversation_id|sourceConversationId/.test(
          readFileSync(repositoryPath(file), 'utf8')
        )
      );

    expect(conversationAware.filter((file) => !classified.has(file))).toEqual([]);
    for (const related of inventory.related_modules) {
      expect(related.owner).not.toBe('');
      expect(related.reason).not.toBe('');
      expect(inventory.compatibility_states).toContain(related.compatibility);
    }
  });

  it('keeps every declared source and consumer anchored to code', () => {
    for (const contract of inventory.contracts) {
      for (const route of contract.routes) {
        expect(existsSync(repositoryPath(route.source)), route.source).toBe(true);
      }
      for (const consumer of contract.consumers) {
        expect(existsSync(repositoryPath(consumer.file)), consumer.file).toBe(true);
        expect(readFileSync(repositoryPath(consumer.file), 'utf8'), consumer.file).toContain(
          consumer.token
        );
      }
    }
  });

  it('keeps typed-client contract gaps explicit until they are resolved', () => {
    const implemented = new Set(
      inventory.contracts.flatMap((contract) =>
        contract.routes.map((route) => endpointKey(route.method, route.path))
      )
    );

    for (const gap of inventory.known_contract_gaps) {
      expect(gap.id).not.toBe('');
      expect(gap.resolution_gate).not.toBe('');
      expect(implemented.has(endpointKey(gap.method, gap.path)), gap.id).toBe(false);
      expect(readFileSync(repositoryPath(gap.client_file), 'utf8'), gap.id).toContain(
        gap.client_token
      );
      expect(readFileSync(repositoryPath(gap.live_consumer_file), 'utf8'), gap.id).toContain(
        gap.live_consumer_token
      );
    }
  });

  it('prevents retired compatibility routes from being reintroduced', () => {
    const routesDirectory = repositoryPath('packages/api/src/routes');
    const implemented = new Set(
      readdirSync(routesDirectory)
        .filter((file) => file.endsWith('.ts'))
        .flatMap((file) =>
          extractRoutes(readFileSync(resolve(routesDirectory, file), 'utf8')).map((route) =>
            endpointKey(route.method, route.path)
          )
        )
    );

    for (const route of inventory.retired_routes) {
      expect(route.reason).not.toBe('');
      expect(implemented.has(endpointKey(route.method, route.path)), route.path).toBe(false);
    }
  });

  it('does not allow deprecated client symbols to gain undeclared first-party callers', () => {
    const files = productionConsumerRoots.flatMap((root) => productionFiles(repositoryPath(root)));

    for (const guard of inventory.deprecated_caller_guards) {
      const observed = files
        .filter((file) => readFileSync(file, 'utf8').includes(guard.symbol))
        .map((file) => relative(repositoryRoot, file).replaceAll('\\', '/'))
        .sort();
      expect(observed, guard.symbol).toEqual([...guard.allowed_files].sort());
    }
  });

  it('does not pull the protocol kernel into an application migration', () => {
    const referencedFiles = [
      ...inventory.route_modules,
      ...inventory.related_modules.map((entry) => entry.file),
      ...inventory.contracts.flatMap((contract) => [
        ...contract.routes.map((route) => route.source),
        ...contract.consumers.map((consumer) => consumer.file),
      ]),
    ];

    expect(referencedFiles.some((file) => file.startsWith('packages/transition/'))).toBe(false);
  });
});
