import { currentComposition } from '@t3x-dev/application';
import { createYOpsState } from '@t3x-dev/core';
import {
  findWorkspaceDraft,
  getTransitionRefHead,
  insertBranch,
  insertProject,
  transactWorkspaceReconciliation,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commitRepositoryYOpsState } from '../lib/repository-state-transition';
import {
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  readWorkspaceAuthoring,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import {
  reconcileDocuments,
  reconcileWorkspaceAuthoring,
  synchronizeCleanBranchWorkspaces,
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
        schemaBindings: [{ canonicalName: 'test' }],
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

  it('synchronizes a clean Workspace without a Commit and permits the next edit', async () => {
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
});
