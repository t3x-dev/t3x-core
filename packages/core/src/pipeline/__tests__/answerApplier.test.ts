import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../semantic/types';
import {
  applyAnswer,
  applyStructuralAnswer,
  applyVaguenessAnswer,
  generateCollapseDelta,
} from '../answerApplier';

// ── Fixtures ──

const baseSnapshot: SemanticContent = {
  frames: [
    { id: 'f_001', type: 'travel_plan', slots: { destination: 'Hangzhou', budget: '5000左右' } },
    { id: 'f_002', type: 'attractions', slots: { places: ['West Lake', 'Lingyin Temple'] } },
    { id: 'f_003', type: 'food', slots: { cuisine: 'Hangbang' } },
  ],
  relations: [
    { from: 'f_001', to: 'f_002', type: 'elaborates' },
    { from: 'f_001', to: 'f_003', type: 'elaborates' },
  ],
};

// ══════════════════════════════════════════════════════
// applyVaguenessAnswer
// ══════════════════════════════════════════════════════

describe('applyVaguenessAnswer', () => {
  it('updates slot with precise value', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'f_001', 'budget', 5000);
    expect(result.applied).toBe(true);
    expect(result.delta!.changes).toHaveLength(1);
    expect(result.delta!.changes[0]).toEqual({
      action: 'update',
      target: 'f_001',
      slots: { budget: 5000 },
    });
    expect(result.snapshot!.frames[0].slots.budget).toBe(5000);
  });

  it('updates slot with string value', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'f_001', 'budget', '5000元');
    expect(result.applied).toBe(true);
    expect(result.snapshot!.frames[0].slots.budget).toBe('5000元');
  });

  it('fails for non-existent frame', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'f_999', 'budget', 5000);
    expect(result.applied).toBe(false);
    expect(result.errors).toContain('Frame f_999 not found');
  });

  it('fails for non-existent slot', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'f_001', 'nonexistent', 5000);
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('Slot nonexistent not found');
  });

  it('preserves other slots when updating one', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'f_001', 'budget', 5000);
    expect(result.snapshot!.frames[0].slots.destination).toBe('Hangzhou');
  });
});

// ══════════════════════════════════════════════════════
// applyStructuralAnswer
// ══════════════════════════════════════════════════════

describe('applyStructuralAnswer', () => {
  it('moves frame under new parent', () => {
    // Move f_003 (food) from under f_001 to under f_002
    const result = applyStructuralAnswer(baseSnapshot, 'f_003', 'f_002');
    expect(result.applied).toBe(true);
    expect(result.delta!.remove_relations).toHaveLength(1);
    expect(result.delta!.new_relations).toHaveLength(1);
    expect(result.delta!.new_relations![0]).toEqual({
      from: 'f_002',
      to: 'f_003',
      type: 'elaborates',
    });
  });

  it('fails for non-existent frame', () => {
    const result = applyStructuralAnswer(baseSnapshot, 'f_999', 'f_001');
    expect(result.applied).toBe(false);
  });

  it('fails for non-existent parent', () => {
    const result = applyStructuralAnswer(baseSnapshot, 'f_003', 'f_999');
    expect(result.applied).toBe(false);
  });

  it('fails for self-reference', () => {
    const result = applyStructuralAnswer(baseSnapshot, 'f_001', 'f_001');
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('own parent');
  });
});

// ══════════════════════════════════════════════════════
// generateCollapseDelta
// ══════════════════════════════════════════════════════

describe('generateCollapseDelta', () => {
  it('generates collapse for root + direct children', () => {
    const delta = generateCollapseDelta(baseSnapshot);
    // Root is f_001 (no incoming elaborates), children are f_002 and f_003
    expect(delta.changes).toHaveLength(3);
    const targets = delta.changes.map((c) => (c as { target: string }).target);
    expect(targets).toContain('f_001');
    expect(targets).toContain('f_002');
    expect(targets).toContain('f_003');
  });

  it('returns empty delta for empty snapshot', () => {
    const delta = generateCollapseDelta({ frames: [], relations: [] });
    expect(delta.changes).toHaveLength(0);
  });

  it('collapses only root when no children', () => {
    const snapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'solo', slots: { x: 1 } }],
      relations: [],
    };
    const delta = generateCollapseDelta(snapshot);
    expect(delta.changes).toHaveLength(1);
  });

  it('does not collapse grandchildren', () => {
    const snapshot: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'root', slots: { x: 1 } },
        { id: 'f_002', type: 'child', slots: { y: 2 } },
        { id: 'f_003', type: 'grandchild', slots: { z: 3 } },
      ],
      relations: [
        { from: 'f_001', to: 'f_002', type: 'elaborates' },
        { from: 'f_002', to: 'f_003', type: 'elaborates' },
      ],
    };
    const delta = generateCollapseDelta(snapshot);
    // Only root (f_001) + direct child (f_002), NOT grandchild (f_003)
    expect(delta.changes).toHaveLength(2);
    const targets = delta.changes.map((c) => (c as { target: string }).target);
    expect(targets).toContain('f_001');
    expect(targets).toContain('f_002');
    expect(targets).not.toContain('f_003');
  });
});

// ══════════════════════════════════════════════════════
// applyAnswer (dispatch)
// ══════════════════════════════════════════════════════

describe('applyAnswer', () => {
  it('handles drift choice keep_old (no-op)', () => {
    const result = applyAnswer(baseSnapshot, { question_id: 'q1', drift_choice: 'keep_old' });
    expect(result.applied).toBe(true);
    expect(result.delta!.changes).toHaveLength(0);
    expect(result.snapshot).toBe(baseSnapshot); // same reference, no mutation
  });

  it('handles drift choice keep_new (collapse)', () => {
    const result = applyAnswer(baseSnapshot, { question_id: 'q1', drift_choice: 'keep_new' });
    expect(result.applied).toBe(true);
    expect(result.delta!.changes.length).toBeGreaterThan(0);
  });

  it('returns error for keep_both_separate (needs API orchestration)', () => {
    const result = applyAnswer(baseSnapshot, {
      question_id: 'q1',
      drift_choice: 'keep_both_separate',
    });
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('API-layer orchestration');
  });

  it('returns error for keep_both_together (needs API orchestration)', () => {
    const result = applyAnswer(baseSnapshot, {
      question_id: 'q1',
      drift_choice: 'keep_both_together',
    });
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('API-layer orchestration');
  });

  it('handles vagueness answer', () => {
    const result = applyAnswer(
      baseSnapshot,
      { question_id: 'q1', answer_text: '5000' },
      'vagueness',
      'f_001',
      'budget'
    );
    expect(result.applied).toBe(true);
    expect(result.snapshot!.frames[0].slots.budget).toBe('5000');
  });

  it('handles vagueness answer with selected_value', () => {
    const result = applyAnswer(
      baseSnapshot,
      { question_id: 'q1', selected_value: 5000 },
      'vagueness',
      'f_001',
      'budget'
    );
    expect(result.applied).toBe(true);
    expect(result.snapshot!.frames[0].slots.budget).toBe(5000);
  });

  it('handles structural answer', () => {
    const result = applyAnswer(
      baseSnapshot,
      { question_id: 'q1', selected_value: 'f_002' },
      'structural',
      'f_003'
    );
    expect(result.applied).toBe(true);
  });

  it('fails when no answer type can be determined', () => {
    const result = applyAnswer(baseSnapshot, { question_id: 'q1' });
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('Could not determine');
  });

  it('fails vagueness answer without value', () => {
    const result = applyAnswer(baseSnapshot, { question_id: 'q1' }, 'vagueness', 'f_001', 'budget');
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('No value');
  });
});
