/**
 * Sentence Builder
 *
 * Converts Ring 3 segments to CommitV3 sentences with source provenance.
 */

import type { Sentence } from '../types/commit-v3';
import type { Segment } from '../extractors/types';

/**
 * Build CommitV3 sentences from Ring 3 segments.
 *
 * Each segment is converted to a sentence with:
 * - id: Uses the segment's segmentId directly (preserves traceability)
 * - text: The segment text content
 * - source: Provenance info linking back to the turn
 *
 * Note: Confidence scores are NOT included in Sentence (stored in extraction layer).
 * See commit-v3.ts for rationale.
 *
 * @param segments - Ring 3 segments from extraction
 * @param turnHash - The source turn's hash for provenance
 * @returns Array of CommitV3 sentences
 */
export function buildSentencesFromSegments(
  segments: Segment[],
  turnHash: string
): Sentence[] {
  return segments.map((seg) => ({
    id: seg.segmentId,
    text: seg.text,
    source: {
      turn_hash: turnHash,
      start_char: seg.startChar,
      end_char: seg.endChar,
    },
  }));
}
