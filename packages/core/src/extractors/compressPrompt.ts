/**
 * Compression Prompt Builder
 *
 * Builds the system + user prompt for the CompressAgent.
 * Input: frames with engagement signals → Output: Delta with remove/update actions.
 */

import type { FlatNode, Relation } from '../semantic/types';

export interface NodeWithSignals extends FlatNode {
  has_manual_edit: boolean;
  last_touched: number;
  mention_count: number;
}

export interface CompressInput {
  frames: NodeWithSignals[];
  relations: Relation[];
}

export interface CompressPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

const COMPRESS_SYSTEM_PROMPT = `You are a semantic frame compressor. Given a set of extracted frames with their origin and engagement signals, produce a Delta that merges redundant frames and removes low-value content.

Each frame has these signals:
- confidence: origin indicator
    0.85+ = user explicitly stated (highest value)
    0.6+  = user confirmed an AI suggestion
    <0.6  = AI inferred, user did not object (lowest value)
- has_manual_edit: true if user manually edited this frame
- last_touched: number of turns since last mention or edit
- mention_count: how many times referenced in conversation

Priority rules:
1. PROTECTED — never delete:
   - Frames the user stated or confirmed (confidence >= 0.6)
   - Frames the user manually edited (has_manual_edit = true)
   - These can only be MERGED into another frame if ALL slot values are preserved
2. COMPRESS FIRST:
   - AI-inferred frames (confidence < 0.6) that are redundant with another frame → merge
   - AI-inferred frames with no user engagement (mention_count = 1, no manual edit) → remove
   - AI-inferred frames not recently referenced (high last_touched) → remove
3. COMPRESS LAST:
   - Protected frames that are highly redundant with each other → merge (preserve all slots)
4. When merging, the surviving frame keeps the HIGHER confidence of the two
5. When merging, combine slot values from both frames (no information loss)
6. Output 'remove' and 'update' actions only (no 'add')
7. Relations use field names 'from' and 'to' (NOT 'source'/'target')
8. If there is nothing worth compressing, return an empty changes array

Output ONLY valid JSON (no markdown fences, no commentary):
{
  "changes": [
    { "action": "remove", "target": "<frame_id>", "reason": "<why>" },
    { "action": "update", "target": "<frame_id>", "slots": { "<key>": "<merged_value>" } }
  ],
  "remove_relations": [
    { "from": "<id>", "to": "<id>", "type": "<relation_type>" }
  ],
  "summary": "<1-line human-readable summary of what was compressed>",
  "stats": { "before": <N>, "after": <N>, "merged": <N>, "removed": <N> }
}`;

function serializeNodeWithSignals(frame: NodeWithSignals): string {
  const lines: string[] = [];
  lines.push(
    `${frame.id}: # type=${frame.type}, confidence=${frame.confidence ?? 'unknown'}, has_manual_edit=${frame.has_manual_edit}, last_touched=${frame.last_touched}, mention_count=${frame.mention_count}`
  );
  for (const [key, value] of Object.entries(frame.slots)) {
    const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
    lines.push(`  ${key}: ${display}`);
  }
  return lines.join('\n');
}

function serializeRelations(relations: Relation[]): string {
  if (relations.length === 0) return '(none)';
  return relations.map((r) => `${r.from} --${r.type}--> ${r.to}`).join('\n');
}

export function buildCompressPrompt(input: CompressInput): CompressPromptResult {
  const framesYaml = input.frames.map(serializeNodeWithSignals).join('\n\n');
  const relationsText = serializeRelations(input.relations);

  const userPrompt = `Frames (${input.frames.length} total):

${framesYaml}

Relations:
${relationsText}

Compress these frames. Output JSON only.`;

  return { systemPrompt: COMPRESS_SYSTEM_PROMPT, userPrompt };
}
