import { describe, expect, it } from 'vitest';
import { formatTreeDiff, formatSlotDiff } from '../lib/diff-format.js';

const diffResult = {
  changes: [
    {
      type: 'modified' as const,
      path: 'travel_preferences',
      old_value: { destination: 'Tokyo', budget: '1000 USD per day', duration: '7 days' },
      new_value: { destination: 'Kyoto', budget: '800 USD per day', duration: '7 days' },
    },
    {
      type: 'added' as const,
      path: 'new_restaurant_reviews',
      new_value: { name: 'Sushi Dai', rating: 5 },
    },
    {
      type: 'removed' as const,
      path: 'old_budget_notes',
      old_value: { amount: '500' },
    },
  ],
  stats: { added: 1, removed: 1, modified: 1 },
};

describe('formatTreeDiff', () => {
  it('returns lines with symbols for each change type', () => {
    const output = formatTreeDiff(diffResult);
    expect(output).toContain('±');
    expect(output).toContain('travel_preferences');
    expect(output).toContain('+');
    expect(output).toContain('new_restaurant_reviews');
    expect(output).toContain('-');
    expect(output).toContain('old_budget_notes');
  });

  it('includes a summary line', () => {
    const output = formatTreeDiff(diffResult);
    expect(output).toContain('1 modified');
    expect(output).toContain('1 added');
    expect(output).toContain('1 removed');
  });

  it('returns "No differences" for empty changes', () => {
    const output = formatTreeDiff({ changes: [], stats: { added: 0, removed: 0, modified: 0 } });
    expect(output).toContain('No differences');
  });
});

describe('formatSlotDiff', () => {
  it('shows changed slots with old → new', () => {
    const output = formatSlotDiff(diffResult);
    expect(output).toContain('destination');
    expect(output).toContain('Tokyo');
    expect(output).toContain('Kyoto');
  });

  it('shows added nodes with their slot values', () => {
    const output = formatSlotDiff(diffResult);
    expect(output).toContain('new_restaurant_reviews');
    expect(output).toContain('Sushi Dai');
  });

  it('returns "No differences" for empty changes', () => {
    const output = formatSlotDiff({ changes: [], stats: { added: 0, removed: 0, modified: 0 } });
    expect(output).toContain('No differences');
  });
});
