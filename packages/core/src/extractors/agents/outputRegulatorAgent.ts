/**
 * Output Regulator Agent — CODE (deterministic)
 *
 * Runs FIRST after extraction. Normalizes the extractor's output:
 * 1. Consolidate duplicate frame types into ONE frame with array slots
 * 2. Flag if frame count is too high
 *
 * This is the safety net — if the extractor produces 15 "city_recommendation"
 * frames, this agent merges them into ONE "city_recommendations" frame with
 * a "cities" array slot.
 *
 * No LLM needed — pure deterministic transformation.
 */

import type { Frame, SlotValue } from '../../semantic/types';
import type { LLMProvider } from '../../llm/types';
import type { MeaningAgent, PipelineContext } from '../meaningPipeline';

/**
 * Find groups of frames with the same type and merge them.
 * Each group becomes ONE frame with array-valued slots.
 */
function consolidateDuplicateTypes(frames: Frame[]): Frame[] {
  // Group by type
  const groups = new Map<string, Frame[]>();
  const order: string[] = [];

  for (const frame of frames) {
    const existing = groups.get(frame.type);
    if (existing) {
      existing.push(frame);
    } else {
      groups.set(frame.type, [frame]);
      order.push(frame.type);
    }
  }

  const result: Frame[] = [];

  for (const type of order) {
    const group = groups.get(type);
    if (!group || group.length === 0) continue;

    if (group.length === 1) {
      // No duplicates — keep as is
      result.push(group[0]);
      continue;
    }

    // Multiple frames of same type — merge into ONE frame with array slots
    // Find the common slot keys across all frames in the group
    const allSlotKeys = new Set<string>();
    for (const f of group) {
      for (const key of Object.keys(f.slots)) {
        allSlotKeys.add(key);
      }
    }

    // Build merged frame: convert to an "items" array
    const items: SlotValue[] = group.map((f) => ({
      type: f.type,
      slots: f.slots,
    }));

    // Use plural type name
    const pluralType = type.endsWith('s') ? type : `${type}s`;

    const mergedFrame: Frame = {
      id: group[0].id, // Keep first frame's ID
      type: pluralType,
      slots: {
        items,
      },
      source: group[0].source,
      confidence: Math.min(...group.map((f) => f.confidence ?? 1)),
    };

    // Preserve slot_sources from first frame
    if (group[0].slot_sources) {
      mergedFrame.slot_sources = group[0].slot_sources;
    }

    result.push(mergedFrame);
  }

  return result;
}

export const outputRegulatorAgent: MeaningAgent = {
  name: 'output_regulator',
  description: 'Normalize extractor output — consolidate duplicate frame types into arrays',
  usesLLM: false,

  shouldRun(ctx: PipelineContext): boolean {
    // Run if there are duplicate frame types
    const types = ctx.content.frames.map((f) => f.type);
    const uniqueTypes = new Set(types);
    return uniqueTypes.size < types.length; // Has duplicates
  },

  async run(ctx: PipelineContext, _provider: LLMProvider): Promise<PipelineContext> {
    const consolidated = consolidateDuplicateTypes(ctx.content.frames);

    // Update relations: remove relations pointing to merged-away frames
    const remainingIds = new Set(consolidated.map((f) => f.id));
    const validRelations = ctx.content.relations.filter(
      (r) => remainingIds.has(r.from) && remainingIds.has(r.to)
    );

    ctx.content = {
      frames: consolidated,
      relations: validRelations,
    };

    return ctx;
  },
};
