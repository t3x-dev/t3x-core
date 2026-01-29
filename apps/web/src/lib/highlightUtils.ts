/**
 * Highlight Utilities
 *
 * Shared functions for highlight range manipulation.
 * Used by TurnBubble, TruncatedCommitView, CommitSourceContext, etc.
 *
 * @see docs/specification/commit-source-context-presentation.md
 */

import type { HighlightRange } from '@/types/sourceContext';

/**
 * Merge overlapping or adjacent highlight ranges.
 *
 * Two ranges are considered adjacent if the gap between them is <= 1 character.
 * This prevents visual fragmentation of nearly-continuous highlights.
 *
 * @param ranges - Array of highlight ranges to merge
 * @returns Merged array with no overlapping or adjacent ranges
 *
 * @example
 * mergeHighlightRanges([
 *   { start: 0, end: 10 },
 *   { start: 8, end: 15 },   // overlaps with first
 *   { start: 16, end: 20 },  // adjacent to merged (gap = 1)
 *   { start: 30, end: 40 },  // separate
 * ])
 * // Returns: [{ start: 0, end: 20 }, { start: 30, end: 40 }]
 */
export function mergeHighlightRanges(ranges: HighlightRange[]): HighlightRange[] {
  if (ranges.length === 0) return [];

  // Sort by start position
  const sorted = [...ranges].sort((a, b) => a.start - b.start);

  // Start with a copy of the first range
  const merged: HighlightRange[] = [{ start: sorted[0].start, end: sorted[0].end }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    // Merge if overlapping or adjacent (gap <= 1 char)
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }

  return merged;
}

/**
 * Check if two highlight ranges overlap.
 *
 * @param a - First range
 * @param b - Second range
 * @returns true if ranges overlap
 */
export function rangesOverlap(a: HighlightRange, b: HighlightRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Check if two highlight ranges are adjacent (gap <= 1 char).
 *
 * @param a - First range
 * @param b - Second range
 * @returns true if ranges are adjacent
 */
export function rangesAdjacent(a: HighlightRange, b: HighlightRange): boolean {
  const [first, second] = a.end <= b.start ? [a, b] : [b, a];
  return second.start <= first.end + 1;
}

/**
 * Calculate the total coverage of highlights as a fraction of content length.
 *
 * @param contentLength - Total content length
 * @param highlights - Array of highlight ranges
 * @returns Coverage fraction between 0 and 1
 */
export function calculateHighlightCoverage(
  contentLength: number,
  highlights: HighlightRange[]
): number {
  if (contentLength === 0 || highlights.length === 0) return 0;

  // Merge to avoid double-counting overlaps
  const merged = mergeHighlightRanges(highlights);

  const totalHighlighted = merged.reduce((sum, h) => sum + (h.end - h.start), 0);

  return Math.min(1, totalHighlighted / contentLength);
}

/**
 * Clamp a highlight range to valid content bounds.
 *
 * @param range - Highlight range to clamp
 * @param contentLength - Maximum valid position
 * @returns Clamped range, or null if completely out of bounds
 */
export function clampHighlightRange(
  range: HighlightRange,
  contentLength: number
): HighlightRange | null {
  const start = Math.max(0, range.start);
  const end = Math.min(contentLength, range.end);

  if (start >= end) return null;

  return { start, end };
}

/**
 * Validate a highlight range against content.
 *
 * @param range - Highlight range to validate
 * @param contentLength - Content length
 * @returns true if range is valid
 */
export function isValidHighlightRange(range: HighlightRange, contentLength: number): boolean {
  return (
    range.start >= 0 &&
    range.end > range.start &&
    range.start < contentLength &&
    range.end <= contentLength
  );
}

/**
 * Offset all highlight ranges by a given amount.
 * Useful when content has been sliced.
 *
 * @param ranges - Highlight ranges to offset
 * @param offset - Offset to apply (can be negative)
 * @returns New array of offset ranges
 */
export function offsetHighlightRanges(ranges: HighlightRange[], offset: number): HighlightRange[] {
  return ranges.map((r) => ({
    start: r.start + offset,
    end: r.end + offset,
  }));
}

/**
 * Filter highlights to only those within a given content window.
 *
 * @param ranges - All highlight ranges
 * @param windowStart - Start of visible window
 * @param windowEnd - End of visible window
 * @returns Highlights clipped to the window (with adjusted positions)
 */
export function filterHighlightsInWindow(
  ranges: HighlightRange[],
  windowStart: number,
  windowEnd: number
): HighlightRange[] {
  const result: HighlightRange[] = [];

  for (const range of ranges) {
    // Skip if completely outside window
    if (range.end <= windowStart || range.start >= windowEnd) continue;

    // Clip to window bounds
    const clippedStart = Math.max(range.start, windowStart);
    const clippedEnd = Math.min(range.end, windowEnd);

    if (clippedStart < clippedEnd) {
      result.push({
        start: clippedStart - windowStart, // Adjust to window-relative position
        end: clippedEnd - windowStart,
      });
    }
  }

  return result;
}
