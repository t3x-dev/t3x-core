import type { SchemaNodeProvenance, StudioPreview } from '@t3x-dev/api-client';
import { createRepositorySemanticState, yvalueToTrees } from '@t3x-dev/core';
import {
  type AnyDB,
  ensureMainBranch,
  findWorkspaceDraft,
  findYSchemaArtifactVersion,
  getTransitionRefHead,
  insertBranch,
  insertProject,
  projects,
  saveYSchemaCompositionSnapshot,
  upsertWorkspaceDraft,
  upsertYSchemaArtifactVersion,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue } from '@t3x-dev/yschema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { setupTestDB } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;
vi.mock('../lib/db', () => ({ getDB: async () => db }));

import {
  accessibleNodeProvenance,
  composeNodeProvenance,
  readNodeProvenance,
} from '../lib/schema-node-provenance';
import { initializeWorkspaceAuthoring, workspaceAuthoringState } from '../lib/workspace-authoring';
import { prepareWorkspaceAuthoringReview } from '../lib/workspace-authoring-review';
import { decideWorkspaceTransition } from '../lib/workspace-transition';
import { exploreRoutes } from '../routes/explore.openapi';
import { schemaStudioRoutes } from '../routes/schema-studio.openapi';

const app = new Hono().route('/', schemaStudioRoutes).route('/', exploreRoutes);
const actor = { kind: 'human' as const, id: 'human:local-user' };
const schema = normalizeYSchemaObject({
  yschema: '0.1',
  name: 'Origin contract',
  strict: true,
  nodes: {
    checklist: {
      slots: { title: { type: 'string' } },
      children: {
        items: { repeated: true, slots: { done: { type: 'boolean' } } },
      },
    },
  },
});
let projectId: string, consumerId: string, commitDigest: string, schemaHash: string;
let source: StudioPreview['sources'][number];
let released: StudioPreview['sources'][number];
let releaseProvenance: SchemaNodeProvenance;
const request = (project: string, action: string, body: unknown, method = 'POST') =>
  app.request(`/v1/projects/${project}/schema-studio/${action}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
async function data(response: Response) {
  const payload = await response.json();
  expect(response.status, JSON.stringify(payload)).toBe(200);
  return payload.data;
}
async function candidate(project: string, pin: StudioPreview['sources'][number]) {
  return data(
    await request(project, 'candidates', {
      canonicalName: pin.canonicalName,
      version: pin.version,
      expectedHash: pin.hash,
      ...(pin.projectId ? { sourceProjectId: pin.projectId } : {}),
    })
  );
}
async function reviewed(
  project: string,
  workspaceId: string,
  candidateId: string,
  localContribution = {}
) {
  const saved = await data(
    await request(
      project,
      `edit-candidates/${workspaceId}`,
      {
        workspaceId,
        candidateIds: [candidateId],
        ifRevision: 0,
        retryKey: workspaceId,
        intent: 'Publish checked definition',
        origin: 'studio',
        localContribution,
      },
      'PUT'
    )
  );
  const selection = {
    workspaceId,
    candidateIds: [candidateId],
    schemaEditCandidate: {
      candidateId: saved.candidate.candidateId,
      revision: saved.candidate.revision,
    },
  };
  const preview = (await data(await request(project, 'preview', selection))) as StudioPreview;
  return {
    preview,
    input: {
      visibility: 'community',
      candidateIds: selection.candidateIds,
      schemaEditCandidate: selection.schemaEditCandidate,
      ifRevision: preview.workspace!.revision,
      reviewHash: preview.reviewHash,
      canonicalName: `origin-test/${workspaceId}`,
      version: '1.0.0',
      title: 'Origin test',
      description: '',
      releaseNotes: '',
      tags: [],
      license: 'MIT',
    },
  };
}
async function workspace(project: string, id: string, bindings: Record<string, unknown>[] = []) {
  const branch = project === projectId ? 'main' : id;
  if (branch !== 'main') await insertBranch(db, { projectId: project, name: branch });
  return upsertWorkspaceDraft(db, {
    project_id: project,
    workspace_id: id,
    target_branch: branch,
    title: id,
    workspace_state: { targetBranch: branch, schemaBindings: bindings },
  });
}
beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
  projectId = (await insertProject(db, { name: 'Original source', ownerId: 'origin-publisher' }))
    .projectId;
  await db.update(projects).set({ visibility: 'public' }).where(eq(projects.projectId, projectId));
  consumerId = (await insertProject(db, { name: 'Consumer', ownerId: 'origin-consumer' }))
    .projectId;
  await ensureMainBranch(db, projectId);
  await ensureMainBranch(db, consumerId);
  schemaHash = await sha256CompositionValue(schema);
  const manifest = {
    apiVersion: 't3x.dev/yschema-blueprint/v1',
    canonicalName: 'origin-test/base',
    version: '1.0.0',
    license: 'MIT',
    schema,
    registry: { schemaHash, originsByPath: {}, renderPlan: [] },
  };
  const hash = await sha256CompositionValue(manifest);
  const row = await upsertYSchemaArtifactVersion(db, {
    artifact_id: 'origin-base',
    artifact_version_id: 'origin-base-1',
    canonical_name: 'origin-test/base',
    version: '1.0.0',
    family: 'open',
    kind: 'schema',
    visibility: 'community',
    status: 'published',
    manifest_json: manifest,
    artifact_hash: hash,
    path_count: 4,
    provides: [],
    requires: [],
  });
  source = {
    projectId: null,
    canonicalName: row.canonicalName,
    version: row.version,
    artifactVersionId: row.artifactVersionId,
    hash,
  };
  await saveYSchemaCompositionSnapshot(db, {
    snapshot_id: 'origin-committed',
    project_id: projectId,
    composition_id: 'origin-contract',
    composition_revision: 1,
    composition_hash: schemaHash,
    compiled_schema_hash: schemaHash,
    compiler_version: 'test',
    manifest_json: { sources: [source] },
    schema_json: { ...schema },
    render_plan_json: [],
    origins_json: {},
  });
  const bindings = [
    {
      canonicalName: 'origin-contract',
      version: '1',
      rootKey: 'candidate',
      compositionId: 'origin-contract',
      compositionRevision: 1,
      compositionHash: schemaHash,
      schemaHash,
      studioSources: [source],
    },
  ];
  const initial = await workspace(projectId, 'commit-origin', bindings);
  await initializeWorkspaceAuthoring(db, {
    projectId,
    workspaceId: 'commit-origin',
    actionId: 'init-origin',
    actor,
    expectedWorkspaceRevision: initial.revision,
    expectedRefHead: null,
    legacyDocument: createRepositorySemanticState({
      trees: yvalueToTrees({ candidate: { checklist: { title: 'Recorded origin' } } }),
      relations: [],
    }).value as never,
  });
  const draft = (await findWorkspaceDraft(db, projectId, 'commit-origin'))!;
  const { ledger, basis } = workspaceAuthoringState(draft.workspace_state!);
  const review = await prepareWorkspaceAuthoringReview({
    db,
    projectId,
    workspaceId: 'commit-origin',
    actor,
    requestId: 'origin-review',
    expectedWorkspaceRevision: draft.revision,
    expectedRevision: ledger.compositionRevision,
    expectedRefHead: basis.refHead,
  });
  await decideWorkspaceTransition(db, {
    projectId,
    workspaceId: 'commit-origin',
    transitionId: review.view.transitionId,
    actor,
    policyBinding: null,
    outcome: 'accepted',
    precondition: {
      ...review.view.precondition,
      policyDigest: review.view.precondition.policyDigest!,
    },
  });
  commitDigest = (await getTransitionRefHead(db, { projectId, refName: 'main' })).head!;
  expect(
    workspaceAuthoringState(
      (await findWorkspaceDraft(db, projectId, 'commit-origin'))!.workspace_state!
    ).basis.refHead
  ).toBe(commitDigest);
});
afterAll(async () => cleanup?.());

it('records a verified fixed Base Commit on a new immutable public release', async () => {
  const added = await candidate(projectId, source);
  const { preview, input } = await reviewed(projectId, 'commit-origin', added.id);
  expect(preview.nodeProvenance?.byPath).toEqual({});
  const result = await data(await request(projectId, 'publish/commit-origin', input));
  released = result.source;
  const stored = (await findYSchemaArtifactVersion(db, {
    canonical_name: released.canonicalName,
    version: released.version,
  }))!;
  releaseProvenance = (stored.manifest.registry as { nodeProvenance: SchemaNodeProvenance })
    .nodeProvenance;
  expect(releaseProvenance.byPath.checklist?.[0]?.commitRef).toEqual({
    projectId,
    commitDigest,
    schemaHash,
    sourcePath: 'checklist',
  });
  expect(releaseProvenance.byPath['checklist/items']?.[0]?.commitRef.sourcePath).toBe(
    'checklist/items'
  );
  expect(await sha256CompositionValue(stored.manifest)).toBe(released.hash);
  expect((await data(await request(projectId, 'publish/commit-origin', input))).source).toEqual(
    released
  );
});

it('carries the original Commit across import, local contribution and republication', async () => {
  const added = await candidate(consumerId, released);
  await workspace(consumerId, 'derived-release');
  const { preview, input } = await reviewed(consumerId, 'derived-release', added.id, {
    nodes: { extra: { slots: { note: { type: 'string' } } } },
  });
  expect(preview.nodeProvenance?.byPath.checklist?.[0]).toMatchObject({
    source: released,
    commitRef: { projectId, commitDigest, sourcePath: 'checklist' },
  });
  expect(preview.nodeProvenance?.byPath.extra).toBeUndefined();
  const result = await data(await request(consumerId, 'publish/derived-release', input));
  const stored = (await findYSchemaArtifactVersion(db, {
    canonical_name: result.source.canonicalName,
    version: '1.0.0',
  }))!;
  expect(
    (stored.manifest.registry as { nodeProvenance: SchemaNodeProvenance }).nodeProvenance.byPath
      .checklist?.[0]?.commitRef.commitDigest
  ).toBe(commitDigest);
  const query = new URLSearchParams({
    canonicalName: released.canonicalName,
    version: released.version,
    expectedHash: released.hash,
  });
  const read = await data(await app.request(`/v1/explore/schema-release?${query}`));
  expect(read.nodeProvenance.byPath.checklist[0].commitRef.commitDigest).toBe(commitDigest);
});

it('rejects wrong project, Commit, schema hash and original node path without guessing', async () => {
  const context = new Hono();
  context.get('/', async (c) => {
    const valid = releaseProvenance.byPath.checklist![0]!;
    const mutations = [
      { projectId: consumerId },
      { commitDigest: `sha256:${'f'.repeat(64)}` },
      { schemaHash: `sha256:${'e'.repeat(64)}` },
      { sourcePath: 'missing/path' },
    ];
    for (const change of mutations) {
      const result = await accessibleNodeProvenance(c, db, {
        version: 1,
        byPath: { checklist: [{ ...valid, commitRef: { ...valid.commitRef, ...change } }] },
      });
      expect(result.byPath).toEqual({});
    }
    return c.text('ok');
  });
  expect((await context.request('/')).status).toBe(200);
});

it('preserves source references through saved edits, apply and reload, without restoring removed nodes', async () => {
  const added = await candidate(consumerId, released);
  await workspace(consumerId, 'edited-release');
  const initial = await reviewed(consumerId, 'edited-release', added.id);
  const definition = normalizeYSchemaObject(initial.preview.schema);
  definition.nodes.checklist!.children = {};
  definition.nodes.checklist!.slots!.title = { type: 'number' };
  const saved = await data(
    await request(
      consumerId,
      'edit-candidates/edited-release',
      {
        workspaceId: 'edited-release',
        candidateIds: [added.id],
        ifRevision: 1,
        retryKey: 'edit-source',
        intent: 'Change title and remove child',
        origin: 'studio',
        localContribution: {},
        baseSchemaHash: initial.preview.schemaHash,
        schemaDefinition: definition,
      },
      'PUT'
    )
  );
  const edit = { candidateId: saved.candidate.candidateId, revision: saved.candidate.revision };
  const edited = await data(
    await request(consumerId, 'preview', {
      workspaceId: 'edited-release',
      candidateIds: [added.id],
      schemaEditCandidate: edit,
    })
  );
  expect(edited.nodeProvenance.byPath.checklist[0].commitRef.commitDigest).toBe(commitDigest);
  expect(edited.nodeProvenance.byPath['checklist/items']).toBeUndefined();
  await data(
    await request(consumerId, 'apply', {
      workspaceId: 'edited-release',
      candidateIds: [added.id],
      ifRevision: edited.workspace.revision,
      reviewHash: edited.reviewHash,
      schemaEditCandidate: edit,
    })
  );
  const reloaded = await data(
    await request(consumerId, 'preview', {
      workspaceId: 'edited-release',
      candidateIds: [added.id],
    })
  );
  expect(reloaded.nodeProvenance.byPath.checklist[0].commitRef.commitDigest).toBe(commitDigest);
  expect(reloaded.nodeProvenance.byPath['checklist/items']).toBeUndefined();
});

it('keeps old Releases unrecorded and never uses an introduction Commit', () => {
  expect(readNodeProvenance(undefined).byPath).toEqual({});
  const provenance = composeNodeProvenance(
    schema,
    {},
    [
      {
        source,
        whole: true,
        manifest: { registry: { presentationRef: { projectId, commitDigest } } },
      },
    ],
    true
  );
  expect(provenance.byPath).toEqual({});
});

it('omits private Commit references when publishing and reading a previously public source', async () => {
  await db.update(projects).set({ visibility: 'private' }).where(eq(projects.projectId, projectId));
  // Auth-disabled local mode can read the project; public disclosure must still be denied.
  const added = await candidate(consumerId, released);
  await workspace(consumerId, 'private-origin-release');
  const { input } = await reviewed(consumerId, 'private-origin-release', added.id);
  const result = await data(await request(consumerId, 'publish/private-origin-release', input));
  const stored = (await findYSchemaArtifactVersion(db, {
    canonical_name: result.source.canonicalName,
    version: '1.0.0',
  }))!;
  expect(
    (stored.manifest.registry as { nodeProvenance: SchemaNodeProvenance }).nodeProvenance.byPath
  ).toEqual({});
  expect(JSON.stringify(stored.manifest)).not.toContain(commitDigest);
  expect(JSON.stringify(stored.manifest)).not.toContain(projectId);
  const previousAuth = process.env.AUTH_DISABLED;
  try {
    process.env.AUTH_DISABLED = 'false';
    const unauthorized = new Hono();
    unauthorized.get('/', async (c) =>
      c.json(await accessibleNodeProvenance(c, db, releaseProvenance))
    );
    expect((await (await unauthorized.request('/')).json()).byPath).toEqual({});
  } finally {
    if (previousAuth === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = previousAuth;
  }
});
