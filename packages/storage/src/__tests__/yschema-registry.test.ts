import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertProject } from '../queries/projects';
import {
  findYSchemaCompositionSnapshot,
  listYSchemaArtifactVersions,
  saveYSchemaCompositionSnapshot,
  upsertYSchemaArtifactVersion,
} from '../queries/yschema-registry';
import { createTestDB, testData } from './setup';

describe('YSchema Registry storage', () => {
  let db: AnyDB;
  let cleanup: () => Promise<void>;
  let projectId: string;

  beforeAll(async () => {
    const setup = await createTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
    const project = await insertProject(db, testData.project({ name: 'YSchema Registry Test' }));
    projectId = project.projectId;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('keeps private Artifacts project-scoped while public Registry remains visible', async () => {
    await publishArtifact({
      canonicalName: 'test/public-module',
      visibility: 'official',
      artifactHash: `sha256:${'1'.repeat(64)}`,
    });
    await publishArtifact({
      canonicalName: 'test/private-module',
      visibility: 'private',
      artifactHash: `sha256:${'2'.repeat(64)}`,
      ownerProjectId: projectId,
    });

    const publicPage = await listYSchemaArtifactVersions(db, { family: 'prd', limit: 100 });
    const projectPage = await listYSchemaArtifactVersions(db, {
      project_id: projectId,
      family: 'prd',
      limit: 100,
    });

    expect(publicPage.items.map((item) => item.canonicalName)).toContain('test/public-module');
    expect(publicPage.items.map((item) => item.canonicalName)).not.toContain('test/private-module');
    expect(projectPage.items.map((item) => item.canonicalName)).toEqual(
      expect.arrayContaining(['test/public-module', 'test/private-module'])
    );
  });

  it('rejects replacement content for an already published Artifact version', async () => {
    const input = {
      canonicalName: 'test/immutable-module',
      visibility: 'official' as const,
      artifactHash: `sha256:${'3'.repeat(64)}`,
    };
    await publishArtifact(input);

    await expect(
      publishArtifact({ ...input, artifactHash: `sha256:${'4'.repeat(64)}` })
    ).rejects.toThrow('is immutable');
  });

  it('stores and resolves an exact immutable Composition snapshot', async () => {
    const snapshot = await saveYSchemaCompositionSnapshot(db, {
      snapshot_id: 'yscs_test_registry',
      project_id: projectId,
      composition_id: 'composition:test-registry',
      composition_revision: 2,
      composition_hash: `sha256:${'5'.repeat(64)}`,
      compiled_schema_hash: `sha256:${'6'.repeat(64)}`,
      compiler_version: 'yschema-composition@1',
      manifest_json: { id: 'composition:test-registry', revision: 2 },
      schema_json: { name: 'test/schema', version: 'r2', description: 'Snapshot', nodes: {} },
      render_plan_json: [],
      origins_json: {},
    });

    expect(snapshot?.compositionHash).toBe(`sha256:${'5'.repeat(64)}`);
    await expect(
      saveYSchemaCompositionSnapshot(db, {
        snapshot_id: 'yscs_test_registry_conflict',
        project_id: projectId,
        composition_id: 'composition:test-registry',
        composition_revision: 2,
        composition_hash: `sha256:${'7'.repeat(64)}`,
        compiled_schema_hash: `sha256:${'6'.repeat(64)}`,
        compiler_version: 'yschema-composition@1',
        manifest_json: {},
        schema_json: {},
        render_plan_json: [],
        origins_json: {},
      })
    ).rejects.toThrow('is immutable');

    const restored = await findYSchemaCompositionSnapshot(db, {
      project_id: projectId,
      composition_id: 'composition:test-registry',
      composition_revision: 2,
      compiled_schema_hash: `sha256:${'6'.repeat(64)}`,
    });
    expect(restored?.schemaJson).toMatchObject({ name: 'test/schema', version: 'r2' });
  });

  function publishArtifact(input: {
    canonicalName: string;
    visibility: 'official' | 'private';
    artifactHash: string;
    ownerProjectId?: string;
  }) {
    const id = input.canonicalName.replace('/', '_');
    return upsertYSchemaArtifactVersion(db, {
      artifact_id: `ysa_${id}`,
      artifact_version_id: `ysav_${id}_1_0_0`,
      canonical_name: input.canonicalName,
      family: 'prd',
      kind: 'module',
      owner_project_id: input.ownerProjectId,
      visibility: input.visibility,
      version: '1.0.0',
      status: 'active',
      manifest_json: {
        apiVersion: 't3x.dev/yschema-module/v1',
        canonicalName: input.canonicalName,
        version: '1.0.0',
      },
      artifact_hash: input.artifactHash,
      path_count: 1,
      provides: ['test.capability'],
      requires: [],
    });
  }
});
