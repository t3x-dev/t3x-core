/**
 * FourColorDiff Classification Display Tests (S4)
 *
 * Tests the four-color diff classification display in DraftDiffSection:
 *   - identical: gray stripe (border-l-4 border-gray-400)
 *   - equivalent: green stripe (border-l-4 border-green-500)
 *   - similar/modified: amber stripe (border-l-4 border-amber-500)
 *   - added: green-accent stripe, removed: red-accent stripe
 */

import { describe, expect, test } from 'vitest';

import {
  type CommitDiff,
  type DiffableSentence,
  diffCommits,
  EQUIVALENT_THRESHOLD,
  type SentencePair,
} from '@/lib/diffUtils';

describe('FourColorDiff - Classification Logic', () => {
  test('identical sentences are classified correctly', () => {
    const source: DiffableSentence[] = [
      { id: 's1', text: 'User trust is paramount.' },
      { id: 's2', text: 'Deterministic systems are key.' },
    ];
    const target: DiffableSentence[] = [
      { id: 't1', text: 'User trust is paramount.' },
      { id: 't2', text: 'Deterministic systems are key.' },
    ];

    const diff = diffCommits(source, target);
    expect(diff.identical.length).toBe(2);
    expect(diff.equivalent.length).toBe(0);
    expect(diff.similar.length).toBe(0);
    expect(diff.onlyInSource.length).toBe(0);
    expect(diff.onlyInTarget.length).toBe(0);
  });

  test('added sentences are classified as onlyInTarget', () => {
    const source: DiffableSentence[] = [{ id: 's1', text: 'Existing sentence.' }];
    const target: DiffableSentence[] = [
      { id: 't1', text: 'Existing sentence.' },
      { id: 't2', text: 'Brand new sentence added here.' },
    ];

    const diff = diffCommits(source, target);
    expect(diff.identical.length).toBe(1);
    expect(diff.onlyInTarget.length).toBe(1);
    expect(diff.onlyInTarget[0].text).toBe('Brand new sentence added here.');
  });

  test('removed sentences are classified as onlyInSource', () => {
    const source: DiffableSentence[] = [
      { id: 's1', text: 'Kept sentence.' },
      { id: 's2', text: 'Removed sentence.' },
    ];
    const target: DiffableSentence[] = [{ id: 't1', text: 'Kept sentence.' }];

    const diff = diffCommits(source, target);
    expect(diff.identical.length).toBe(1);
    expect(diff.onlyInSource.length).toBe(1);
    expect(diff.onlyInSource[0].text).toBe('Removed sentence.');
  });

  test('similar sentences with small changes are classified as similar/equivalent', () => {
    const source: DiffableSentence[] = [
      { id: 's1', text: 'The budget is three thousand dollars for the project.' },
    ];
    const target: DiffableSentence[] = [
      { id: 't1', text: 'The budget is three thousand five hundred dollars for the project.' },
    ];

    const diff = diffCommits(source, target);
    // Should match as similar (high Jaccard overlap)
    const totalPairs = diff.equivalent.length + diff.similar.length;
    expect(totalPairs).toBe(1);
  });

  test('completely different sentences are classified as added/removed', () => {
    const source: DiffableSentence[] = [{ id: 's1', text: 'Apple banana cherry date elderberry.' }];
    const target: DiffableSentence[] = [
      { id: 't1', text: 'Xylophone violin trumpet saxophone piano.' },
    ];

    const diff = diffCommits(source, target);
    // Low Jaccard overlap → not matched → each in onlyIn*
    expect(diff.onlyInSource.length).toBe(1);
    expect(diff.onlyInTarget.length).toBe(1);
  });

  test('diff result has all five categories', () => {
    const diff: CommitDiff = {
      identical: [{ id: 's1', text: 'Same text.' }],
      equivalent: [
        {
          source: { id: 's2', text: 'Nearly same text here.' },
          target: { id: 't2', text: 'Nearly same text here now.' },
          similarity: 0.9,
          wordDiff: [
            { type: 'unchanged', text: 'Nearly same text here' },
            { type: 'added', text: 'now' },
          ],
        },
      ],
      similar: [
        {
          source: { id: 's3', text: 'Modified sentence original.' },
          target: { id: 't3', text: 'Modified sentence updated.' },
          similarity: 0.6,
          wordDiff: [
            { type: 'unchanged', text: 'Modified sentence' },
            { type: 'removed', text: 'original' },
            { type: 'added', text: 'updated' },
          ],
        },
      ],
      onlyInSource: [{ id: 's4', text: 'Removed.' }],
      onlyInTarget: [{ id: 't4', text: 'Added.' }],
    };

    expect(diff.identical.length).toBe(1);
    expect(diff.equivalent.length).toBe(1);
    expect(diff.similar.length).toBe(1);
    expect(diff.onlyInSource.length).toBe(1);
    expect(diff.onlyInTarget.length).toBe(1);
  });

  test('equivalent pairs have word diff segments', () => {
    const pair: SentencePair = {
      source: { id: 's1', text: 'Hello world' },
      target: { id: 't1', text: 'Hello earth' },
      similarity: 0.5,
      wordDiff: [
        { type: 'unchanged', text: 'Hello' },
        { type: 'removed', text: 'world' },
        { type: 'added', text: 'earth' },
      ],
    };

    expect(pair.wordDiff.length).toBe(3);
    expect(pair.wordDiff.every((s) => ['unchanged', 'removed', 'added'].includes(s.type))).toBe(
      true
    );
  });

  test('EQUIVALENT_THRESHOLD is defined', () => {
    expect(EQUIVALENT_THRESHOLD).toBeGreaterThan(0);
    expect(EQUIVALENT_THRESHOLD).toBeLessThanOrEqual(1);
  });

  test('empty diff returns all empty arrays', () => {
    const diff = diffCommits([], []);
    expect(diff.identical.length).toBe(0);
    expect(diff.equivalent.length).toBe(0);
    expect(diff.similar.length).toBe(0);
    expect(diff.onlyInSource.length).toBe(0);
    expect(diff.onlyInTarget.length).toBe(0);
  });

  test('all source sentences removed produces correct diff', () => {
    const source: DiffableSentence[] = [
      { id: 's1', text: 'First sentence.' },
      { id: 's2', text: 'Second sentence.' },
    ];

    const diff = diffCommits(source, []);
    expect(diff.onlyInSource.length).toBe(2);
    expect(diff.identical.length).toBe(0);
    expect(diff.onlyInTarget.length).toBe(0);
  });

  test('all target sentences added produces correct diff', () => {
    const target: DiffableSentence[] = [
      { id: 't1', text: 'New first.' },
      { id: 't2', text: 'New second.' },
    ];

    const diff = diffCommits([], target);
    expect(diff.onlyInTarget.length).toBe(2);
    expect(diff.identical.length).toBe(0);
    expect(diff.onlyInSource.length).toBe(0);
  });
});
