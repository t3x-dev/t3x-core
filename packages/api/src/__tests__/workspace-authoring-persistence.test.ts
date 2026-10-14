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
import { UNPROTECTED_REF_POLICY } from '../lib/transition-control-plane/applicable-policy';
import {
  commitTransition,
  decideTransition,
  TransitionReviewStaleError,
} from '../lib/transition-control-plane/lifecycle';
import { materializeTransitionProposal } from '../lib/transition-control-plane/materialize';
import {
  buildAuthoringEffect,
  buildAuthoringPreparation,
  ensureWorkspaceAuthoringSchema,
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  readWorkspaceAuthoring,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { prepareWorkspaceAuthoringReview } from '../lib/workspace-authoring-review';
import { decideWorkspaceTransition } from '../lib/workspace-transition';
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
  async function initialize(workspaceId: string, unbound = false) {
    await insertBranch(setup.db, { projectId, name: workspaceId });
    const draft = await upsertWorkspaceDraft(setup.db, {
      project_id: projectId,
      workspace_id: workspaceId,
      title: workspaceId,
      target_branch: workspaceId,
      workspace_state: {
        targetBranch: workspaceId,
        yopsDraft: { operations: [] },
        schemaBindings: unbound
          ? []
          : [{ canonicalName: 't3x/prd', version: 'v2', mode: 'pinned' }],
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
  it('repairs missing Schema with revision protection and leaves immutable history intact', async () => {
    const init = await initialize('unbound', true);
    const input = { projectId, workspaceId: 'unbound', expectedRevision: init.draft.revision };
    await expect(
      ensureWorkspaceAuthoringSchema(setup.db, { ...input, expectedRevision: 0 })
    ).rejects.toThrow();
    const revision = await ensureWorkspaceAuthoringSchema(setup.db, input);
    const saved = (await findWorkspaceDraft(setup.db, projectId, 'unbound'))!;
    expect(revision).toBe(init.draft.revision + 1);
    expect(saved.workspace_state?.authoringLedger).toEqual(
      init.draft.workspace_state?.authoringLedger
    );
    expect(saved.workspace_state?.authoringBasis).toEqual(
      init.draft.workspace_state?.authoringBasis
    );
    expect(saved.workspace_state?.schemaBindings).toEqual([
      expect.objectContaining({ canonicalName: 't3x/prd', version: 'v2' }),
    ]);
    await ensureWorkspaceAuthoringSchema(setup.db, { ...input, expectedRevision: revision });
    expect((await findWorkspaceDraft(setup.db, projectId, 'unbound'))?.revision).toBe(revision);
  });
  it('persists a new root object after earlier actions added fields to an existing object', async () => {
    const workspaceId = 'append-root-after-edit';
    const init = await initialize(workspaceId);
    const command = {
      projectId,
      workspaceId,
      actor,
      channel: 'manual' as const,
      expectedRefHead: null,
    };
    const seeded = await publishWorkspaceAuthoringAction(setup.db, {
      ...command,
      actionId: 'seed-root',
      expectedRevision: 0,
      expectedWorkspaceRevision: init.draft.revision,
      operations: [
        {
          set: { path: 'trees', value: [{ key: 'prd', slots: { title: 'Draft' }, children: [] }] },
        },
      ],
    });
    const edited = await publishWorkspaceAuthoringAction(setup.db, {
      ...command,
      actionId: 'edit-root',
      expectedRevision: 1,
      expectedWorkspaceRevision: seeded.draft.revision,
      operations: [{ set: { path: 'trees/[key=prd]/slots/audience', value: 'Team' } }],
    });
    const added = await publishWorkspaceAuthoringAction(setup.db, {
      ...command,
      actionId: 'append-root',
      expectedRevision: 2,
      expectedWorkspaceRevision: edited.draft.revision,
      operations: [
        { append: { path: 'trees', value: { key: 'new-root', slots: {}, children: [] } } },
      ],
    });
    expect(added.value.kind).toBe('published');
    const recovered = workspaceAuthoringState(
      (await findWorkspaceDraft(setup.db, projectId, workspaceId))!.workspace_state!
    );
    const expected = {
      trees: [
        { key: 'prd', slots: { title: 'Draft', audience: 'Team' }, children: [] },
        { key: 'new-root', slots: {}, children: [] },
      ],
    };
    expect(recovered.ledger.compositionRevision).toBe(3);
    expect(currentComposition(recovered.ledger)).toEqual(expected);
    expect(buildAuthoringEffect(recovered.ledger).result.value).toEqual(expected);
  });

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
    const renewed = await findWorkspaceDraft(setup.db, projectId, 'review');
    expect(renewed?.status).toBe('editing');
    expect(renewed?.workspace_state?.authoringHistory).toEqual([
      expect.objectContaining({
        commitDigest: committed.commitDigest,
        preparationDigest: graph.preparation!.digest,
        compositionRevision: frozen.ledger.compositionRevision,
        basis: frozen.basis,
      }),
    ]);
    expect(renewed?.workspace_state?.authoringLedger).toMatchObject({
      base: { x: 1, y: 2 },
      compositionRevision: 0,
      actions: [],
    });
    expect(renewed?.workspace_state?.authoringBasis).toMatchObject({
      refName: 'review',
      refHead: committed.commitDigest,
    });
    const next = await publishWorkspaceAuthoringAction(setup.db, {
      projectId,
      workspaceId: 'review',
      actionId: 'after-commit',
      actor,
      channel: 'manual',
      expectedRevision: 0,
      expectedWorkspaceRevision: renewed!.revision,
      expectedRefHead: committed.commitDigest,
      operations: [{ set: { path: 'z', value: 3 } }],
    });
    expect(next.value.kind).toBe('published');
    expect(
      buildAuthoringPreparation(next.draft.workspace_state!).ledger.actions.map((a) => a.actionId)
    ).toEqual(['after-commit']);
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
  it('lets a human commit a Draft on an unprotected ref while machine actors still need a rule', async () => {
    const init = await initialize('unprotected');
    const saved = await publishWorkspaceAuthoringAction(setup.db, {
      projectId,
      workspaceId: 'unprotected',
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
      workspaceId: 'unprotected',
      requestId: 'unprotected-review',
      actor,
      expectedRevision: 1,
      expectedWorkspaceRevision: saved.draft.revision,
      expectedRefHead: null,
    });
    const precondition = reviewed.view.precondition;
    expect(precondition.policyDigest).toBe(UNPROTECTED_REF_POLICY.resource.digest);
    await expect(
      decideTransition({
        db: setup.db,
        projectId,
        transitionId: reviewed.view.transitionId,
        requestId: 'agent-decide',
        actor: { kind: 'agent', id: 'agent:test' },
        outcome: 'accepted',
        precondition,
      })
    ).rejects.toBeInstanceOf(TransitionReviewStaleError);

    const decide = (outcome: 'accepted' | 'overridden', decisionReason?: string) =>
      decideWorkspaceTransition(setup.db, {
        projectId,
        workspaceId: 'unprotected',
        transitionId: reviewed.view.transitionId,
        actor,
        policyBinding: null,
        outcome,
        ...(decisionReason === undefined ? {} : { decisionReason }),
        precondition: {
          workspaceRevision: precondition.workspaceRevision,
          refHead: precondition.refHead,
          effectDigest: precondition.effectDigest,
          proposalDigest: precondition.proposalDigest,
          statementDigests: [...precondition.statementDigests],
          policyDigest: precondition.policyDigest!,
        },
      });
    await expect(decide('accepted')).rejects.toMatchObject({
      failures: [expect.objectContaining({ code: 'VALIDATION_FAILED', overrideable: true })],
    });
    const decided = await decide('overridden', 'Ship the partial PRD');
    expect(decided.commit).toBeDefined();
    const renewed = await findWorkspaceDraft(setup.db, projectId, 'unprotected');
    expect(renewed?.status).toBe('editing');
    expect(renewed?.parent_commit_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(renewed?.workspace_state?.authoringBasis).toMatchObject({
      refHead: renewed?.parent_commit_hash,
    });
  });
});
