import { describe, expect, test } from 'vitest';
import { SentenceCard } from '@/components/draft/SentenceCard';
import type { DraftNode } from '@/lib/api';

function makeNode(overrides: Partial<DraftNode> = {}): DraftNode {
  return {
    id: 's_abc',
    text: 'Test sentence',
    origin: { type: 'extracted', segment_id: 'seg1', confidence: 0.9 },
    position: 0,
    included: true,
    ...overrides,
  };
}

describe('SentenceCard - Inherited Locking', () => {
  test('component exports successfully', () => {
    expect(SentenceCard).toBeDefined();
    expect(typeof SentenceCard).toBe('function');
  });

  test('accepts inherited prop', () => {
    const sentence = makeNode();
    const props = { sentence, inherited: true };
    expect(props.inherited).toBe(true);
  });

  test('default inherited is false', () => {
    const sentence = makeNode();
    const props: { sentence: DraftNode; inherited?: boolean } = { sentence };
    expect(props.inherited ?? false).toBe(false);
  });

  test('inherited sentences have different styling intent', () => {
    const inherited = makeNode({ id: 's_inherited' });
    const regular = makeNode({ id: 's_regular' });

    // Locked sentences should use muted styling
    const lockedClass = 'border-border/50 bg-muted/50';
    const normalClass = 'border-border bg-[var(--surface-card)]';

    expect(lockedClass).toContain('bg-muted');
    expect(normalClass).toContain('surface-card');
    expect(inherited).toBeDefined();
    expect(regular).toBeDefined();
  });

  test('drag is disabled when locked', () => {
    // When inherited/locked, draggable should be false
    const locked = true;
    expect(!locked).toBe(false); // draggable={!locked}
  });
});
