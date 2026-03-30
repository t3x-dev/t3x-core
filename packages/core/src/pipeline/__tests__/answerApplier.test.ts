import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../semantic/types';
import {
  applyAnswer,
  applyStructuralAnswer,
  applyVaguenessAnswer,
  generateCollapseYOps,
} from '../answerApplier';

// ── Fixtures ──

const baseSnapshot: SemanticContent = {
  trees: [
    {
      key: 'travel_plan', slots: { destination: 'Hangzhou', budget: '5000左右' }, children: [
        { key: 'attractions', slots: { places: ['West Lake', 'Lingyin Temple'] }, children: [] },
        { key: 'food', slots: { cuisine: 'Hangbang' }, children: [] },
      ],
    },
  ],
  relations: [
    { from: 'travel_plan', to: 'travel_plan/attractions', type: 'depends' },
    { from: 'travel_plan', to: 'travel_plan/food', type: 'depends' },
  ],
};

// ══════════════════════════════════════════════════════
// applyVaguenessAnswer
// ══════════════════════════════════════════════════════

describe('applyVaguenessAnswer', () => {
  it('updates slot with precise value', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'travel_plan', 'budget', 5000);
    expect(result.applied).toBe(true);
    expect(result.yops).toBeDefined();
    expect(result.yops!.length).toBeGreaterThan(0);
    expect(result.snapshot!.trees[0].slots.budget).toBe(5000);
  });

  it('updates slot with string value', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'travel_plan', 'budget', '5000元');
    expect(result.applied).toBe(true);
    expect(result.snapshot!.trees[0].slots.budget).toBe('5000元');
  });

  it('fails for non-existent frame', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'f_999', 'budget', 5000);
    expect(result.applied).toBe(false);
    expect(result.errors).toContain('Node f_999 not found');
  });

  it('fails for non-existent slot', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'travel_plan', 'nonexistent', 5000);
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('Slot nonexistent not found');
  });

  it('preserves other slots when updating one', () => {
    const result = applyVaguenessAnswer(baseSnapshot, 'travel_plan', 'budget', 5000);
    expect(result.snapshot!.trees[0].slots.destination).toBe('Hangzhou');
  });
});

// ══════════════════════════════════════════════════════
// applyStructuralAnswer
// ══════════════════════════════════════════════════════

describe('applyStructuralAnswer', () => {
  it('adds relate YOp for new parent', () => {
    const result = applyStructuralAnswer(baseSnapshot, 'travel_plan/food', 'travel_plan/attractions');
    expect(result.applied).toBe(true);
    expect(result.yops).toBeDefined();
    expect(result.yops!.length).toBeGreaterThan(0);
  });

  it('fails for non-existent frame', () => {
    const result = applyStructuralAnswer(baseSnapshot, 'f_999', 'travel_plan');
    expect(result.applied).toBe(false);
  });

  it('fails for non-existent parent', () => {
    const result = applyStructuralAnswer(baseSnapshot, 'travel_plan/food', 'f_999');
    expect(result.applied).toBe(false);
  });

  it('fails for self-reference', () => {
    const result = applyStructuralAnswer(baseSnapshot, 'travel_plan', 'travel_plan');
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('own parent');
  });
});

// ══════════════════════════════════════════════════════
// generateCollapseYOps
// ══════════════════════════════════════════════════════

describe('generateCollapseYOps', () => {
  it('generates drop YOps for root trees', () => {
    const yops = generateCollapseYOps(baseSnapshot);
    expect(yops.length).toBeGreaterThan(0);
    // Should be drop operations
    for (const op of yops) {
      expect('drop' in op).toBe(true);
    }
  });

  it('returns empty array for empty snapshot', () => {
    const yops = generateCollapseYOps({ trees: [], relations: [] });
    expect(yops).toHaveLength(0);
  });

  it('generates one drop for single root', () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'solo', slots: { x: 1 }, children: [] }],
      relations: [],
    };
    const yops = generateCollapseYOps(snapshot);
    expect(yops).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════
// applyAnswer (dispatch)
// ══════════════════════════════════════════════════════

describe('applyAnswer', () => {
  it('handles drift choice keep_old (no-op)', () => {
    const result = applyAnswer(baseSnapshot, { question_id: 'q1', drift_choice: 'keep_old' });
    expect(result.applied).toBe(true);
    expect(result.yops).toHaveLength(0);
    expect(result.snapshot).toBe(baseSnapshot); // same reference, no mutation
  });

  it('handles drift choice keep_new (collapse)', () => {
    const result = applyAnswer(baseSnapshot, { question_id: 'q1', drift_choice: 'keep_new' });
    expect(result.applied).toBe(true);
    expect(result.yops!.length).toBeGreaterThan(0);
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
      'travel_plan',
      'budget'
    );
    expect(result.applied).toBe(true);
    expect(result.snapshot!.trees[0].slots.budget).toBe('5000');
  });

  it('handles vagueness answer with selected_value', () => {
    const result = applyAnswer(
      baseSnapshot,
      { question_id: 'q1', selected_value: 5000 },
      'vagueness',
      'travel_plan',
      'budget'
    );
    expect(result.applied).toBe(true);
    expect(result.snapshot!.trees[0].slots.budget).toBe(5000);
  });

  it('handles structural answer', () => {
    const result = applyAnswer(
      baseSnapshot,
      { question_id: 'q1', selected_value: 'travel_plan/attractions' },
      'structural',
      'travel_plan/food'
    );
    expect(result.applied).toBe(true);
  });

  it('fails when no answer type can be determined', () => {
    const result = applyAnswer(baseSnapshot, { question_id: 'q1' });
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('Could not determine');
  });

  it('fails vagueness answer without value', () => {
    const result = applyAnswer(baseSnapshot, { question_id: 'q1' }, 'vagueness', 'travel_plan', 'budget');
    expect(result.applied).toBe(false);
    expect(result.errors![0]).toContain('No value');
  });
});
