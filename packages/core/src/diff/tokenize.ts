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
