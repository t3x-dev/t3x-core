import type { SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { framesToSentences } from '@/lib/framesToSentences';

describe('framesToSentences', () => {
  it('should convert frames to sentences', () => {
    const content: SemanticContent = {
      frames: [
        {
          id: 'f_1',
          type: 'decision',
          slots: { choice: 'launch API', timeline: 'Q2 2026' },
          source: 'sha256:abc',
          confidence: 0.92,
        },
      ],
      relations: [],
    };

    const sentences = framesToSentences(content);
    expect(sentences).toHaveLength(1);
    expect(sentences[0].id).toMatch(/^s_/);
    expect(sentences[0].text).toContain('launch API');
    expect(sentences[0].text).toContain('Q2 2026');
    expect(sentences[0].confidence).toBe(0.92);
  });

  it('should generate unique sentence IDs', () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_1', type: 'a', slots: { x: '1' }, source: '', confidence: 1 },
        { id: 'f_2', type: 'b', slots: { y: '2' }, source: '', confidence: 1 },
      ],
      relations: [],
    };

    const sentences = framesToSentences(content);
    expect(sentences[0].id).not.toBe(sentences[1].id);
  });

  it('should return empty array for empty content', () => {
    const sentences = framesToSentences({ frames: [], relations: [] });
    expect(sentences).toEqual([]);
  });
});
