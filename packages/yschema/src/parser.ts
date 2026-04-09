/**
 * @t3x-dev/schema — Schema Parser
 *
 * Parse a user schema from a YAML string or plain object.
 * Normalizes shorthand slot definitions to full form.
 */

import yaml from 'js-yaml';
import type { NodeDef, Schema, SlotDef, SlotFull } from './types';

/** Normalize a slot shorthand to full form. */
export function normalizeSlot(def: SlotDef): SlotFull {
  if (def === 'scalar') {
    return { type: 'scalar', required: true };
  }
  if (def === 'list') {
    return { type: 'list', required: true };
  }
  if (Array.isArray(def)) {
    return { type: 'scalar', required: true, enum: def };
  }
  // Full form — fill defaults
  return {
    type: def.type ?? 'scalar',
    required: def.required ?? true,
    enum: def.enum,
    min: def.min,
    max: def.max,
    default: def.default,
  };
}

/** Normalize all slots in a node definition (recursive). */
function normalizeNodeSlots(node: NodeDef): NodeDef {
  const result = { ...node };

  if (result.slots) {
    const normalized: Record<string, SlotFull> = {};
    for (const [key, def] of Object.entries(result.slots)) {
      normalized[key] = normalizeSlot(def);
    }
    result.slots = normalized;
  }

  if (result.each_child?.slots) {
    const normalized: Record<string, SlotFull> = {};
    for (const [key, def] of Object.entries(result.each_child.slots)) {
      normalized[key] = normalizeSlot(def);
    }
    result.each_child = { slots: normalized };
  }

  if (result.children && result.children !== 'any') {
    const normalized: Record<string, NodeDef> = {};
    for (const [key, child] of Object.entries(result.children)) {
      normalized[key] = normalizeNodeSlots(child);
    }
    result.children = normalized;
  }

  return result;
}

/** Parse a YAML string into a Schema. */
export function parseSchema(yamlStr: string): Schema {
  const raw = yaml.load(yamlStr) as Record<string, unknown>;
  return parseSchemaObject(raw);
}

/** Parse a plain object into a Schema. */
export function parseSchemaObject(raw: Record<string, unknown>): Schema {
  if (!raw.name || typeof raw.name !== 'string') {
    throw new Error('Schema must have a "name" field');
  }
  if (!raw.nodes || typeof raw.nodes !== 'object') {
    throw new Error('Schema must have a "nodes" field');
  }

  const nodes: Record<string, NodeDef> = {};
  for (const [key, def] of Object.entries(raw.nodes as Record<string, unknown>)) {
    nodes[key] = normalizeNodeSlots(def as NodeDef);
  }

  return {
    name: raw.name as string,
    version: raw.version as number | string | undefined,
    description: raw.description as string | undefined,
    strict: (raw.strict as boolean) ?? false,
    nodes,
    rules: (raw.rules as Schema['rules']) ?? [],
  };
}
