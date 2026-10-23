import { createRepositorySemanticState, type SemanticContent, yvalueToTrees } from '@t3x-dev/core';
import {
  type AnyDB,
  ensureMainBranch,
  findWorkspaceDraft,
  getTransitionRefHead,
  getTransitionViewForCommit,
  insertBranch,
  insertProject,
  saveYSchemaCompositionSnapshot,
  transactWorkspaceAuthoring,
  upsertWorkspaceDraft,
  yschemaCompositionSnapshots,
} from '@t3x-dev/storage';
import { normalizeYSchemaObject, sha256CompositionValue, type YSchema } from '@t3x-dev/yschema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createBranchWorkspace } from '../lib/branch-workspace';
import {
  commitRepositoryYOpsMerge,
  prepareRepositoryYOpsMerge,
} from '../lib/repository-state-transition';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { prepareWorkspaceAuthoringReview } from '../lib/workspace-authoring-review';
import { decideWorkspaceTransition } from '../lib/workspace-transition';
import { resolveWorkspaceYSchema } from '../lib/workspace-yschema';
import { mergeRoutes } from '../routes/merge.openapi';
import { pullRequestRoutes } from '../routes/pull-requests.openapi';
import { setupTestDB } from './setup';

let db: AnyDB;
vi.mock('../lib/db', () => ({ getDB: async () => db }));
const actor = { kind: 'human' as const, id: 'human:local-user' };
const base = normalizeYSchemaObject({
  yschema: '0.1',
  name: 'Merge contract',
  strict: true,
  nodes: { requirements: { slots: { title: { type: 'string' } } } },
});
const schema = (slots: Record<string, unknown>) =>
  normalizeYSchemaObject({
    ...base,
    nodes: {
      requirements: {
        ...base.nodes.requirements,
        slots: { ...base.nodes.requirements!.slots, ...slots },
      },
    },
  });
const content = (slots: Record<string, string>): SemanticContent => ({
  trees: yvalueToTrees({ candidate: { requirements: { title: 'Study', ...slots } } }),
  relations: [],
});

async function commit(
  projectId: string,
  branch: string,
  definition: YSchema,
  document: SemanticContent
) {
  const head = await getTransitionRefHead(db, { projectId, refName: branch });
  const hash = await sha256CompositionValue(definition);
  const id = `fixture:${branch}:${hash}`;
  await saveYSchemaCompositionSnapshot(db, {
    snapshot_id: `${projectId}:${id}`,
    project_id: projectId,
    composition_id: id,
    composition_revision: 1,
    composition_hash: hash,
    compiled_schema_hash: hash,
    compiler_version: 'test',
    manifest_json: { rootKey: 'candidate' },
    schema_json: { ...definition },
    render_plan_json: [],
    origins_json: {},
  });
  const ws = `fixture:${branch}`;
  const previous = await findWorkspaceDraft(db, projectId, ws);
  const bindings = [
    {
      canonicalName: id,
      version: '1',
      rootKey: 'candidate',
      compositionId: id,
      compositionRevision: 1,
      compositionHash: hash,
      schemaHash: hash,
    },
  ];
  if (previous) {
    const updated = await transactWorkspaceAuthoring(
      db,
      { projectId, workspaceId: ws, refName: branch },
      async (_tx, draft) => ({
        workspace: { ...draft.workspace_state, schemaBindings: bindings },
        value: null,
      })
    );
    const { ledger } = workspaceAuthoringState(updated.draft.workspace_state!);
    await publishWorkspaceAuthoringAction(db, {
      projectId,
      workspaceId: ws,
      actionId: `edit:${hash}`,
      actor,
      channel: 'manual',
      operations: [{ set: { path: 'content', value: document as never } }],
      expectedRevision: ledger.compositionRevision,
      expectedWorkspaceRevision: updated.draft.revision,
      expectedRefHead: head.head,
    });
  } else {
    const saved = await upsertWorkspaceDraft(db, {
      project_id: projectId,
      workspace_id: ws,
      title: branch,
      target_branch: branch,
      workspace_state: {
        targetBranch: branch,
        ...(head.head
          ? {
              workspaceSchemaBase: {
                refHead: head.head,
                snapshot: {
                  status: 'bound',
                  schemaHash: await sha256CompositionValue(base),
                  definition: base,
                  bindings: [],
                },
              },
            }
          : {}),
        schemaBindings: bindings,
      },
    });
    await initializeWorkspaceAuthoring(db, {
      projectId,
      workspaceId: ws,
      actionId: `init:${ws}`,
      actor,
      expectedWorkspaceRevision: saved.revision,
      expectedRefHead: head.head,
      legacyDocument: createRepositorySemanticState(document).value as never,
    });
  }
  const draft = (await findWorkspaceDraft(db, projectId, ws))!;
  const { ledger, basis } = workspaceAuthoringState(draft.workspace_state!);
  const review = await prepareWorkspaceAuthoringReview({
    db,
    projectId,
    workspaceId: ws,
    actor,
    requestId: `review:${ws}:${hash}:${head.head ?? 'initial'}`,
    expectedWorkspaceRevision: draft.revision,
    expectedRevision: ledger.compositionRevision,
    expectedRefHead: basis.refHead,
  });
  await decideWorkspaceTransition(db, {
    projectId,
    workspaceId: ws,
    transitionId: review.view.transitionId,
    actor,
    policyBinding: null,
    outcome: 'accepted',
    precondition: {
      ...review.view.precondition,
      policyDigest: review.view.precondition.policyDigest!,
    },
  });
  return (await getTransitionRefHead(db, { projectId, refName: branch })).head!;
}

describe('Schema/content merge across verified Commits', () => {
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    const setup = await setupTestDB();
    db = setup.db;
    cleanup = setup.cleanup;
  });
  afterAll(async () => {
    await cleanup();
  });
  async function branches(
    sourceSchema = schema({ owner: { type: 'string' } }),
    targetSchema = schema({ advantage: { type: 'string' } }),
    sourceSlots = { owner: 'Ada' } as Record<string, string>,
    targetSlots = { advantage: 'Useful' } as Record<string, string>
  ) {
    const projectId = (await insertProject(db, { name: 'Schema merge integration' })).projectId;
    await ensureMainBranch(db, projectId);
    await commit(projectId, 'main', base, content({}));
    await insertBranch(db, { projectId, name: 'dev', parentBranch: 'main' });
    const source = await commit(projectId, 'dev', sourceSchema, content(sourceSlots));
    const target = await commit(projectId, 'main', targetSchema, content(targetSlots));
    return { projectId, sourceDigest: source, targetDigest: target };
  }
  const decisions = {
    conflictResolutions: {},
    keepFromSource: [],
    keepFromTarget: [],
    keepRelationsFromSource: true,
    keepRelationsFromTarget: true,
  };

  it('merges both contracts, validates combined content, and recovers the exact snapshot on a new branch', async () => {
    const input = await branches();
    const merged = await commitRepositoryYOpsMerge({
      db,
      ...input,
      refName: 'main',
      actor,
      decisions,
      message: 'Merge Schema and content',
    });
    const view = await getTransitionViewForCommit(db, {
      projectId: input.projectId,
      refName: 'main',
      commitId: merged.commitDigest,
    });
    expect(view?.checks.validation.runs).toHaveLength(1);
    expect(view?.checks.validation.runs[0]?.predicate).toMatchObject({
      outcome: 'passed',
      valid: true,
      ready: true,
    });
    const main = (await findWorkspaceDraft(db, input.projectId, 'fixture:main'))!;
    const currentSchema = await resolveWorkspaceYSchema(main.workspace_state!, db, input.projectId);
    expect(main.workspace_state!.authoringBasis.refHead).toBe(merged.commitDigest);
    expect(currentSchema.schema?.nodes.requirements?.slots).toMatchObject({
      owner: { type: 'string' },
      advantage: { type: 'string' },
    });
    await createBranchWorkspace(db, {
      projectId: input.projectId,
      name: 'after-merge',
      parentBranch: 'main',
    });
    const child = (await findWorkspaceDraft(db, input.projectId, 'workspace_branch:after-merge'))!;
    const resolved = await resolveWorkspaceYSchema(child.workspace_state!, db, input.projectId);
    expect(resolved.schema?.nodes.requirements?.slots).toMatchObject({
      owner: { type: 'string' },
      advantage: { type: 'string' },
    });
    expect(child.workspace_state!.schemaBindings[0].rootKey).toBe('candidate');
  });

  it('blocks individually valid branches whose combined content violates the combined constraint', async () => {
    const input = await branches(
      schema({ owner: { type: 'string', maxLength: 2 } }),
      schema({ owner: { type: 'string' }, advantage: { type: 'string' } }),
      {},
      { owner: 'Long owner', advantage: 'Useful' }
    );
    await expect(
      commitRepositoryYOpsMerge({
        db,
        ...input,
        refName: 'main',
        actor,
        decisions,
        message: 'Invalid combination',
      })
    ).rejects.toThrow(/merged Schema/i);
    expect(
      (await getTransitionRefHead(db, { projectId: input.projectId, refName: 'main' })).head
    ).toBe(input.targetDigest);
    const app = new Hono().route('/', pullRequestRoutes);
    const response = await app.request(`/v1/projects/${input.projectId}/pull-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Invalid Schema combination',
        source_branch: 'dev',
        target_branch: 'main',
        expected_source_commit_id: input.sourceDigest,
        expected_target_commit_id: input.targetDigest,
      }),
    });
    expect(response.status).toBe(201);
    const opened = (await response.json()).data;
    expect(opened.status).toBe('blocked');
    const checks = await (
      await app.request(`/v1/projects/${input.projectId}/pull-requests/${opened.number}/checks`)
    ).json();
    expect(checks.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Merged content against merged Schema',
          status: 'blocked',
        }),
      ])
    );
  });

  it('blocks Schema conflicts during readiness and direct execution without advancing the target', async () => {
    const input = await branches(
      schema({ owner: { type: 'string' }, title: { type: 'string', maxLength: 30 } }),
      schema({ advantage: { type: 'string' }, title: { type: 'string', maxLength: 40 } })
    );
    // Preparation now retains an editable draft; unresolved publication must still fail closed.
    await expect(prepareRepositoryYOpsMerge({ db, ...input })).resolves.toBeDefined();
    await expect(
      commitRepositoryYOpsMerge({
        db,
        ...input,
        refName: 'main',
        actor,
        decisions,
        message: 'Conflict',
      })
    ).rejects.toThrow(/Schema/i);
    expect(
      (await getTransitionRefHead(db, { projectId: input.projectId, refName: 'main' })).head
    ).toBe(input.targetDigest);
  });

  it('resolves a Schema conflict in the PR workspace, migrates content, rechecks and commits one validated result', async () => {
    const input = await branches(
      schema({ owner: { type: 'string' }, title: { type: 'string', maxLength: 30 } }),
      schema({ advantage: { type: 'string' }, title: { type: 'string', maxLength: 40 } })
    );
    const app = new Hono().route('/', pullRequestRoutes).route('/', mergeRoutes);
    const prefix = `/v1/projects/${input.projectId}/pull-requests`;
    const post = (url: string, body: unknown, method = 'POST') =>
      app.request(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const opened = await (
      await post(prefix, {
        title: 'Resolve Schema together',
        source_branch: 'dev',
        target_branch: 'main',
        expected_source_commit_id: input.sourceDigest,
        expected_target_commit_id: input.targetDigest,
      })
    ).json();
    expect(opened.data.status).toBe('blocked');
    expect(opened.data.merge_draft_id).toBeTruthy();
    const url = `${prefix}/${opened.data.number}`;
    const review = await (await app.request(`${url}/merge-review`)).json();
    const path = 'nodes/requirements/slots/title/maxLength';
    expect(review.data.schema_merge).toMatchObject({
      unresolved: [path],
      conflicts: [{ path, source: 30, target: 40 }],
    });
    const merge = () =>
      post(`${url}/merge`, {
        expected_source_commit_id: input.sourceDigest,
        expected_target_commit_id: input.targetDigest,
      });
    expect((await merge()).status).toBe(409);
    const decision = {
      ...decisions,
      schemaResolution: { choices: { [path]: { value: 3 } }, commands: [] },
    };
    const saved = await post(
      `/v1/merge/drafts/${review.data.draft_id}`,
      {
        decisions: decision,
        expected_decision_revision: review.data.decision_revision,
      },
      'PATCH'
    );
    expect(saved.status).toBe(200);
    const revision = (await saved.json()).data.decisionRevision;
    // Schema choices persist across reload, but invalid combined content still blocks merging.
    const invalid = await (await app.request(`${url}/merge-review`)).json();
    expect(invalid.data.decisions.schemaResolution).toEqual(decision.schemaResolution);
    expect(invalid.data.schema_merge.unresolved).toEqual([]);
    expect(invalid.data.schema_merge.issues.length).toBeGreaterThan(0);
    expect((await (await post(`${url}/checks/rerun`, {})).json()).data.status).toBe('blocked');
    expect((await merge()).status).toBe(409);
    decision.schemaResolution.commands = [
      {
        kind: 'set',
        path: 'content/trees/[key=candidate]/children/[key=requirements]/slots/title',
        value: 'New',
      },
    ] as never;
    const updated = await post(
      `/v1/merge/drafts/${review.data.draft_id}`,
      { decisions: decision, expected_decision_revision: revision },
      'PATCH'
    );
    expect(updated.status).toBe(200);
    const stale = await post(
      `/v1/merge/drafts/${review.data.draft_id}`,
      { decisions: decision, expected_decision_revision: revision },
      'PATCH'
    );
    expect(stale.status).toBe(409);
    const readyResponse = await post(`${url}/checks/rerun`, {});
    expect(readyResponse.status).toBe(200);
    const ready = await readyResponse.json();
    expect(ready.data.status).toBe('ready');
    const preview = await (await app.request(`${url}/merge-review`)).json();
    expect(preview.data.schema_merge.issues).toEqual([]);
    const merged = await merge();
    expect(merged.status, await merged.clone().text()).toBe(200);
    const head = await getTransitionRefHead(db, { projectId: input.projectId, refName: 'main' });
    expect(head.state!.value).toMatchObject({
      content: {
        trees: [{ children: [{ slots: { title: 'New', owner: 'Ada', advantage: 'Useful' } }] }],
      },
    });
    const draft = (await findWorkspaceDraft(db, input.projectId, 'fixture:main'))!;
    expect(
      (await resolveWorkspaceYSchema(draft.workspace_state!, db, input.projectId)).schema?.nodes
        .requirements?.slots.title
    ).toMatchObject({ maxLength: 3 });
    expect(
      (await getTransitionRefHead(db, { projectId: input.projectId, refName: 'dev' })).head
    ).toBe(input.sourceDigest);
  });

  it('rejects destructive mappings, invalid Schema edits and paths outside content without advancing either branch', async () => {
    const input = await branches(
      schema({ title: { type: 'string', maxLength: 30 } }),
      schema({ title: { type: 'string', maxLength: 40 } }),
      {},
      {}
    );
    const path = 'nodes/requirements/slots/title/maxLength';
    for (const schemaResolution of [
      { choices: { [path]: { value: 'invalid constraint' } }, commands: [] },
      {
        choices: { [path]: 'source' },
        commands: [{ kind: 'set', path: 'domain', value: 'forged' }],
      },
      {
        choices: { [path]: 'source' },
        commands: [{ kind: 'move', from: 'content/missing', to: 'content/other' }],
      },
      { choices: { 'nodes/not_a_conflict': 'source' }, commands: [] },
    ]) {
      await expect(
        commitRepositoryYOpsMerge({
          db,
          ...input,
          refName: 'main',
          actor,
          message: 'Invalid mapping',
          decisions: { ...decisions, schemaResolution } as never,
        })
      ).rejects.toThrow();
      expect(
        (await getTransitionRefHead(db, { projectId: input.projectId, refName: 'main' })).head
      ).toBe(input.targetDigest);
      expect(
        (await getTransitionRefHead(db, { projectId: input.projectId, refName: 'dev' })).head
      ).toBe(input.sourceDigest);
    }
  });

  it('records a Schema check on the actual PR rather than treating content-only readiness as enough', async () => {
    const input = await branches();
    const app = new Hono().route('/', pullRequestRoutes);
    const response = await app.request(`/v1/projects/${input.projectId}/pull-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Merge contract',
        source_branch: 'dev',
        target_branch: 'main',
        expected_source_commit_id: input.sourceDigest,
        expected_target_commit_id: input.targetDigest,
      }),
    });
    expect(response.status).toBe(201);
    const opened = (await response.json()).data;
    const checks = await (
      await app.request(`/v1/projects/${input.projectId}/pull-requests/${opened.number}/checks`)
    ).json();
    expect(checks.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'schema_compatibility', status: 'passed' }),
      ])
    );
    const review = await (
      await app.request(
        `/v1/projects/${input.projectId}/pull-requests/${opened.number}/merge-review`
      )
    ).json();
    expect(review.data.schema_merge).toMatchObject({
      root_key: 'candidate',
      changes: expect.arrayContaining([
        expect.objectContaining({ kind: 'ADD', path: 'nodes.requirements.slots.owner' }),
      ]),
    });
  });

  it('allows a Schema-only PR and commits its verified contract without requiring content changes', async () => {
    const input = await branches(schema({ owner: { type: 'string' } }), base, {}, {});
    const app = new Hono().route('/', pullRequestRoutes);
    const response = await app.request(`/v1/projects/${input.projectId}/pull-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Schema only',
        source_branch: 'dev',
        target_branch: 'main',
        expected_source_commit_id: input.sourceDigest,
        expected_target_commit_id: input.targetDigest,
      }),
    });
    expect(response.status).toBe(201);
    const opened = (await response.json()).data;
    expect(opened.status).toBe('ready');
    const merge = await app.request(
      `/v1/projects/${input.projectId}/pull-requests/${opened.number}/merge`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expected_source_commit_id: input.sourceDigest,
          expected_target_commit_id: input.targetDigest,
          strategy: 'deterministic_merge',
        }),
      }
    );
    expect(merge.status).toBe(200);
    const mergedHead = (
      await getTransitionRefHead(db, { projectId: input.projectId, refName: 'main' })
    ).head!;
    const main = (await findWorkspaceDraft(db, input.projectId, 'fixture:main'))!;
    expect(
      (await resolveWorkspaceYSchema(main.workspace_state!, db, input.projectId)).schema?.nodes
        .requirements?.slots.owner
    ).toMatchObject({ type: 'string' });
    expect(
      (
        await getTransitionViewForCommit(db, {
          projectId: input.projectId,
          refName: 'main',
          commitId: mergedHead,
        })
      )?.checks.validation.runs
    ).toHaveLength(1);
  });

  it('does not overwrite a target workspace with unpublished edits', async () => {
    const input = await branches();
    const main = (await findWorkspaceDraft(db, input.projectId, 'fixture:main'))!;
    const { ledger } = workspaceAuthoringState(main.workspace_state!);
    await publishWorkspaceAuthoringAction(db, {
      projectId: input.projectId,
      workspaceId: 'fixture:main',
      actionId: 'unpublished-edit',
      actor,
      channel: 'manual',
      operations: [
        { set: { path: 'content', value: content({ advantage: 'Local edit' }) as never } },
      ],
      expectedRevision: ledger.compositionRevision,
      expectedWorkspaceRevision: main.revision,
      expectedRefHead: input.targetDigest,
    });
    const before = await findWorkspaceDraft(db, input.projectId, 'fixture:main');
    await commitRepositoryYOpsMerge({
      db,
      ...input,
      refName: 'main',
      actor,
      decisions,
      message: 'Keep local work',
    });
    const after = await findWorkspaceDraft(db, input.projectId, 'fixture:main');
    expect(after?.workspace_state).toEqual(before?.workspace_state);
    expect(after?.revision).toBe(before?.revision);
  });

  it('fails closed when an exact committed Schema snapshot is missing', async () => {
    const input = await branches();
    const source = (await findWorkspaceDraft(db, input.projectId, 'fixture:dev'))!;
    const binding = source.workspace_state!.schemaBindings[0];
    await db
      .delete(yschemaCompositionSnapshots)
      .where(eq(yschemaCompositionSnapshots.compositionId, binding.compositionId));
    await expect(
      commitRepositoryYOpsMerge({
        db,
        ...input,
        refName: 'main',
        actor,
        decisions,
        message: 'Missing contract',
      })
    ).rejects.toThrow(/snapshot/i);
    expect(
      (await getTransitionRefHead(db, { projectId: input.projectId, refName: 'main' })).head
    ).toBe(input.targetDigest);
  });

  it('preserves unpublished Schema binding edits even when the compiled hash has not changed', async () => {
    const input = await branches();
    await transactWorkspaceAuthoring(
      db,
      { projectId: input.projectId, workspaceId: 'fixture:main', refName: 'main' },
      async (_tx, draft) => ({
        workspace: {
          ...draft.workspace_state,
          schemaBindings: draft.workspace_state!.schemaBindings.map(
            (binding: Record<string, unknown>) => ({ ...binding, rootKey: 'unpublished-root' })
          ),
        },
        value: null,
      })
    );
    const before = await findWorkspaceDraft(db, input.projectId, 'fixture:main');
    await commitRepositoryYOpsMerge({
      db,
      ...input,
      refName: 'main',
      actor,
      decisions,
      message: 'Preserve binding edits',
    });
    expect(
      (await findWorkspaceDraft(db, input.projectId, 'fixture:main'))?.workspace_state
    ).toEqual(before?.workspace_state);
  });

  it('rolls back the contract and Commit when final workspace synchronization fails', async () => {
    const input = await branches();
    const before = await db
      .select()
      .from(yschemaCompositionSnapshots)
      .where(eq(yschemaCompositionSnapshots.projectId, input.projectId));
    // Inject a database failure after the merge Commit/ref write, not before validation.
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql.raw(
        `CREATE FUNCTION test_schema_merge_sync_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected workspace sync failure'; END $$`
      )
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER test_schema_merge_sync_failure BEFORE UPDATE ON drafts FOR EACH ROW WHEN (NEW.project_id = '${input.projectId}') EXECUTE FUNCTION test_schema_merge_sync_failure()`
      )
    );
    try {
      await expect(
        commitRepositoryYOpsMerge({
          db,
          ...input,
          refName: 'main',
          actor,
          decisions,
          message: 'Atomic failure',
        })
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ message: 'injected workspace sync failure' }),
      });
    } finally {
      await db.execute(sql.raw('DROP TRIGGER test_schema_merge_sync_failure ON drafts'));
      await db.execute(sql.raw('DROP FUNCTION test_schema_merge_sync_failure()'));
    }
    expect(
      (await getTransitionRefHead(db, { projectId: input.projectId, refName: 'main' })).head
    ).toBe(input.targetDigest);
    expect(
      await db
        .select()
        .from(yschemaCompositionSnapshots)
        .where(eq(yschemaCompositionSnapshots.projectId, input.projectId))
    ).toEqual(before);
  });
});
