/**
 * Relation Response Parser
 *
 * Parses LLM output for inter-node relation extraction.
 * More lenient than extractionParser.ts: returns empty array even when all items
 * are invalid, since relation extraction is non-blocking and should never throw
 * on valid JSON.
 */

import { RELATION_TYPES, type RelationType } from '../semantic/types';

export interface RelationItem {
  source_id: string;
  target_id: string;
  type: RelationType;
  reasoning: string;
}

export class RelationParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string
  ) {
    super(message);
    this.name = 'RelationParseError';
  }
}

const VALID_TYPES = new Set<string>(RELATION_TYPES);

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

function validateItem(item: unknown, validIds: Set<string>): RelationItem | null {
  if (typeof item !== 'object' || item === null) return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj.source_id !== 'string' || obj.source_id.length === 0) return null;
  if (typeof obj.target_id !== 'string' || obj.target_id.length === 0) return null;
  if (typeof obj.type !== 'string' || !VALID_TYPES.has(obj.type)) return null;
  if (typeof obj.reasoning !== 'string' || obj.reasoning.length === 0) return null;
  if (obj.source_id === obj.target_id) return null;
  if (!validIds.has(obj.source_id) || !validIds.has(obj.target_id)) return null;
  return {
    source_id: obj.source_id,
    target_id: obj.target_id,
    type: obj.type as RelationType,
    reasoning: (obj.reasoning as string).slice(0, 500),
  };
}

export function parseRelationResponse(raw: string, validIds: Set<string>): RelationItem[] {
  const cleaned = stripCodeFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new RelationParseError(`Invalid JSON: ${cleaned.slice(0, 200)}`, raw);
  }
  if (!Array.isArray(parsed)) {
    throw new RelationParseError('Expected JSON array', raw);
  }
  const results: RelationItem[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const validated = validateItem(item, validIds);
    if (!validated) continue;
    const key = `${validated.source_id}:${validated.target_id}:${validated.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(validated);
  }
  return results;
}
