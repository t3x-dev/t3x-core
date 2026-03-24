import { describe, expect, it } from 'vitest';
import { parseDriftResponse } from '../driftDetector';
import { preFilterDrift } from '../driftPreFilter';

// ══════════════════════════════════════════════════════
// Pre-Filter Tests
// ══════════════════════════════════════════════════════

describe('preFilterDrift', () => {
  it('returns needsLLM=false when no existing frames (first extraction)', () => {
    const result = preFilterDrift('I want to go to Hangzhou', [], []);
    expect(result.needsLLM).toBe(false);
    expect(result.overlapScore).toBe(1);
  });

  it('returns needsLLM=false when high keyword overlap', () => {
    const result = preFilterDrift(
      'What are the best hotels near West Lake in Hangzhou?',
      ['travel_plan', 'hangzhou_attractions'],
      ['Hangzhou', 'West Lake', '3 days', 'budget 5000']
    );
    expect(result.needsLLM).toBe(false);
    expect(result.overlapScore).toBeGreaterThanOrEqual(0.3);
  });

  it('returns needsLLM=true when low keyword overlap', () => {
    const result = preFilterDrift(
      'What cooking techniques are used in Hangbang cuisine?',
      ['travel_plan'],
      ['destination', 'Tokyo', 'budget', '5000']
    );
    expect(result.needsLLM).toBe(true);
    expect(result.overlapScore).toBeLessThan(0.3);
  });

  it('handles CJK content correctly', () => {
    const result = preFilterDrift(
      '杭帮菜有什么烹饪技法？',
      ['travel_plan'],
      ['杭州', '西湖', '旅游', '预算']
    );
    // "杭" appears in both → some overlap but likely low
    expect(result).toHaveProperty('needsLLM');
    expect(result).toHaveProperty('overlapScore');
  });

  it('returns needsLLM=false for empty turn content', () => {
    const result = preFilterDrift('', ['travel_plan'], ['Hangzhou']);
    expect(result.needsLLM).toBe(false);
  });

  it('handles mixed CJK and Latin content', () => {
    const result = preFilterDrift(
      '我想了解Python编程',
      ['travel_plan'],
      ['杭州', 'West Lake', '旅游']
    );
    expect(result.needsLLM).toBe(true);
  });

  it('recognizes same-topic subtopics as related', () => {
    const result = preFilterDrift(
      'What about the food in Hangzhou? Any good restaurants?',
      ['hangzhou_travel'],
      ['Hangzhou', 'West Lake', 'hotels', 'attractions', 'food']
    );
    // "Hangzhou", "food" overlap → needsLLM should be false
    expect(result.needsLLM).toBe(false);
  });
});

// ══════════════════════════════════════════════════════
// LLM Response Parser Tests
// ══════════════════════════════════════════════════════

describe('parseDriftResponse', () => {
  it('parses same_topic response', () => {
    const result = parseDriftResponse(
      '{"same_topic": true, "confidence": 0.9, "relation": "none", "new_topic": ""}'
    );
    expect(result.drifted).toBe(false);
    expect(result.confidence).toBe(0.9);
  });

  it('parses drift_detected response with valid relation', () => {
    const result = parseDriftResponse(
      '{"same_topic": false, "confidence": 0.85, "relation": "elaborates", "new_topic": "cooking_techniques"}'
    );
    expect(result.drifted).toBe(true);
    expect(result.confidence).toBe(0.85);
    expect(result.relationType).toBe('elaborates');
    expect(result.newTopicName).toBe('cooking_techniques');
  });

  it('defaults to same_topic when confidence < 0.7', () => {
    const result = parseDriftResponse(
      '{"same_topic": false, "confidence": 0.5, "relation": "none", "new_topic": "something"}'
    );
    expect(result.drifted).toBe(false);
  });

  it('defaults to same_topic on invalid JSON', () => {
    const result = parseDriftResponse('This is not JSON at all');
    expect(result.drifted).toBe(false);
    expect(result.confidence).toBe(1);
  });

  it('defaults to same_topic on empty string', () => {
    const result = parseDriftResponse('');
    expect(result.drifted).toBe(false);
  });

  it('handles JSON wrapped in markdown code block', () => {
    const result = parseDriftResponse(
      '```json\n{"same_topic": false, "confidence": 0.9, "relation": "contrasts", "new_topic": "budget_analysis"}\n```'
    );
    expect(result.drifted).toBe(true);
    expect(result.relationType).toBe('contrasts');
  });

  it('rejects invalid relation type', () => {
    const result = parseDriftResponse(
      '{"same_topic": false, "confidence": 0.9, "relation": "INVALID_TYPE", "new_topic": "test"}'
    );
    expect(result.drifted).toBe(true);
    expect(result.relationType).toBeUndefined(); // invalid → stripped
  });

  it('rejects invalid topic name pattern', () => {
    const result = parseDriftResponse(
      '{"same_topic": false, "confidence": 0.9, "relation": "elaborates", "new_topic": "has spaces and !special"}'
    );
    expect(result.drifted).toBe(true);
    expect(result.newTopicName).toBeUndefined(); // invalid → stripped
  });

  it('accepts CJK topic names', () => {
    const result = parseDriftResponse(
      '{"same_topic": false, "confidence": 0.85, "relation": "elaborates", "new_topic": "杭帮菜技法"}'
    );
    expect(result.drifted).toBe(true);
    expect(result.newTopicName).toBe('杭帮菜技法');
  });

  it('clamps confidence to 0-1 range', () => {
    const result = parseDriftResponse(
      '{"same_topic": true, "confidence": 1.5, "relation": "none", "new_topic": ""}'
    );
    expect(result.confidence).toBe(1);
  });

  it('handles missing confidence field', () => {
    const result = parseDriftResponse('{"same_topic": true, "relation": "none", "new_topic": ""}');
    expect(result.drifted).toBe(false);
    // Missing confidence defaults to 0.5, but same_topic=true → no drift anyway
  });

  it('relation "none" maps to undefined relationType', () => {
    const result = parseDriftResponse(
      '{"same_topic": false, "confidence": 0.9, "relation": "none", "new_topic": "unrelated_topic"}'
    );
    expect(result.drifted).toBe(true);
    expect(result.relationType).toBeUndefined();
  });

  it('accepts all 6 valid relation types', () => {
    for (const rel of ['causes', 'conditions', 'contrasts', 'elaborates', 'follows', 'depends']) {
      const result = parseDriftResponse(
        `{"same_topic": false, "confidence": 0.9, "relation": "${rel}", "new_topic": "test"}`
      );
      expect(result.relationType).toBe(rel);
    }
  });
});
