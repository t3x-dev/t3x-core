import {
  definitionOf,
  describeProtocolObject,
  digestProtocolObject,
  replay,
} from '@t3x-dev/transition';
import { describe, expect, it } from 'vitest';
import type { MergeDecision, SemanticContent } from '../../semantic/types';
import {
  createRepositorySemanticState,
  createSemanticMergeEffect,
  decodeRepositorySemanticState,
  SEMANTIC_MERGE_DRIVER_SPEC_DIGEST,
  SEMANTIC_MERGE_MUTATION_DRIVER_REF,
  semanticMergeMutationDrivers,
} from '../semanticMergeDriver';

function content(trees: SemanticContent['trees']): SemanticContent {
  return { trees, relations: [] };
}

const mergeBase = createRepositorySemanticState(
  content([{ key: 'shared', slots: { value: 'base' }, children: [] }])
);
const source = createRepositorySemanticState(
  content([
    { key: 'shared', slots: { value: 'source' }, children: [] },
    { key: 'source_only', slots: { enabled: true }, children: [] },
  ])
);
const target = createRepositorySemanticState(
  content([
    { key: 'shared', slots: { value: 'target' }, children: [] },
    { key: 'target_only', slots: { enabled: true }, children: [] },
  ])
);

const decisions: MergeDecision = {
  conflictResolutions: { shared: 'source' },
  keepFromSource: ['source_only'],
  keepFromTarget: ['target_only'],
  keepRelationsFromSource: true,
  keepRelationsFromTarget: true,
};

describe('semantic merge MutationDriver adapter', () => {
  it('pins versioned three-way merge semantics and declares both merge inputs', () => {
    expect(SEMANTIC_MERGE_DRIVER_SPEC_DIGEST).toBe(
      'sha256:59b2d290de8e1862b7eb514215ba22c7ce05f818b2bae1388683e3006f696e42'
    );
    expect(SEMANTIC_MERGE_MUTATION_DRIVER_REF).toEqual({
      protocol: 't3x.dev/yops-semantic-merge',
      protocolVersion: '1',
      specDigest: SEMANTIC_MERGE_DRIVER_SPEC_DIGEST,
    });

    const created = createSemanticMergeEffect({ target, mergeBase, source, decisions });

    expect(created.effect.inputs).toEqual([
      { role: 'merge-base', object: describeProtocolObject(mergeBase) },
      { role: 'merge-source', object: describeProtocolObject(source) },
    ]);
    expect(decodeRepositorySemanticState(created.result)).toEqual(
      content([
        { key: 'shared', slots: { value: 'source' }, children: [] },
        { key: 'source_only', slots: { enabled: true }, children: [] },
        { key: 'target_only', slots: { enabled: true }, children: [] },
      ])
    );
  });

  it('normalizes decision sets into one deterministic Effect identity', () => {
    const first = createSemanticMergeEffect({ target, mergeBase, source, decisions });
    const second = createSemanticMergeEffect({
      target,
      mergeBase,
      source,
      decisions: {
        ...decisions,
        keepFromSource: ['source_only', 'source_only'],
        keepFromTarget: ['target_only', 'target_only'],
      },
    });

    expect(digestProtocolObject(first.effect)).toBe(digestProtocolObject(second.effect));
    expect(second.effect.operations).toEqual(first.effect.operations);
  });

  it('rejects resolutions for paths outside the recomputed merge plan', () => {
    expect(() =>
      createSemanticMergeEffect({
        target,
        mergeBase,
        source,
        decisions: {
          ...decisions,
          conflictResolutions: { shared: 'source', injected: 'target' },
        },
      })
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_SEMANTICS' }));
  });

  it('rejects replay when an attacker substitutes a different source State', () => {
    const created = createSemanticMergeEffect({ target, mergeBase, source, decisions });
    const substitutedSource = createRepositorySemanticState(
      content([{ key: 'shared', slots: { value: 'attacker' }, children: [] }])
    );

    expect(() =>
      replay(
        target,
        definitionOf(created.effect),
        new Map([
          ['merge-base', mergeBase],
          ['merge-source', substitutedSource],
        ]),
        semanticMergeMutationDrivers
      )
    ).toThrowError(expect.objectContaining({ code: 'INTEGRITY_CHAIN_INVALID' }));
  });
});
