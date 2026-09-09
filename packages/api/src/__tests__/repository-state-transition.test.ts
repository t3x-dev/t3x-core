import {
  prepareRepositoryYOpsStateWrite,
  REPOSITORY_MERGE_POLICY,
  REPOSITORY_STATE_POLICY,
} from '@t3x-dev/application';
import { createYamlSourceState, createYOpsState, describeTransitionObject } from '@t3x-dev/core';
import {
  type AnyDB,
  acquireTransitionPolicyBindingLock,
  bindTransitionPolicy,
  ensureMainBranch,
  getTransitionRefHead,
  getVerifiedTransitionCommitGraph,
  insertBranch,
  insertProject,
  listRepositoryDecisionAudit,
  listTransitionCommits,
  TransitionHeadConflictError,
  TransitionYOpsLogMembershipError,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitRepositoryYOpsMerge,
  commitRepositoryYOpsState,
  createRepositoryYOpsStateFromSemanticContent,
  decodeRepositorySemanticContentState,
  getRepositorySemanticCommit,
  prepareRepositoryYOpsMerge,
  TransitionReviewStaleError,
} from '../lib/repository-state-transition';
import {
  commitPreparedRepositoryTransition,
  TransitionDecisionMembershipError,
} from '../lib/transition-control-plane/lifecycle';
import { setupTestDB, testData } from './setup';

const HUMAN = { kind: 'human' as const, id: 'user:repository-state-test' };
type TxRunner = { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T> };

let db: AnyDB;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('repository YOps State Transition application service', () => {
  it('persists the complete graph and advances an empty ref through CommitV2 CAS', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository State Transition' })
    );
    await ensureMainBranch(db, project.projectId);
    const target = createYOpsState({ service: { enabled: true } });
    const policyBinding = {
      policy: REPOSITORY_STATE_POLICY.policy,
      resource: {
        ...REPOSITORY_STATE_POLICY.resource,
        uri: `t3x://projects/${project.projectId}/policies/repository-state`,
      },
    };

    const created = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target,
      actor: HUMAN,
      intent: 'Enable the service',
      rationale: 'The repository command requested the exact target State.',
      policyBinding,
    });

    expect(created.transition).toMatchObject({
      mode: 'transition',
      history: { observation: 'committed' },
      audit: { commit: { digest: created.commitDigest } },
    });
    await expect(
      getTransitionRefHead(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toMatchObject({
      format: 'transition_v2',
      head: created.commitDigest,
      state: target,
    });
    const graph = await getVerifiedTransitionCommitGraph(
      db,
      project.projectId,
      created.commitDigest
    );
    expect(graph?.effect.result).toEqual(describeTransitionObject(target));
    expect(graph?.state).toEqual(target);
    expect(graph?.decision.predicate.policy).toEqual({
      mode: 'evaluated',
      resource: policyBinding.resource,
    });
    await expect(listTransitionCommits(db, project.projectId)).resolves.toHaveLength(1);
    await expect(
      listRepositoryDecisionAudit(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toEqual([expect.objectContaining({ outcome: 'accepted' })]);
  });

  it('rejects a server policy rebind serialized ahead of one-shot authorization', async () => {
    const project = await insertProject(db, testData.project({ name: 'Repository policy race' }));
    await ensureMainBranch(db, project.projectId);
    const selected = await bindTransitionPolicy(db, {
      projectId: project.projectId,
      refName: 'main',
      uri: 't3x://policies/repository-race/selected',
      policy: REPOSITORY_STATE_POLICY.policy,
      actor: { kind: 'human', id: 'user:policy-admin' },
    });

    let releasePolicyWriter!: () => void;
    const policyWriterCanContinue = new Promise<void>((resolve) => {
      releasePolicyWriter = resolve;
    });
    let reportPolicyLocked!: () => void;
    const policyLocked = new Promise<void>((resolve) => {
      reportPolicyLocked = resolve;
    });
    const policyWriter = (db as unknown as TxRunner).transaction(async (rawTx) => {
      const tx = rawTx as AnyDB;
      await acquireTransitionPolicyBindingLock(tx, project.projectId, 'main');
      reportPolicyLocked();
      await policyWriterCanContinue;
      await bindTransitionPolicy(tx, {
        projectId: project.projectId,
        refName: 'main',
        uri: 't3x://policies/repository-race/rebound',
        policy: REPOSITORY_STATE_POLICY.policy,
        actor: { kind: 'human', id: 'user:policy-admin' },
      });
    });
    await policyLocked;

    let commitSettled = false;
    const commit = commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ version: 'raced' }),
      actor: HUMAN,
      policyBinding: selected,
      policyBindingSource: 'server-selected',
    }).finally(() => {
      commitSettled = true;
    });
    void commit.catch(() => undefined);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(commitSettled).toBe(false);
    } finally {
      releasePolicyWriter();
      await policyWriter;
    }

    await expect(commit).rejects.toBeInstanceOf(TransitionReviewStaleError);
    await expect(listTransitionCommits(db, project.projectId)).resolves.toEqual([]);
    await expect(
      listRepositoryDecisionAudit(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toEqual([]);
  });

  it('rejects a first server binding inserted after observed absence', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository first policy bind race' })
    );
    await ensureMainBranch(db, project.projectId);

    let releasePolicyWriter!: () => void;
    const policyWriterCanContinue = new Promise<void>((resolve) => {
      releasePolicyWriter = resolve;
    });
    let reportPolicyLocked!: () => void;
    const policyLocked = new Promise<void>((resolve) => {
      reportPolicyLocked = resolve;
    });
    const policyWriter = (db as unknown as TxRunner).transaction(async (rawTx) => {
      const tx = rawTx as AnyDB;
      const locked = await acquireTransitionPolicyBindingLock(tx, project.projectId, 'main');
      expect(locked.policyBindingFound).toBe(false);
      reportPolicyLocked();
      await policyWriterCanContinue;
      await bindTransitionPolicy(tx, {
        projectId: project.projectId,
        refName: 'main',
        uri: 't3x://policies/repository-race/first-binding',
        policy: REPOSITORY_STATE_POLICY.policy,
        actor: { kind: 'human', id: 'user:policy-admin' },
      });
    });
    await policyLocked;

    let commitSettled = false;
    const commit = commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ version: 'first-bind-raced' }),
      actor: HUMAN,
      policyBindingSource: 'server-selected',
    }).finally(() => {
      commitSettled = true;
    });
    void commit.catch(() => undefined);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(commitSettled).toBe(false);
    } finally {
      releasePolicyWriter();
      await policyWriter;
    }

    await expect(commit).rejects.toBeInstanceOf(TransitionReviewStaleError);
    await expect(listTransitionCommits(db, project.projectId)).resolves.toEqual([]);
  });

  it('rejects an independently substituted expected head for a parentless prepared write', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository Prepared Target Binding' })
    );
    await ensureMainBranch(db, project.projectId);
    const prepared = prepareRepositoryYOpsStateWrite({
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      base: createYOpsState({}),
      target: createYOpsState({ version: 1 }),
      actor: HUMAN,
      policyBinding: REPOSITORY_STATE_POLICY,
      recordedAt: '2026-08-29T00:00:00.000Z',
    });

    await expect(
      commitPreparedRepositoryTransition({
        db,
        preparedTarget: prepared.target,
        projectId: prepared.target.projectId,
        refName: prepared.target.refName,
        expectedHead: `sha256:${'f'.repeat(64)}`,
        proposal: prepared.proposal,
        effect: prepared.effect,
        rationale: prepared.rationale,
        decidedAt: prepared.decidedAt,
        authority: prepared.authority,
        parents: prepared.parents,
        objects: prepared.objects,
      })
    ).rejects.toBeInstanceOf(TransitionDecisionMembershipError);
    await expect(listTransitionCommits(db, project.projectId)).resolves.toEqual([]);
  });

  it('rejects substitutions across the prepared commit bundle before audit persistence', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository Prepared Bundle Binding' })
    );
    await ensureMainBranch(db, project.projectId);
    const prepared = prepareRepositoryYOpsStateWrite({
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      base: createYOpsState({}),
      target: createYOpsState({ version: 'bound-bundle' }),
      actor: HUMAN,
      rationale: 'The exact prepared bundle was reviewed.',
      yopsLogIds: ['yop_bundle_identity'],
      policyBinding: REPOSITORY_STATE_POLICY,
      serverPolicyBindingExpectation: {
        expected: REPOSITORY_STATE_POLICY,
        required: false,
      },
      recordedAt: '2026-08-29T00:00:00.000Z',
    });
    const exact: Parameters<typeof commitPreparedRepositoryTransition>[0] = {
      db,
      preparedTarget: prepared.target,
      projectId: prepared.target.projectId,
      refName: prepared.target.refName,
      expectedHead: prepared.target.expectedHead,
      proposal: prepared.proposal,
      effect: prepared.effect,
      rationale: prepared.rationale,
      decidedAt: prepared.decidedAt,
      authority: prepared.authority,
      parents: prepared.parents,
      objects: prepared.objects,
      yopsLogIds: prepared.yopsLogIds,
      serverPolicyBindingExpectation: prepared.serverPolicyBindingExpectation,
    };
    const substitutions: Array<Parameters<typeof commitPreparedRepositoryTransition>[0]> = [
      { ...exact, parents: [...prepared.parents] },
      { ...exact, objects: [...prepared.objects] },
      { ...exact, rationale: structuredClone(prepared.rationale) },
      { ...exact, decidedAt: '2026-08-29T00:00:00.001Z' },
      { ...exact, yopsLogIds: [...prepared.yopsLogIds!] },
      { ...exact, serverPolicyBindingExpectation: undefined },
      {
        ...exact,
        serverPolicyBindingExpectation: structuredClone(prepared.serverPolicyBindingExpectation!),
      },
      {
        ...exact,
        serverPolicyBindingExpectation: { expected: null, required: false },
      },
    ];

    for (const substituted of substitutions) {
      await expect(commitPreparedRepositoryTransition(substituted)).rejects.toThrow(
        'exact prepared write bundle'
      );
    }
    await expect(listTransitionCommits(db, project.projectId)).resolves.toEqual([]);
    await expect(
      listRepositoryDecisionAudit(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toEqual([]);
  });

  it('creates a first-parent CommitV2 chain and rejects a stale observed head', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository State CAS Transition' })
    );
    await ensureMainBranch(db, project.projectId);
    const first = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target: createYOpsState({ version: 1 }),
      actor: HUMAN,
    });
    const second = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: first.commitDigest,
      target: createYOpsState({ version: 2 }),
      actor: HUMAN,
    });
    const graph = await getVerifiedTransitionCommitGraph(
      db,
      project.projectId,
      second.commitDigest
    );
    expect(graph?.commit.parents.map((parent) => parent.digest)).toEqual([first.commitDigest]);

    await expect(
      commitRepositoryYOpsState({
        db,
        projectId: project.projectId,
        refName: 'main',
        expectedHead: first.commitDigest,
        target: createYOpsState({ version: 3 }),
        actor: HUMAN,
      })
    ).rejects.toBeInstanceOf(TransitionHeadConflictError);
    await expect(
      getTransitionRefHead(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toMatchObject({ head: second.commitDigest });
  });

  it('fails explicitly when a task tries to replace a non-YOps State through this adapter', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository State Unsupported Codec' })
    );
    await ensureMainBranch(db, project.projectId);

    await expect(
      commitRepositoryYOpsState({
        db,
        projectId: project.projectId,
        refName: 'main',
        expectedHead: null,
        target: createYamlSourceState('device:\n  enabled: true\n'),
        actor: HUMAN,
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    await expect(listTransitionCommits(db, project.projectId)).resolves.toEqual([]);
  });

  it('rolls back Decision audit, CommitV2, and ref when commit persistence fails', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository State Atomic Commit' })
    );
    await ensureMainBranch(db, project.projectId);

    await expect(
      commitRepositoryYOpsState({
        db,
        projectId: project.projectId,
        refName: 'main',
        expectedHead: null,
        target: createYOpsState({ version: 1 }),
        actor: HUMAN,
        yopsLogIds: ['missing-yops-log'],
      })
    ).rejects.toBeInstanceOf(TransitionYOpsLogMembershipError);

    await expect(listTransitionCommits(db, project.projectId)).resolves.toEqual([]);
    await expect(
      listRepositoryDecisionAudit(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toEqual([]);
    await expect(
      getTransitionRefHead(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toMatchObject({ format: 'empty', head: null });
  });

  it('round-trips repository trees and relations through the versioned YOps domain', () => {
    const content = {
      trees: [{ key: 'a', slots: { text: 'A' }, children: [] }],
      relations: [{ from: 'a', to: 'b', type: 'supports' }],
    };
    const state = createRepositoryYOpsStateFromSemanticContent(content);

    expect(decodeRepositorySemanticContentState(state)).toEqual(content);
    expect(() => decodeRepositorySemanticContentState(createYOpsState({ a: true }))).toThrowError(
      'State is not a t3x.dev/semantic-content version 1 YOps document'
    );
  });

  it('projects only a verified semantic CommitV2 graph for tree consumers', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository Semantic Read Projection' })
    );
    await ensureMainBranch(db, project.projectId);
    const semanticContent = {
      trees: [{ key: 'read-model', slots: { enabled: true }, children: [] }],
      relations: [],
    };
    const created = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target: createRepositoryYOpsStateFromSemanticContent(semanticContent),
      actor: HUMAN,
      intent: 'Create a semantic read model',
      rationale: 'Tree consumers require the explicit semantic State codec.',
    });

    await expect(
      getRepositorySemanticCommit(db, created.commitDigest, project.projectId)
    ).resolves.toMatchObject({
      digest: created.commitDigest,
      projectId: project.projectId,
      schema: 't3x/commit/v2',
      parents: [],
      actor: HUMAN,
      intent: 'Create a semantic read model',
      rationale: 'Tree consumers require the explicit semantic State codec.',
      semanticContent,
    });
    await expect(getRepositorySemanticCommit(db, created.commitDigest)).resolves.toMatchObject({
      digest: created.commitDigest,
      projectId: project.projectId,
    });
  });

  it('recomputes and commits a deterministic two-parent merge with source evidence', async () => {
    const project = await insertProject(
      db,
      testData.project({ name: 'Repository CommitV2 Merge' })
    );
    await ensureMainBranch(db, project.projectId);
    const base = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: null,
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: [{ key: 'shared', slots: { value: 'base' }, children: [] }],
        relations: [],
      }),
      actor: HUMAN,
      intent: 'Create merge base',
    });
    await insertBranch(db, {
      projectId: project.projectId,
      name: 'feature',
      parentBranch: 'main',
    });
    const source = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'feature',
      expectedHead: base.commitDigest,
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: [
          { key: 'shared', slots: { value: 'source' }, children: [] },
          { key: 'source_only', slots: { enabled: true }, children: [] },
        ],
        relations: [],
      }),
      actor: HUMAN,
      intent: 'Change source branch',
    });
    const target = await commitRepositoryYOpsState({
      db,
      projectId: project.projectId,
      refName: 'main',
      expectedHead: base.commitDigest,
      target: createRepositoryYOpsStateFromSemanticContent({
        trees: [
          { key: 'shared', slots: { value: 'target' }, children: [] },
          { key: 'target_only', slots: { enabled: true }, children: [] },
        ],
        relations: [],
      }),
      actor: HUMAN,
      intent: 'Change target branch',
    });
    const mergePolicyBinding = {
      policy: REPOSITORY_MERGE_POLICY.policy,
      resource: {
        ...REPOSITORY_MERGE_POLICY.resource,
        uri: `t3x://projects/${project.projectId}/policies/repository-merge`,
      },
    };

    const prepared = await prepareRepositoryYOpsMerge({
      db,
      projectId: project.projectId,
      sourceDigest: source.commitDigest,
      targetDigest: target.commitDigest,
    });
    expect(prepared.conflicts.map((conflict) => conflict.path)).toEqual(['shared']);

    const merged = await commitRepositoryYOpsMerge({
      db,
      projectId: project.projectId,
      refName: 'main',
      sourceDigest: source.commitDigest,
      targetDigest: target.commitDigest,
      decisions: {
        conflictResolutions: { shared: 'source' },
        keepFromSource: ['source_only'],
        keepFromTarget: ['target_only'],
        keepRelationsFromSource: true,
        keepRelationsFromTarget: true,
      },
      actor: HUMAN,
      message: 'Merge feature into main',
      policyBinding: mergePolicyBinding,
    });

    const graph = await getVerifiedTransitionCommitGraph(
      db,
      project.projectId,
      merged.commitDigest
    );
    expect(graph?.commit.parents.map((parent) => parent.digest)).toEqual([
      target.commitDigest,
      source.commitDigest,
    ]);
    expect(graph?.effect).toMatchObject({
      driver: { protocol: 't3x.dev/yops-semantic-merge', protocolVersion: '1' },
      inputs: [{ role: 'merge-base' }, { role: 'merge-source', object: source.commit.result }],
    });
    expect(graph?.proposal.predicate.rationale).toMatchObject({
      mode: 'inferred',
      evidence: [
        {
          resource: { digest: source.commitDigest },
          locator: { scheme: 't3x.protocol-object/v1' },
        },
      ],
    });
    expect(graph?.decision.predicate.policy).toEqual({
      mode: 'evaluated',
      resource: mergePolicyBinding.resource,
    });
    expect(
      decodeRepositorySemanticContentState(graph!.state).trees.map((tree) => tree.key)
    ).toEqual(['shared', 'source_only', 'target_only']);
    expect(merged.mergeSummary).toMatchObject({
      resolved_conflicts: 1,
      kept_from_source: 1,
      kept_from_target: 1,
      total_nodes: 3,
    });
    await expect(
      getTransitionRefHead(db, { projectId: project.projectId, refName: 'main' })
    ).resolves.toMatchObject({ head: merged.commitDigest, state: graph?.state });

    await expect(
      commitRepositoryYOpsMerge({
        db,
        projectId: project.projectId,
        refName: 'main',
        sourceDigest: source.commitDigest,
        targetDigest: target.commitDigest,
        decisions: {
          conflictResolutions: { shared: 'source' },
          keepFromSource: ['source_only'],
          keepFromTarget: ['target_only'],
          keepRelationsFromSource: true,
          keepRelationsFromTarget: true,
        },
        actor: HUMAN,
        message: 'Retry stale merge',
      })
    ).rejects.toBeInstanceOf(TransitionHeadConflictError);
    await expect(listTransitionCommits(db, project.projectId)).resolves.toHaveLength(4);
  });
});
