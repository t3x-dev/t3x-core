/**
 * Incremental Extraction Parser
 *
 * Parses raw LLM response into ExtractionProposal[].
 * Handles markdown fences, validates required fields, filters invalid items.
 */

import type { EvidenceAnchor, ExtractionProposal } from '../types/v4';

const VALID_TYPES = new Set(['new', 'modify', 'reinforce']);
const VALID_INFERENCE_TYPES = new Set(['direct', 'paraphrase', 'cross_turn', 'implicit']);
const VALID_ROLES = new Set(['primary', 'supporting']);

export function parseIncrementalResponse(raw: string): ExtractionProposal[] {
  // Strip markdown code fences
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse incremental extraction response as JSON: ${err instanceof Error ? err.message : String(err)}. Raw (first 200 chars): ${cleaned.slice(0, 200)}`
    );
  }

  if (!Array.isArray(parsed)) return [];

  // Validate and filter
  return parsed
    .filter((item): item is ExtractionProposal => isValidProposal(item))
    .map((item) => ({
      type: item.type,
      target_sp_id: item.target_sp_id,
      text: item.text.trim(),
      confidence: Math.max(0, Math.min(1, Number(item.confidence))),
      inference_type: item.inference_type,
      reasoning: item.reasoning || '',
      evidence: (item.evidence || []).filter(isValidEvidence),
    }));
}

function isValidProposal(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;

  if (!VALID_TYPES.has(obj.type as string)) return false;
  if (typeof obj.text !== 'string' || obj.text.trim().length === 0) return false;
  if (typeof obj.confidence !== 'number') return false;
  if (!VALID_INFERENCE_TYPES.has(obj.inference_type as string)) return false;
  if (!Array.isArray(obj.evidence) || obj.evidence.length === 0) return false;

  return true;
}

function isValidEvidence(item: unknown): item is EvidenceAnchor {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;

  return (
    typeof obj.conversation_id === 'string' &&
    typeof obj.turn_hash === 'string' &&
    typeof obj.quoted_text === 'string' &&
    typeof obj.relevance === 'string' &&
    VALID_ROLES.has(obj.role as string)
  );
}
