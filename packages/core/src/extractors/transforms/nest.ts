/**
 * Nest — build hierarchical tree structure from flat nodes + relations.
 *
 * Relations (causes, depends, follows, etc.) define parent-child nesting.
 * After nesting, relations are consumed (expressed via structure, not edges).
 *
 * Pure deterministic transform. No LLM.
 */

import { flattenTrees, unflattenToTrees } from '../../semantic/tree';
import type { FlatNode, SemanticContent, SlotValue } from '../../semantic/types';

const NESTING_RELATIONS = new Set(['conditions', 'depends', 'follows', 'causes', 'contrasts']);

export function nest(content: SemanticContent): SemanticContent {
  if (content.relations.length === 0 || content.trees.length === 0) {
    return content;
  }

  const frames = flattenTrees(content.trees);
  const frameMap = new Map<string, FlatNode>();
  for (const frame of frames) {
    frameMap.set(frame.id, frame);
  }

  const childrenMap = new Map<string, Array<{ frame: FlatNode; relationType: string }>>();
  const childIds = new Set<string>();

  for (const rel of content.relations) {
    if (!NESTING_RELATIONS.has(rel.type)) continue;
    if (!frameMap.has(rel.from) || !frameMap.has(rel.to)) continue;

    const childFrame = frameMap.get(rel.from);
    childIds.add(rel.from);
    const children = childrenMap.get(rel.to) ?? [];
    if (childFrame) {
      children.push({ frame: childFrame, relationType: rel.type });
      childrenMap.set(rel.to, children);
    }
  }

  const rootFrames = frames.filter((f) => !childIds.has(f.id));

  if (rootFrames.length === frames.length) return content;

  function nestFrame(frame: FlatNode, visited: Set<string>): FlatNode {
    visited.add(frame.id);
    const children = childrenMap.get(frame.id) ?? [];
    if (children.length === 0) return frame;

    const newSlots: Record<string, SlotValue> = { ...frame.slots };

    for (const { frame: childFrame } of children) {
      if (visited.has(childFrame.id)) continue;
      const nested = nestFrame(childFrame, new Set(visited));

      let slotKey = nested.type;
      if (slotKey in newSlots) {
        let suffix = 2;
        while (`${slotKey}_${suffix}` in newSlots) suffix++;
        slotKey = `${slotKey}_${suffix}`;
      }

      newSlots[slotKey] = { type: nested.type, slots: nested.slots };
    }

    return { ...frame, slots: newSlots };
  }

  const nestedFrames = rootFrames.map((f) => nestFrame(f, new Set()));

  return { trees: unflattenToTrees(nestedFrames), relations: [] };
}
