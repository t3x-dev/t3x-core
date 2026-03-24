import type { Frame, SemanticContent, SlotValue } from '@t3x-dev/core';

// ── Client-side nesting from relations ──

const NESTING_RELATIONS = new Set([
  'elaborates',
  'conditions',
  'depends',
  'follows',
  'causes',
  'contrasts',
]);

/**
 * Build nested tree from flat frames + relations (client-side mirror of nesterAgent).
 * Children become InlineFrame slot values in their parent.
 */
export function nestFrames(content: SemanticContent): Frame[] {
  if (content.relations.length === 0 || content.frames.length <= 1) {
    return content.frames;
  }

  const frameMap = new Map<string, Frame>();
  for (const frame of content.frames) {
    frameMap.set(frame.id, frame);
  }

  const childrenMap = new Map<string, Array<{ frame: Frame; relationType: string }>>();
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

  const rootFrames = content.frames.filter((f) => !childIds.has(f.id));
  if (rootFrames.length === content.frames.length) return content.frames;

  function nest(frame: Frame, visited: Set<string>): Frame {
    visited.add(frame.id);
    const children = childrenMap.get(frame.id) ?? [];
    if (children.length === 0) return frame;

    const newSlots: Record<string, SlotValue> = { ...frame.slots };
    for (const { frame: childFrame } of children) {
      if (visited.has(childFrame.id)) continue;
      const nested = nest(childFrame, new Set(visited));
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

  return rootFrames.map((f) => nest(f, new Set()));
}
