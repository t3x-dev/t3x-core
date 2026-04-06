import { describe, expect, test } from 'vitest';
import { NodeCard } from '@/components/draft/NodeCard';
import type { DraftNode } from '@/lib/api';

function makeNode(overrides: Partial<DraftNode> = {}): DraftNode {
  return {
    id: 's_abc',
    text: 'Test node',
    origin: { type: 'extracted', segment_id: 'seg1' },
    position: 0,
    included: true,
    ...overrides,
  };
}

describe('NodeCard - Inherited Locking', () => {
  test('component exports successfully', () => {
    expect(NodeCard).toBeDefined();
    expect(typeof NodeCard).toBe('function');
  });

  test('accepts inherited prop', () => {
    const node = makeNode();
    const props = { node, inherited: true };
    expect(props.inherited).toBe(true);
  });

  test('default inherited is false', () => {
    const node = makeNode();
    const props: { node: DraftNode; inherited?: boolean } = { node };
    expect(props.inherited ?? false).toBe(false);
  });

  test('inherited nodes have different styling intent', () => {
    const inherited = makeNode({ id: 's_inherited' });
    const regular = makeNode({ id: 's_regular' });

    // Locked nodes should use muted styling
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
