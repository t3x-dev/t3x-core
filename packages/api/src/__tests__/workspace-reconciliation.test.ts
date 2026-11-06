import { currentComposition } from '@t3x-dev/application';
import { createYOpsState } from '@t3x-dev/core';
import {
  branches,
  createMaterial,
  findWorkspaceDraft,
  getTransitionRefHead,
  insertBranch,
  insertProject,
  saveWorkspaceSchemaPreparation,
  transactWorkspaceReconciliation,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { t3xPrdP0Fixtures } from '@t3x-dev/yschema';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commitRepositoryYOpsState } from '../lib/repository-state-transition';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  readWorkspaceAuthoring,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import {
  decideWorkspaceReconciliation,
  prepareWorkspaceReconciliation,
  reconcileDocuments,
  reconcileWorkspaceAuthoring,
  reconcileWorkspaceSchemas,
  synchronizeCleanBranchWorkspaces,
  WorkspaceReconciliationConflictError,
  WorkspaceReconciliationValidationError,
} from '../lib/workspace-reconciliation';
import { setupTestDB } from './setup';

describe('Workspace branch reconciliation', () => {
  let setup: Awaited<ReturnType<typeof setupTestDB>>;
  const actor = { kind: 'human' as const, id: 'human:test' };
  beforeAll(async () => {
    setup = await setupTestDB();
  });
  afterAll(async () => {
    await setup?.cleanup();
  });

  async function fixture() {
    const projectId = (await insertProject(setup.db, { name: 'Reconciliation' })).projectId;
    await insertBranch(setup.db, { projectId, name: 'main' });
    const advance = async (value: Record<string, unknown>) => {
      const head = await getTransitionRefHead(setup.db, { projectId, refName: 'main' });
      return commitRepositoryYOpsState({
        db: setup.db,
        projectId,
        refName: 'main',
        expectedHead: head.head,
        target: createYOpsState(value),
        actor,
      });
    };
    const base = await advance({ product: { title: 'base', status: 'draft' }, keep: 1 });
    const workspaceId = 'workspace_branch:main';
    const draft = await upsertWorkspaceDraft(setup.db, {
      project_id: projectId,
      workspace_id: workspaceId,
      title: 'Main',
      target_branch: 'main',
      workspace_state: {
        targetBranch: 'main',
        sourceBundle: [{ id: 'source:keep' }],
        schemaBindings: [],
      },
    });
    const init = await initializeWorkspaceAuthoring(setup.db, {
      projectId,
      workspaceId,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: base.commitDigest,
      actionId: 'init',
      actor,
    });
    const publish = async (value: string) =>
      publishWorkspaceAuthoringAction(setup.db, {
        projectId,
        workspaceId,
        actor,
        channel: 'manual',
        actionId: 'edit',
        operations: [{ set: { path: 'product/title', value } }],
        expectedRevision: 0,
        expectedWorkspaceRevision: init.draft.revision,
        expectedRefHead: base.commitDigest,
      });
    const read = () => findWorkspaceDraft(setup.db, projectId, workspaceId);
    return { projectId, workspaceId, base, advance, init, publish, read };
  }

  it('merges independent fields and preserves deletions, identical edits and null', () => {
    expect(
      reconcileDocuments({ a: 1, b: 1, c: 1 }, { a: 2, c: null }, { a: 1, b: 1, c: 1, d: 3 })
    ).toEqual({ current: { a: 2, c: null, d: 3 }, conflicts: [] });
    expect(reconcileDocuments({ a: 1 }, { a: 2 }, { a: 2 }).conflicts).toEqual([]);
    expect(reconcileDocuments({ a: { b: 1 } }, {}, { a: { b: 2 } }).conflicts).toEqual(['/a']);
    expect(reconcileDocuments({ a: [1] }, { a: [1, 2] }, { a: [0, 1] }).conflicts).toEqual(['/a']);
    const dangerous = JSON.parse('{"__proto__":{"old":1}}');
    expect(reconcileDocuments(dangerous, {}, dangerous).current).toEqual({});
  });

  it('inherits a branch Schema and requires an explicit choice for simultaneous Schema edits', () => {
    const unbound = { status: 'unbound' as const, bindings: [] };
    const branch = {
      status: 'bound' as const,
      bindings: [{ canonicalName: 'product', version: '1' }],
      schemaHash: 'sha256:branch',
      definition: { root: 'product' },
    };
    expect(
      reconcileWorkspaceSchemas({ base: unbound, ours: unbound, theirs: branch })
    ).toMatchObject({ merged: branch, conflict: null });

    const ours = { ...branch, schemaHash: 'sha256:ours' };
    const theirs = { ...branch, schemaHash: 'sha256:theirs' };
    expect(reconcileWorkspaceSchemas({ base: branch, ours, theirs })).toMatchObject({
      merged: ours,
      conflict: { scope: 'schema', kind: 'schema', path: '/schema' },
    });
  });

  it('synchronizes a clean Workspace after a Commit and permits the next edit', async () => {
    const f = await fixture();
    const next = await f.advance({ product: { title: 'remote', status: 'live' }, keep: 1 });
    expect((await readWorkspaceAuthoring(setup.db, f)).synchronization.required).toBe(true);
    await synchronizeCleanBranchWorkspaces(setup.db, {
      projectId: f.projectId,
      refName: 'main',
      refHead: next.commitDigest,
      actor,
    });
    const saved = (await f.read())!;
    const state = workspaceAuthoringState(saved.workspace_state!);
    expect(state.basis.refHead).toBe(next.commitDigest);
    expect(state.ledger.compositionRevision).toBe(0);
    expect(saved.parent_commit_hash).toBe(next.commitDigest);
    expect(saved.committed_as).toBe(f.init.draft.committed_as);
    expect(saved.workspace_state?.sourceBundle).toEqual(f.init.draft.workspace_state?.sourceBundle);
    expect(
      (saved.workspace_state?.authoringReconciliations as Array<{ ledger: unknown }>)[0].ledger
    ).toEqual(f.init.draft.workspace_state?.authoringLedger);
    const edit = await publishWorkspaceAuthoringAction(setup.db, {
      projectId: f.projectId,
      workspaceId: f.workspaceId,
      actor,
      channel: 'manual',
      actionId: 'next-edit',
      operations: [{ set: { path: 'keep', value: 2 } }],
      expectedRevision: 0,
      expectedWorkspaceRevision: saved.revision,
      expectedRefHead: next.commitDigest,
    });
    expect(edit.value.kind).toBe('published');
    expect(
      (await getTransitionRefHead(setup.db, { projectId: f.projectId, refName: 'main' })).head
    ).toBe(next.commitDigest);
  });

  it('initializes an untouched Workspace from the latest committed Content and Schema', async () => {
    const f = await fixture();
    const workspaceId = 'workspace_branch:main:human:other';
    await upsertWorkspaceDraft(setup.db, {
      project_id: f.projectId,
      workspace_id: workspaceId,
      title: 'Other collaborator',
      target_branch: 'main',
      parent_commit_hash: f.base.commitDigest,
      workspace_state: { targetBranch: 'main', schemaBindings: [] },
    });
    const next = await f.advance({ product: { title: 'shared', status: 'live' }, keep: 2 });

    await synchronizeCleanBranchWorkspaces(setup.db, {
      projectId: f.projectId,
      refName: 'main',
      refHead: next.commitDigest,
      actor,
    });

    const saved = (await findWorkspaceDraft(setup.db, f.projectId, workspaceId))!;
    const state = workspaceAuthoringState(saved.workspace_state!);
    expect(state.basis.refHead).toBe(next.commitDigest);
    expect(currentComposition(state.ledger)).toEqual({
      product: { title: 'shared', status: 'live' },
      keep: 2,
    });
    expect(saved.parent_commit_hash).toBe(next.commitDigest);
    expect(saved.workspace_state?.workspaceSchemaBase).toMatchObject({
      refHead: next.commitDigest,
      snapshot: { status: 'unbound', schemaHash: null, bindings: [] },
    });
  });

  it('leaves dirty Workspaces intact during merge and explicitly carries edits forward with an immutable archive', async () => {
    const f = await fixture();
    await f.publish('local');
    const before = (await f.read())!;
    const next = await f.advance({ product: { title: 'base', status: 'live' }, keep: 1 });
    await synchronizeCleanBranchWorkspaces(setup.db, {
      projectId: f.projectId,
      refName: 'main',
      refHead: next.commitDigest,
      actor,
    });
    expect(await f.read()).toEqual(before);
    const input = {
      projectId: f.projectId,
      workspaceId: f.workspaceId,
      requestId: 'sync',
      actor,
      expectedWorkspaceRevision: before.revision,
      expectedRefHead: next.commitDigest,
    };
    const result = await reconcileWorkspaceAuthoring(setup.db, input);
    const saved = result.draft.workspace_state!;
    expect(currentComposition(workspaceAuthoringState(saved).ledger)).toEqual({
      product: { title: 'local', status: 'live' },
      keep: 1,
    });
    expect((saved.authoringReconciliations as unknown[])[0]).toMatchObject({
      ledger: before.workspace_state?.authoringLedger,
      basis: before.workspace_state?.authoringBasis,
    });
    expect((await reconcileWorkspaceAuthoring(setup.db, input)).value.kind).toBe('reused');
    expect((await f.read())?.revision).toBe(result.draft.revision);
    await expect(
      reconcileWorkspaceAuthoring(setup.db, { ...input, expectedRefHead: null })
    ).rejects.toThrow('different facts');
  });

  it('leaves a Schema-only Draft pending instead of blocking another Commit', async () => {
    const f = await fixture();
    const before = (await f.read())!;
    const dirty = await saveWorkspaceSchemaPreparation(setup.db, {
      projectId: f.projectId,
      workspaceId: f.workspaceId,
      expectedRevision: before.revision,
      schemaEditCandidate: { candidateId: 'schema-draft', revision: 1 },
    });
    const next = await f.advance({ product: { title: 'remote', status: 'live' }, keep: 1 });

    await synchronizeCleanBranchWorkspaces(setup.db, {
      projectId: f.projectId,
      refName: 'main',
      refHead: next.commitDigest,
      actor,
    });

    expect(await f.read()).toEqual(dirty);
  });

  it('rejects overlapping edits, stale Workspace revisions and changed heads without losing anything', async () => {
    const f = await fixture();
    await f.publish('local');
    const before = (await f.read())!;
    const next = await f.advance({ product: { title: 'remote', status: 'live' }, keep: 1 });
    const input = {
      projectId: f.projectId,
      workspaceId: f.workspaceId,
      requestId: 'sync',
      actor,
      expectedWorkspaceRevision: before.revision,
      expectedRefHead: next.commitDigest,
    };
    await expect(reconcileWorkspaceAuthoring(setup.db, input)).rejects.toThrow('/product/title');
    await expect(
      reconcileWorkspaceAuthoring(setup.db, {
        ...input,
        expectedWorkspaceRevision: before.revision - 1,
      })
    ).rejects.toThrow();
    await expect(
      reconcileWorkspaceAuthoring(setup.db, { ...input, expectedRefHead: f.base.commitDigest })
    ).rejects.toThrow('changed again');
    expect(await f.read()).toEqual(before);
    await expect(
      transactWorkspaceReconciliation(setup.db, { ...f, refName: 'main' }, async () => ({
        workspace: { ...before.workspace_state, authoringReconciliations: [] },
        value: null,
      }))
    ).rejects.toThrow('preserve');
  });

  it('previews Base/Ours/Theirs and records explicit cancel, adopt and discard decisions', async () => {
    const adopt = await fixture();
    await adopt.publish('local');
    let before = (await adopt.read())!;
    const advanced = await adopt.advance({
      product: { title: 'base', status: 'live' },
      keep: 1,
    });
    let preview = await prepareWorkspaceReconciliation(setup.db, {
      projectId: adopt.projectId,
      workspaceId: adopt.workspaceId,
      expectedWorkspaceRevision: before.revision,
      expectedRefHead: advanced.commitDigest,
    });
    expect(preview).toMatchObject({
      workspaceRevision: before.revision,
      baseHead: adopt.base.commitDigest,
      currentRefHead: advanced.commitDigest,
      ours: { product: { title: 'local', status: 'draft' }, keep: 1 },
      theirs: { product: { title: 'base', status: 'live' }, keep: 1 },
      merged: { product: { title: 'local', status: 'live' }, keep: 1 },
      conflicts: [],
    });
    expect(preview.preparationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const cancelInput = {
      projectId: adopt.projectId,
      workspaceId: adopt.workspaceId,
      requestId: 'cancel-sync',
      actor,
      expectedWorkspaceRevision: before.revision,
      expectedRefHead: advanced.commitDigest,
      preparationDigest: preview.preparationDigest,
      action: 'cancel' as const,
    };
    const cancelled = await decideWorkspaceReconciliation(setup.db, cancelInput);
    expect(cancelled.value.kind).toBe('cancelled');
    expect(workspaceAuthoringState(cancelled.draft.workspace_state!).basis.refHead).toBe(
      adopt.base.commitDigest
    );
    expect((await decideWorkspaceReconciliation(setup.db, cancelInput)).value.kind).toBe('reused');

    before = (await adopt.read())!;
    preview = await prepareWorkspaceReconciliation(setup.db, {
      projectId: adopt.projectId,
      workspaceId: adopt.workspaceId,
      expectedWorkspaceRevision: before.revision,
      expectedRefHead: advanced.commitDigest,
    });
    const adopted = await decideWorkspaceReconciliation(setup.db, {
      ...cancelInput,
      requestId: 'adopt-sync',
      expectedWorkspaceRevision: before.revision,
      preparationDigest: preview.preparationDigest,
      action: 'adopt',
    });
    expect(adopted.value.kind).toBe('reconciled');
    expect(
      currentComposition(workspaceAuthoringState(adopted.draft.workspace_state!).ledger)
    ).toEqual(preview.merged);

    const discard = await fixture();
    await discard.publish('local');
    const discardBefore = (await discard.read())!;
    const discardHead = await discard.advance({
      product: { title: 'remote', status: 'live' },
      keep: 1,
    });
    const conflicting = await prepareWorkspaceReconciliation(setup.db, {
      projectId: discard.projectId,
      workspaceId: discard.workspaceId,
      expectedWorkspaceRevision: discardBefore.revision,
      expectedRefHead: discardHead.commitDigest,
    });
    expect(conflicting.conflicts).toHaveLength(1);
    expect(conflicting.conflicts[0]).toMatchObject({ path: '/product/title' });
    await expect(
      decideWorkspaceReconciliation(setup.db, {
        projectId: discard.projectId,
        workspaceId: discard.workspaceId,
        requestId: 'adopt-conflict',
        actor,
        expectedWorkspaceRevision: discardBefore.revision,
        expectedRefHead: discardHead.commitDigest,
        preparationDigest: conflicting.preparationDigest,
        action: 'adopt',
      })
    ).rejects.toBeInstanceOf(WorkspaceReconciliationConflictError);
    const discarded = await decideWorkspaceReconciliation(setup.db, {
      projectId: discard.projectId,
      workspaceId: discard.workspaceId,
      requestId: 'discard-conflict',
      actor,
      expectedWorkspaceRevision: discardBefore.revision,
      expectedRefHead: discardHead.commitDigest,
      preparationDigest: conflicting.preparationDigest,
      action: 'discard',
    });
    expect(discarded.value.kind).toBe('discarded');
    expect(
      currentComposition(workspaceAuthoringState(discarded.draft.workspace_state!).ledger)
    ).toEqual(conflicting.theirs);
  });

  it('rejects a stale explicit preview when the Workspace revision or branch head changes', async () => {
    const f = await fixture();
    await f.publish('local');
    const before = (await f.read())!;
    const firstAdvance = await f.advance({
      product: { title: 'base', status: 'live' },
      keep: 1,
    });
    await expect(
      prepareWorkspaceReconciliation(setup.db, {
        projectId: f.projectId,
        workspaceId: f.workspaceId,
        expectedWorkspaceRevision: before.revision - 1,
        expectedRefHead: firstAdvance.commitDigest,
      })
    ).rejects.toThrow();
    const preview = await prepareWorkspaceReconciliation(setup.db, {
      projectId: f.projectId,
      workspaceId: f.workspaceId,
      expectedWorkspaceRevision: before.revision,
      expectedRefHead: firstAdvance.commitDigest,
    });
    await f.advance({
      product: { title: 'base', status: 'live' },
      keep: 2,
    });
    await expect(
      decideWorkspaceReconciliation(setup.db, {
        projectId: f.projectId,
        workspaceId: f.workspaceId,
        requestId: 'stale-preview',
        actor,
        expectedWorkspaceRevision: before.revision,
        expectedRefHead: firstAdvance.commitDigest,
        preparationDigest: preview.preparationDigest,
        action: 'adopt',
      })
    ).rejects.toThrow('changed again');
    expect(await f.read()).toEqual(before);
  });

  it('refuses automatic synchronization when the target ref no longer descends from the Draft Base', async () => {
    const f = await fixture();
    await f.publish('local');
    const before = (await f.read())!;
    await insertBranch(setup.db, { projectId: f.projectId, name: 'unrelated' });
    const unrelated = await commitRepositoryYOpsState({
      db: setup.db,
      projectId: f.projectId,
      refName: 'unrelated',
      expectedHead: null,
      target: createYOpsState({ product: { title: 'unrelated' } }),
      actor,
    });
    await setup.db
      .update(branches)
      .set({ headCommitHash: unrelated.commitDigest })
      .where(and(eq(branches.projectId, f.projectId), eq(branches.name, 'main')));
    await expect(
      prepareWorkspaceReconciliation(setup.db, {
        projectId: f.projectId,
        workspaceId: f.workspaceId,
        expectedWorkspaceRevision: before.revision,
        expectedRefHead: unrelated.commitDigest,
      })
    ).rejects.toThrow('diverged from the Draft Base');
    expect(await f.read()).toEqual(before);
  });

  it('resolves every structured conflict explicitly and validates the complete result before applying', async () => {
    const projectId = (await insertProject(setup.db, { name: 'Validated resolution' })).projectId;
    await insertBranch(setup.db, { projectId, name: 'main' });
    const material = await createMaterial(setup.db, {
      project_id: projectId,
      source_type: 'document',
      title: 'prd.md',
      content_text: 'Evidence for the complete PRD fixture.',
      content_hash: 'resolution-evidence',
    });
    const baseCandidate = structuredClone(t3xPrdP0Fixtures.validCandidateTree);
    const base = await commitRepositoryYOpsState({
      db: setup.db,
      projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ candidate: baseCandidate }),
      actor,
    });
    const workspaceId = 'workspace_validated_resolution';
    const draft = await upsertWorkspaceDraft(setup.db, {
      project_id: projectId,
      workspace_id: workspaceId,
      title: 'Validated resolution',
      target_branch: 'main',
      workspace_state: {
        targetBranch: 'main',
        schemaBindings: [
          {
            canonicalName: 't3x/prd',
            schemaName: 'Candidate Schema',
            version: 'v2',
          },
        ],
        sourceBundle: [
          {
            id: `material:${material.id}`,
            materialId: material.id,
            contentHash: material.content_hash,
          },
        ],
      },
    });
    const initialized = await initializeWorkspaceAuthoring(setup.db, {
      projectId,
      workspaceId,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: base.commitDigest,
      actionId: 'init-resolution',
      actor,
    });
    const local = await publishWorkspaceAuthoringAction(setup.db, {
      projectId,
      workspaceId,
      actor,
      channel: 'manual',
      actionId: 'local-priority',
      operations: [
        {
          set: {
            path: 'candidate/requirements/schema_contract/priority',
            value: 'should',
          },
        },
      ],
      expectedRevision: 0,
      expectedWorkspaceRevision: initialized.draft.revision,
      expectedRefHead: base.commitDigest,
    });
    const remoteCandidate = structuredClone(baseCandidate);
    remoteCandidate.requirements.schema_contract.priority = 'could';
    const remote = await commitRepositoryYOpsState({
      db: setup.db,
      projectId,
      refName: 'main',
      expectedHead: base.commitDigest,
      target: createYOpsState({ candidate: remoteCandidate }),
      actor,
    });
    const preview = await prepareWorkspaceReconciliation(setup.db, {
      projectId,
      workspaceId,
      expectedWorkspaceRevision: local.draft.revision,
      expectedRefHead: remote.commitDigest,
    });
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0]).toMatchObject({
      path: '/candidate/requirements/schema_contract/priority',
      kind: 'value',
      base: { present: true, source: 'base', value: 'must' },
      ours: { present: true, source: 'workspace_draft', value: 'should' },
      theirs: { present: true, source: 'branch', value: 'could' },
    });
    const conflictId = preview.conflicts[0]!.id;
    await expect(
      decideWorkspaceReconciliation(setup.db, {
        projectId,
        workspaceId,
        requestId: 'incomplete-resolution',
        actor,
        expectedWorkspaceRevision: local.draft.revision,
        expectedRefHead: remote.commitDigest,
        preparationDigest: preview.preparationDigest,
        action: 'resolve',
        resolutions: [],
      })
    ).rejects.toThrow('Every conflict requires a resolution');
    await expect(
      decideWorkspaceReconciliation(setup.db, {
        projectId,
        workspaceId,
        requestId: 'invalid-resolution',
        actor,
        expectedWorkspaceRevision: local.draft.revision,
        expectedRefHead: remote.commitDigest,
        preparationDigest: preview.preparationDigest,
        action: 'resolve',
        resolutions: [{ conflictId, choice: 'custom', value: 'critical' }],
      })
    ).rejects.toBeInstanceOf(WorkspaceReconciliationValidationError);
    expect((await findWorkspaceDraft(setup.db, projectId, workspaceId))?.revision).toBe(
      local.draft.revision
    );
    const resolved = await decideWorkspaceReconciliation(setup.db, {
      projectId,
      workspaceId,
      requestId: 'valid-resolution',
      actor,
      expectedWorkspaceRevision: local.draft.revision,
      expectedRefHead: remote.commitDigest,
      preparationDigest: preview.preparationDigest,
      action: 'resolve',
      resolutions: [{ conflictId, choice: 'ours' }],
    });
    expect(resolved.value.kind).toBe('resolved');
    expect(
      currentComposition(workspaceAuthoringState(resolved.draft.workspace_state!).ledger)
    ).toMatchObject({ candidate: { requirements: { schema_contract: { priority: 'should' } } } });
    expect(
      (
        resolved.draft.workspace_state?.authoringReconciliations as Array<Record<string, unknown>>
      ).at(-1)
    ).toMatchObject({
      outcome: 'resolve',
      conflictIds: [conflictId],
      resolutions: [{ conflictId, choice: 'ours' }],
      actor,
    });
  });
});
