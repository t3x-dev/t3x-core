/**
 * Ambiguity Detector (Step 6)
 *
 * LLM-based detection of vague and structurally ambiguous content in nodes.
 * Returns advisory questions for optional user correction.
 *
 * All questions are advisory — pipeline never pauses, delta persists normally.
 * Fail-safe: LLM failure → assume clean (no questions).
 *
 * Two types detected:
 * - vagueness: slot values with hedging language ("about", "maybe", "大概", "左右")
 * - structural: node could belong to multiple parent nodes
 *
 * @see docs/hlq_docs/2026-03-20-agentic-pipeline-8step-design.md §4.6
 * @see https://github.com/t3x-dev/t3x-core/issues/620
 */

import { nanoid } from 'nanoid';
import { escapePromptContent } from '../llm/sanitize';
import type { LLMProvider } from '../llm/types';
import type { FlatNode, SemanticContent } from '../semantic/types';
import { flattenTrees } from '../semantic/tree';
import type { AdvisoryQuestion } from './types';

/** Valid ambiguity types */
const VALID_TYPES = new Set(['vagueness', 'structural']);

export interface AmbiguityResult {
  clean: boolean;
  questions: AdvisoryQuestion[];
}

const SYSTEM_PROMPT = `You detect ambiguity in extracted semantic frames.

Check for exactly 2 types:

1. **vagueness** — A slot value contains hedging language that makes it imprecise.
   Indicators: "about", "around", "maybe", "probably", "approximately", "roughly",
   "大概", "左右", "可能", "差不多", "大约", "估计"
   Only flag when the vague language meaningfully reduces precision.
   Do NOT flag qualitative descriptions (e.g., "good food" is not vague).

2. **structural** — A frame could logically belong to multiple parent frames.
   This occurs when the content is relevant to two or more distinct sub-topics.

Output ONLY JSON:
{
  "ambiguities": [
    {
      "type": "vagueness",
      "frame_id": "f_001",
      "slot_key": "budget",
      "question": "The budget is '5000左右'. Do you have an exact number?",
      "current_value": "5000左右"
    }
  ]
}

If no ambiguity found: { "ambiguities": [] }
Output ONLY JSON. No explanation.`;

const NO_AMBIGUITY: AmbiguityResult = { clean: true, questions: [] };

/**
 * Detect ambiguity in extracted nodes.
 *
 * @param provider - LLM provider
 * @param snapshot - Current semantic content (trees + relations)
 * @param recentTurns - Recent conversation turns for context
 * @returns Advisory questions (may be empty)
 */
export async function detectAmbiguity(
  provider: LLMProvider,
  snapshot: SemanticContent,
  recentTurns: Array<{ role: string; content: string }>
): Promise<AmbiguityResult> {
  const nodes: FlatNode[] = flattenTrees(snapshot.trees);
  if (nodes.length === 0) return NO_AMBIGUITY;

  try {
    const nodesYaml = nodes
      .map((f: FlatNode) => {
        const slots = Object.entries(f.slots)
          .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
          .join('\n');
        return `  ${f.id} (${f.type}):\n${slots}`;
      })
      .join('\n');

    const turnsText = recentTurns
      .slice(-5)
      .map((t) => `[${t.role}]: ${t.content}`)
      .join('\n');

    const userPrompt = `Frames:\n${nodesYaml}\n\nRecent conversation:\n${escapePromptContent(turnsText, 'conversation')}\n\nCheck for ambiguity:`;

    const result = await provider.generate(`${SYSTEM_PROMPT}\n\n${userPrompt}`, {
      temperature: 0.1,
      maxTokens: 500,
    });

    const validNodeIds = new Set(nodes.map((f: FlatNode) => f.id));
    return parseAmbiguityResponse(result.text, validNodeIds);
  } catch {
    return NO_AMBIGUITY;
  }
}

/**
 * Parse and validate LLM ambiguity detection response.
 */
export function parseAmbiguityResponse(raw: string, validNodeIds: Set<string>): AmbiguityResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NO_AMBIGUITY;

    const parsed = JSON.parse(jsonMatch[0]) as {
      ambiguities?: Array<{
        type?: string;
        frame_id?: string;
        slot_key?: string;
        question?: string;
        current_value?: unknown;
      }>;
    };

    if (!Array.isArray(parsed.ambiguities) || parsed.ambiguities.length === 0) {
      return NO_AMBIGUITY;
    }

    const questions: AdvisoryQuestion[] = [];

    for (const amb of parsed.ambiguities) {
      // Validate type
      if (typeof amb.type !== 'string' || !VALID_TYPES.has(amb.type)) continue;

      // Validate frame_id exists in snapshot (LLM still uses frame_id in wire format)
      if (typeof amb.frame_id !== 'string' || !validNodeIds.has(amb.frame_id)) continue;

      // Validate question text
      if (typeof amb.question !== 'string' || amb.question.length === 0) continue;

      questions.push({
        id: `aq_${nanoid(12)}`,
        type: amb.type as 'vagueness' | 'structural',
        nodeId: amb.frame_id,
        slotKey: typeof amb.slot_key === 'string' ? amb.slot_key : undefined,
        question: amb.question,
        currentValue: amb.current_value,
      });
    }

    return {
      clean: questions.length === 0,
      questions,
    };
  } catch {
    return NO_AMBIGUITY;
  }
}
