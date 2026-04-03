import { describe, expect, it } from 'vitest';
import { toolCallToYOp, yopToolDefinitions } from '../extractors/strategies/tool-schemas';

describe('yopToolDefinitions', () => {
  it('produces exactly 13 tool definitions', () => {
    expect(yopToolDefinitions).toHaveLength(13);
  });

  it('each definition has name, description, input_schema', () => {
    for (const def of yopToolDefinitions) {
      expect(def.name).toMatch(/^yop_/);
      expect(def.description).toBeTruthy();
      expect(def.input_schema).toBeDefined();
      expect(def.input_schema.type).toBe('object');
    }
  });

  it('tool names match the 13 YOp types', () => {
    const names = yopToolDefinitions.map((d) => d.name).sort();
    expect(names).toEqual([
      'yop_add',
      'yop_clone',
      'yop_drop',
      'yop_fold',
      'yop_merge',
      'yop_move',
      'yop_nest',
      'yop_relate',
      'yop_rename',
      'yop_set',
      'yop_split',
      'yop_unrelate',
      'yop_unset',
    ]);
  });
});

describe('toolCallToYOp', () => {
  it('converts a yop_set tool call to SetOp', () => {
    const result = toolCallToYOp('yop_set', {
      path: 'trip/budget',
      value: 3000,
      source: 'budget is 3000',
      from: 'T1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yop).toEqual({
        set: { path: 'trip/budget', value: 3000, source: 'budget is 3000', from: 'T1' },
      });
    }
  });

  it('converts a yop_add tool call to AddOp', () => {
    const result = toolCallToYOp('yop_add', {
      parent: '',
      node: { trip: { destination: 'Tokyo' } },
      source: { destination: 'going to Tokyo' },
      from: 'T1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yop).toEqual({
        add: {
          parent: '',
          node: { trip: { destination: 'Tokyo' } },
          source: { destination: 'going to Tokyo' },
          from: 'T1',
        },
      });
    }
  });

  it('returns error for invalid input', () => {
    const result = toolCallToYOp('yop_set', { path: '' }); // missing required fields
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it('returns error for unknown tool name', () => {
    const result = toolCallToYOp('yop_unknown', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unknown tool');
    }
  });

  it('converts yop_relate tool call', () => {
    const result = toolCallToYOp('yop_relate', {
      from: 'trip/hotel',
      to: 'trip/budget',
      type: 'depends',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yop).toEqual({
        relate: { from: 'trip/hotel', to: 'trip/budget', type: 'depends' },
      });
    }
  });

  it('converts yop_unset tool call', () => {
    const result = toolCallToYOp('yop_unset', { path: 'trip/budget' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yop).toEqual({ unset: { path: 'trip/budget' } });
    }
  });

  it('converts yop_drop tool call', () => {
    const result = toolCallToYOp('yop_drop', { path: 'trip', reason: 'cancelled' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yop).toEqual({ drop: { path: 'trip', reason: 'cancelled' } });
    }
  });

  it('converts yop_rename tool call', () => {
    const result = toolCallToYOp('yop_rename', { path: 'trip', to: 'vacation' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yop).toEqual({ rename: { path: 'trip', to: 'vacation' } });
    }
  });

  it('converts yop_nest tool call', () => {
    const result = toolCallToYOp('yop_nest', {
      paths: ['hotel', 'flight'],
      under: 'logistics',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yop).toEqual({
        nest: { paths: ['hotel', 'flight'], under: 'logistics' },
      });
    }
  });

  it('converts yop_merge tool call', () => {
    const result = toolCallToYOp('yop_merge', {
      paths: ['hotel_a', 'hotel_b'],
      into: 'hotel',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yop).toEqual({
        merge: { paths: ['hotel_a', 'hotel_b'], into: 'hotel' },
      });
    }
  });

  it('rejects extra fields on strict schemas', () => {
    const result = toolCallToYOp('yop_unset', { path: 'trip/budget', extra: true });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid relation type', () => {
    const result = toolCallToYOp('yop_relate', {
      from: 'a',
      to: 'b',
      type: 'invalid_type',
    });
    expect(result.ok).toBe(false);
  });
});
