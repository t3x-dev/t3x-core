import type {
  Frame,
  FrameMergeResult,
  Relation,
  SemanticContent,
  SlotConflict,
  SlotValue,
} from './types';

export function prepareFrameMerge(
  base: SemanticContent,
  source: SemanticContent,
  target: SemanticContent,
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

    if (srcFrame && !tgtFrame) { onlyInSource.push(srcFrame); continue; }
    if (!srcFrame && tgtFrame) { onlyInTarget.push(tgtFrame); continue; }
    if (!srcFrame || !tgtFrame) continue;

    if (framesEqual(srcFrame, tgtFrame)) {
      autoKept.push(srcFrame);
      continue;
    }

    if (!baseFrame) {
      const slotConflicts = findSlotConflicts(undefined, srcFrame, tgtFrame);
      conflicts.push({ frameId: id, baseFrame: undefined, sourceFrame: srcFrame, targetFrame: tgtFrame, slotConflicts });
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
      if (slotConflicts.length === 0) {
        const merged = mergeNonConflicting(baseFrame, srcFrame, tgtFrame);
        autoKept.push(merged);
      } else {
        conflicts.push({ frameId: id, baseFrame, sourceFrame: srcFrame, targetFrame: tgtFrame, slotConflicts });
      }
    }
  }

  const srcRelKeys = new Set(source.relations.map(relKey));
  const tgtRelKeys = new Set(target.relations.map(relKey));
  const relationsInBoth = source.relations.filter((r) => tgtRelKeys.has(relKey(r)));
  const relationsOnlyInSource = source.relations.filter((r) => !tgtRelKeys.has(relKey(r)));
  const relationsOnlyInTarget = target.relations.filter((r) => !srcRelKeys.has(relKey(r)));

  return { autoKept, conflicts, onlyInSource, onlyInTarget, relationsOnlyInSource, relationsOnlyInTarget, relationsInBoth };
}

function relKey(r: Relation): string {
  return `${r.from}|${r.to}|${r.type}`;
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
    const baseVal = base?.slots[key];
    const srcVal = src.slots[key];
    const tgtVal = tgt.slots[key];

    if (deepEqual(srcVal as SlotValue, tgtVal as SlotValue)) continue;
    if (base && deepEqual(srcVal as SlotValue, baseVal as SlotValue)) continue;
    if (base && deepEqual(tgtVal as SlotValue, baseVal as SlotValue)) continue;

    conflicts.push({ key, baseValue: baseVal as SlotValue, sourceValue: srcVal as SlotValue, targetValue: tgtVal as SlotValue });
  }
  return conflicts;
}

function mergeNonConflicting(base: Frame, src: Frame, tgt: Frame): Frame {
  const slots: Record<string, SlotValue> = { ...base.slots };
  const allKeys = new Set([...Object.keys(src.slots), ...Object.keys(tgt.slots), ...Object.keys(base.slots)]);

  for (const key of allKeys) {
    const baseVal = base.slots[key];
    const srcVal = src.slots[key];
    const tgtVal = tgt.slots[key];

    const srcChanged = !deepEqual(srcVal as SlotValue, baseVal as SlotValue);
    const tgtChanged = !deepEqual(tgtVal as SlotValue, baseVal as SlotValue);

    if (srcChanged) {
      if (srcVal === undefined) { delete slots[key]; } else { slots[key] = srcVal; }
    } else if (tgtChanged) {
      if (tgtVal === undefined) { delete slots[key]; } else { slots[key] = tgtVal; }
    }
  }
  return { ...src, slots };
}

function deepEqual(a: SlotValue | undefined, b: SlotValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const aObj = a as unknown as Record<string, unknown>;
    const bObj = b as unknown as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => k in bObj && deepEqual(aObj[k] as SlotValue, bObj[k] as SlotValue));
  }
  return false;
}
