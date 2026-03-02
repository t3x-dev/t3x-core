/**
 * Incremental Extraction Prompt Builder
 *
 * Builds prompts for LLM incremental extraction using the ReClaim interleaved pattern:
 * Evidence anchor → Claim generation.
 *
 * Key differences from buildExtractionPrompt:
 * - Receives existing SPs as context (LLM sees all, extracts delta)
 * - Style seed for normalization
 * - Review zone items for awareness
 * - Output format: ExtractionProposal[] (not ExtractionItem[])
 */

import type { SemanticPoint } from '../types/v4';
import type { TurnInput } from './extractionPrompt';

/**
 * Build style seed from first 5 non-undone SPs.
 */
export function buildStyleSeed(existingSPs: SemanticPoint[]): SemanticPoint[] {
  return existingSPs.filter((sp) => sp.status !== 'undone').slice(0, 5);
}

/**
 * Build system + user prompts for incremental extraction.
 */
export function buildIncrementalPrompt(
  existingSPs: SemanticPoint[],
  newTurns: TurnInput[],
  reviewZoneItems: SemanticPoint[],
  styleSeed?: SemanticPoint[]
): { systemPrompt: string; userPrompt: string } {
  const seed = styleSeed ?? buildStyleSeed(existingSPs);

  // Build existing SP context
  const existingSection =
    existingSPs.length > 0
      ? `## Existing Semantic Points (already extracted — do NOT re-extract these)\n${existingSPs
          .filter((sp) => sp.status !== 'undone')
          .map((sp, i) => `${i + 1}. [${sp.id}] ${sp.text}`)
          .join('\n')}\n\n`
      : '';

  // Build review zone context
  const reviewSection =
    reviewZoneItems.length > 0
      ? `## Pending Review Items (already proposed — do NOT duplicate)\n${reviewZoneItems
          .map((sp, i) => `${i + 1}. [${sp.id}] ${sp.text}`)
          .join('\n')}\n\n`
      : '';

  // Build style seed
  const styleSection =
    seed.length > 0
      ? `## Style Reference (match this style for new extractions)\n${seed
          .map((sp) => `- "${sp.text}"`)
          .join('\n')}\n\n`
      : '';

  const systemPrompt = `You are a knowledge extraction engine performing incremental extraction.

${existingSection}${reviewSection}${styleSection}## Task
Extract NEW knowledge from the conversation turns below. Only extract information NOT already captured in the existing semantic points above.

## Output Format
Return a JSON array of proposal objects. Each object has:
- "type": "new" (new knowledge), "modify" (update existing SP), or "reinforce" (confirm existing SP with new evidence)
- "target_sp_id": (only for modify/reinforce) The ID of the existing SP to modify/reinforce
- "text": The knowledge sentence. Third person. Self-contained. De-colloquialized.
- "confidence": Number 0-1. 0.9+ for explicit facts, 0.7-0.89 for strong inferences, 0.5-0.69 for weak inferences.
- "inference_type": "direct" (verbatim from conversation), "paraphrase" (rephrased), "cross_turn" (combined from multiple turns), "implicit" (implied but not stated)
- "reasoning": Brief explanation of why this was extracted
- "evidence": Array of evidence anchors, each with:
  - "conversation_id": The conversation ID
  - "turn_hash": The turn hash
  - "quoted_text": EXACT verbatim quote from the turn content (must be a substring)
  - "role": "primary" (main evidence) or "supporting" (additional context)
  - "relevance": Brief explanation of how this quote supports the claim

## Rules
- Extract ONLY new information not in existing SPs
- Each sentence must be self-contained
- Quotes must be exact substrings of the turn content
- Provide at least one "primary" evidence anchor per proposal
- Match the style of existing semantic points
- Do NOT extract greetings, filler, or meta-conversation
- Return ONLY the JSON array. No markdown fences, no explanation.`;

  const userPrompt = newTurns.map((t) => `[${t.turn_hash}] [${t.role}]: ${t.content}`).join('\n');

  return { systemPrompt, userPrompt };
}
