/**
 * YAMLRenderer Component Tests
 *
 * Tests for the pure YAML rendering component that renders Tree nodes.
 */

import { describe, expect, test, vi } from 'vitest';
import {
  buildYAMLLines,
  YAMLRenderer,
  type YAMLRendererProps,
} from '@/components/shared/YAMLRenderer';
import type { CompatNode } from '@/domain/tree/treeCompat';

// ── Helper: minimal trees ──────────────────────────────────────────────────

function makeNode(overrides: Partial<CompatNode> & { id: string; type: string }): CompatNode {
  return {
    key: overrides.type,
    slots: {},
    children: [],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('YAMLRenderer', () => {
  test('component exports successfully', () => {
    expect(YAMLRenderer).toBeDefined();
    expect(typeof YAMLRenderer).toBe('function');
  });

  test('buildYAMLLines exports successfully', () => {
    expect(buildYAMLLines).toBeDefined();
    expect(typeof buildYAMLLines).toBe('function');
  });
});

describe('buildYAMLLines', () => {
  test('empty trees array returns empty lines', () => {
    const lines = buildYAMLLines([]);
    expect(lines).toEqual([]);
  });

  test('single tree renders header line', () => {
    const nodes: CompatNode[] = [makeNode({ id: 'f_001', type: 'user_goal', slots: {} })];
    const lines = buildYAMLLines(nodes);

    // Should have a header line and a blank separator
    expect(lines.length).toBeGreaterThan(0);
    const headerLine = lines.find((l) => l.isNodeHeader);
    expect(headerLine).toBeDefined();
    expect(headerLine?.text).toBe('user_goal:');
    expect(headerLine?.treeId).toBe('f_001');
    expect(headerLine?.slotKey).toBeNull();
  });

  test('tree with string slot renders key-value line', () => {
    const nodes: CompatNode[] = [
      makeNode({
        id: 'f_001',
        type: 'preference',
        slots: { color: 'blue' },
      }),
    ];
    const lines = buildYAMLLines(nodes);

    const slotLine = lines.find((l) => l.slotKey === 'color');
    expect(slotLine).toBeDefined();
    expect(slotLine?.text).toBe('  color: blue');
    expect(slotLine?.treeId).toBe('f_001');
    expect(slotLine?.isNodeHeader).toBe(false);
    expect(slotLine?.indent).toBe(1);
  });

  test('tree with numeric slot renders correctly', () => {
    const nodes: CompatNode[] = [
      makeNode({
        id: 'f_001',
        type: 'budget',
        slots: { amount: 3000 },
      }),
    ];
    const lines = buildYAMLLines(nodes);

    const slotLine = lines.find((l) => l.slotKey === 'amount');
    expect(slotLine).toBeDefined();
    expect(slotLine?.text).toBe('  amount: 3000');
  });

  test('tree with SlotRef renders with asterisk notation', () => {
    const nodes: CompatNode[] = [
      makeNode({
        id: 'f_001',
        type: 'relation',
        slots: { target: { ref: 'f_002' } },
      }),
    ];
    const lines = buildYAMLLines(nodes);

    const slotLine = lines.find((l) => l.slotKey === 'target');
    expect(slotLine).toBeDefined();
    expect(slotLine?.text).toBe('  target: *f_002');
  });

  test('tree with InlineNode slot renders nested lines', () => {
    const nodes: CompatNode[] = [
      makeNode({
        id: 'f_001',
        type: 'person',
        slots: {
          address: { type: 'location', slots: { city: 'Paris' } },
        },
      }),
    ];
    const lines = buildYAMLLines(nodes);

    // Should have address: line plus indented city: line
    const addressLine = lines.find((l) => l.slotKey === 'address' && l.text === '  address:');
    expect(addressLine).toBeDefined();

    const cityLine = lines.find((l) => l.text.includes('city'));
    expect(cityLine).toBeDefined();
    expect(cityLine?.text).toBe('    city: Paris');
    expect(cityLine?.indent).toBe(2);
  });

  test('tree with array slot renders bullet-point lines', () => {
    const nodes: CompatNode[] = [
      makeNode({
        id: 'f_001',
        type: 'list',
        slots: { items: ['apple', 'banana'] },
      }),
    ];
    const lines = buildYAMLLines(nodes);

    const arrayHeaderLine = lines.find((l) => l.text === '  items:');
    expect(arrayHeaderLine).toBeDefined();

    const bulletLines = lines.filter((l) => l.text.includes('- '));
    expect(bulletLines.length).toBe(2);
    // Array items at indent=1: pad='  ' + '  - ' = 4 spaces before dash
    expect(bulletLines[0].text).toBe('    - apple');
    expect(bulletLines[1].text).toBe('    - banana');
  });

  test('blank separator line is added after each tree', () => {
    const nodes: CompatNode[] = [
      makeNode({ id: 'f_001', type: 'tree_one', slots: { key: 'val' } }),
    ];
    const lines = buildYAMLLines(nodes);

    const emptyLine = lines.find((l) => l.isEmpty);
    expect(emptyLine).toBeDefined();
    expect(emptyLine?.text).toBe('');
  });

  test('multiple trees all get headers', () => {
    const nodes: CompatNode[] = [
      makeNode({ id: 'f_001', type: 'type_a', slots: {} }),
      makeNode({ id: 'f_002', type: 'type_b', slots: {} }),
    ];
    const lines = buildYAMLLines(nodes);

    const headers = lines.filter((l) => l.isNodeHeader);
    expect(headers.length).toBe(2);
    expect(headers[0].text).toBe('type_a:');
    expect(headers[1].text).toBe('type_b:');
  });

  test('YAMLLine has correct shape', () => {
    const nodes: CompatNode[] = [makeNode({ id: 'f_001', type: 'test_type', slots: { k: 'v' } })];
    const lines = buildYAMLLines(nodes);

    const headerLine = lines.find((l) => l.isNodeHeader)!;
    expect(headerLine).toHaveProperty('text');
    expect(headerLine).toHaveProperty('treeId');
    expect(headerLine).toHaveProperty('slotKey');
    expect(headerLine).toHaveProperty('isNodeHeader');
    expect(headerLine).toHaveProperty('indent');
    expect(headerLine).toHaveProperty('isEmpty');
  });
});

describe('YAMLRendererProps interface', () => {
  test('accepts minimal props with only trees', () => {
    const nodes: CompatNode[] = [];
    const props: YAMLRendererProps = { nodes };
    expect(props.nodes).toEqual([]);
  });

  test('accepts full props object', () => {
    const nodes: CompatNode[] = [makeNode({ id: 'f_001', type: 'goal', slots: {} })];
    const props: YAMLRendererProps = {
      nodes,
      renderNodeActions: (_treeId, _treeType) => null,
      highlightNodeId: 'f_001',
      getTreeMeta: (_treeId) => ({ changeType: 'add' }),
      onHoverNode: (_treeId) => {},
      className: 'my-class',
    };
    expect(props.nodes).toHaveLength(1);
    expect(props.highlightNodeId).toBe('f_001');
    expect(props.className).toBe('my-class');
  });

  test('renderNodeActions callback is invocable per tree', () => {
    const nodes: CompatNode[] = [
      makeNode({ id: 'f_001', type: 'goal', slots: {} }),
      makeNode({ id: 'f_002', type: 'constraint', slots: {} }),
    ];
    const spy = vi.fn().mockReturnValue(null);
    const props: YAMLRendererProps = { nodes, renderNodeActions: spy };

    // Simulate what the component would do — call renderNodeActions for each tree
    for (const node of props.nodes) {
      props.renderNodeActions?.(node.id, node.type);
    }

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('f_001', 'goal');
    expect(spy).toHaveBeenCalledWith('f_002', 'constraint');
  });

  test('getTreeMeta returns correct shape for add change', () => {
    const meta = { changeType: 'add' as const };
    const getTreeMeta = (_treeId: string) => meta;

    const result = getTreeMeta('f_001');
    expect(result.changeType).toBe('add');
  });

  test('getTreeMeta returns correct shape for update change', () => {
    const getTreeMeta = (treeId: string) => {
      if (treeId === 'f_001') return { changeType: 'update' as const };
      return undefined;
    };

    expect(getTreeMeta('f_001')?.changeType).toBe('update');
    expect(getTreeMeta('f_002')).toBeUndefined();
  });

  test('onHoverNode is called with treeId or null', () => {
    const spy = vi.fn();
    const props: YAMLRendererProps = {
      nodes: [],
      onHoverNode: spy,
    };

    props.onHoverNode?.('f_001');
    props.onHoverNode?.(null);

    expect(spy).toHaveBeenCalledWith('f_001');
    expect(spy).toHaveBeenCalledWith(null);
  });
});
