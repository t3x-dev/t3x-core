import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../../../..', import.meta.url));
const apiRoot = `${repositoryRoot}/packages/api/src`;
const rawCredentialAllowlist = new Set([
  'packages/api/src/middleware/auth.ts',
  'packages/api/src/middleware/rate-limit.ts',
  'packages/api/src/middleware/response-cache-policy.ts',
  'packages/api/src/lib/request-principal.ts',
  'packages/api/src/routes/api-keys.openapi.ts',
  'packages/api/src/routes/auth-me.openapi.ts',
]);
const reservedIdentityHeaders = [
  'X-T3X-Actor',
  'X-T3X-Owner',
  'X-T3X-Role',
  'X-T3X-Namespace',
  'X-T3X-Scopes',
];

async function productionTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const files: string[] = [];
  for (const entry of entries) {
    if (['dist', 'node_modules', '__tests__'].includes(entry)) continue;
    const absolute = `${directory}/${entry}`;
    const metadata = await stat(absolute);
    if (metadata.isDirectory()) files.push(...(await productionTypeScriptFiles(absolute)));
    else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\.(?:ts|tsx)$/.test(entry))
      files.push(absolute);
  }
  return files;
}

function repositoryPath(absolute: string): string {
  return absolute.slice(repositoryRoot.length + 1);
}

describe('RequestPrincipal ingress boundary', () => {
  it('keeps raw API-key context out of authorization consumers', async () => {
    const offenders: string[] = [];
    for (const file of await productionTypeScriptFiles(apiRoot)) {
      const path = repositoryPath(file);
      if (rawCredentialAllowlist.has(path)) continue;
      if (/(?:c|context)\.get\(['"]apiKey['"]\)/.test(await readFile(file, 'utf8'))) {
        offenders.push(path);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  it('keeps clients from sending server-controlled identity headers', async () => {
    const offenders: string[] = [];
    for (const root of ['apps/web', 'apps/cli', 'apps/mcp', 'packages/mcp']) {
      for (const file of await productionTypeScriptFiles(`${repositoryRoot}/${root}`)) {
        const source = await readFile(file, 'utf8');
        for (const header of reservedIdentityHeaders) {
          if (source.includes(header)) offenders.push(`${repositoryPath(file)}:${header}`);
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});
