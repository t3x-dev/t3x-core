import { flattenTrees } from './tree';
import type { Frame, SemanticContent, SlotDiff, SlotValue, TreeDiff, WordDiffFn } from './types';
import { deepEqual, relKey } from './utils';

const WORD_DIFF_THRESHOLD = 5;

/**
 * Compute a semantic diff between two SemanticContent snapshots.
 *
 * Internally flattens trees to frames for comparison, then returns
 * results using path strings (not Frame objects).
 */
export function diffCommits(
  source: SemanticContent,
  target: SemanticContent,
  wordDiffFn?: WordDiffFn
): TreeDiff {
  const sourceFrames = flattenTrees(source.trees);
  const targetFrames = flattenTrees(target.trees);

  const sourceMap = new Map(sourceFrames.map((f) => [f.id, f]));
  const targetMap = new Map(targetFrames.map((f) => [f.id, f]));

  const identical: string[] = [];
  const modified: TreeDiff['modified'] = [];
  const onlyInSource: string[] = [];
  const onlyInTarget: string[] = [];

  for (const [id, srcFrame] of sourceMap) {
    const tgtFrame = targetMap.get(id);
    if (!tgtFrame) {
      onlyInSource.push(id);
      continue;
    }
    const slotDiffs = diffSlots(srcFrame.slots, tgtFrame.slots, wordDiffFn);
    if (slotDiffs.length === 0 && srcFrame.type === tgtFrame.type) {
      identical.push(id);
    } else {
      modified.push({ path: id, slotDiffs });
    }
  }

  for (const [id] of targetMap) {
    if (!sourceMap.has(id)) {
      onlyInTarget.push(id);
    }
  }

  const srcRelKeys = new Set(source.relations.map(relKey));
  const tgtRelKeys = new Set(target.relations.map(relKey));
  const relationsAdded = target.relations.filter((r) => !srcRelKeys.has(relKey(r)));
  const relationsRemoved = source.relations.filter((r) => !tgtRelKeys.has(relKey(r)));

  return {
    identical,
    modified,
    onlyInSource,
    onlyInTarget,
    relationsAdded,
    relationsRemoved,
  };
}

/**
 * Compare slots between two frames and return differences.
 */
export function diffSlots(
  source: Record<string, SlotValue>,
  target: Record<string, SlotValue>,
  wordDiffFn?: WordDiffFn
): SlotDiff[] {
  const diffs: SlotDiff[] = [];
  const allKeys = new Set([...Object.keys(source), ...Object.keys(target)]);

  for (const key of allKeys) {
    const hasSource = key in source;
    const hasTarget = key in target;

    if (hasSource && !hasTarget) {
      diffs.push({ key, type: 'removed', oldValue: source[key] });
    } else if (!hasSource && hasTarget) {
      diffs.push({ key, type: 'added', newValue: target[key] });
    } else if (hasSource && hasTarget) {
      if (!deepEqual(source[key], target[key])) {
        const diff: SlotDiff = {
          key,
          type: 'changed',
          oldValue: source[key],
          newValue: target[key],
        };
        if (
          wordDiffFn &&
          typeof source[key] === 'string' &&
          typeof target[key] === 'string' &&
          (source[key] as string).split(/\s+/).length >= WORD_DIFF_THRESHOLD
        ) {
          diff.wordDiff = wordDiffFn(source[key] as string, target[key] as string);
        }
        diffs.push(diff);
      }
    }
  }
  return diffs;
}
