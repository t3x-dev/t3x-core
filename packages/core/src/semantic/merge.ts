import type { Frame, FrameMergeResult, SemanticContent, SlotConflict, SlotValue } from './types';
import { deepEqual, relKey } from './utils';

export function prepareFrameMerge(
  base: SemanticContent,
  source: SemanticContent,
  target: SemanticContent
): FrameMergeResult {
  const baseMap = new Map(base.frames.map((f) => [f.id, f]));
  const srcMap = new Map(source.frames.map((f) => [f.id, f]));
  const tgtMap = new Map(target.frames.map((f) => [f.id, f]));

  const allIds = new Set([...srcMap.keys(), ...tgtMap.keys()]);

  const autoKept: Frame[] = [];
  const conflicts: FrameMergeResult['conflicts'] = [];
  const onlyInSource: Frame[] = [];
  const onlyInTarget: Frame[] = [];

  for (const id of allIds) {
    const srcFrame = srcMap.get(id);
    const tgtFrame = tgtMap.get(id);
    const baseFrame = baseMap.get(id);

    if (srcFrame && !tgtFrame) {
      onlyInSource.push(srcFrame);
      continue;
    }
    if (!srcFrame && tgtFrame) {
      onlyInTarget.push(tgtFrame);
      continue;
    }
    if (!srcFrame || !tgtFrame) continue;

    if (framesEqual(srcFrame, tgtFrame)) {
      autoKept.push(srcFrame);
      continue;
    }

    if (!baseFrame) {
      const slotConflicts = findSlotConflicts(undefined, srcFrame, tgtFrame);
      conflicts.push({
        frameId: id,
        baseFrame: undefined,
        sourceFrame: srcFrame,
        targetFrame: tgtFrame,
        slotConflicts,
      });
      continue;
    }

    const srcChanged = !framesEqual(baseFrame, srcFrame);
    const tgtChanged = !framesEqual(baseFrame, tgtFrame);

    if (!srcChanged && !tgtChanged) {
      autoKept.push(srcFrame);
    } else if (srcChanged && !tgtChanged) {
      autoKept.push(srcFrame);
    } else if (!srcChanged && tgtChanged) {
      autoKept.push(tgtFrame);
    } else {
      const slotConflicts = findSlotConflicts(baseFrame, srcFrame, tgtFrame);
      // If both sides changed the type differently, treat as a conflict
      const typeConflict =
        srcFrame.type !== tgtFrame.type &&
        srcFrame.type !== baseFrame.type &&
        tgtFrame.type !== baseFrame.type;
      if (slotConflicts.length === 0 && !typeConflict) {
        const merged = mergeNonConflicting(baseFrame, srcFrame, tgtFrame);
        autoKept.push(merged);
      } else {
        conflicts.push({
          frameId: id,
          baseFrame,
          sourceFrame: srcFrame,
          targetFrame: tgtFrame,
          slotConflicts,
        });
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
  // Use the changed side's type; if only target changed type, take target's
  const mergedType = tgt.type !== base.type && src.type === base.type ? tgt.type : src.type;
  return { ...src, type: mergedType, slots };
}
