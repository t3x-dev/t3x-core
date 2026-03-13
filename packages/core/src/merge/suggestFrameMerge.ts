/**
 * Frame-level Merge Suggestions
 *
 * Uses LLM to suggest merged slot values for conflicting semantic frames.
 * Optional — returns null if no LLM configured or on any error.
 */

import type { LLMProvider } from '../llm/types';
import type { SlotValue } from '../semantic/types';

export interface FrameMergeSuggestion {
  slots: Record<string, SlotValue>;
  reasoning: string;
}

export interface FrameMergeInput {
  sourceFrame: { type: string; slots: Record<string, SlotValue> };
  targetFrame: { type: string; slots: Record<string, SlotValue> };
  context?: string;
}

function buildFrameMergePrompt(input: FrameMergeInput): string {
  return `You need to merge two versions of the same semantic frame. Output the merged slots as JSON with reasoning.

Rules:
- If two values contradict, keep the more accurate or conservative value
- If two values complement each other, combine them
- If one value refines the other, keep the more detailed version
- Keep all slot keys unchanged

Frame type: ${input.sourceFrame.type}

Source version:
${JSON.stringify(input.sourceFrame.slots, null, 2)}

Target version:
${JSON.stringify(input.targetFrame.slots, null, 2)}
${input.context ? `\nContext: ${input.context}` : ''}

Output JSON only: { "slots": { ... }, "reasoning": "..." }`;
}

export interface SuggestFrameMergeResult {
  suggestion: FrameMergeSuggestion | null;
  usage: { inputTokens: number; outputTokens: number };
}

export async function suggestFrameMerge(
  input: FrameMergeInput,
  llm?: LLMProvider
): Promise<SuggestFrameMergeResult> {
  if (!llm) return { suggestion: null, usage: { inputTokens: 0, outputTokens: 0 } };

  try {
    const prompt = buildFrameMergePrompt(input);
    const result = await llm.generate(prompt, { temperature: 0.3, maxTokens: 500 });

    // Strip markdown code fences if present, then parse JSON directly
    const fenceMatch = result.text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    const cleaned = fenceMatch ? fenceMatch[1].trim() : result.text.trim();

    const parsed = JSON.parse(cleaned);
    if (!parsed.slots || typeof parsed.slots !== 'object') {
      return { suggestion: null, usage: result.usage };
    }

    return {
      suggestion: {
        slots: parsed.slots as Record<string, SlotValue>,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      },
      usage: result.usage,
    };
  } catch {
    return { suggestion: null, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}
