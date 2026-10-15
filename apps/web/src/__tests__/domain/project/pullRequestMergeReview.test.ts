import { describe, expect, it } from 'vitest';
import {
  type ApiPullRequestMergeReviewNode,
  buildMergeReviewDecision,
  choicesFromDecision,
  chooseSideForRemaining,
} from '@/domain/project/pullRequestMergeReview';

const product: ApiPullRequestMergeReviewNode = {
  path: 'candidate/product',
  status: 'conflict',
  presence: { base: true, source: true, target: true },
  slots: [
    { key: 'goal', base: 'old', source: 'dev goal', target: 'main goal', conflict: true },
    { key: 'name', base: 'T3X', source: 'T3X', target: 'T3X', merged: 'T3X', conflict: false },
    { key: 'owner', base: 'a', source: 'b', target: 'a', merged: 'b', conflict: false },
    { key: 'score', base: 1, source: 2, target: 3, conflict: true },
  ],
};
const removed: ApiPullRequestMergeReviewNode = {
  path: 'candidate/legacy',
  status: 'conflict',
  presence: { base: true, source: false, target: true },
  slots: [{ key: 'note', base: 'x', target: 'y', conflict: true }],
};
const added: ApiPullRequestMergeReviewNode = {
  path: 'candidate/extra',
  status: 'source_only',
  presence: { base: false, source: true, target: false },
  slots: [{ key: 'ready', source: true, merged: true, conflict: false }],
};
const review = { nodes: [product, removed, added] };

describe('pull request merge review decisions', () => {
  it('keeps every conflict unresolved until each conflicting field has a choice', () => {
    const partial = buildMergeReviewDecision(review, {
      'candidate/product': { slots: { goal: { kind: 'source' } } },
    });
    expect(partial.unresolved).toEqual(['candidate/product', 'candidate/legacy']);
    expect(partial.decision.conflictResolutions).toEqual({});
    expect(partial.decision.keepFromSource).toEqual(['candidate/extra']);
  });

  it('mixes sides and custom values per field while keeping auto-merged fields', () => {
    const { decision, unresolved } = buildMergeReviewDecision(review, {
      'candidate/product': {
        slots: { goal: { kind: 'target' }, score: { kind: 'custom', text: '42' } },
      },
      'candidate/legacy': { node: 'source', slots: {} },
    });
    expect(unresolved).toEqual([]);
    expect(decision.conflictResolutions).toEqual({
      'candidate/product': {
        edit: {
          key: 'product',
          slots: { goal: 'main goal', name: 'T3X', owner: 'b', score: 42 },
          children: [],
        },
      },
      'candidate/legacy': 'source',
    });
  });

  it('keeps custom text as a string when the field holds strings', () => {
    const { decision } = buildMergeReviewDecision(
      { nodes: [product] },
      {
        'candidate/product': {
          slots: { goal: { kind: 'custom', text: '123' }, score: { kind: 'source' } },
        },
      }
    );
    const resolution = decision.conflictResolutions['candidate/product'];
    expect(resolution).toMatchObject({ edit: { slots: { goal: '123', score: 2 } } });
  });

  it('fills only the remaining conflicts when one side is applied in bulk', () => {
    const choices = chooseSideForRemaining(
      review,
      { 'candidate/product': { slots: { goal: { kind: 'custom', text: 'mine' } } } },
      'target'
    );
    expect(choices['candidate/product']?.slots).toEqual({
      goal: { kind: 'custom', text: 'mine' },
      score: { kind: 'target' },
    });
    expect(choices['candidate/legacy']?.node).toBe('target');
  });

  it('restores saved choices from the draft decision', () => {
    const { decision } = buildMergeReviewDecision(review, {
      'candidate/product': {
        slots: { goal: { kind: 'source' }, score: { kind: 'custom', text: '9' } },
      },
      'candidate/legacy': { node: 'target', slots: {} },
    });
    expect(choicesFromDecision(review, decision)).toEqual({
      'candidate/product': {
        slots: { goal: { kind: 'source' }, score: { kind: 'custom', text: '9' } },
      },
      'candidate/legacy': { node: 'target', slots: { note: { kind: 'target' } } },
    });
  });
});
