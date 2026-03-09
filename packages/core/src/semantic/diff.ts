import type { Frame, FrameDiff, SemanticContent, SlotDiff, SlotValue, WordDiffFn } from './types';
import { deepEqual, relKey } from './utils';

const WORD_DIFF_THRESHOLD = 5;

export function frameDiff(
  source: SemanticContent,
  target: SemanticContent,
  wordDiffFn?: WordDiffFn
): FrameDiff {
  const sourceMap = new Map(source.frames.map((f) => [f.id, f]));
  const targetMap = new Map(target.frames.map((f) => [f.id, f]));

  const identical: Frame[] = [];
  const modified: FrameDiff['modified'] = [];
  const onlyInSource: Frame[] = [];
  const onlyInTarget: Frame[] = [];

  for (const [id, srcFrame] of sourceMap) {
    const tgtFrame = targetMap.get(id);
    if (!tgtFrame) {
      onlyInSource.push(srcFrame);
      continue;
    }
    const slotDiffs = diffSlots(srcFrame.slots, tgtFrame.slots, wordDiffFn);
    if (slotDiffs.length === 0 && srcFrame.type === tgtFrame.type) {
      identical.push(srcFrame);
    } else {
      modified.push({ frameId: id, sourceFrame: srcFrame, targetFrame: tgtFrame, slotDiffs });
    }
  }

  for (const [id, tgtFrame] of targetMap) {
    if (!sourceMap.has(id)) {
      onlyInTarget.push(tgtFrame);
    }
  }

  const srcRelKeys = new Set(source.relations.map(relKey));
  const tgtRelKeys = new Set(target.relations.map(relKey));
  const relationsAdded = target.relations.filter((r) => !srcRelKeys.has(relKey(r)));
  const relationsRemoved = source.relations.filter((r) => !tgtRelKeys.has(relKey(r)));

  return { identical, modified, onlyInSource, onlyInTarget, relationsAdded, relationsRemoved };
}

function diffSlots(
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
