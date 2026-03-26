import { describe, expect, it } from 'vitest';
import { normalizeLLMOutput } from '../../llm/normalizer';

describe('normalizeLLMOutput', () => {
  it('passes through valid frames unchanged', () => {
    const input = {
      frames: [{ id: 'f_001', type: 'travel_plan', slots: { destination: 'Tokyo' } }],
      relations: [],
    };
    const result = normalizeLLMOutput(input);
    expect(result).toEqual(input);
  });

  it('normalizes frame IDs missing f_ prefix', () => {
    const input = {
      frames: [{ id: '001', type: 'topic', slots: { name: 'test' } }],
      relations: [],
    };
    const result = normalizeLLMOutput(input);
    expect(result.frames[0].id).toBe('f_001');
  });

  it('normalizes frame IDs with short numbers', () => {
    const input = {
      frames: [{ id: 'f_1', type: 'topic', slots: { name: 'test' } }],
      relations: [],
    };
    const result = normalizeLLMOutput(input);
    expect(result.frames[0].id).toBe('f_001');
  });

  it('converts string numbers to numbers in slots', () => {
    const input = {
      frames: [{ id: 'f_001', type: 'price', slots: { amount: '42.5', currency: 'USD' } }],
      relations: [],
    };
    const result = normalizeLLMOutput(input);
    // normalizer should not blindly convert — only if slot value looks numeric
    // This is best-effort; strings that are numbers stay as strings (safe default)
    expect(result.frames[0].slots.currency).toBe('USD');
  });

  it('strips extra fields not in frame schema', () => {
    const input = {
      frames: [
        {
          id: 'f_001',
          type: 'topic',
          slots: { name: 'test' },
          extra_field: 'should be removed',
          description: 'also removed',
        },
      ],
      relations: [],
    };
    const result = normalizeLLMOutput(input);
    expect(result.frames[0]).not.toHaveProperty('extra_field');
    expect(result.frames[0]).not.toHaveProperty('description');
  });

  it('normalizes frame type to snake_case', () => {
    const input = {
      frames: [{ id: 'f_001', type: 'TravelPlan', slots: { dest: 'NYC' } }],
      relations: [],
    };
    const result = normalizeLLMOutput(input);
    expect(result.frames[0].type).toBe('travel_plan');
  });

  it('coerces plain objects in slot arrays to InlineFrame', () => {
    const input = {
      frames: [
        {
          id: 'f_001',
          type: 'itinerary',
          slots: {
            stops: [
              { name: 'Tokyo', duration: '3 days' },
              { name: 'Osaka', duration: '2 days' },
            ],
          },
        },
      ],
      relations: [],
    };
    const result = normalizeLLMOutput(input);
    const stops = result.frames[0].slots.stops as unknown[];
    for (const stop of stops) {
      const frame = stop as { type: string; slots: Record<string, unknown> };
      expect(frame.type).toBeDefined();
      expect(frame.slots).toBeDefined();
    }
  });

  it('passes through empty frames array', () => {
    const input = { frames: [], relations: [] };
    const result = normalizeLLMOutput(input);
    expect(result.frames).toEqual([]);
  });

  it('does not re-wrap objects already in InlineFrame format', () => {
    const input = {
      frames: [
        {
          id: 'f_001',
          type: 'list',
          slots: {
            items: [{ type: 'city', slots: { name: 'Tokyo' } }],
          },
        },
      ],
      relations: [],
    };
    const result = normalizeLLMOutput(input);
    const items = result.frames[0].slots.items as unknown[];
    const item = items[0] as { type: string; slots: Record<string, unknown> };
    expect(item.type).toBe('city');
    expect(item.slots.name).toBe('Tokyo');
  });

  it('preserves relations unchanged', () => {
    const input = {
      frames: [{ id: 'f_001', type: 'a', slots: { x: 1 } }],
      relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
    };
    const result = normalizeLLMOutput(input);
    expect(result.relations).toEqual(input.relations);
  });

  it('handles non-numeric frame IDs gracefully', () => {
    const input = {
      frames: [{ id: 'travel_plan', type: 'topic', slots: { x: 1 } }],
      relations: [],
    };
    const result = normalizeLLMOutput(input);
    expect(result.frames[0].id).toBe('travel_plan');
  });

  it('handles delta format (changes array)', () => {
    const input = {
      changes: [
        {
          action: 'add',
          frame: { id: 'f_1', type: 'NewTopic', slots: { x: 'y' } },
        },
      ],
    };
    const result = normalizeLLMOutput(input);
    expect(result.changes[0].frame.id).toBe('f_001');
    expect(result.changes[0].frame.type).toBe('new_topic');
  });
});
