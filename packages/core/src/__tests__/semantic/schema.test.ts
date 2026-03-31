import { describe, expect, it } from 'vitest';
import {
  FlatNodeSchema,
  RelationTypeSchema,
  SemanticContentSchema,
  TreeNodeSchema,
} from '../../semantic/schema';

describe('TreeNodeSchema', () => {
  it('accepts valid tree node', () => {
    const result = TreeNodeSchema.safeParse({
      key: 'travel_plan',
      slots: { destination: 'Paris', budget: 5000 },
      children: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-snake_case key', () => {
    const result = TreeNodeSchema.safeParse({
      key: 'TravelPlan',
      slots: { a: 1 },
      children: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts nested children', () => {
    const result = TreeNodeSchema.safeParse({
      key: 'trip',
      slots: { dest: 'Tokyo' },
      children: [
        { key: 'budget', slots: { amount: 5000 }, children: [] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts array slot value', () => {
    const result = TreeNodeSchema.safeParse({
      key: 'preferences',
      slots: { tags: ['a', 'b', 'c'] },
      children: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts boolean slot value', () => {
    const result = TreeNodeSchema.safeParse({
      key: 'travel_plan',
      slots: { fine_dining: true, budget_friendly: false },
      children: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional confidence', () => {
    const result = TreeNodeSchema.safeParse({
      key: 'topic',
      slots: { a: 1 },
      children: [],
      confidence: 0.9,
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence > 1', () => {
    const result = TreeNodeSchema.safeParse({
      key: 'topic',
      slots: { a: 1 },
      children: [],
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional slot_quotes', () => {
    const result = TreeNodeSchema.safeParse({
      key: 'topic',
      slots: { dest: 'Tokyo' },
      children: [],
      slot_quotes: { dest: 'I want to go to Tokyo' },
    });
    expect(result.success).toBe(true);
  });
});

describe('FlatNodeSchema (internal)', () => {
  it('accepts valid frame', () => {
    const result = FlatNodeSchema.safeParse({
      id: 'f_001',
      type: 'travel_plan',
      slots: { destination: 'Paris', budget: 5000 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts path-based IDs', () => {
    const result = FlatNodeSchema.safeParse({
      id: 'hangzhou_trip/activity_plan',
      type: 'activity_plan',
      slots: { a: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty slots', () => {
    const result = FlatNodeSchema.safeParse({
      id: 'f_001',
      type: 'x',
      slots: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional confidence', () => {
    const result = FlatNodeSchema.safeParse({
      id: 'f_001',
      type: 'x',
      slots: { a: 1 },
      confidence: 0.9,
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence > 1', () => {
    const result = FlatNodeSchema.safeParse({
      id: 'f_001',
      type: 'x',
      slots: { a: 1 },
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('SemanticContentSchema', () => {
  it('accepts valid content with trees', () => {
    const result = SemanticContentSchema.safeParse({
      trees: [{ key: 'topic', slots: { a: 1 }, children: [] }],
      relations: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid relation', () => {
    const result = SemanticContentSchema.safeParse({
      trees: [
        { key: 'topic_a', slots: { a: 1 }, children: [] },
        { key: 'topic_b', slots: { b: 2 }, children: [] },
      ],
      relations: [{ from: 'topic_a', to: 'topic_b', type: 'causes' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid relation type', () => {
    const result = SemanticContentSchema.safeParse({
      trees: [{ key: 'topic', slots: { a: 1 }, children: [] }],
      relations: [{ from: 'topic', to: 'other', type: 'invalid' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty trees array', () => {
    const result = SemanticContentSchema.safeParse({
      trees: [],
      relations: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('RelationTypeSchema', () => {
  it('accepts depends', () => {
    expect(RelationTypeSchema.safeParse('depends').success).toBe(true);
  });
  it('accepts causes', () => {
    expect(RelationTypeSchema.safeParse('causes').success).toBe(true);
  });
  it('accepts follows', () => {
    expect(RelationTypeSchema.safeParse('follows').success).toBe(true);
  });
  it('accepts contrasts', () => {
    expect(RelationTypeSchema.safeParse('contrasts').success).toBe(true);
  });
  it('accepts conditions', () => {
    expect(RelationTypeSchema.safeParse('conditions').success).toBe(true);
  });
  it('rejects invalid type', () => {
    expect(RelationTypeSchema.safeParse('elaborates').success).toBe(false);
  });
});

