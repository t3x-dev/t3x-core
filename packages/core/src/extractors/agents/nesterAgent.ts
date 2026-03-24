/**
 * Nester Agent — CODE (deterministic)
 *
 * Takes flat frames + relations and builds a nested tree structure.
 * Child frames become InlineFrame slot values in their parent.
 * Relations define the hierarchy: elaborates/conditions/depends → child of target.
 *
 * This is the same logic as CommitYAMLDocument.tsx but server-side.
 * No LLM needed — pure deterministic transformation.
 */

import type { LLMProvider } from '../../llm/types';
import type { Frame, SemanticContent, SlotValue } from '../../semantic/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

/** Relations that indicate parent-child nesting */
const NESTING_RELATIONS = new Set([
  'elaborates',
  'conditions',
  'depends',
  'follows',
  'causes',
  'contrasts',
]);

function buildNestedContent(content: SemanticContent): SemanticContent {
  const frameMap = new Map<string, Frame>();
  for (const frame of content.frames) {
    frameMap.set(frame.id, frame);
  }

  // Build children map: parentId → [childFrame]
  const childrenMap = new Map<string, Array<{ frame: Frame; relationType: string }>>();
  const childIds = new Set<string>();

  for (const rel of content.relations) {
    if (!NESTING_RELATIONS.has(rel.type)) continue;
    if (!frameMap.has(rel.from) || !frameMap.has(rel.to)) continue;

    const childFrame = frameMap.get(rel.from);

    // rel.from elaborates rel.to → rel.from is child of rel.to
    childIds.add(rel.from);
    const children = childrenMap.get(rel.to) ?? [];
    if (childFrame) {
      children.push({ frame: childFrame, relationType: rel.type });
      childrenMap.set(rel.to, children);
    }
  }

  // Root frames: not a child of anyone
  const rootFrames = content.frames.filter((f) => !childIds.has(f.id));

  // If only 1-2 frames and no children, nothing to nest
  if (rootFrames.length === content.frames.length || content.relations.length === 0) {
    return content;
  }

  // Recursively nest children into parent's slots
  function nestFrame(frame: Frame, visited: Set<string>): Frame {
    visited.add(frame.id);
    const children = childrenMap.get(frame.id) ?? [];
    if (children.length === 0) return frame;

    const newSlots: Record<string, SlotValue> = { ...frame.slots };

    for (const { frame: childFrame } of children) {
      if (visited.has(childFrame.id)) continue;
      const nested = nestFrame(childFrame, new Set(visited));

      // Use child's type as the slot key
      let slotKey = nested.type;
      // Handle duplicate keys
      if (slotKey in newSlots) {
        let suffix = 2;
        while (`${slotKey}_${suffix}` in newSlots) suffix++;
        slotKey = `${slotKey}_${suffix}`;
      }

      // Convert to InlineFrame slot value
      newSlots[slotKey] = {
        type: nested.type,
        slots: nested.slots,
      };
    }

    return {
      ...frame,
      slots: newSlots,
    };
  }

  const nestedFrames = rootFrames.map((f) => nestFrame(f, new Set()));

  return {
    frames: nestedFrames,
    relations: [], // Relations are now expressed via nesting
  };
}

export const nesterAgent: MeaningAgent = {
  name: 'nester',
  description: 'Build nested tree structure from flat frames using relations',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    // Run if there are relations to nest and more than 2 frames
    return ctx.content.relations.length > 0 && ctx.content.frames.length > 2;
  },

  async run(ctx: PipelineContext, _provider: LLMProvider): Promise<PipelineContext> {
    ctx.content = buildNestedContent(ctx.content);
    return ctx;
  },
};
