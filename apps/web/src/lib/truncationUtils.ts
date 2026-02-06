/**
 * Truncation Utilities
 *
 * Shared functions for smart text truncation with highlight preservation.
 * Used by CommitSourceContext, TruncatedCommitView, SourceContextView.
 *
 * Key features:
 * - Preserves highlighted sections fully visible
 * - Respects word boundaries (never breaks mid-word)
 * - Adds ellipsis markers for truncated portions
 * - Supports multiple highlight ranges
 *
 * @see docs/specification/commit-source-context-presentation.md
 */

import type { HighlightRange, TruncatedSegment, TruncationOptions } from '@/types/sourceContext';
import { mergeHighlightRanges } from './highlightUtils';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Default maximum content length before truncation */
export const DEFAULT_MAX_LENGTH = 2000;

/** Default context characters around highlights */
export const DEFAULT_CONTEXT_CHARS = 100;

// ═══════════════════════════════════════════════════════════════════════════
// Word Boundary Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find the nearest word boundary from a given position.
 *
 * @param text - The text to search within
 * @param pos - Starting position
 * @param direction - 'left' to find start of word, 'right' to find end
 * @returns Position at a word boundary
 *
 * @example
 * const text = "Hello world example";
 * findWordBoundary(text, 7, 'left');  // Returns 6 (start of "world")
 * findWordBoundary(text, 7, 'right'); // Returns 11 (end of "world")
 */
export function findWordBoundary(text: string, pos: number, direction: 'left' | 'right'): number {
  // Clamp to valid range
  if (pos <= 0) return 0;
  if (pos >= text.length) return text.length;

  if (direction === 'left') {
    // Move left to find start of current word or end of previous word
    while (pos > 0 && !/\s/.test(text[pos - 1])) {
      pos--;
    }
    return pos;
  }

  // direction === 'right'
  // Move right to find end of current word
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++;
  }
  return pos;
}

// ═══════════════════════════════════════════════════════════════════════════
// Simple Truncation (for long content without segments)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Truncate long content while preserving highlighted sections.
 * Returns a simple string with ellipsis markers.
 *
 * @param content - Full content string
 * @param highlights - Highlight ranges to preserve
 * @param options - Truncation options
 * @returns Truncated string with "..." markers
 *
 * @example
 * const content = "A very long text with important [highlighted] content...";
 * truncateLongContent(content, [{ start: 31, end: 42 }], { contextChars: 20 });
 * // Returns: "...with important [highlighted] content..."
 */
export function truncateLongContent(
  content: string,
  highlights: HighlightRange[],
  options?: TruncationOptions
): string {
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;
  const contextChars = options?.contextChars ?? DEFAULT_CONTEXT_CHARS;

  // No truncation needed
  if (content.length <= maxLength) return content;

  // No highlights - just truncate from start
  if (highlights.length === 0) {
    return content.slice(0, maxLength) + '...';
  }

  // Find the range that covers all highlights with context
  const minStart = Math.min(...highlights.map((h) => h.start));
  const maxEnd = Math.max(...highlights.map((h) => h.end));

  const visibleStart = Math.max(0, minStart - contextChars);
  const visibleEnd = Math.min(content.length, maxEnd + contextChars);

  let result = '';

  if (visibleStart > 0) {
    result += '...';
  }

  result += content.slice(visibleStart, visibleEnd);

  if (visibleEnd < content.length) {
    result += '...';
  }

  return result;
}

/**
 * Adjust highlight positions after truncation.
 * Call this when using truncateLongContent to get correct highlight positions.
 *
 * @param highlights - Original highlight ranges
 * @param content - Original content
 * @param options - Same options used for truncation
 * @returns Adjusted highlight ranges for the truncated content
 */
export function adjustHighlightsForTruncation(
  highlights: HighlightRange[],
  content: string,
  options?: TruncationOptions
): HighlightRange[] {
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;
  const contextChars = options?.contextChars ?? DEFAULT_CONTEXT_CHARS;

  // No truncation happened
  if (content.length <= maxLength) return highlights;
  if (highlights.length === 0) return highlights;

  const minStart = Math.min(...highlights.map((h) => h.start));
  const visibleStart = Math.max(0, minStart - contextChars);

  // Account for leading "..." (3 characters)
  const offset = visibleStart > 0 ? visibleStart - 3 : 0;

  return highlights.map((h) => ({
    start: h.start - offset,
    end: h.end - offset,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Segment-based Truncation (for rich rendering)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Smart truncation algorithm that returns segments for rich rendering.
 *
 * Features:
 * - Shows first N highlights fully
 * - Adds context around each highlight
 * - Uses ellipsis for truncated portions
 * - Never breaks mid-word
 *
 * @param text - Full text content
 * @param highlights - Highlight ranges
 * @param options - Truncation options
 * @returns Array of segments for rendering
 *
 * @example
 * truncateWithHighlights(
 *   "The system uses OAuth 2.0 for authentication. Rate limiting is 100/min.",
 *   [{ start: 16, end: 25 }],
 *   { contextChars: 10, maxHighlights: 2 }
 * )
 * // Returns:
 * // [
 * //   { type: 'ellipsis', content: '...' },
 * //   { type: 'text', content: 'uses ' },
 * //   { type: 'highlight', content: 'OAuth 2.0' },
 * //   { type: 'text', content: ' for auth' },
 * //   { type: 'ellipsis', content: '...' }
 * // ]
 */
export function truncateWithHighlights(
  text: string,
  highlights: HighlightRange[],
  options?: TruncationOptions
): TruncatedSegment[] {
  const contextChars = options?.contextChars ?? DEFAULT_CONTEXT_CHARS;
  const maxHighlights = options?.maxHighlights;
  const preserveWordBoundary = options?.preserveWordBoundary ?? true;

  if (text.length === 0) return [];

  // If no highlights, show truncated text from start
  if (highlights.length === 0) {
    const maxLen = contextChars * 2;
    if (text.length <= maxLen) {
      return [{ type: 'text', content: text }];
    }
    const endPos = preserveWordBoundary ? findWordBoundary(text, maxLen, 'right') : maxLen;
    return [
      { type: 'text', content: text.slice(0, endPos) },
      { type: 'ellipsis', content: '...' },
    ];
  }

  // Merge overlapping highlights and limit count
  const merged = mergeHighlightRanges(highlights);
  const visibleHighlights = maxHighlights ? merged.slice(0, maxHighlights) : merged;

  // Build visible ranges (highlight + context)
  const visibleRanges: HighlightRange[] = [];

  for (const hl of visibleHighlights) {
    // Calculate context boundaries
    let contextStart = Math.max(0, hl.start - contextChars);
    let contextEnd = Math.min(text.length, hl.end + contextChars);

    // Adjust to word boundaries if enabled
    if (preserveWordBoundary) {
      if (contextStart > 0) {
        contextStart = findWordBoundary(text, contextStart, 'right');
      }
      if (contextEnd < text.length) {
        contextEnd = findWordBoundary(text, contextEnd, 'left');
      }
    }

    // Ensure highlight is still fully visible
    contextStart = Math.min(contextStart, hl.start);
    contextEnd = Math.max(contextEnd, hl.end);

    visibleRanges.push({ start: contextStart, end: contextEnd });
  }

  // Merge adjacent visible ranges
  const mergedRanges = mergeHighlightRanges(visibleRanges);

  // Build segments
  const segments: TruncatedSegment[] = [];
  let lastEnd = 0;

  for (const range of mergedRanges) {
    // Add ellipsis if there's a gap
    if (range.start > lastEnd) {
      segments.push({ type: 'ellipsis', content: '...' });
    }

    // Find highlights within this range
    const rangeHighlights = visibleHighlights.filter(
      (hl) => hl.start >= range.start && hl.end <= range.end
    );

    // Build segments within this range
    let pos = range.start;
    for (const hl of rangeHighlights) {
      // Text before highlight
      if (hl.start > pos) {
        segments.push({ type: 'text', content: text.slice(pos, hl.start) });
      }
      // Highlight
      segments.push({ type: 'highlight', content: text.slice(hl.start, hl.end) });
      pos = hl.end;
    }

    // Text after last highlight in range
    if (pos < range.end) {
      segments.push({ type: 'text', content: text.slice(pos, range.end) });
    }

    lastEnd = range.end;
  }

  // Add trailing ellipsis if needed
  if (lastEnd < text.length) {
    segments.push({ type: 'ellipsis', content: '...' });
  }

  return segments;
}

// ═══════════════════════════════════════════════════════════════════════════
// Content Integrity
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple Jaccard-like similarity calculation for content integrity checking.
 * Case-insensitive word-based comparison.
 *
 * @param a - First string
 * @param b - Second string
 * @returns Similarity score between 0 and 1
 */
export function calculateTextSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );

  // Handle whitespace-only strings
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  if (union === 0) return 0;

  return intersection / union;
}

/**
 * Check if sentence text matches the content at the source position.
 *
 * @param sentenceText - Expected sentence text
 * @param turnContent - Full turn content
 * @param startChar - Start position
 * @param endChar - End position
 * @returns 'valid' if match, 'mismatch' if different, 'unknown' if can't determine
 */
export function checkContentIntegrity(
  sentenceText: string,
  turnContent: string,
  startChar: number,
  endChar: number
): 'valid' | 'mismatch' | 'unknown' {
  // Boundary validation
  if (
    startChar < 0 ||
    endChar < 0 ||
    startChar >= endChar ||
    startChar >= turnContent.length ||
    endChar > turnContent.length
  ) {
    return 'mismatch';
  }

  const actualText = turnContent.slice(startChar, endChar);

  // Normalize whitespace for comparison
  const normalizedSentence = sentenceText.trim().replace(/\s+/g, ' ');
  const normalizedActual = actualText.trim().replace(/\s+/g, ' ');

  if (normalizedSentence === normalizedActual) {
    return 'valid';
  }

  // Check if it's a close match (>90% similar) - could be minor edits
  const similarity = calculateTextSimilarity(normalizedSentence, normalizedActual);
  if (similarity > 0.9) {
    return 'valid';
  }

  return 'mismatch';
}
