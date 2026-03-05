/**
 * Lazy singleton for Intl.Segmenter (word granularity).
 *
 * Intl.Segmenter correctly handles CJK text where whitespace-based splitting
 * would treat an entire Chinese/Japanese/Korean sentence as a single token.
 * The `isWordLike` filter automatically strips punctuation-only segments.
 */
let _wordSegmenter: Intl.Segmenter | undefined;
function getWordSegmenter(): Intl.Segmenter {
  if (!_wordSegmenter) {
    _wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  }
  return _wordSegmenter;
}

/**
 * Tokenizer for word-level diff
 *
 * Split text into original-case word tokens using Intl.Segmenter.
 * - Handles CJK word boundaries (Chinese, Japanese, Korean)
 * - Preserves original case (comparison should be case-insensitive)
 * - Filters punctuation-only segments via `isWordLike`
 *
 * @example
 * tokenize("Budget is $3000") → ["Budget", "is", "3000"]
 * tokenize("Hello, World!") → ["Hello", "World"]
 * tokenize("用户需要登录功能") → ["用户", "需要", "登录", "功能"]
 */
export function tokenize(text: string): string[] {
  const segmenter = getWordSegmenter();
  return [...segmenter.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment);
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
 * - Lowercases all tokens for case-insensitive matching
 * - Applies light stemming for better recall
 *
 * Uses Intl.Segmenter to correctly handle CJK text.
 * `isWordLike` filter removes punctuation-only segments.
 *
 * @example
 * tokenizeForMatching('"Hello," world!') → ["hello", "world"]
 * tokenizeForMatching("running quickly") → ["runn", "quick"]
 */
export function tokenizeForMatching(text: string): string[] {
  const segmenter = getWordSegmenter();
  return [...segmenter.segment(text)]
    .filter((s) => s.isWordLike)
    .map((s) => s.segment.toLowerCase())
    .filter((t) => t.length > 0)
    .map(lightStem);
}
