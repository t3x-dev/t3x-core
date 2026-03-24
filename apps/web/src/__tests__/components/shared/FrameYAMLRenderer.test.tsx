/**
 * FrameYAMLRenderer Component Tests
 *
 * Tests for the pure YAML rendering component that renders Frame trees.
 */

import { describe, expect, test, vi } from 'vitest';
import type { Frame } from '@t3x-dev/core';
import {
  FrameYAMLRenderer,
  type FrameYAMLRendererProps,
  buildYAMLLines,
  type YAMLLine,
} from '@/components/shared/FrameYAMLRenderer';

// ── Helper: minimal frames ──────────────────────────────────────────────────

function makeFrame(overrides: Partial<Frame> & { id: string; type: string }): Frame {
  return {
    slots: {},
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('FrameYAMLRenderer', () => {
  test('component exports successfully', () => {
    expect(FrameYAMLRenderer).toBeDefined();
    expect(typeof FrameYAMLRenderer).toBe('function');
  });

  test('buildYAMLLines exports successfully', () => {
    expect(buildYAMLLines).toBeDefined();
    expect(typeof buildYAMLLines).toBe('function');
  });
});

describe('buildYAMLLines', () => {
  test('empty frames array returns empty lines', () => {
    const lines = buildYAMLLines([]);
    expect(lines).toEqual([]);
  });

  test('single frame renders header line', () => {
    const frames: Frame[] = [makeFrame({ id: 'f_001', type: 'user_goal', slots: {} })];
    const lines = buildYAMLLines(frames);

    // Should have a header line and a blank separator
    expect(lines.length).toBeGreaterThan(0);
    const headerLine = lines.find((l) => l.isFrameHeader);
    expect(headerLine).toBeDefined();
    expect(headerLine?.text).toBe('user_goal:');
    expect(headerLine?.frameId).toBe('f_001');
    expect(headerLine?.slotKey).toBeNull();
  });

  test('frame with string slot renders key-value line', () => {
    const frames: Frame[] = [
      makeFrame({
        id: 'f_001',
        type: 'preference',
        slots: { color: 'blue' },
      }),
    ];
    const lines = buildYAMLLines(frames);

    const slotLine = lines.find((l) => l.slotKey === 'color');
    expect(slotLine).toBeDefined();
    expect(slotLine?.text).toBe('  color: "blue"');
    expect(slotLine?.frameId).toBe('f_001');
    expect(slotLine?.isFrameHeader).toBe(false);
    expect(slotLine?.indent).toBe(1);
  });

  test('frame with numeric slot renders correctly', () => {
    const frames: Frame[] = [
      makeFrame({
        id: 'f_001',
        type: 'budget',
        slots: { amount: 3000 },
      }),
    ];
    const lines = buildYAMLLines(frames);

    const slotLine = lines.find((l) => l.slotKey === 'amount');
    expect(slotLine).toBeDefined();
    expect(slotLine?.text).toBe('  amount: 3000');
  });

  test('frame with SlotRef renders with asterisk notation', () => {
    const frames: Frame[] = [
      makeFrame({
        id: 'f_001',
        type: 'relation',
        slots: { target: { ref: 'f_002' } },
      }),
    ];
    const lines = buildYAMLLines(frames);

    const slotLine = lines.find((l) => l.slotKey === 'target');
    expect(slotLine).toBeDefined();
    expect(slotLine?.text).toBe('  target: *f_002');
  });

  test('frame with InlineFrame slot renders nested lines', () => {
    const frames: Frame[] = [
      makeFrame({
        id: 'f_001',
        type: 'person',
        slots: {
          address: { type: 'location', slots: { city: 'Paris' } },
        },
      }),
    ];
    const lines = buildYAMLLines(frames);

    // Should have address: line plus indented city: line
    const addressLine = lines.find((l) => l.slotKey === 'address' && l.text === '  address:');
    expect(addressLine).toBeDefined();

    const cityLine = lines.find((l) => l.text.includes('city'));
    expect(cityLine).toBeDefined();
    expect(cityLine?.text).toBe('    city: "Paris"');
    expect(cityLine?.indent).toBe(2);
  });

  test('frame with array slot renders bullet-point lines', () => {
    const frames: Frame[] = [
      makeFrame({
        id: 'f_001',
        type: 'list',
        slots: { items: ['apple', 'banana'] },
      }),
    ];
    const lines = buildYAMLLines(frames);

    const arrayHeaderLine = lines.find((l) => l.text === '  items:');
    expect(arrayHeaderLine).toBeDefined();

    const bulletLines = lines.filter((l) => l.text.includes('- '));
    expect(bulletLines.length).toBe(2);
    // Array items at indent=1: pad='  ' + '  - ' = 4 spaces before dash
    expect(bulletLines[0].text).toBe('    - "apple"');
    expect(bulletLines[1].text).toBe('    - "banana"');
  });

  test('blank separator line is added after each frame', () => {
    const frames: Frame[] = [
      makeFrame({ id: 'f_001', type: 'frame_one', slots: { key: 'val' } }),
    ];
    const lines = buildYAMLLines(frames);

    const emptyLine = lines.find((l) => l.isEmpty);
    expect(emptyLine).toBeDefined();
    expect(emptyLine?.text).toBe('');
  });

  test('multiple frames all get headers', () => {
    const frames: Frame[] = [
      makeFrame({ id: 'f_001', type: 'type_a', slots: {} }),
      makeFrame({ id: 'f_002', type: 'type_b', slots: {} }),
    ];
    const lines = buildYAMLLines(frames);

    const headers = lines.filter((l) => l.isFrameHeader);
    expect(headers.length).toBe(2);
    expect(headers[0].text).toBe('type_a:');
    expect(headers[1].text).toBe('type_b:');
  });

  test('YAMLLine has correct shape', () => {
    const frames: Frame[] = [makeFrame({ id: 'f_001', type: 'test_type', slots: { k: 'v' } })];
    const lines = buildYAMLLines(frames);

    const headerLine = lines.find((l) => l.isFrameHeader)!;
    expect(headerLine).toHaveProperty('text');
    expect(headerLine).toHaveProperty('frameId');
    expect(headerLine).toHaveProperty('slotKey');
    expect(headerLine).toHaveProperty('isFrameHeader');
    expect(headerLine).toHaveProperty('indent');
    expect(headerLine).toHaveProperty('isEmpty');
  });
});

describe('FrameYAMLRendererProps interface', () => {
  test('accepts minimal props with only frames', () => {
    const frames: Frame[] = [];
    const props: FrameYAMLRendererProps = { frames };
    expect(props.frames).toEqual([]);
  });

  test('accepts full props object', () => {
    const frames: Frame[] = [makeFrame({ id: 'f_001', type: 'goal', slots: {} })];
    const props: FrameYAMLRendererProps = {
      frames,
      renderFrameActions: (frameId, frameType) => null,
      highlightFrameId: 'f_001',
      getFrameMeta: (frameId) => ({ confidence: 0.9, changeType: 'add' }),
      onHoverFrame: (frameId) => {},
      className: 'my-class',
    };
    expect(props.frames).toHaveLength(1);
    expect(props.highlightFrameId).toBe('f_001');
    expect(props.className).toBe('my-class');
  });

  test('renderFrameActions callback is invocable per frame', () => {
    const frames: Frame[] = [
      makeFrame({ id: 'f_001', type: 'goal', slots: {} }),
      makeFrame({ id: 'f_002', type: 'constraint', slots: {} }),
    ];
    const spy = vi.fn().mockReturnValue(null);
    const props: FrameYAMLRendererProps = { frames, renderFrameActions: spy };

    // Simulate what the component would do — call renderFrameActions for each frame
    for (const frame of props.frames) {
      props.renderFrameActions?.(frame.id, frame.type);
    }

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('f_001', 'goal');
    expect(spy).toHaveBeenCalledWith('f_002', 'constraint');
  });

  test('getFrameMeta returns correct shape for add change', () => {
    const meta = { confidence: 0.85, changeType: 'add' as const };
    const getFrameMeta = (_frameId: string) => meta;

    const result = getFrameMeta('f_001');
    expect(result.confidence).toBe(0.85);
    expect(result.changeType).toBe('add');
  });

  test('getFrameMeta returns correct shape for update change', () => {
    const getFrameMeta = (frameId: string) => {
      if (frameId === 'f_001') return { changeType: 'update' as const };
      return undefined;
    };

    expect(getFrameMeta('f_001')?.changeType).toBe('update');
    expect(getFrameMeta('f_002')).toBeUndefined();
  });

  test('onHoverFrame is called with frameId or null', () => {
    const spy = vi.fn();
    const props: FrameYAMLRendererProps = {
      frames: [],
      onHoverFrame: spy,
    };

    props.onHoverFrame?.('f_001');
    props.onHoverFrame?.(null);

    expect(spy).toHaveBeenCalledWith('f_001');
    expect(spy).toHaveBeenCalledWith(null);
  });
});
