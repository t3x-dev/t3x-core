import { describe, expect, it } from 'vitest';
import { DeltaSchema, FrameSchema, SemanticContentSchema } from '../../semantic/schema';

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
      id: 'bad',
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
      changes: [
        { action: 'add', frame: { id: 'f_001', type: 'x', slots: { a: 1 } } },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts update change with null slot (delete)', () => {
    const result = DeltaSchema.safeParse({
      changes: [
        { action: 'update', target: 'f_001', slots: { old_key: null } },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts remove change', () => {
    const result = DeltaSchema.safeParse({
      changes: [
        { action: 'remove', target: 'f_001', reason: 'user denied' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts new_relations', () => {
    const result = DeltaSchema.safeParse({
      changes: [
        { action: 'add', frame: { id: 'f_001', type: 'x', slots: { a: 1 } } },
      ],
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
