import type { AnyDB } from '@t3x-dev/storage';
import {
  addSchemaStudioCandidate,
  insertProject,
  upsertYSchemaArtifactVersion,
} from '@t3x-dev/storage';
import { sha256CompositionValue } from '@t3x-dev/yschema';
import type { Context } from 'hono';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { compileStudioSelection } from '../lib/schema-studio-preview';
import { resolveWorkspaceSchemaEditBasis } from '../lib/workspace-schema-edit-basis';
import { resolveBuiltInYSchema } from '../lib/yschema-registry';
import { setupTestDB } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
let projectId: string;
beforeAll(async () => {
  ({ db, cleanup } = await setupTestDB());
  projectId = (await insertProject(db, { name: 'Default Schema exact source' })).projectId;
});
afterAll(async () => {
  await cleanup();
});

it('does not exempt an arbitrary published Schema from its compilation integrity check', async () => {
  const manifest = {
    apiVersion: 't3x.dev/yschema-blueprint/v1',
    schema: resolveBuiltInYSchema('t3x/prd', 'v2'),
    license: 'Apache-2.0',
  };
  const hash = await sha256CompositionValue(manifest);
  await upsertYSchemaArtifactVersion(db, {
    artifact_id: 'unverified-release',
    artifact_version_id: 'unverified-release-v2',
    canonical_name: 'test/unverified',
    version: 'v2',
    family: 'general',
    kind: 'schema',
    visibility: 'official',
    status: 'active',
    manifest_json: manifest,
    artifact_hash: hash,
    path_count: 1,
    provides: [],
    requires: [],
  });
  await addSchemaStudioCandidate(db, {
    id: 'unverified-source',
    projectId,
    sourceProjectId: null,
    canonicalName: 'test/unverified',
    version: 'v2',
    artifactVersionId: 'unverified-release-v2',
    artifactHash: hash,
  });
  await expect(
    compileStudioSelection({} as Context, db, projectId, ['unverified-source'])
  ).rejects.toThrow('integrity');
});

it('recovers the exact version of a new Workspace default without requiring Studio first', async () => {
  const schema = resolveBuiltInYSchema('t3x/prd', 'v2')!;
  const basis = await resolveWorkspaceSchemaEditBasis(
    {} as Context,
    db,
    projectId,
    { schemaBindings: [{ canonicalName: 't3x/prd', version: 'v2', mode: 'pinned' }] },
    schema
  );
  expect(basis.schema).toEqual(schema);
  expect(basis.sources).toEqual([
    expect.objectContaining({ canonicalName: 't3x/prd', version: 'v2', projectId: null }),
  ]);
  const source = basis.sources[0]!;
  await addSchemaStudioCandidate(db, {
    id: 'default-source',
    projectId,
    sourceProjectId: source.projectId,
    canonicalName: source.canonicalName,
    version: source.version,
    artifactVersionId: source.artifactVersionId,
    artifactHash: source.hash,
  });
  expect(
    (await compileStudioSelection({} as Context, db, projectId, ['default-source'])).schemaHash
  ).toBe(basis.schemaHash);
});

it('never replaces an edited or unavailable bound snapshot with the built-in default', async () => {
  const schema = resolveBuiltInYSchema('t3x/prd', 'v2')!;
  await expect(
    resolveWorkspaceSchemaEditBasis(
      {} as Context,
      db,
      projectId,
      {
        schemaBindings: [
          {
            canonicalName: 't3x/prd',
            version: 'v2',
            compositionId: 'missing-snapshot',
            compositionRevision: 1,
          },
        ],
      },
      schema
    )
  ).rejects.toThrow('exact bound Schema snapshot');
});
