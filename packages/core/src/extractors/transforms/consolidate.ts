/**
 * Consolidate — merge duplicate node types into single nodes with array slots.
 *
 * If the extractor produces 5 nodes with key "activity", this merges them
 * into one "activities" node with an items array.
 *
 * Pure deterministic transform. No LLM.
 */

import type { Schema } from '@t3x-dev/yschema';
import { flattenTrees, unflattenToTrees } from '../../semantic/tree';
import type { FlatNode, SemanticContent, SlotValue } from '../../semantic/types';

export interface ConsolidateOptions {
  schema?: Schema;
}

function consolidateDuplicateTypes(frames: FlatNode[]): FlatNode[] {
  const groups = new Map<string, FlatNode[]>();
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

  const result: FlatNode[] = [];

  for (const type of order) {
    const group = groups.get(type);
    if (!group || group.length === 0) continue;

    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    const items: SlotValue[] = group.map((f) => ({
      type: f.type,
      slots: f.slots,
    }));

    const pluralType = type.endsWith('s') ? type : `${type}s`;

    result.push({
      id: group[0].id,
      type: pluralType,
      slots: { items },
      source: group[0].source,
    });
  }

  return result;
}

export function consolidate(
  content: SemanticContent,
  options?: ConsolidateOptions
): SemanticContent {
  // Strict schemas declare their shape exactly. Pluralising duplicate types
  // would invent keys the schema doesn't allow — skip.
  if (options?.schema?.strict === true) return content;

  const frames = flattenTrees(content.trees);
  const types = frames.map((f) => f.type);
  const uniqueTypes = new Set(types);

  if (uniqueTypes.size === types.length) return content;

  const consolidated = consolidateDuplicateTypes(frames);
  const remainingIds = new Set(consolidated.map((f) => f.id));

  return {
    trees: unflattenToTrees(consolidated),
    relations: content.relations.filter((r) => remainingIds.has(r.from) && remainingIds.has(r.to)),
  };
}
