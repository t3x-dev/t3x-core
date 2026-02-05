/**
 * Sentence Builder Tests
 */

import { describe, expect, it } from 'vitest';
import { buildSentencesFromSegments } from '../../commit/sentenceBuilder';
import type { Segment } from '../../extractors/types';

function makeSegment(id: string, text: string, start: number, end: number): Segment {
  return {
    segmentId: id,
    text,
    startChar: start,
    endChar: end,
  } as Segment;
}

describe('buildSentencesFromSegments', () => {
  it('converts segments to sentences', () => {
    const segments = [makeSegment('seg1', 'Hello world', 0, 11)];
    const result = buildSentencesFromSegments(segments, 'sha256:abc');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('seg1');
    expect(result[0].text).toBe('Hello world');
    expect(result[0].source.turn_hash).toBe('sha256:abc');
    expect(result[0].source.start_char).toBe(0);
    expect(result[0].source.end_char).toBe(11);
  });

  it('handles multiple segments', () => {
    const segments = [
      makeSegment('s1', 'First', 0, 5),
      makeSegment('s2', 'Second', 6, 12),
      makeSegment('s3', 'Third', 13, 18),
    ];
    const result = buildSentencesFromSegments(segments, 'sha256:xyz');
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(result.map((s) => s.text)).toEqual(['First', 'Second', 'Third']);
  });

  it('returns empty for empty segments', () => {
    expect(buildSentencesFromSegments([], 'sha256:abc')).toEqual([]);
  });

  it('preserves segment IDs as sentence IDs', () => {
    const segments = [makeSegment('custom-id-123', 'Text', 0, 4)];
    const result = buildSentencesFromSegments(segments, 'sha256:abc');
    expect(result[0].id).toBe('custom-id-123');
  });

  it('sets correct source provenance', () => {
    const segments = [makeSegment('s1', 'Text', 42, 99)];
    const result = buildSentencesFromSegments(segments, 'sha256:hash123');
    expect(result[0].source).toEqual({
      turn_hash: 'sha256:hash123',
      start_char: 42,
      end_char: 99,
    });
  });
});
