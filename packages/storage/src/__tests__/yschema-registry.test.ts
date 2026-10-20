import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnyDB } from '../adapters';
import { insertPersonalNamespace } from '../queries/namespaces';
import { deleteProject, insertProject, permanentDeleteProject } from '../queries/projects';
import {
  findYSchemaArtifactVersion,
  findYSchemaCompositionSnapshot,
  listProjectYSchemaVersionHistory,
  listYSchemaArtifactVersions,
  publishYSchemaArtifactVersion,
  saveYSchemaCompositionSnapshot,
  updateYSchemaArtifactIdentity,
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

  it('retains public namespace releases after soft and permanent repository deletion without exposing private releases', async () => {
    const publisher = await insertPersonalNamespace(db, { slug: 'schema-publisher' });
    const other = await insertPersonalNamespace(db, { slug: 'other-publisher' });
    const project = await insertProject(db, {
      name: 'Release-origin',
      namespaceId: publisher.namespaceId,
    });
    const release = {
      artifact_id: 'retained-public-schema',
      artifact_version_id: 'retained-public-schema-v1',
      canonical_name: 'shared/retained-schema',
      family: 'open',
      kind: 'schema' as const,
      publisher_namespace_id: publisher.namespaceId,
      visibility: 'community' as const,
      version: '1.0.0',
      status: 'published' as const,
      manifest_json: { schema: { nodes: {} }, registry: { sourceProjectId: project.projectId } },
      artifact_hash: `sha256:${'a'.repeat(64)}`,
      path_count: 0,
      provides: [],
      requires: [],
    };
    const published = await publishYSchemaArtifactVersion(db, release);
    expect(published).toMatchObject({
      ownerProjectId: null,
      publisherNamespaceId: publisher.namespaceId,
    });
    const privateRelease = {
      ...release,
      artifact_id: 'retained-private-schema',
      artifact_version_id: 'retained-private-schema-v1',
      canonical_name: 'private/retained-schema',
      publisher_namespace_id: undefined,
      owner_project_id: project.projectId,
      visibility: 'private' as const,
    };
    await publishYSchemaArtifactVersion(db, privateRelease);
    await deleteProject(db, project.projectId);
    expect(
      await findYSchemaArtifactVersion(db, {
        canonical_name: release.canonical_name,
        version: '1.0.0',
      })
    ).toMatchObject({ artifactHash: published.artifactHash });
    expect(
      await findYSchemaArtifactVersion(db, {
        canonical_name: privateRelease.canonical_name,
        version: '1.0.0',
      })
    ).toBeNull();
    await permanentDeleteProject(db, project.projectId);
    expect(
      await findYSchemaArtifactVersion(db, {
        canonical_name: release.canonical_name,
        version: '1.0.0',
      })
    ).toMatchObject({ artifactHash: published.artifactHash, manifest: published.manifest });
    expect(
      await findYSchemaArtifactVersion(db, {
        canonical_name: privateRelease.canonical_name,
        version: '1.0.0',
        project_id: project.projectId,
      })
    ).toBeNull();
    await expect(
      publishYSchemaArtifactVersion(db, { ...release, publisher_namespace_id: other.namespaceId })
    ).rejects.toThrow('identity conflict');
    await expect(
      publishYSchemaArtifactVersion(db, { ...release, artifact_hash: `sha256:${'b'.repeat(64)}` })
    ).rejects.toThrow('immutable');
    // The publisher, not the removed project, can publish a subsequent immutable version.
    expect(
      await publishYSchemaArtifactVersion(db, {
        ...release,
        artifact_version_id: 'retained-public-schema-v2',
        version: '2.0.0',
        artifact_hash: `sha256:${'b'.repeat(64)}`,
      })
    ).toMatchObject({ version: '2.0.0', ownerProjectId: null });
  });

  it('publishes immutable project versions while retaining exact history', async () => {
    const canonicalName = `projects/${projectId}/prd`;
    const publishVersion = (version: string, hashCharacter: string) =>
      publishYSchemaArtifactVersion(db, {
        artifact_id: `ysa_project_${projectId}_prd`,
        artifact_version_id: `ysav_project_${projectId}_${version.replaceAll('.', '_')}`,
        canonical_name: canonicalName,
        family: 'prd',
        kind: 'core',
        owner_project_id: projectId,
        visibility: 'private',
        version,
        status: 'active',
        manifest_json: {
          apiVersion: 't3x.dev/yschema-core/v1',
          canonicalName,
          version,
          status: 'active',
          schema: { yschema: '0.1', name: canonicalName, version, nodes: {} },
        },
        artifact_hash: `sha256:${hashCharacter.repeat(64)}`,
        path_count: 0,
        provides: ['document-root'],
        requires: [],
      });

    await publishVersion('1.0.0', '8');
    await publishVersion('1.1.0', '9');

    const history = await listProjectYSchemaVersionHistory(db, {
      project_id: projectId,
      family: 'prd',
      kind: 'core',
    });
    expect(history.map((item) => [item.version, item.status])).toEqual([
      ['1.1.0', 'active'],
      ['1.0.0', 'deprecated'],
    ]);
    expect(history[1]?.manifest).toMatchObject({ version: '1.0.0' });

    const historical = await findYSchemaArtifactVersion(db, {
      canonical_name: canonicalName,
      version: '1.0.0',
      project_id: projectId,
    });
    expect(historical?.status).toBe('deprecated');
    expect(historical?.manifest).toMatchObject({ version: '1.0.0' });
  });

  it('keeps every published Schema version available without creating a current pointer', async () => {
    const canonicalName = `projects/${projectId}/versioned-schema`;
    const publishVersion = (version: string, hashCharacter: string) =>
      publishYSchemaArtifactVersion(db, {
        artifact_id: `ysa_versioned_${projectId}`,
        artifact_version_id: `ysav_versioned_${projectId}_${version.replaceAll('.', '_')}`,
        canonical_name: canonicalName,
        family: 'open',
        kind: 'schema',
        owner_project_id: projectId,
        visibility: 'private',
        version,
        status: 'published',
        manifest_json: {
          apiVersion: 't3x.dev/yschema-blueprint/v1',
          canonicalName,
          version,
          status: 'published',
        },
        artifact_hash: `sha256:${hashCharacter.repeat(64)}`,
        path_count: 0,
        provides: [],
        requires: [],
      });

    await publishVersion('1.0.0', 'b');
    // A lost response may retry the exact published version, not just an active Module.
    const retried = await publishVersion('1.0.0', 'b');
    expect(retried.artifactHash).toBe(`sha256:${'b'.repeat(64)}`);
    await expect(publishVersion('1.0.0', 'd')).rejects.toThrow('is immutable');
    await publishVersion('1.1.0', 'c');

    const history = await listProjectYSchemaVersionHistory(db, {
      project_id: projectId,
      kind: 'schema',
    });
    const versionedHistory = history.filter((item) => item.canonicalName === canonicalName);
    expect(versionedHistory.map((item) => [item.version, item.status])).toEqual([
      ['1.1.0', 'published'],
      ['1.0.0', 'published'],
    ]);
  });

  it('serializes first publication across owners and versions without mixing private identities', async () => {
    const otherProject = await insertProject(db, testData.project({ name: 'Other publisher' }));
    const canonicalName = `projects/${projectId}/concurrent-schema`;
    const input = {
      artifact_id: `ysa_concurrent_${projectId}`,
      artifact_version_id: `ysav_concurrent_${projectId}`,
      canonical_name: canonicalName,
      family: 'open',
      kind: 'schema',
      owner_project_id: projectId,
      visibility: 'private',
      version: '1.0.0',
      status: 'published',
      manifest_json: { owner: projectId },
      artifact_hash: `sha256:${'e'.repeat(64)}`,
      path_count: 0,
      provides: [],
      requires: [],
    } as const;
    const contenders = [
      input,
      {
        ...input,
        owner_project_id: otherProject.projectId,
        artifact_version_id: `${input.artifact_version_id}_foreign`,
        version: '1.1.0',
      },
    ];
    const results = await Promise.allSettled(
      contenders.map((contender) =>
        publishYSchemaArtifactVersion(db, { ...contender, provides: [], requires: [] })
      )
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure).toMatchObject({
      reason: expect.objectContaining({ message: expect.stringContaining('identity conflict') }),
    });
    const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
    const winner = contenders[winnerIndex]!;
    const history = await listProjectYSchemaVersionHistory(db, {
      project_id: winner.owner_project_id,
      kind: 'schema',
    });
    expect(history.filter((item) => item.canonicalName === canonicalName)).toHaveLength(1);
    const loser = contenders[1 - winnerIndex]!;
    expect(
      await findYSchemaArtifactVersion(db, {
        canonical_name: canonicalName,
        version: loser.version,
        project_id: loser.owner_project_id,
      })
    ).toBeNull();
  });

  it('updates and archives Schema identity metadata without mutating its version', async () => {
    const canonicalName = `projects/${projectId}/managed-schema`;
    const published = await publishYSchemaArtifactVersion(db, {
      artifact_id: `ysa_managed_${projectId}`,
      artifact_version_id: `ysav_managed_${projectId}_1_0_0`,
      canonical_name: canonicalName,
      family: 'open',
      kind: 'schema',
      display_name: 'Managed Schema',
      description: 'Initial catalog metadata',
      tags: ['initial'],
      owner_project_id: projectId,
      visibility: 'private',
      version: '1.0.0',
      status: 'published',
      manifest_json: {
        apiVersion: 't3x.dev/yschema-blueprint/v1',
        canonicalName,
        version: '1.0.0',
      },
      artifact_hash: `sha256:${'a'.repeat(64)}`,
      path_count: 0,
      provides: [],
      requires: [],
    });

    const renamed = await updateYSchemaArtifactIdentity(db, {
      artifact_id: published.artifactId,
      project_id: projectId,
      if_revision: 1,
      display_name: 'Checkout Schema',
      description: 'Updated catalog metadata',
      tags: ['checkout', 'team'],
    });
    expect(renamed).toMatchObject({
      displayName: 'Checkout Schema',
      description: 'Updated catalog metadata',
      tags: ['checkout', 'team'],
      metadataRevision: 2,
      lifecycleStatus: 'active',
      artifactHash: `sha256:${'a'.repeat(64)}`,
    });

    const archived = await updateYSchemaArtifactIdentity(db, {
      artifact_id: published.artifactId,
      project_id: projectId,
      if_revision: 2,
      lifecycle_status: 'archived',
    });
    expect(archived?.lifecycleStatus).toBe('archived');
    expect(archived?.archivedAt).toEqual(expect.any(Date));
    expect(archived?.manifest).toMatchObject({ version: '1.0.0' });

    await expect(
      updateYSchemaArtifactIdentity(db, {
        artifact_id: published.artifactId,
        project_id: projectId,
        if_revision: 2,
        display_name: 'Stale update',
      })
    ).resolves.toBeNull();
  });

  it('keeps Official Schema identity metadata read-only to projects', async () => {
    const canonicalName = 't3x/official-managed-schema';
    const published = await publishYSchemaArtifactVersion(db, {
      artifact_id: 'ysa_official_managed_schema',
      artifact_version_id: 'ysav_official_managed_schema_1_0_0',
      canonical_name: canonicalName,
      family: 'open',
      kind: 'schema',
      display_name: 'Official Managed Schema',
      visibility: 'official',
      version: '1.0.0',
      status: 'published',
      manifest_json: {
        apiVersion: 't3x.dev/yschema-blueprint/v1',
        canonicalName,
        version: '1.0.0',
      },
      artifact_hash: `sha256:${'f'.repeat(64)}`,
      path_count: 0,
      provides: [],
      requires: [],
    });

    await expect(
      updateYSchemaArtifactIdentity(db, {
        artifact_id: published.artifactId,
        project_id: projectId,
        if_revision: 1,
        display_name: 'Project override',
      })
    ).resolves.toBeNull();
  });

  it('archives a project-owned legacy Core published as a Schema identity', async () => {
    const canonicalName = `projects/${projectId}/legacy-schema`;
    const published = await publishYSchemaArtifactVersion(db, {
      artifact_id: `ysa_legacy_${projectId}`,
      artifact_version_id: `ysav_legacy_${projectId}_1_0_0`,
      canonical_name: canonicalName,
      family: 'prd',
      kind: 'core',
      display_name: 'Legacy Schema',
      owner_project_id: projectId,
      visibility: 'private',
      version: '1.0.0',
      status: 'published',
      manifest_json: {
        apiVersion: 't3x.dev/yschema-core/v1',
        canonicalName,
        version: '1.0.0',
      },
      artifact_hash: `sha256:${'d'.repeat(64)}`,
      path_count: 0,
      provides: [],
      requires: [],
    });

    const archived = await updateYSchemaArtifactIdentity(db, {
      artifact_id: published.artifactId,
      project_id: projectId,
      if_revision: 1,
      lifecycle_status: 'archived',
    });

    expect(archived).toMatchObject({
      kind: 'core',
      lifecycleStatus: 'archived',
      metadataRevision: 2,
    });
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
