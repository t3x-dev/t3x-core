/**
 * Extraction Prompt Builder
 *
 * Constructs system + user prompts for LLM-based semantic extraction.
 * The LLM extracts structured knowledge sentences from conversation turns.
 */

import { escapePromptContent, estimateTokenCount } from '../llm/sanitize';

export interface TurnInput {
  conversation_id: string;
  turn_hash: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface LLMExtractionOptions {
  /** Maximum sentences to extract (default: 30) */
  maxSentences?: number;
  /** LLM temperature (default: 0.1) */
  temperature?: number;
  /** Language hint for extraction (auto-detect if not provided) */
  language?: string;
}

/**
 * Build the system and user prompts for LLM extraction.
 */
export function buildExtractionPrompt(
  turns: TurnInput[],
  options?: LLMExtractionOptions
): { systemPrompt: string; userPrompt: string; estimatedTokens: number } {
  const maxSentences = options?.maxSentences ?? 30;
  const languageHint = options?.language ? `\nExtract sentences in ${options.language}.` : '';

  const systemPrompt = `You are a knowledge extraction engine. Your task is to extract structured knowledge sentences from a conversation.

## Output Format
Return a JSON array of objects. Each object has:
- "text": A single declarative knowledge sentence. One fact per sentence. Self-contained (understandable without conversation context). Written in third person ("The user prefers..." not "I prefer..."). De-colloquialized (e.g., "I really love fancy hotels" → "The user prefers luxury hotels").
- "confidence": A number between 0 and 1.
  - 0.9–1.0: Explicitly stated facts
  - 0.7–0.89: Strong inferences from context
  - 0.5–0.69: Weak inferences or implied preferences
- "quote": The exact verbatim snippet from the original conversation that most directly supports this sentence. Must be a substring of the turn content.
- "turn_index": The 0-based index of the turn this sentence was extracted from.

## Rules
- Extract at most ${maxSentences} sentences.
- Only extract factual knowledge, preferences, decisions, requirements, and constraints.
- Do NOT extract greetings, filler words, meta-conversation ("let me think about that"), or questions without answers.
- Each sentence must be self-contained — a reader should understand it without seeing the conversation.
- If multiple turns discuss the same topic, consolidate into the most informative sentence and cite the most relevant turn.
- The "quote" field must be an exact substring of the turn content at the given turn_index.${languageHint}

## Output
Return ONLY the JSON array. No markdown fences, no explanation, no preamble.`;

  const userPrompt = turns
    .map((t, i) => `[Turn ${i}] [${t.role}]:\n${escapePromptContent(t.content, 'turn_content')}`)
    .join('\n\n');

  const estimatedTokens = estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt);

  return { systemPrompt, userPrompt, estimatedTokens };
}
