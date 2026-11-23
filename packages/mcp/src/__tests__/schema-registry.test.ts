import { T3xApiError } from '@t3x-dev/api-client';
import { normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { beforeEach, expect, it, vi } from 'vitest';

const { listSchemaCatalog, readSchemaRegistryRelease, isApiBackend } = vi.hoisted(() => ({
  listSchemaCatalog: vi.fn(),
  readSchemaRegistryRelease: vi.fn(),
  isApiBackend: vi.fn(),
}));

vi.mock('../backend.js', () => ({
  getApiClient: () => ({ listSchemaCatalog, readSchemaRegistryRelease }),
  isApiBackend,
}));

import { schemaRegistryHandler } from '../tools/schema-registry.js';

const schema = {
  yschema: '0.1',
  name: 'Example',
  nodes: {
    entry: {
      requiredSlots: ['title'],
      slots: { title: { type: 'string', minLength: 1 } },
    },
  },
};
const manifest = { canonicalName: 'studio/example', version: '1.2.0', schema };
const artifactHash = await sha256CompositionValue(manifest);
const schemaHash = await sha256CompositionValue(normalizeYSchemaObject(schema));
const exact = {
  project_id: 'project-1',
  source_project_id: 'source-2',
  canonical_name: manifest.canonicalName,
  version: manifest.version,
  artifact_hash: artifactHash,
};

function payload(result: Awaited<ReturnType<typeof schemaRegistryHandler>>) {
  return JSON.parse(result.content[0]!.text);
}

beforeEach(() => {
  vi.resetAllMocks();
  isApiBackend.mockReturnValue(true);
  readSchemaRegistryRelease.mockResolvedValue({ artifactHash, manifest });
});

it('lists one canonical name in the selected project with the supplied pagination', async () => {
  const catalog = { items: [], next_cursor: null, has_more: false };
  listSchemaCatalog.mockResolvedValue(catalog);
  expect(
    payload(
      await schemaRegistryHandler({
        action: 'list',
        project_id: exact.project_id,
        canonical_name: exact.canonical_name,
        cursor: 'page-token',
        limit: 4,
      })
    )
  ).toEqual(catalog);
  expect(listSchemaCatalog).toHaveBeenCalledExactlyOnceWith({
    projectId: exact.project_id,
    canonical_name: exact.canonical_name,
    cursor: 'page-token',
    q: undefined,
    limit: 4,
  });
});

it('returns the verified exact definition for the authorized release', async () => {
  const result = await schemaRegistryHandler({ ...exact, action: 'read', schema_hash: schemaHash });
  expect(payload(result)).toMatchObject({ ...exact, definition: schema, schema_hash: schemaHash });
  expect(readSchemaRegistryRelease).toHaveBeenCalledExactlyOnceWith({
    projectId: exact.project_id,
    sourceProjectId: exact.source_project_id,
    canonicalName: exact.canonical_name,
    version: exact.version,
    expectedHash: artifactHash,
  });
});

it('rejects both changed release bytes and a different historical definition digest', async () => {
  readSchemaRegistryRelease
    .mockResolvedValueOnce({ artifactHash, manifest: { ...manifest, description: 'Changed' } })
    .mockResolvedValueOnce({ artifactHash, manifest });
  for (const identity of [exact, { ...exact, schema_hash: artifactHash }]) {
    const result = await schemaRegistryHandler({ ...identity, action: 'read' });
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ error: { code: 'HASH_CONFLICT', status: 409 } });
  }
});

it('preserves missing, null, empty and numeric Content and accepts a valid string', async () => {
  const validate = async (entry: Record<string, unknown>) =>
    payload(await schemaRegistryHandler({ ...exact, action: 'validate', content: { entry } }))
      .validation;
  const missing = await validate({});
  expect(missing).toMatchObject({
    valid: true,
    ready: false,
    gaps: [{ code: 'REQUIRED_SLOT_MISSING', path: 'entry/title' }],
  });
  expect(await validate({ title: null })).toMatchObject({
    errors: [{ code: 'INVALID_TYPE', path: 'entry/title', details: { actual: 'null' } }],
  });
  expect(await validate({ title: '' })).toMatchObject({
    errors: [{ code: 'INVALID_LENGTH', path: 'entry/title', details: { actual: 0 } }],
  });
  expect(await validate({ title: 123 })).toMatchObject({
    errors: [{ code: 'INVALID_TYPE', path: 'entry/title', details: { actual: 'integer' } }],
  });
  expect(await validate({ title: 'Example title' })).toMatchObject({ valid: true, ready: true });
});

it('requires an exact version and preserves denial without falling back to another release', async () => {
  const invalid = await schemaRegistryHandler({ ...exact, action: 'read', version: 'latest' });
  expect(payload(invalid)).toMatchObject({ error: { code: 'INVALID_ARGUMENT', status: 400 } });
  expect(readSchemaRegistryRelease).not.toHaveBeenCalled();

  readSchemaRegistryRelease.mockRejectedValue(
    new T3xApiError('NOT_FOUND', 'The selected release is unavailable.', 404)
  );
  const denied = await schemaRegistryHandler({ ...exact, action: 'read' });
  expect(payload(denied)).toMatchObject({ error: { code: 'NOT_FOUND', status: 404 } });
  expect(readSchemaRegistryRelease).toHaveBeenCalledTimes(1);
});

it('reads exact Module manifests and reports that their contributions cannot validate Content', async () => {
  const module = {
    canonicalName: manifest.canonicalName,
    version: manifest.version,
    contribution: { nodes: {} },
  };
  const hash = await sha256CompositionValue(module);
  readSchemaRegistryRelease.mockResolvedValue({ artifactHash: hash, manifest: module });
  const selector = { ...exact, artifact_hash: hash };
  const read = await schemaRegistryHandler({ ...selector, action: 'read' });
  expect(payload(read)).toMatchObject({
    definition: null,
    manifest: { contribution: { nodes: {} } },
  });
  const validation = await schemaRegistryHandler({ ...selector, action: 'validate', content: {} });
  expect(payload(validation)).toMatchObject({ error: { code: 'SCHEMA_DEFINITION_UNAVAILABLE' } });
});
