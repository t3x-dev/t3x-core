import { describe, expect, it } from 'vitest';
import { applyDelta, buildDraft } from '../../semantic/delta';
import type { Delta, DeltaLogEntry, SemanticContent } from '../../semantic/types';

const empty: SemanticContent = { frames: [], relations: [] };

describe('applyDelta', () => {
  it('adds a frame', () => {
    const delta: Delta = {
      changes: [{ action: 'add', frame: { id: 'f_001', type: 'x', slots: { a: 1 } } }],
    };
    const result = applyDelta(empty, delta);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].id).toBe('f_001');
  });

  it('updates a frame slot', () => {
    const snapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'x', slots: { a: 1, b: 2 } }],
      relations: [],
    };
    const delta: Delta = {
      changes: [{ action: 'update', target: 'f_001', slots: { a: 99 } }],
    };
    const result = applyDelta(snapshot, delta);
    expect(result.frames[0].slots.a).toBe(99);
    expect(result.frames[0].slots.b).toBe(2);
  });

  it('removes a slot with null', () => {
    const snapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'x', slots: { a: 1, b: 2 } }],
      relations: [],
    };
    const delta: Delta = {
      changes: [{ action: 'update', target: 'f_001', slots: { b: null } }],
    };
    const result = applyDelta(snapshot, delta);
    expect(result.frames[0].slots.b).toBeUndefined();
    expect(result.frames[0].slots.a).toBe(1);
  });

  it('removes a frame and cleans up relations', () => {
    const snapshot: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'x', slots: { a: 1 } },
        { id: 'f_002', type: 'y', slots: { b: 2 } },
      ],
      relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
    };
    const delta: Delta = {
      changes: [{ action: 'remove', target: 'f_001' }],
    };
    const result = applyDelta(snapshot, delta);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].id).toBe('f_002');
    expect(result.relations).toHaveLength(0);
  });

  it('adds new relations', () => {
    const snapshot: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'x', slots: { a: 1 } },
        { id: 'f_002', type: 'y', slots: { b: 2 } },
      ],
      relations: [],
    };
    const delta: Delta = {
      changes: [{ action: 'add', frame: { id: 'f_003', type: 'z', slots: { c: 3 } } }],
      new_relations: [{ from: 'f_001', to: 'f_002', type: 'elaborates' }],
    };
    const result = applyDelta(snapshot, delta);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].type).toBe('elaborates');
  });

  it('removes specified relations', () => {
    const snapshot: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'x', slots: { a: 1 } },
        { id: 'f_002', type: 'y', slots: { b: 2 } },
      ],
      relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
    };
    const delta: Delta = {
      changes: [{ action: 'add', frame: { id: 'f_003', type: 'z', slots: { c: 3 } } }],
      remove_relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
    };
    const result = applyDelta(snapshot, delta);
    expect(result.relations).toHaveLength(0);
  });

  it('skips update with non-existent target silently', () => {
    const result = applyDelta(empty, {
      changes: [{ action: 'update', target: 'f_999', slots: { a: 1 } }],
    });
    expect(result.frames).toHaveLength(0);
  });

  it('skips remove with non-existent target silently', () => {
    const result = applyDelta(empty, {
      changes: [{ action: 'remove', target: 'f_999' }],
    });
    expect(result.frames).toHaveLength(0);
  });

  it('merges add with existing frame ID instead of duplicating', () => {
    const snapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'x', slots: { a: 1, b: 2 } }],
      relations: [],
    };
    const delta: Delta = {
      changes: [
        { action: 'add', frame: { id: 'f_001', type: 'x_updated', slots: { a: 99, c: 3 } } },
      ],
    };
    const result = applyDelta(snapshot, delta);
    expect(result.frames).toHaveLength(1); // No duplicate
    expect(result.frames[0].type).toBe('x_updated');
    expect(result.frames[0].slots.a).toBe(99); // Overwritten
    expect(result.frames[0].slots.b).toBe(2); // Preserved from original
    expect(result.frames[0].slots.c).toBe(3); // New slot added
  });

  it('is immutable — does not modify input', () => {
    const snapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'x', slots: { a: 1 } }],
      relations: [],
    };
    const delta: Delta = {
      changes: [{ action: 'update', target: 'f_001', slots: { a: 99 } }],
    };
    applyDelta(snapshot, delta);
    expect(snapshot.frames[0].slots.a).toBe(1);
  });
});

describe('buildDraft', () => {
  it('builds from empty delta log', () => {
    const result = buildDraft([]);
    expect(result.frames).toHaveLength(0);
    expect(result.relations).toHaveLength(0);
  });

  it('builds from multiple deltas', () => {
    const log: DeltaLogEntry[] = [
      {
        id: 'd1',
        source: 'llm_extraction',
        created_at: '2026-01-01T00:00:00Z',
        delta: { changes: [{ action: 'add', frame: { id: 'f_001', type: 'x', slots: { a: 1 } } }] },
      },
      {
        id: 'd2',
        source: 'user_graph_edit',
        created_at: '2026-01-01T00:01:00Z',
        delta: { changes: [{ action: 'update', target: 'f_001', slots: { a: 99 } }] },
      },
    ];
    const result = buildDraft(log);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].slots.a).toBe(99);
  });
});
