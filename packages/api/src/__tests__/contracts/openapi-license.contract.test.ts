import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';

function collectOperationTags(spec: unknown): string[] {
  if (!spec || typeof spec !== 'object' || !('paths' in spec)) {
    return [];
  }

  const paths = (spec as { paths?: unknown }).paths;
  if (!paths || typeof paths !== 'object') {
    return [];
  }

  const tags = new Set<string>();
  for (const pathItem of Object.values(paths)) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }

    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== 'object' || !('tags' in operation)) {
        continue;
      }

      const operationTags = (operation as { tags?: unknown }).tags;
      if (!Array.isArray(operationTags)) {
        continue;
      }

      for (const tag of operationTags) {
        if (typeof tag === 'string') {
          tags.add(tag);
        }
      }
    }
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
}

function collectDeclaredTags(spec: unknown): string[] {
  if (!spec || typeof spec !== 'object' || !('tags' in spec)) {
    return [];
  }

  const tags = (spec as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => (tag && typeof tag === 'object' && 'name' in tag ? tag.name : undefined))
    .filter((name): name is string => typeof name === 'string')
    .sort((a, b) => a.localeCompare(b));
}

describe('OpenAPI metadata contract', () => {
  it('publishes the repository license in the API spec metadata', async () => {
    const { app } = createApp({ skipBuiltinAuth: true });
    const res = await app.request('/api/openapi.json');

    expect(res.status).toBe(200);

    const spec = await res.json();
    expect(spec.info.license).toEqual({
      name: 'Apache-2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0',
    });
  });

  it('declares every route tag in the top-level OpenAPI metadata', async () => {
    const { app } = createApp({
      skipBuiltinAuth: true,
      enableLocalConfigRoutes: true,
    });
    const res = await app.request('/api/openapi.json');

    expect(res.status).toBe(200);

    const spec = await res.json();
    const declaredTags = new Set(collectDeclaredTags(spec));
    const missingTags = collectOperationTags(spec).filter((tag) => !declaredTags.has(tag));

    expect(missingTags).toEqual([]);
  });
});
