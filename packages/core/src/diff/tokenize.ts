/**
 * Tokenizer for word-level diff
 *
 * Split text into lowercase word tokens.
 * Preserves punctuation attached to words (e.g., "$3000" stays as one token,
 * "Hello," includes the comma). This is intentional - we want to detect
 * punctuation changes.
 *
 * @example
 * tokenize("Budget is $3000") → ["budget", "is", "$3000"]
 * tokenize("Hello, World!") → ["hello,", "world!"]
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Light English stemmer for Jaccard matching.
 * Handles common suffixes: -ies, -ses/-xes/-zes/-ches/-shes, -s, -ed, -ing, -ly.
 * Short words (<=3 chars) are returned unchanged.
 */
export function lightStem(word: string): string {
  if (word.length <= 3) return word;

  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes'))
    return word.slice(0, -2);
  if (word.endsWith('ches') || word.endsWith('shes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.endsWith('ied') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);

  return word;
}

/**
 * Tokenizer for Jaccard similarity matching (Stage 2).
 *
 * Differences from `tokenize`:
 * - Strips leading/trailing punctuation from each token
 * - Applies light stemming for better recall
 *
 * NOT used for LCS word diff (Stage 4) — that needs original punctuation for UI display.
 *
 * @example
 * tokenizeForMatching('"Hello," world!') → ["hello", "world"]
 * tokenizeForMatching("running quickly") → ["run", "quick"]
 */
export function tokenizeForMatching(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter((t) => t.length > 0)
    .map(lightStem);
}
