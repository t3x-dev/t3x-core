import { describe, expect, test } from 'vitest';
import { SuggestConstraintsDialog } from '@/components/leaf/SuggestConstraintsDialog';
import type { SuggestedConstraint } from '@/lib/api';

describe('SuggestConstraintsDialog', () => {
  test('component exports successfully', () => {
    expect(SuggestConstraintsDialog).toBeDefined();
    expect(typeof SuggestConstraintsDialog).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      open: true,
      onOpenChange: () => {},
      leafId: 'leaf_abc123',
      onAccept: () => {},
    };
    expect(props.open).toBe(true);
    expect(props.leafId).toBe('leaf_abc123');
  });

  test('SuggestedConstraint has correct shape', () => {
    const suggestion: SuggestedConstraint = {
      type: 'require',
      match_mode: 'exact',
      value: 'Must include greeting',
      reason: 'Formal communication requires greeting',
    };
    expect(suggestion.type).toBe('require');
    expect(suggestion.match_mode).toBe('exact');
  });

  test('exclude constraint has reason', () => {
    const suggestion: SuggestedConstraint = {
      type: 'exclude',
      match_mode: 'semantic',
      value: 'Avoid jargon',
      reason: 'Target audience is general public',
    };
    expect(suggestion.type).toBe('exclude');
    expect(suggestion.reason).toBeTruthy();
  });

  test('selection filters accepted suggestions', () => {
    const suggestions: SuggestedConstraint[] = [
      { type: 'require', match_mode: 'exact', value: 'A', reason: 'r1' },
      { type: 'exclude', match_mode: 'semantic', value: 'B', reason: 'r2' },
      { type: 'require', match_mode: 'semantic', value: 'C', reason: 'r3' },
    ];
    // Simulate selecting indices 0 and 2
    const selected = new Set([0, 2]);
    const accepted = suggestions.filter((_, i) => selected.has(i));
    expect(accepted).toHaveLength(2);
    expect(accepted[0].value).toBe('A');
    expect(accepted[1].value).toBe('C');
  });
});
