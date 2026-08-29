import {
  createRepositorySemanticState,
  createYOpsState,
  describeTransitionObject,
  type SemanticContent,
  type StatementObservation,
} from '@t3x-dev/core';
import { type CommitV2, parseCommitV2, type State } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
  assertPreparedRepositoryTransitionAuthorityTarget,
  prepareRepositoryYOpsMergeWrite,
  prepareRepositoryYOpsStateWrite,
  REPOSITORY_MERGE_POLICY,
  REPOSITORY_MERGE_REPLAY_TOOL,
  REPOSITORY_STATE_POLICY,
  REPOSITORY_STATE_REPLAY_TOOL,
} from '../repository/writers';

const ACTOR = { kind: 'human' as const, id: 'human:repository-writer-test' };
const RECORDED_AT = '2026-08-17T00:00:00.000Z' as const;

function commitFor(state: State, digestSeed: string, parents: CommitV2[] = []): CommitV2 {
  return parseCommitV2({
    schema: 't3x/commit/v2',
    parents: parents.map((parent) => describeTransitionObject(parent)),
    decision: {
      kind: 'statement',
      schema: 't3x/statement/v1',
      digest: `sha256:${digestSeed.repeat(64).slice(0, 64)}`,
    },
    result: describeTransitionObject(state),
  });
}

function content(trees: SemanticContent['trees']): SemanticContent {
  return { trees, relations: [] };
}

describe('repository writer preparation', () => {
  it('builds the repository State replacement proposal, replay Statement, and policy bundle', async () => {
    const base = createYOpsState({ service: { enabled: false } });
    const target = createYOpsState({ service: { enabled: true } });
    const parentCommit = commitFor(base, 'a');
    const evidence = [
      {
        resource: {
          uri: 't3x://projects/project_1/conversations/c1/turns/t1',
          mediaType: 'text/plain;charset=utf-8',
          digest: `sha256:${'b'.repeat(64)}` as const,
        },
        locator: { scheme: 't3x.text-quote/v1', value: { quote: 'turn text' } },
      },
    ];

    const prepared = prepareRepositoryYOpsStateWrite({
      projectId: 'project_1',
      refName: 'main',
      expectedHead: describeTransitionObject(parentCommit).digest,
      base,
      target,
      parentCommit,
      actor: ACTOR,
      intent: ' Enable service ',
      rationale: ' Exact target State was reviewed. ',
      evidence,
      yopsLogIds: ['yop_1'],
      policyBinding: REPOSITORY_STATE_POLICY,
      recordedAt: RECORDED_AT,
    });

    expect(prepared.target).toEqual({
      projectId: 'project_1',
      refName: 'main',
      expectedHead: describeTransitionObject(parentCommit).digest,
    });
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.target)).toBe(true);
    expect(prepared.effect.result).toEqual(describeTransitionObject(target));
    expect(prepared.parents).toEqual([parentCommit]);
    expect(prepared.objects).toEqual([base, prepared.result, parentCommit]);
    expect(prepared.yopsLogIds).toEqual(['yop_1']);
    expect(prepared.rationale).toEqual({
      mode: 'authored',
      value: 'Exact target State was reviewed.',
      evidence: [],
    });
    expect(prepared.proposal.predicate.intent).toMatchObject({
      mode: 'authored',
      value: 'Enable service',
    });
    expect(prepared.proposal.predicate.rationale).toMatchObject({
      mode: 'authored',
      evidence,
    });

    const facts = await prepared.authority.resolve({
      projectId: 'project_1',
      refName: 'main',
      proposal: prepared.proposal,
      effect: prepared.effect,
    });
    expect(facts.actorContext.actor).toEqual(ACTOR);
    expect(facts.observationScope.sources).toEqual(['server:repository-state-transition']);
    expect(facts.policyResource).toEqual(REPOSITORY_STATE_POLICY.resource);
    expect(facts.statements).toHaveLength(1);
    expect(facts.statements[0]!.statement.predicate).toMatchObject({
      outcome: 'verified',
      tool: REPOSITORY_STATE_REPLAY_TOOL,
      run: { recordedAt: RECORDED_AT },
    });
  });

  it('captures caller-owned evidence and YOps log ids as preparation snapshots', () => {
    const base = createYOpsState({ service: { enabled: false } });
    const target = createYOpsState({ service: { enabled: true } });
    const evidence = [
      {
        resource: {
          uri: 't3x://projects/project_1/conversations/c1/turns/t1',
          mediaType: 'text/plain;charset=utf-8',
          digest: `sha256:${'e'.repeat(64)}` as const,
        },
        locator: { scheme: 't3x.text-quote/v1', value: { quote: 'original evidence' } },
      },
    ];
    const yopsLogIds = ['yop_1'];

    const prepared = prepareRepositoryYOpsStateWrite({
      projectId: 'project_1',
      refName: 'main',
      expectedHead: null,
      base,
      target,
      actor: ACTOR,
      rationale: 'Exact target State was reviewed.',
      evidence,
      yopsLogIds,
      policyBinding: REPOSITORY_STATE_POLICY,
      recordedAt: RECORDED_AT,
    });
    evidence[0]!.locator.value.quote = 'mutated after preparation';
    yopsLogIds.push('yop_2');

    expect(prepared.proposal.predicate.rationale).toMatchObject({
      evidence: [
        {
          locator: { value: { quote: 'original evidence' } },
        },
      ],
    });
    expect(prepared.yopsLogIds).toEqual(['yop_1']);
    expect(Object.isFrozen(prepared.yopsLogIds)).toBe(true);
    expect(() => (prepared.yopsLogIds as unknown as string[]).push('yop_attacker')).toThrow(
      TypeError
    );
  });

  it('deeply seals caller-owned graph inputs and returned protocol values', async () => {
    const base = createYOpsState({ service: { enabled: false } });
    const target = createYOpsState({ service: { enabled: true } });
    const parentCommit = commitFor(base, 'c');
    const prepared = prepareRepositoryYOpsStateWrite({
      projectId: 'project_1',
      refName: 'main',
      expectedHead: describeTransitionObject(parentCommit).digest,
      base,
      target,
      parentCommit,
      actor: ACTOR,
      intent: 'Seal the prepared graph',
      rationale: 'Every committed object was reviewed.',
      yopsLogIds: ['yop_sealed'],
      policyBinding: REPOSITORY_STATE_POLICY,
      recordedAt: RECORDED_AT,
    });
    const descriptors = {
      proposal: describeTransitionObject(prepared.proposal),
      effect: describeTransitionObject(prepared.effect),
      result: describeTransitionObject(prepared.result),
      parents: prepared.parents.map(describeTransitionObject),
      objects: prepared.objects.map(describeTransitionObject),
    };

    (base.value as { service: { enabled: boolean } }).service.enabled = true;
    Object.assign(parentCommit.decision, { digest: `sha256:${'d'.repeat(64)}` });

    expect(prepared.parents[0]).not.toBe(parentCommit);
    expect(prepared.objects[0]).not.toBe(base);
    expect(prepared.objects.at(-1)).toBe(prepared.parents[0]);
    expect({
      proposal: describeTransitionObject(prepared.proposal),
      effect: describeTransitionObject(prepared.effect),
      result: describeTransitionObject(prepared.result),
      parents: prepared.parents.map(describeTransitionObject),
      objects: prepared.objects.map(describeTransitionObject),
    }).toEqual(descriptors);
    expect((prepared.objects[0] as State).value).toEqual({ service: { enabled: false } });

    expect(Object.isFrozen(prepared.proposal)).toBe(true);
    expect(Object.isFrozen(prepared.effect)).toBe(true);
    expect(Object.isFrozen(prepared.result)).toBe(true);
    expect(Object.isFrozen(prepared.rationale)).toBe(true);
    expect(Object.isFrozen(prepared.parents)).toBe(true);
    expect(Object.isFrozen(prepared.parents[0])).toBe(true);
    expect(Object.isFrozen(prepared.objects)).toBe(true);
    expect(Object.isFrozen(prepared.objects[0])).toBe(true);
    expect(Object.isFrozen((prepared.objects[0] as State).value)).toBe(true);
    expect(() => Object.assign(prepared.proposal.actor, { id: 'human:attacker' })).toThrow(
      TypeError
    );
    expect(() => Object.assign(prepared.rationale, { value: 'mutated rationale' })).toThrow(
      TypeError
    );
    expect(() =>
      Object.assign((prepared.objects[0] as State).value as object, {
        service: { enabled: 'attacker' },
      })
    ).toThrow(TypeError);
    expect(() =>
      Object.assign(prepared.parents[0]!.decision, { digest: `sha256:${'e'.repeat(64)}` })
    ).toThrow(TypeError);

    await expect(
      prepared.authority.resolve({
        projectId: prepared.target.projectId,
        refName: prepared.target.refName,
        proposal: prepared.proposal,
        effect: prepared.effect,
      })
    ).resolves.toMatchObject({
      actorContext: { actor: ACTOR },
      policyResource: REPOSITORY_STATE_POLICY.resource,
    });
  });

  it('binds a parentless prepared authority to its immutable repository target and graph', async () => {
    const base = createYOpsState({});
    const target = createYOpsState({ service: { enabled: true } });
    const actor = { kind: 'human' as const, id: 'human:prepared-original' };
    const policyBinding = {
      policy: structuredClone(REPOSITORY_STATE_POLICY.policy),
      resource: {
        ...REPOSITORY_STATE_POLICY.resource,
        uri: 't3x://projects/project_1/policies/repository-state',
      },
    };
    const expectedPolicyBinding = structuredClone(policyBinding);
    const prepared = prepareRepositoryYOpsStateWrite({
      projectId: 'project_1',
      refName: 'main',
      expectedHead: null,
      base,
      target,
      actor,
      intent: 'Create root state',
      policyBinding,
      serverPolicyBindingExpectation: { expected: policyBinding, required: false },
      recordedAt: RECORDED_AT,
    });
    const foreign = prepareRepositoryYOpsStateWrite({
      projectId: 'project_1',
      refName: 'main',
      expectedHead: null,
      base,
      target: createYOpsState({ service: { enabled: false } }),
      actor: ACTOR,
      intent: 'Create a different root state',
      policyBinding: REPOSITORY_STATE_POLICY,
      recordedAt: RECORDED_AT,
    });
    const request = {
      projectId: prepared.target.projectId,
      refName: prepared.target.refName,
      proposal: prepared.proposal,
      effect: prepared.effect,
    };

    expect(prepared.target.expectedHead).toBeNull();
    expect(prepared.parents).toEqual([]);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.target)).toBe(true);
    expect(Object.isFrozen(prepared.serverPolicyBindingExpectation)).toBe(true);
    expect(Object.isFrozen(prepared.serverPolicyBindingExpectation?.expected)).toBe(true);
    expect(Object.isFrozen(prepared.authority)).toBe(true);
    expect(() =>
      Object.assign(prepared.authority, {
        resolve: async () => ({
          actorContext: { actor: { kind: 'human', id: 'human:attacker' } },
          observationScope: { completeness: 'complete', sources: [] },
          policy: REPOSITORY_STATE_POLICY.policy,
          policyResource: REPOSITORY_STATE_POLICY.resource,
          statements: [],
        }),
      })
    ).toThrow(TypeError);
    expect(() =>
      Object.assign(prepared.target, { expectedHead: `sha256:${'f'.repeat(64)}` })
    ).toThrow(TypeError);
    expect(() =>
      assertPreparedRepositoryTransitionAuthorityTarget({
        authority: prepared.authority,
        target: foreign.target,
      })
    ).toThrow('exact prepared target');

    actor.id = 'human:mutated-after-preparation';
    policyBinding.resource.uri = 't3x://projects/attacker/policies/repository-state';
    const facts = await prepared.authority.resolve(request);
    expect(facts).toMatchObject({
      actorContext: { actor: { kind: 'human', id: 'human:prepared-original' } },
      policy: expectedPolicyBinding.policy,
      policyResource: expectedPolicyBinding.resource,
    });
    expect(prepared.serverPolicyBindingExpectation).toEqual({
      expected: expectedPolicyBinding,
      required: false,
    });
    expect(Object.isFrozen(facts.actorContext.actor)).toBe(true);
    expect(Object.isFrozen(facts.statements)).toBe(true);
    expect(Object.isFrozen(facts.statements[0])).toBe(true);
    expect(() => (facts.statements as StatementObservation[]).splice(0, 1)).toThrow(TypeError);
    expect(() =>
      Object.assign(facts.statements[0]!.issuerContext.actor, { id: 'service:attacker' })
    ).toThrow(TypeError);

    const repeatedFacts = await prepared.authority.resolve(request);
    expect(repeatedFacts.actorContext.actor).toEqual({
      kind: 'human',
      id: 'human:prepared-original',
    });
    expect(repeatedFacts.statements).toHaveLength(1);
    await expect(
      prepared.authority.resolve({ ...request, projectId: 'project_2' })
    ).rejects.toThrow('different project');
    await expect(prepared.authority.resolve({ ...request, refName: 'feature' })).rejects.toThrow(
      'different ref'
    );
    await expect(
      prepared.authority.resolve({ ...request, proposal: foreign.proposal })
    ).rejects.toThrow('different Proposal');
    await expect(
      prepared.authority.resolve({ ...request, effect: foreign.effect })
    ).rejects.toThrow('different Effect');
  });

  it('builds a deterministic two-parent semantic merge bundle', async () => {
    const mergeBaseState = createRepositorySemanticState(
      content([{ key: 'shared', slots: { value: 'base' }, children: [] }])
    );
    const sourceState = createRepositorySemanticState(
      content([
        { key: 'shared', slots: { value: 'source' }, children: [] },
        { key: 'source_only', slots: { enabled: true }, children: [] },
      ])
    );
    const targetState = createRepositorySemanticState(
      content([
        { key: 'shared', slots: { value: 'target' }, children: [] },
        { key: 'target_only', slots: { enabled: true }, children: [] },
      ])
    );
    const sourceCommit = commitFor(sourceState, 'c');
    const targetCommit = commitFor(targetState, 'd');
    const sourceDigest = describeTransitionObject(sourceCommit).digest;
    const targetDigest = describeTransitionObject(targetCommit).digest;

    const prepared = prepareRepositoryYOpsMergeWrite({
      projectId: 'project_1',
      refName: 'main',
      sourceDigest,
      targetDigest,
      sourceState,
      targetState,
      mergeBaseState,
      sourceCommit,
      targetCommit,
      decisions: {
        conflictResolutions: { shared: 'source' },
        keepFromSource: ['source_only'],
        keepFromTarget: ['target_only'],
        keepRelationsFromSource: true,
        keepRelationsFromTarget: true,
      },
      actor: ACTOR,
      message: 'Merge feature into main',
      policyBinding: REPOSITORY_MERGE_POLICY,
      recordedAt: RECORDED_AT,
    });

    expect(prepared.target).toEqual({
      projectId: 'project_1',
      refName: 'main',
      expectedHead: targetDigest,
    });
    expect(prepared.parents).toEqual([targetCommit, sourceCommit]);
    expect(prepared.objects).toEqual([
      targetState,
      sourceState,
      mergeBaseState,
      prepared.result,
      targetCommit,
      sourceCommit,
    ]);
    expect(prepared.content.trees.map((tree) => tree.key)).toEqual([
      'shared',
      'source_only',
      'target_only',
    ]);
    expect(prepared.mergeSummary).toMatchObject({
      resolved_conflicts: 1,
      kept_from_source: 1,
      kept_from_target: 1,
      total_nodes: 3,
    });
    expect(Object.isFrozen(prepared.content)).toBe(true);
    expect(Object.isFrozen(prepared.mergeSummary)).toBe(true);
    expect(prepared.proposal.predicate.rationale).toMatchObject({
      mode: 'inferred',
      evidence: [
        {
          resource: { digest: sourceDigest },
          locator: { scheme: 't3x.protocol-object/v1' },
        },
      ],
    });

    const facts = await prepared.authority.resolve({
      projectId: 'project_1',
      refName: 'main',
      proposal: prepared.proposal,
      effect: prepared.effect,
    });
    expect(facts.observationScope.sources).toEqual(['server:repository-semantic-merge']);
    expect(facts.policyResource).toEqual(REPOSITORY_MERGE_POLICY.resource);
    expect(facts.statements[0]!.statement.predicate).toMatchObject({
      outcome: 'verified',
      tool: REPOSITORY_MERGE_REPLAY_TOOL,
    });
  });
});
