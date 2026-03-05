import { describe, expect, it } from 'vitest';
import { parseIncrementalResponse } from '../incrementalParser';

describe('parseIncrementalResponse', () => {
  it('parses valid JSON array of proposals', () => {
    const raw = JSON.stringify([
      {
        type: 'new',
        text: 'The user prefers TypeScript.',
        confidence: 0.9,
        inference_type: 'direct',
        reasoning: 'Stated directly',
        evidence: [
          {
            conversation_id: 'conv_1',
            turn_hash: 'sha256:t1',
            quoted_text: 'I like TypeScript',
            role: 'primary',
            relevance: 'stated',
          },
        ],
      },
    ]);
    const result = parseIncrementalResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('new');
    expect(result[0].text).toBe('The user prefers TypeScript.');
  });

  it('strips markdown code fences', () => {
    const raw =
      '```json\n[{"type":"new","text":"test","confidence":0.9,"inference_type":"direct","reasoning":"r","evidence":[{"conversation_id":"c","turn_hash":"h","quoted_text":"q","role":"primary","relevance":"r"}]}]\n```';
    const result = parseIncrementalResponse(raw);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for invalid JSON', () => {
    const result = parseIncrementalResponse('not json at all');
    expect(result).toEqual([]);
  });

  it('filters out proposals with missing required fields', () => {
    const raw = JSON.stringify([
      {
        type: 'new',
        text: 'Valid',
        confidence: 0.9,
        inference_type: 'direct',
        reasoning: 'r',
        evidence: [
          {
            conversation_id: 'c',
            turn_hash: 'h',
            quoted_text: 'q',
            role: 'primary',
            relevance: 'r',
          },
        ],
      },
      { type: 'new', text: '', confidence: 0.9 }, // missing fields
      { confidence: 0.5 }, // missing type and text
    ]);
    const result = parseIncrementalResponse(raw);
    expect(result).toHaveLength(1);
  });

  it('handles modify proposal with target_sp_id', () => {
    const raw = JSON.stringify([
      {
        type: 'modify',
        target_sp_id: 'sp_abc123',
        text: 'Updated text',
        confidence: 0.85,
        inference_type: 'paraphrase',
        reasoning: 'Better phrasing available',
        evidence: [
          {
            conversation_id: 'c',
            turn_hash: 'h',
            quoted_text: 'q',
            role: 'primary',
            relevance: 'r',
          },
        ],
      },
    ]);
    const result = parseIncrementalResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].target_sp_id).toBe('sp_abc123');
  });
});
