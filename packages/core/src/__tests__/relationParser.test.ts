import { describe, expect, it } from 'vitest';
import { parseRelationResponse, RelationParseError } from '../extractors/relationParser';

const VALID_IDS = new Set(['s_aaa', 's_bbb', 's_ccc']);

describe('parseRelationResponse', () => {
  it('parses valid JSON array', () => {
    const raw = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.85,
        reasoning: 'S_bbb provides evidence for S_aaa',
      },
    ]);
    const items = parseRelationResponse(raw, VALID_IDS);
    expect(items).toHaveLength(1);
    expect(items[0].source_id).toBe('s_aaa');
    expect(items[0].target_id).toBe('s_bbb');
    expect(items[0].type).toBe('supports');
    expect(items[0].confidence).toBe(0.85);
  });

  it('strips markdown code fences', () => {
    const raw =
      '```json\n[{"source_id":"s_aaa","target_id":"s_bbb","type":"causes","confidence":0.9,"reasoning":"because"}]\n```';
    const items = parseRelationResponse(raw, VALID_IDS);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('causes');
  });

  it('filters out items with invalid sentence IDs', () => {
    const raw = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.8,
        reasoning: 'ok',
      },
      {
        source_id: 's_aaa',
        target_id: 's_zzz',
        type: 'causes',
        confidence: 0.9,
        reasoning: 'bad id',
      },
    ]);
    const items = parseRelationResponse(raw, VALID_IDS);
    expect(items).toHaveLength(1);
  });

  it('filters out self-referencing relations', () => {
    const raw = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_aaa',
        type: 'causes',
        confidence: 0.8,
        reasoning: 'self',
      },
    ]);
    const items = parseRelationResponse(raw, VALID_IDS);
    expect(items).toHaveLength(0);
  });

  it('filters out invalid relation types', () => {
    const raw = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'invalid_type',
        confidence: 0.8,
        reasoning: 'bad type',
      },
    ]);
    const items = parseRelationResponse(raw, VALID_IDS);
    expect(items).toHaveLength(0);
  });

  it('clamps confidence to [0, 1]', () => {
    const raw = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 1.5,
        reasoning: 'over',
      },
      {
        source_id: 's_bbb',
        target_id: 's_ccc',
        type: 'causes',
        confidence: -0.1,
        reasoning: 'under',
      },
    ]);
    const items = parseRelationResponse(raw, VALID_IDS);
    expect(items).toHaveLength(2);
    expect(items[0].confidence).toBe(1.0);
    expect(items[1].confidence).toBe(0.0);
  });

  it('returns empty array for empty JSON array', () => {
    const items = parseRelationResponse('[]', VALID_IDS);
    expect(items).toHaveLength(0);
  });

  it('throws RelationParseError on invalid JSON', () => {
    expect(() => parseRelationResponse('not json', VALID_IDS)).toThrow(RelationParseError);
  });

  it('throws RelationParseError on non-array JSON', () => {
    expect(() => parseRelationResponse('{"a":1}', VALID_IDS)).toThrow(RelationParseError);
  });

  it('preserves raw text in RelationParseError', () => {
    const bad = 'not valid json at all';
    try {
      parseRelationResponse(bad, VALID_IDS);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RelationParseError);
      expect((e as RelationParseError).raw).toBe(bad);
    }
  });

  it('returns valid items even if some are malformed (lenient)', () => {
    const raw = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.8,
        reasoning: 'good',
      },
      {
        source_id: 123,
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.8,
        reasoning: 'bad source_id',
      },
      'not an object',
    ]);
    const items = parseRelationResponse(raw, VALID_IDS);
    expect(items).toHaveLength(1);
  });

  it('filters out items with empty reasoning', () => {
    const raw = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.8,
        reasoning: '',
      },
    ]);
    const items = parseRelationResponse(raw, VALID_IDS);
    expect(items).toHaveLength(0);
  });

  it('deduplicates by (source_id, target_id, type) triple', () => {
    const raw = JSON.stringify([
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.8,
        reasoning: 'first',
      },
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'supports',
        confidence: 0.9,
        reasoning: 'dupe',
      },
      {
        source_id: 's_aaa',
        target_id: 's_bbb',
        type: 'causes',
        confidence: 0.7,
        reasoning: 'different type ok',
      },
    ]);
    const items = parseRelationResponse(raw, VALID_IDS);
    expect(items).toHaveLength(2);
    expect(items[0].confidence).toBe(0.8);
    expect(items[1].type).toBe('causes');
  });
});
