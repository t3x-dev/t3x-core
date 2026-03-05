import { describe, expect, it } from 'vitest';
import type { SemanticPoint } from '../../types/v4';
import { spToSentence } from '../spToSentence';

function makeSP(overrides: Partial<SemanticPoint> = {}): SemanticPoint {
  return {
    id: 'sp_test123456',
    text: 'The user prefers dark mode.',
    extraction_mode: 'llm_extracted',
    inference_type: 'direct',
    status: 'auto_landed',
    zone: 'ready',
    evidence: [
      {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:turn1',
        quoted_text: 'I prefer dark mode',
        start_char: 10,
        end_char: 29,
        match_score: 0.95,
        role: 'primary',
        relevance: 'stated directly',
        enabled: true,
      },
      {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:turn2',
        quoted_text: 'dark mode helps',
        start_char: 5,
        end_char: 20,
        match_score: 0.9,
        role: 'supporting',
        relevance: 'confirms preference',
        enabled: true,
      },
    ],
    confidence: 0.92,
    position: 0,
    staged: true,
    ...overrides,
  };
}

describe('spToSentence', () => {
  it('maps primary evidence to source_ref', () => {
    const result = spToSentence(makeSP());
    expect(result.source_ref).toEqual({
      conversation_id: 'conv_1',
      turn_hash: 'sha256:turn1',
      start_char: 10,
      end_char: 29,
    });
  });

  it('maps supporting evidence to supporting_refs', () => {
    const result = spToSentence(makeSP());
    expect(result.supporting_refs).toHaveLength(1);
    expect(result.supporting_refs![0]).toEqual({
      conversation_id: 'conv_1',
      turn_hash: 'sha256:turn2',
      start_char: 5,
      end_char: 20,
    });
  });

  it('maps inference_type to anchor_type', () => {
    expect(spToSentence(makeSP({ inference_type: 'direct' })).anchor_type).toBe('verbatim');
    expect(spToSentence(makeSP({ inference_type: 'paraphrase' })).anchor_type).toBe('paraphrase');
    expect(spToSentence(makeSP({ inference_type: 'cross_turn' })).anchor_type).toBe('inference');
    expect(spToSentence(makeSP({ inference_type: 'implicit' })).anchor_type).toBe('inference');
  });

  it('generates sentence ID with s_ prefix', () => {
    const result = spToSentence(makeSP());
    expect(result.id).toMatch(/^s_/);
  });

  it('preserves text and confidence', () => {
    const result = spToSentence(makeSP());
    expect(result.text).toBe('The user prefers dark mode.');
    expect(result.confidence).toBe(0.92);
  });

  it('handles SP with no supporting evidence', () => {
    const sp = makeSP({
      evidence: [makeSP().evidence[0]], // only primary
    });
    const result = spToSentence(sp);
    expect(result.supporting_refs).toEqual([]);
  });

  it('skips disabled evidence', () => {
    const sp = makeSP({
      evidence: [{ ...makeSP().evidence[0] }, { ...makeSP().evidence[1], enabled: false }],
    });
    const result = spToSentence(sp);
    expect(result.supporting_refs).toEqual([]);
  });
});
