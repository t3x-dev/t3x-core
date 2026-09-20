import { currentComposition, REPOSITORY_STATE_POLICY } from '@t3x-dev/application';
import { compileProposalDraft, createHumanProposalDraft, createYOpsState } from '@t3x-dev/core';
import {
  bindTransitionPolicy,
  deleteDraft,
  findWorkspaceDraft,
  insertBranch,
  insertProject,
  resolveTransitionProposalGraph,
  transactWorkspaceAuthoring,
  updateDraft,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyTransition } from '../lib/transition-control-plane';
import { commitTransition, decideTransition } from '../lib/transition-control-plane/lifecycle';
import { materializeTransitionProposal } from '../lib/transition-control-plane/materialize';
import {
  buildAuthoringEffect,
  buildAuthoringPreparation,
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  readWorkspaceAuthoring,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { prepareWorkspaceAuthoringReview } from '../lib/workspace-authoring-review';
import { setupTestDB } from './setup';

describe('durable Draft authoring commands', () => {
  let setup: Awaited<ReturnType<typeof setupTestDB>>;
  let projectId: string;
  const actor = { kind: 'human' as const, id: 'human:test' };
  beforeAll(async () => {
    setup = await setupTestDB();
    const project = await insertProject(setup.db, { name: 'Authoring persistence' });
    projectId = project.projectId;
    await insertBranch(setup.db, { projectId, name: 'main' });
  });
  afterAll(async () => {
    await setup?.cleanup();
  });
  async function initialize(workspaceId: string) {
    await insertBranch(setup.db, { projectId, name: workspaceId });
    const draft = await upsertWorkspaceDraft(setup.db, {
      project_id: projectId,
      workspace_id: workspaceId,
      title: workspaceId,
      target_branch: workspaceId,
      workspace_state: {
        targetBranch: workspaceId,
        yopsDraft: { operations: [] },
        schemaBindings: [{ canonicalName: 't3x/prd', version: 'v2', mode: 'pinned' }],
      },
    });
    return initializeWorkspaceAuthoring(setup.db, {
      projectId,
      workspaceId,
      expectedWorkspaceRevision: draft.revision,
      expectedRefHead: null,
      actionId: `import:${workspaceId}`,
      actor,
    });
  }
  it('persists a multi-node action, recovers a lost response, and reconstructs immutable views', async () => {
    const init = await initialize('durable');
    const command = {
      projectId,
      workspaceId: 'durable',
      actionId: 'a1',
      actor,
      channel: 'manual' as const,
      expectedRevision: 0,
      expectedWorkspaceRevision: init.draft.revision,
      expectedRefHead: null,
      operations: [
        { set: { path: 'allocation', value: 10 } },
        { set: { path: 'enabled', value: true } },
      ],
    };
    const first = await publishWorkspaceAuthoringAction(setup.db, command);
    expect(first.value.kind).toBe('published');
    const retry = await publishWorkspaceAuthoringAction(setup.db, command);
    expect(retry.value.kind).toBe('reused');
    expect(retry.draft.revision).toBe(first.draft.revision);
    const recovered = workspaceAuthoringState(
      (await findWorkspaceDraft(setup.db, projectId, 'durable'))!.workspace_state!
    );
    expect(currentComposition(recovered.ledger)).toEqual({ allocation: 10, enabled: true });
    expect(buildAuthoringEffect(recovered.ledger).result.value).toEqual({
      allocation: 10,
      enabled: true,
    });
    await publishWorkspaceAuthoringAction(setup.db, {
      ...command,
      actionId: 'a2',
      expectedRevision: 1,
      expectedWorkspaceRevision: first.draft.revision,
      operations: [{ set: { path: 'allocation', value: 25 } }],
    });
    const old = await readWorkspaceAuthoring(setup.db, {
      projectId,
      workspaceId: 'durable',
      actionId: 'a1',
      nodeId: 'node:allocation@1:0',
    });
    expect(old.selected?.cards).toHaveLength(2);
    expect(old.selected?.cards.find((c) => c.path === 'allocation')?.after).toBe(10);
    expect(old.node?.current).toBe(25);
    await expect(
      publishWorkspaceAuthoringAction(setup.db, { ...command, reason: 'different facts' })
    ).rejects.toThrow('different');
  });
  it('serializes racing writers, and rolls back failed commands without partial state', async () => {
    const init = await initialize('race');
    const command = {
      projectId,
      workspaceId: 'race',
      actor,
      channel: 'mcp' as const,
      expectedRevision: 0,
      expectedWorkspaceRevision: init.draft.revision,
      expectedRefHead: null,
      operations: [{ set: { path: 'x', value: 1 } }],
    };
    const results = await Promise.allSettled(
      ['r1', 'r2'].map((actionId) =>
        publishWorkspaceAuthoringAction(setup.db, { ...command, actionId })
      )
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await readWorkspaceAuthoring(setup.db, { projectId, workspaceId: 'race' }))
        .compositionRevision
    ).toBe(1);
    const draft = await findWorkspaceDraft(setup.db, projectId, 'race');
    await expect(
      transactWorkspaceAuthoring(
        setup.db,
        { projectId, workspaceId: 'race', refName: 'race' },
        async () => {
          throw new Error('crash before save');
        }
      )
    ).rejects.toThrow('crash');
    expect((await findWorkspaceDraft(setup.db, projectId, 'race'))?.revision).toBe(draft?.revision);
    await expect(
      publishWorkspaceAuthoringAction(setup.db, {
        ...command,
        projectId: 'other',
        actionId: 'cross',
      })
    ).rejects.toThrow();
  });
  it('prevents legacy forgery, overwrite and deletion of retained audit', async () => {
    const init = await initialize('protected');
    await expect(
      updateDraft(setup.db, init.draft.id, { workspace_state: {} }, init.draft.revision)
    ).rejects.toThrow('immutable');
    await expect(deleteDraft(setup.db, init.draft.id)).rejects.toThrow('retained');
    await expect(
      upsertWorkspaceDraft(setup.db, {
        project_id: projectId,
        workspace_id: 'forged',
        title: 'forged',
        workspace_state: init.draft.workspace_state!,
      })
    ).rejects.toThrow('command service');
    const renamed = await updateDraft(
      setup.db,
      init.draft.id,
      { title: 'New title' },
      init.draft.revision
    );
    expect(renamed.workspace_state).toEqual(init.draft.workspace_state);
  });
  it('persists no-change outcomes and does not advance composition', async () => {
    const init = await initialize('no-op');
    const command = {
      projectId,
      workspaceId: 'no-op',
      actionId: 'noop',
      actor,
      channel: 'manual' as const,
      expectedRevision: 0,
      expectedWorkspaceRevision: init.draft.revision,
      expectedRefHead: null,
      operations: [],
    };
    const first = await publishWorkspaceAuthoringAction(setup.db, command);
    expect(first.value.kind).toBe('no_change');
    const again = await publishWorkspaceAuthoringAction(setup.db, command);
    expect(again.draft.revision).toBe(first.draft.revision);
    expect(
      (await readWorkspaceAuthoring(setup.db, { projectId, workspaceId: 'no-op' })).actions
    ).toEqual([]);
  });
  it('prepares Review through the public service with the complete Draft and explicit schema findings', async () => {
    const init = await initialize('review-service');
    const saved = await publishWorkspaceAuthoringAction(setup.db, {
      projectId,
      workspaceId: 'review-service',
      actionId: 'edit',
      actor,
      channel: 'manual',
      expectedRevision: 0,
      expectedWorkspaceRevision: init.draft.revision,
      expectedRefHead: null,
      operations: [{ set: { path: 'prd', value: { audience: 'operators' } } }],
    });
    const reviewed = await prepareWorkspaceAuthoringReview({
      db: setup.db,
      projectId,
      workspaceId: 'review-service',
      requestId: 'review-service',
      actor,
      expectedRevision: 1,
      expectedWorkspaceRevision: saved.draft.revision,
      expectedRefHead: null,
      reason: 'Review the complete Draft',
    });
    expect(reviewed.authoring.actionCount).toBe(1);
    expect(reviewed.authoring.preparationDigest).toMatch(/^sha256:/);
    const graph = await resolveTransitionProposalGraph(
      setup.db,
      projectId,
      reviewed.view.transitionId
    );
    expect(graph.result.value).toEqual({ prd: { audience: 'operators' } });
    expect(JSON.parse(graph.preparation!.canonicalJson).ledger.actions).toHaveLength(1);
    expect(reviewed.view.precondition.workspaceRevision).toBe(saved.draft.revision);
  });
  it('freezes the full manifest through canonical Review, Decision and Commit', async () => {
    const init = await initialize('review');
    const saved = await publishWorkspaceAuthoringAction(setup.db, {
      projectId,
      workspaceId: 'review',
      actionId: 'full',
      actor,
      channel: 'manual',
      expectedRevision: 0,
      expectedWorkspaceRevision: init.draft.revision,
      expectedRefHead: null,
      operations: [{ set: { path: 'x', value: 1 } }, { set: { path: 'y', value: 2 } }],
    });
    const policy = structuredClone(REPOSITORY_STATE_POLICY.policy);
    policy.checks.replay = {
      issuers: { mode: 'any' },
      tools: { mode: 'any' },
      environments: { mode: 'any' },
    };
    await bindTransitionPolicy(setup.db, {
      projectId,
      refName: 'review',
      uri: 't3x://tests/authoring-policy',
      policy,
      actor,
    });
    const frozen = buildAuthoringPreparation(saved.draft.workspace_state!);
    const built = buildAuthoringEffect(frozen.ledger);
    const base = createYOpsState(frozen.ledger.base);
    const proposal = compileProposalDraft({
      draft: createHumanProposalDraft({ why: 'Save both fields' }),
      effect: built.effect,
      actor,
    });
    if (!proposal.ok) throw new Error('Compilation failed');
    const created = await materializeTransitionProposal({
      db: setup.db,
      projectId,
      workspaceId: 'review',
      workspaceRevision: saved.draft.revision,
      refName: 'review',
      refHead: null,
      requestKind: 'structured_yops',
      requestId: 'review',
      requestFacts: { operation: 'review' },
      preparationFacts: JSON.parse(JSON.stringify(frozen)),
      actor,
      base,
      result: built.result,
      effect: built.effect,
      proposal: proposal.proposal,
    });
    const id = created.membership.transitionId;
    const verified = await verifyTransition({
      db: setup.db,
      projectId,
      transitionId: id,
      requestId: 'verify',
      actor,
    });
    const decision = await decideTransition({
      db: setup.db,
      projectId,
      transitionId: id,
      requestId: 'decide',
      actor,
      outcome: 'accepted',
      precondition: verified.view.precondition,
    });
    const committed = await commitTransition({
      db: setup.db,
      projectId,
      transitionId: id,
      requestId: 'commit',
      actor,
      decisionDigest: decision.decisionDigest,
      expectedHead: null,
    });
    const graph = await resolveTransitionProposalGraph(setup.db, projectId, id);
    expect(JSON.parse(graph.preparation!.canonicalJson)).toEqual(frozen);
    const retained = await findWorkspaceDraft(setup.db, projectId, 'review');
    expect(retained?.status).toBe('committed');
    expect(retained?.workspace_state?.authoringLedger).toEqual(frozen.ledger);
    expect(
      (
        await commitTransition({
          db: setup.db,
          projectId,
          transitionId: id,
          requestId: 'commit',
          actor,
          decisionDigest: decision.decisionDigest,
          expectedHead: null,
        })
      ).commitDigest
    ).toBe(committed.commitDigest);
  });
});
