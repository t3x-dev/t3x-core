import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../../semantic/types';
import { validateSlotQuotes } from '../../semantic/validate-quotes';

function node(
  key: string,
  slots: Record<string, unknown> = {},
  opts: { slot_quotes?: Record<string, string>; children?: TreeNode[] } = {}
): TreeNode {
  return { key, slots, children: opts.children ?? [], slot_quotes: opts.slot_quotes };
}

describe('validateSlotQuotes', () => {
  it('returns 100% coverage when all slots have quotes', () => {
    const trees = [
      node('trip', { destination: 'Tokyo', budget: '5000' }, {
        slot_quotes: { destination: 'going to Tokyo', budget: 'budget is 5000' },
      }),
    ];
    const result = validateSlotQuotes(trees);
    expect(result.total).toBe(2);
    expect(result.quoted).toBe(2);
    expect(result.missing).toEqual([]);
    expect(result.coverage).toBe(1);
  });

  it('detects missing quotes', () => {
    const trees = [
      node('trip', { destination: 'Tokyo', budget: '5000', duration: '7 days' }, {
        slot_quotes: { destination: 'going to Tokyo' },
      }),
    ];
    const result = validateSlotQuotes(trees);
    expect(result.total).toBe(3);
    expect(result.quoted).toBe(1);
    expect(result.missing).toContain('trip.budget');
    expect(result.missing).toContain('trip.duration');
    expect(result.coverage).toBeCloseTo(1 / 3);
  });

  it('handles nested children', () => {
    const trees = [
      node('trip', { destination: 'Tokyo' }, {
        slot_quotes: { destination: 'going to Tokyo' },
        children: [
          node('budget', { food: '1000', hotel: '2000' }, {
            slot_quotes: { food: 'food costs 1000' },
          }),
        ],
      }),
    ];
    const result = validateSlotQuotes(trees);
    expect(result.total).toBe(3);
    expect(result.quoted).toBe(2);
    expect(result.missing).toEqual(['trip.budget.hotel']);
  });

  it('returns empty result for trees with no slots', () => {
    const trees = [node('trip', {})];
    const result = validateSlotQuotes(trees);
    expect(result.total).toBe(0);
    expect(result.quoted).toBe(0);
    expect(result.missing).toEqual([]);
    expect(result.coverage).toBe(1);
  });

  it('handles empty trees array', () => {
    const result = validateSlotQuotes([]);
    expect(result.total).toBe(0);
    expect(result.coverage).toBe(1);
  });

  it('handles node with no slot_quotes property', () => {
    const trees = [node('trip', { destination: 'Tokyo' })];
    const result = validateSlotQuotes(trees);
    expect(result.total).toBe(1);
    expect(result.quoted).toBe(0);
    expect(result.missing).toEqual(['trip.destination']);
    expect(result.coverage).toBe(0);
  });
});
