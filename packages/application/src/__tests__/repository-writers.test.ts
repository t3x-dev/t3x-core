import {
  createRepositorySemanticState,
  createYOpsState,
  describeTransitionObject,
  type SemanticContent,
} from '@t3x-dev/core';
import { type CommitV2, parseCommitV2, type State } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
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
      recordedAt: RECORDED_AT,
    });

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
      recordedAt: RECORDED_AT,
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
