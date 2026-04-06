import { describe, expect, it } from 'vitest';
import { parseAmbiguityResponse } from '../ambiguityDetector';

describe('parseAmbiguityResponse', () => {
  const validIds = new Set(['f_001', 'f_002', 'f_003']);

  it('returns clean for empty ambiguities array', () => {
    const result = parseAmbiguityResponse('{"ambiguities": []}', validIds);
    expect(result.clean).toBe(true);
    expect(result.questions).toHaveLength(0);
  });

  it('parses valid vagueness detection', () => {
    const result = parseAmbiguityResponse(
      JSON.stringify({
        ambiguities: [
          {
            type: 'vagueness',
            frame_id: 'f_001',
            slot_key: 'budget',
            question: 'Budget is "5000左右". Do you have an exact number?',
            current_value: '5000左右',
          },
        ],
      }),
      validIds
    );
    expect(result.clean).toBe(false);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].type).toBe('vagueness');
    expect(result.questions[0].nodeId).toBe('f_001');
    expect(result.questions[0].slotKey).toBe('budget');
    expect(result.questions[0].currentValue).toBe('5000左右');
    expect(result.questions[0].id).toMatch(/^aq_/);
  });

  it('parses valid structural detection', () => {
    const result = parseAmbiguityResponse(
      JSON.stringify({
        ambiguities: [
          {
            type: 'structural',
            frame_id: 'f_002',
            question: 'Hotel booking could belong to Tokyo trip or Osaka trip',
          },
        ],
      }),
      validIds
    );
    expect(result.clean).toBe(false);
    expect(result.questions[0].type).toBe('structural');
    expect(result.questions[0].slotKey).toBeUndefined();
  });

  it('discards detections with invalid type', () => {
    const result = parseAmbiguityResponse(
      JSON.stringify({
        ambiguities: [
          {
            type: 'contradiction',
            frame_id: 'f_001',
            question: 'Some contradiction',
          },
        ],
      }),
      validIds
    );
    expect(result.clean).toBe(true);
  });

  it('discards detections with non-existent frame_id', () => {
    const result = parseAmbiguityResponse(
      JSON.stringify({
        ambiguities: [
          {
            type: 'vagueness',
            frame_id: 'f_999',
            question: 'Some vagueness',
          },
        ],
      }),
      validIds
    );
    expect(result.clean).toBe(true);
  });

  it('discards detections with empty question', () => {
    const result = parseAmbiguityResponse(
      JSON.stringify({
        ambiguities: [
          {
            type: 'vagueness',
            frame_id: 'f_001',
            question: '',
          },
        ],
      }),
      validIds
    );
    expect(result.clean).toBe(true);
  });

  it('handles multiple ambiguities, keeps only valid ones', () => {
    const result = parseAmbiguityResponse(
      JSON.stringify({
        ambiguities: [
          { type: 'vagueness', frame_id: 'f_001', question: 'Q1', slot_key: 'a' },
          { type: 'invalid', frame_id: 'f_002', question: 'Q2' },
          { type: 'structural', frame_id: 'f_003', question: 'Q3' },
        ],
      }),
      validIds
    );
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].question).toBe('Q1');
    expect(result.questions[1].question).toBe('Q3');
  });

  it('returns clean on invalid JSON', () => {
    const result = parseAmbiguityResponse('not json', validIds);
    expect(result.clean).toBe(true);
  });

  it('returns clean on empty string', () => {
    const result = parseAmbiguityResponse('', validIds);
    expect(result.clean).toBe(true);
  });

  it('handles JSON wrapped in markdown code block', () => {
    const result = parseAmbiguityResponse(
      '```json\n{"ambiguities": [{"type":"vagueness","frame_id":"f_001","question":"Q?","slot_key":"x"}]}\n```',
      validIds
    );
    expect(result.questions).toHaveLength(1);
  });

  it('generates unique IDs for each question', () => {
    const result = parseAmbiguityResponse(
      JSON.stringify({
        ambiguities: [
          { type: 'vagueness', frame_id: 'f_001', question: 'Q1', slot_key: 'a' },
          { type: 'vagueness', frame_id: 'f_002', question: 'Q2', slot_key: 'b' },
        ],
      }),
      validIds
    );
    expect(result.questions[0].id).not.toBe(result.questions[1].id);
  });
});
