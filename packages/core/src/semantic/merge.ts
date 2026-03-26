import { flattenTree, flattenTrees, unflattenToTrees } from './tree';
import type {
  Frame,
  MergeDecision,
  MergeResolution,
  MergeResult,
  SemanticContent,
  SlotConflict,
  SlotValue,
} from './types';
import { deepEqual, relKey } from './utils';

/**
 * Prepare a three-way merge by analyzing base, source, and target.
 *
 * Internally flattens all three to frames for comparison, then returns
 * results using path strings.
 */
export function prepareMerge(
  base: SemanticContent,
  source: SemanticContent,
  target: SemanticContent
): MergeResult {
  const baseFrames = flattenTrees(base.trees);
  const sourceFrames = flattenTrees(source.trees);
  const targetFrames = flattenTrees(target.trees);

  const baseMap = new Map(baseFrames.map((f) => [f.id, f]));
  const srcMap = new Map(sourceFrames.map((f) => [f.id, f]));
  const tgtMap = new Map(targetFrames.map((f) => [f.id, f]));

  const allIds = new Set([...srcMap.keys(), ...tgtMap.keys()]);

  const autoKept: string[] = [];
  const conflicts: MergeResult['conflicts'] = [];
  const onlyInSource: string[] = [];
  const onlyInTarget: string[] = [];

  for (const id of allIds) {
    const srcFrame = srcMap.get(id);
    const tgtFrame = tgtMap.get(id);
    const baseFrame = baseMap.get(id);

    if (srcFrame && !tgtFrame) {
      onlyInSource.push(id);
      continue;
    }
    if (!srcFrame && tgtFrame) {
      onlyInTarget.push(id);
      continue;
    }
    if (!srcFrame || !tgtFrame) continue;

    if (framesEqual(srcFrame, tgtFrame)) {
      autoKept.push(id);
      continue;
    }

    if (!baseFrame) {
      const slotConflicts = findSlotConflicts(undefined, srcFrame, tgtFrame);
      conflicts.push({ path: id, slotConflicts });
      continue;
    }

    const srcChanged = !framesEqual(baseFrame, srcFrame);
    const tgtChanged = !framesEqual(baseFrame, tgtFrame);

    if (!srcChanged && !tgtChanged) {
      autoKept.push(id);
    } else if (srcChanged && !tgtChanged) {
      autoKept.push(id);
    } else if (!srcChanged && tgtChanged) {
      autoKept.push(id);
    } else {
      const slotConflicts = findSlotConflicts(baseFrame, srcFrame, tgtFrame);
      const typeConflict =
        srcFrame.type !== tgtFrame.type &&
        srcFrame.type !== baseFrame.type &&
        tgtFrame.type !== baseFrame.type;
      if (slotConflicts.length === 0 && !typeConflict) {
        autoKept.push(id);
      } else {
        conflicts.push({ path: id, slotConflicts });
      }
    }
  }

  const srcRelKeys = new Set(source.relations.map(relKey));
  const tgtRelKeys = new Set(target.relations.map(relKey));
  const relationsInBoth = source.relations.filter((r) => tgtRelKeys.has(relKey(r)));
  const relationsOnlyInSource = source.relations.filter((r) => !tgtRelKeys.has(relKey(r)));
  const relationsOnlyInTarget = target.relations.filter((r) => !srcRelKeys.has(relKey(r)));

  return {
    autoKept,
    conflicts,
    onlyInSource,
    onlyInTarget,
    relationsOnlyInSource,
    relationsOnlyInTarget,
    relationsInBoth,
  };
}

/**
 * Execute a merge by applying user decisions to a prepared merge result.
 *
 * Returns the merged SemanticContent with trees reconstructed from frames.
 */
export function executeMerge(
  base: SemanticContent,
  source: SemanticContent,
  target: SemanticContent,
  prepared: MergeResult,
  decisions: MergeDecision
): SemanticContent {
  const baseFrames = flattenTrees(base.trees);
  const sourceFrames = flattenTrees(source.trees);
  const targetFrames = flattenTrees(target.trees);

  const baseMap = new Map(baseFrames.map((f) => [f.id, f]));
  const srcMap = new Map(sourceFrames.map((f) => [f.id, f]));
  const tgtMap = new Map(targetFrames.map((f) => [f.id, f]));

  const resultFrames: Frame[] = [];

  // 1. Auto-kept: pick the best version
  for (const path of prepared.autoKept) {
    const srcFrame = srcMap.get(path);
    const tgtFrame = tgtMap.get(path);
    const baseFrame = baseMap.get(path);

    if (srcFrame && tgtFrame) {
      if (framesEqual(srcFrame, tgtFrame)) {
        resultFrames.push(srcFrame);
      } else if (baseFrame) {
        const srcChanged = !framesEqual(baseFrame, srcFrame);
        const tgtChanged = !framesEqual(baseFrame, tgtFrame);
        if (srcChanged && !tgtChanged) {
          resultFrames.push(srcFrame);
        } else if (!srcChanged && tgtChanged) {
          resultFrames.push(tgtFrame);
        } else {
          // Both changed but no slot conflicts — merge non-conflicting
          resultFrames.push(mergeNonConflicting(baseFrame, srcFrame, tgtFrame));
        }
      } else {
        resultFrames.push(srcFrame);
      }
    } else if (srcFrame) {
      resultFrames.push(srcFrame);
    } else if (tgtFrame) {
      resultFrames.push(tgtFrame);
    }
  }

  // 2. Resolve conflicts based on user decisions
  for (const conflict of prepared.conflicts) {
    const resolution: MergeResolution | undefined = decisions.conflictResolutions[conflict.path];
    const srcFrame = srcMap.get(conflict.path);
    const tgtFrame = tgtMap.get(conflict.path);

    if (!resolution || resolution === 'source') {
      if (srcFrame) resultFrames.push(srcFrame);
    } else if (resolution === 'target') {
      if (tgtFrame) resultFrames.push(tgtFrame);
    } else if (resolution === 'both') {
      if (srcFrame) resultFrames.push(srcFrame);
      if (tgtFrame) resultFrames.push(tgtFrame);
    } else if (typeof resolution === 'object' && 'edit' in resolution) {
      // Convert edited TreeNode to frames
      const editedFrames = flattenTree(resolution.edit);
      resultFrames.push(...editedFrames);
    }
  }

  // 3. Keep selected source-only frames
  const keepSrcSet = new Set(decisions.keepFromSource);
  for (const path of prepared.onlyInSource) {
    if (keepSrcSet.has(path)) {
      const frame = srcMap.get(path);
      if (frame) resultFrames.push(frame);
    }
  }

  // 4. Keep selected target-only frames
  const keepTgtSet = new Set(decisions.keepFromTarget);
  for (const path of prepared.onlyInTarget) {
    if (keepTgtSet.has(path)) {
      const frame = tgtMap.get(path);
      if (frame) resultFrames.push(frame);
    }
  }

  // 5. Merge relations
  const relations = [...prepared.relationsInBoth];
  if (decisions.keepRelationsFromSource) {
    relations.push(...prepared.relationsOnlyInSource);
  }
  if (decisions.keepRelationsFromTarget) {
    relations.push(...prepared.relationsOnlyInTarget);
  }

  // 6. Reconstruct trees from merged frames
  const trees = unflattenToTrees(resultFrames);

  return { trees, relations };
}

// ── Internal helpers ──

function framesEqual(a: Frame, b: Frame): boolean {
  if (a.type !== b.type) return false;
  const aKeys = Object.keys(a.slots);
  const bKeys = Object.keys(b.slots);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => k in b.slots && deepEqual(a.slots[k], b.slots[k]));
}

function findSlotConflicts(base: Frame | undefined, src: Frame, tgt: Frame): SlotConflict[] {
  const conflicts: SlotConflict[] = [];
  const allKeys = new Set([...Object.keys(src.slots), ...Object.keys(tgt.slots)]);

  for (const key of allKeys) {
    const baseVal: SlotValue | undefined = base?.slots[key];
    const srcVal: SlotValue | undefined = src.slots[key];
    const tgtVal: SlotValue | undefined = tgt.slots[key];

    if (deepEqual(srcVal, tgtVal)) continue;
    if (base && deepEqual(srcVal, baseVal)) continue;
    if (base && deepEqual(tgtVal, baseVal)) continue;

    conflicts.push({
      key,
      baseValue: baseVal,
      sourceValue: srcVal,
      targetValue: tgtVal,
    });
  }
  return conflicts;
}

function mergeNonConflicting(base: Frame, src: Frame, tgt: Frame): Frame {
  const slots: Record<string, SlotValue> = { ...base.slots };
  const allKeys = new Set([
    ...Object.keys(src.slots),
    ...Object.keys(tgt.slots),
    ...Object.keys(base.slots),
  ]);

  for (const key of allKeys) {
    const baseVal: SlotValue | undefined = base.slots[key];
    const srcVal: SlotValue | undefined = src.slots[key];
    const tgtVal: SlotValue | undefined = tgt.slots[key];

    const srcChanged = !deepEqual(srcVal, baseVal);
    const tgtChanged = !deepEqual(tgtVal, baseVal);

    if (srcChanged) {
      if (srcVal === undefined) {
        delete slots[key];
      } else {
        slots[key] = srcVal;
      }
    } else if (tgtChanged) {
      if (tgtVal === undefined) {
        delete slots[key];
      } else {
        slots[key] = tgtVal;
      }
    }
  }
  const mergedType = tgt.type !== base.type && src.type === base.type ? tgt.type : src.type;
  return { ...src, type: mergedType, slots };
}
