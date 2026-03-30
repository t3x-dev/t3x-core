/**
 * Relation Extraction Prompt Builder
 *
 * Builds a dedicated prompt for inter-node relation extraction.
 * Designed as a single-task prompt (not bundled with node extraction)
 * based on research evidence favoring separate extraction calls.
 *
 * @see docs/plans/2026-03-05-ring4-inter-sentence-relations-design.md §4.5
 */

export function buildRelationPrompt(nodes: Array<{ id: string; text: string }>): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a discourse relation analyzer. Given a list of semantic nodes extracted from conversations, identify meaningful relationships between them.

## Relation Types
- supports: S_target provides evidence, reasoning, or backing for S_source
- contrasts: S_target contradicts, qualifies, or presents an alternative to S_source
- causes: S_source leads to or results in S_target
- temporal_follows: S_target occurs after S_source in time
- conditions: S_source is a prerequisite or condition for S_target
- summarizes: S_target abstracts or concludes the content of S_source

## Rules
1. Only identify relationships where there is clear semantic evidence.
2. Each relation needs a brief reasoning explaining WHY this relation exists.
3. Confidence: 0.9+ for explicit markers ("because", "however"), 0.7-0.9 for implicit but clear, 0.5-0.7 for inferred.
4. A node can participate in multiple relations.
5. Do NOT force relations — if nodes are independent, return fewer or zero relations.
6. Relations are directional: source → target.

## Output Format
Return a JSON array:
[
  {
    "source_id": "s_xxx",
    "target_id": "s_yyy",
    "type": "supports",
    "confidence": 0.85,
    "reasoning": "S_yyy provides a concrete example that backs the claim in S_xxx"
  }
]

Return ONLY the JSON array, no markdown fences.`;

  const userPrompt = nodes.map((s) => `[${s.id}] ${s.text}`).join('\n');

  return { systemPrompt, userPrompt };
}
