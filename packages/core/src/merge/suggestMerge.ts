/**
 * Smart Merge Suggestions (#10)
 *
 * Uses LLM to suggest merged text for conflicting sentence pairs.
 * Optional — returns null if no LLM configured or on any error.
 */

import type { LLMProvider } from '../llm/types';
import type { MergeSimilarPair, MergeSuggestion } from './types';

export interface SuggestMergeResult {
  suggestion: MergeSuggestion | null;
  usage: { inputTokens: number; outputTokens: number };
}

export async function suggestMerge(
  pair: MergeSimilarPair,
  llm?: LLMProvider
): Promise<SuggestMergeResult> {
  if (!llm) return { suggestion: null, usage: { inputTokens: 0, outputTokens: 0 } };

  const prompt = buildMergePrompt(pair);

  try {
    const result = await llm.generate(prompt, { temperature: 0.3, maxTokens: 500 });
    return { suggestion: parseSuggestion(result.text), usage: result.usage };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[suggestMerge] LLM suggestion failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
    return { suggestion: null, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

function buildMergePrompt(pair: MergeSimilarPair): string {
  const diffSummary = pair.wordDiff
    .map((seg) => {
      if (seg.type === 'removed') return `[-${seg.text}]`;
      if (seg.type === 'added') return `[+${seg.text}]`;
      return seg.text;
    })
    .join(' ');

  return `You are merging two versions of a sentence that contain different information.

Source: "${pair.source.text}"
Target: "${pair.target.text}"
Diff: ${diffSummary}

Write a single merged sentence that preserves all factual information from both versions.
If they contradict, include both perspectives.

Respond in JSON: {"suggestion": "...", "reasoning": "..."}`;
}

function parseSuggestion(response: string): MergeSuggestion | null {
  try {
    const fenceMatch = response.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    const cleaned = fenceMatch ? fenceMatch[1].trim() : response.trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.suggestion !== 'string' || !parsed.suggestion) return null;
    return {
      suggestion: parsed.suggestion,
      reasoning: parsed.reasoning ?? '',
    };
  } catch {
    return null;
  }
}
