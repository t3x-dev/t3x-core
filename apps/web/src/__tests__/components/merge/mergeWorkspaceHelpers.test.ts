import type { MergeResult, SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { buildMergeDecision } from '@/components/merge/mergeWorkspaceHelpers';

const mergeResult: MergeResult = {
  autoKept: [],
  conflicts: [
    {
      path: 'product',
      slotConflicts: [
        { key: 'version', sourceValue: 2, targetValue: 1 },
        { key: 'label', sourceValue: 'source', targetValue: 'target' },
      ],
    },
  ],
  onlyInSource: ['release'],
  onlyInTarget: ['legacy'],
  relationsOnlyInSource: [],
  relationsOnlyInTarget: [],
  relationsInBoth: [],
};

const sourceContent: SemanticContent = {
  trees: [
    {
      key: 'product',
      slots: { version: 2, label: 'source', unchanged: true },
      children: [],
    },
  ],
  relations: [],
};

const targetContent: SemanticContent = {
  trees: [
    {
      key: 'product',
      slots: { version: 1, label: 'target', unchanged: true },
      children: [],
    },
  ],
  relations: [],
};

describe('buildMergeDecision', () => {
  it('converts per-slot UI choices into an editable deterministic resolution', () => {
    const decision = buildMergeDecision(
      mergeResult,
      new Map([
        [
          'product',
          {
            type: 'per-slot' as const,
            slotChoices: { version: 'source' as const, label: 'target' as const },
          },
        ],
      ]),
      new Set(['release']),
      new Set(['legacy']),
      sourceContent,
      targetContent
    );

    expect(decision).toEqual({
      conflictResolutions: {
        product: {
          edit: {
            key: 'product',
            slots: { version: 2, label: 'target', unchanged: true },
            children: [],
          },
        },
      },
      keepFromSource: ['release'],
      keepFromTarget: ['legacy'],
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    });
  });

  it('passes whole-tree selections through unchanged', () => {
    const decision = buildMergeDecision(
      mergeResult,
      new Map([['product', { type: 'source' as const }]]),
      new Set(),
      new Set(),
      sourceContent,
      targetContent
    );

    expect(decision.conflictResolutions).toEqual({ product: 'source' });
  });
});
