/**
 * Drift Detector (Step 3, Level 2)
 *
 * LLM-based topic drift detection. Only called when the code pre-filter
 * flags low keyword overlap between new turns and existing frames.
 *
 * Outputs: same_topic | drift with relation type + new topic name.
 * Fail-safe: any error defaults to same_topic (never interrupt user).
 *
 * @see docs/hlq_docs/2026-03-20-agentic-pipeline-8step-design.md §4.3
 * @see https://github.com/t3x-dev/t3x-core/issues/617
 */

import { escapePromptContent } from '../llm/sanitize';
import type { LLMProvider } from '../llm/types';
import { RELATION_TYPES, type RelationType } from '../semantic/types';
import type { DriftResult } from './types';

/** Confidence below this → default to same_topic */
const CONFIDENCE_THRESHOLD = 0.7;

/** Allowed relation values in LLM output (FRAME_RELATION_TYPES + 'none') */
const VALID_RELATIONS = new Set<string>([...RELATION_TYPES, 'none']);

/** Regex for validating new_topic output */
const TOPIC_NAME_PATTERN = /^[a-zA-Z0-9_\u4e00-\u9fff]{1,100}$/;

const SYSTEM_PROMPT = `You are a topic drift detector. Given the current topic, existing frame types, and recent conversation turns, determine if the conversation has shifted to a new, unrelated topic.

Output ONLY JSON in this exact format:
{
  "same_topic": true/false,
  "confidence": 0.0-1.0,
  "relation": "elaborates|contrasts|follows|causes|conditions|depends|none",
  "new_topic": "snake_case_topic_name"
}

Rules:
- same_topic: true if conversation is still about the same general subject
- confidence: how confident you are in your assessment
- relation: if drifted, what is the semantic relation between old and new topic? Use "none" if completely unrelated
- new_topic: if drifted, suggest a snake_case name for the new topic (or "" if same_topic)
- Prefer false negatives: when unsure, say same_topic
- Subtopics are NOT drift (e.g., "Japan trip" → "Tokyo hotels" is elaboration, not drift)

Output ONLY JSON. No explanation.`;

const NO_DRIFT: DriftResult = { drifted: false, confidence: 1 };

/**
 * Detect topic drift using LLM.
 *
 * @param provider - LLM provider for generation
 * @param currentTopicName - Name of the current root topic (or first frame type)
 * @param existingFrameTypes - Type names of existing frames
 * @param recentTurns - Last 2-3 conversation turns
 * @returns DriftResult with drifted flag, confidence, relation, new topic
 */
export async function detectDrift(
  provider: LLMProvider,
  currentTopicName: string,
  existingFrameTypes: string[],
  recentTurns: Array<{ role: string; content: string }>
): Promise<DriftResult> {
  if (recentTurns.length === 0) return NO_DRIFT;

  try {
    // Build user prompt with escaped content
    const turnsText = recentTurns.map((t) => `[${t.role}]: ${t.content}`).join('\n');

    const userPrompt = `Current topic: "${currentTopicName}"
Existing frame types: ${existingFrameTypes.join(', ')}

Recent conversation:
${escapePromptContent(turnsText, 'conversation')}

Is the conversation still about the same topic?`;

    const result = await provider.generate(`${SYSTEM_PROMPT}\n\n${userPrompt}`, {
      temperature: 0.1,
      maxTokens: 200,
    });

    return parseDriftResponse(result.text);
  } catch {
    // LLM failure → default to same_topic (fail-safe)
    return NO_DRIFT;
  }
}

/**
 * Parse and validate LLM drift detection response.
 * Invalid output → defaults to same_topic.
 */
export function parseDriftResponse(raw: string): DriftResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NO_DRIFT;

    const parsed = JSON.parse(jsonMatch[0]) as {
      same_topic?: boolean;
      confidence?: number;
      relation?: string;
      new_topic?: string;
    };

    // Validate confidence
    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;

    // If same_topic or low confidence → no drift
    if (parsed.same_topic !== false || confidence < CONFIDENCE_THRESHOLD) {
      return { drifted: false, confidence };
    }

    // Validate relation type
    let relationType: RelationType | undefined;
    if (typeof parsed.relation === 'string' && VALID_RELATIONS.has(parsed.relation)) {
      relationType =
        parsed.relation === 'none' ? undefined : (parsed.relation as RelationType);
    }

    // Validate new_topic name
    let newTopicName: string | undefined;
    if (typeof parsed.new_topic === 'string' && TOPIC_NAME_PATTERN.test(parsed.new_topic)) {
      newTopicName = parsed.new_topic;
    }

    return {
      drifted: true,
      confidence,
      relationType,
      newTopicName,
    };
  } catch {
    return NO_DRIFT;
  }
}
