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
- causes: S_source leads to or results in S_target
- conditions: S_source is a prerequisite or condition for S_target
- contrasts: S_target contradicts, qualifies, or presents an alternative to S_source
- follows: S_target occurs after S_source in time or sequence
- depends: S_source depends on or is supported by S_target

## Rules
1. Only identify relationships where there is clear semantic evidence.
2. Each relation needs a brief reasoning explaining WHY this relation exists.
3. A node can participate in multiple relations.
4. Do NOT force relations — if nodes are independent, return fewer or zero relations.
5. Relations are directional: source → target.

## Output Format
Return a JSON array:
[
  {
    "source_id": "s_xxx",
    "target_id": "s_yyy",
    "type": "depends",
    "reasoning": "S_xxx depends on the evidence provided by S_yyy"
  }
]

Return ONLY the JSON array, no markdown fences.`;

  const userPrompt = nodes.map((s) => `[${s.id}] ${s.text}`).join('\n');

  return { systemPrompt, userPrompt };
}
