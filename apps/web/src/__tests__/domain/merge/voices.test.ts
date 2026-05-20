import type { MergeResult, SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildMergeDecisionLabels, buildMergeVoices } from '@/domain/merge/voices';

const mergeResult: MergeResult = {
  autoKept: ['shared'],
  conflicts: [
    {
      path: 'plan',
      slotConflicts: [
        {
          key: 'timing',
          sourceValue: 'launch Friday',
          targetValue: 'launch Monday',
        },
      ],
    },
  ],
  onlyInSource: ['feature_only'],
  onlyInTarget: ['main_only'],
  relationsOnlyInSource: [],
  relationsOnlyInTarget: [],
  relationsInBoth: [],
};

const sourceContent: SemanticContent = {
  trees: [
    { key: 'shared', slots: { summary: 'same context' }, children: [] },
    { key: 'plan', slots: { timing: 'launch Friday' }, children: [] },
    { key: 'feature_only', slots: { note: 'new feature voice' }, children: [] },
  ],
  relations: [],
};

const targetContent: SemanticContent = {
  trees: [
    { key: 'shared', slots: { summary: 'same context' }, children: [] },
    { key: 'plan', slots: { timing: 'launch Monday' }, children: [] },
    { key: 'main_only', slots: { note: 'main branch voice' }, children: [] },
  ],
  relations: [],
};

describe('merge voices', () => {
  it('builds editorial sections for agreements, unique voices, and tensions', () => {
    const voices = buildMergeVoices({
      mergeResult,
      sourceContent,
      targetContent,
      sourceBranch: 'feature',
      targetBranch: 'main',
    });

    expect(voices).toMatchObject([
      { kind: 'agreements', count: 1, title: 'Agreements' },
      { kind: 'unique_to_source', count: 1, title: 'Unique to feature' },
      { kind: 'unique_to_target', count: 1, title: 'Unique to main' },
      { kind: 'tension', count: 1, title: 'Tension requiring judgment' },
    ]);
    expect(voices[3].examples[0]).toMatchObject({
      path: 'plan',
      reason: 'Slot "timing" differs between voices.',
      sourceQuote: 'launch Friday',
      targetQuote: 'launch Monday',
    });
  });

  it('humanizes merge decision button labels without changing decision semantics', () => {
    expect(buildMergeDecisionLabels({ sourceBranch: 'feature', targetBranch: 'main' })).toEqual({
      source: 'Use feature',
      target: 'Use main',
      both: 'Keep both voices',
      edit: 'Edit voice',
    });
  });
});
