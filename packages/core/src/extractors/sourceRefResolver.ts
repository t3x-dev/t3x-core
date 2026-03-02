/**
 * Source Reference Resolver
 *
 * Resolves LLM-provided quote strings to SentenceSourceRef with character offsets.
 * Uses exact match → case-insensitive match → undefined fallback.
 */

import type { SentenceSourceRef } from '../types/v4';

/**
 * Resolve a quote to a SentenceSourceRef by finding it in the turn content.
 *
 * Strategy (in order):
 * 1. Exact substring match via indexOf
 * 2. Case-insensitive match via toLowerCase
 * 3. Return undefined (quote not found — caller should lower confidence)
 */
export function resolveSourceRef(
  quote: string,
  turnContent: string,
  conversationId: string,
  turnHash: string
): SentenceSourceRef | undefined {
  // 1. Exact match
  const exactIdx = turnContent.indexOf(quote);
  if (exactIdx !== -1) {
    return {
      conversation_id: conversationId,
      turn_hash: turnHash,
      start_char: exactIdx,
      end_char: exactIdx + quote.length,
    };
  }

  // 2. Case-insensitive match
  const lowerIdx = turnContent.toLowerCase().indexOf(quote.toLowerCase());
  if (lowerIdx !== -1) {
    return {
      conversation_id: conversationId,
      turn_hash: turnHash,
      start_char: lowerIdx,
      end_char: lowerIdx + quote.length,
    };
  }

  // 3. Not found
  return undefined;
}
