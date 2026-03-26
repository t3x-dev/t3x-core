import { describe, expect, it } from 'vitest';
import {
  DeltaSchema,
  FrameRelationTypeSchema,
  FrameSchema,
  SemanticContentSchema,
  TreeNativeDeltaSchema,
} from '../../semantic/schema';

describe('FrameSchema', () => {
  it('accepts valid frame', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'travel_plan',
      slots: { destination: 'Paris', budget: 5000 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid id format', () => {
    const result = FrameSchema.safeParse({
      id: 'Bad-id',
      type: 'x',
      slots: { a: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-snake_case type', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'TravelPlan',
      slots: { a: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty slots', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'x',
      slots: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts ref slot value', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'x',
      slots: { link: { ref: 'f_002' } },
    });
    expect(result.success).toBe(true);
  });

  it('accepts inline nested frame slot', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'x',
      slots: {
        detail: {
          type: 'nested',
          slots: { key: 'value' },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts array slot value', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'x',
      slots: { tags: ['a', 'b', 'c'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts boolean slot value', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'travel_plan',
      slots: { fine_dining: true, budget_friendly: false },
    });
    expect(result.success).toBe(true);
  });

  it('accepts boolean in nested array slot', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'preferences',
      slots: { flags: [true, false, 'maybe'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional confidence', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'x',
      slots: { a: 1 },
      confidence: 0.9,
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence > 1', () => {
    const result = FrameSchema.safeParse({
      id: 'f_001',
      type: 'x',
      slots: { a: 1 },
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('FrameSchema (path-based IDs)', () => {
  it('accepts legacy f_NNN IDs', () => {
    const result = FrameSchema.safeParse({ id: 'f_001', type: 'test', slots: { a: 1 } });
    expect(result.success).toBe(true);
  });

  it('accepts path-based IDs', () => {
    const result = FrameSchema.safeParse({
      id: 'hangzhou_trip',
      type: 'hangzhou_trip',
      slots: { a: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts nested path-based IDs', () => {
    const result = FrameSchema.safeParse({
      id: 'hangzhou_trip/activity_plan',
      type: 'activity_plan',
      slots: { a: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts deep path-based IDs', () => {
    const result = FrameSchema.safeParse({
      id: 'trip/activities/gear',
      type: 'gear',
      slots: { a: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid path characters', () => {
    const result = FrameSchema.safeParse({ id: 'Trip/Activity', type: 'test', slots: { a: 1 } });
    expect(result.success).toBe(false);
  });
});

describe('SemanticContentSchema', () => {
  it('accepts valid content', () => {
    const result = SemanticContentSchema.safeParse({
      frames: [{ id: 'f_001', type: 'x', slots: { a: 1 } }],
      relations: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid relation', () => {
    const result = SemanticContentSchema.safeParse({
      frames: [
        { id: 'f_001', type: 'x', slots: { a: 1 } },
        { id: 'f_002', type: 'y', slots: { b: 2 } },
      ],
      relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid relation type', () => {
    const result = SemanticContentSchema.safeParse({
      frames: [{ id: 'f_001', type: 'x', slots: { a: 1 } }],
      relations: [{ from: 'f_001', to: 'f_002', type: 'invalid' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts topic and root_frame_id', () => {
    const result = SemanticContentSchema.safeParse({
      topic: 'Japan Travel Planning',
      root_frame_id: 'f_001',
      frames: [{ id: 'f_001', type: 'plan', slots: { goal: 'travel' } }],
      relations: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topic).toBe('Japan Travel Planning');
      expect(result.data.root_frame_id).toBe('f_001');
    }
  });

  it('accepts SemanticContent without topic (backward compat)', () => {
    const result = SemanticContentSchema.safeParse({
      frames: [{ id: 'f_001', type: 'plan', slots: { goal: 'travel' } }],
      relations: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty frames array', () => {
    const result = SemanticContentSchema.safeParse({
      frames: [],
      relations: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('DeltaSchema', () => {
  it('accepts add change', () => {
    const result = DeltaSchema.safeParse({
      changes: [{ action: 'add', frame: { id: 'f_001', type: 'x', slots: { a: 1 } } }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts update change with null slot (delete)', () => {
    const result = DeltaSchema.safeParse({
      changes: [{ action: 'update', target: 'f_001', slots: { old_key: null } }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts remove change', () => {
    const result = DeltaSchema.safeParse({
      changes: [{ action: 'remove', target: 'f_001', reason: 'user denied' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts new_relations', () => {
    const result = DeltaSchema.safeParse({
      changes: [{ action: 'add', frame: { id: 'f_001', type: 'x', slots: { a: 1 } } }],
      new_relations: [{ from: 'f_001', to: 'f_002', type: 'elaborates' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty changes', () => {
    const result = DeltaSchema.safeParse({
      changes: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('FrameRelationTypeSchema', () => {
  it('accepts depends', () => {
    expect(FrameRelationTypeSchema.safeParse('depends').success).toBe(true);
  });
  it('accepts causes', () => {
    expect(FrameRelationTypeSchema.safeParse('causes').success).toBe(true);
  });
  it('accepts follows', () => {
    expect(FrameRelationTypeSchema.safeParse('follows').success).toBe(true);
  });
  it('accepts contrasts', () => {
    expect(FrameRelationTypeSchema.safeParse('contrasts').success).toBe(true);
  });
  it('accepts elaborates (legacy)', () => {
    expect(FrameRelationTypeSchema.safeParse('elaborates').success).toBe(true);
  });
  it('accepts conditions', () => {
    expect(FrameRelationTypeSchema.safeParse('conditions').success).toBe(true);
  });
});

describe('TreeNativeDeltaSchema', () => {
  it('accepts add with parent_path and node', () => {
    const result = TreeNativeDeltaSchema.safeParse({
      changes: [
        {
          action: 'add',
          parent_path: 'hangzhou_trip',
          node: { transportation: { mode: 'rail' } },
          slot_quotes: { 'transportation.mode': 'take the rail' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts update with target_path', () => {
    const result = TreeNativeDeltaSchema.safeParse({
      changes: [
        {
          action: 'update',
          target_path: 'hangzhou_trip/dining',
          slots: { budget: 800 },
          slot_quotes: { 'dining.budget': 'budget to 800' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts remove with target_path', () => {
    const result = TreeNativeDeltaSchema.safeParse({
      changes: [{ action: 'remove', target_path: 'hangzhou_trip/shopping', reason: 'cancelled' }],
    });
    expect(result.success).toBe(true);
  });
});
