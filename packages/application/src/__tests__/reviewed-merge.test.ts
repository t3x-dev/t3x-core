import {
  createRepositorySemanticState,
  describeTransitionObject,
  yvalueToTrees,
} from '@t3x-dev/core';
import { definitionOf, replay } from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import {
  createReviewedSemanticMergeEffect,
  reviewedMergeMutationDrivers,
} from '../repository/reviewed-merge';

const state = (slots: Record<string, string>) =>
  createRepositorySemanticState({
    trees: yvalueToTrees({ candidate: { requirements: { title: 'Study', ...slots } } }),
    relations: [],
  });
const input = {
  target: state({ advantage: 'Useful' }),
  source: state({ owner: 'Ada' }),
  mergeBase: state({}),
  decisions: {
    conflictResolutions: {},
    keepFromSource: [],
    keepFromTarget: [],
    keepRelationsFromSource: true,
    keepRelationsFromTarget: true,
  },
  rootKey: 'candidate',
  commands: [
    {
      kind: 'set' as const,
      path: 'content/trees/[key=candidate]/children/[key=requirements]/slots/title',
      value: 'New',
    },
  ],
};

describe('reviewed semantic merge application adapter', () => {
  it('composes native merge and explicit migration into a deterministic Effect with exact parent inputs', () => {
    const merged = createReviewedSemanticMergeEffect(input);
    expect(createReviewedSemanticMergeEffect(input)).toEqual(merged);
    expect(merged.effect.inputs).toEqual(
      expect.arrayContaining([
        { role: 'merge-base', object: describeTransitionObject(input.mergeBase) },
        { role: 'merge-source', object: describeTransitionObject(input.source) },
      ])
    );
    expect(merged.content.trees[0]?.children[0]?.slots).toEqual({
      title: 'New',
      owner: 'Ada',
      advantage: 'Useful',
    });
    expect(
      replay(
        input.target,
        definitionOf(merged.effect),
        new Map([
          ['merge-base', input.mergeBase],
          ['merge-source', input.source],
        ]),
        reviewedMergeMutationDrivers
      )
    ).toEqual(merged.result);
  });

  it('rejects substituted source inputs, operations outside content and malformed commands', () => {
    const merged = createReviewedSemanticMergeEffect(input);
    expect(() =>
      replay(
        input.target,
        definitionOf(merged.effect),
        new Map([
          ['merge-base', input.mergeBase],
          ['merge-source', state({ owner: 'Substituted' })],
        ]),
        reviewedMergeMutationDrivers
      )
    ).toThrow();
    expect(() =>
      createReviewedSemanticMergeEffect({
        ...input,
        commands: [{ kind: 'set', path: 'domain', value: 'forged' }],
      })
    ).toThrow(/inside content/);
    expect(() =>
      createReviewedSemanticMergeEffect({
        ...input,
        commands: [{ kind: 'shell', path: 'content' }] as never,
      })
    ).toThrow(/Invalid merge migration command/);
    expect(() =>
      createReviewedSemanticMergeEffect({
        ...input,
        commands: [{ kind: 'move', from: 'content/missing', to: 'content/new' }],
      })
    ).toThrow();
  });
});
