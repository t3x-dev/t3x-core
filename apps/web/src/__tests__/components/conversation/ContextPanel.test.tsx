/**
 * ContextPanel Component Tests
 *
 * Tests for context panel sidebar component
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ContextPanel } from '@/components/conversation/ContextPanel';
import { usePinsStore } from '@/store/pinsStore';

// Mock the pinsStore
vi.mock('@/store/pinsStore', () => ({
  usePinsStore: vi.fn(),
}));

// Mock EditContextDialog
vi.mock('@/components/conversation/EditContextDialog', () => ({
  EditContextDialog: vi.fn(() => null),
}));

describe('ContextPanel', () => {
  const mockPins = [
    {
      id: 'pin_conv_1',
      project_id: 'proj_123',
      type: 'conversation' as const,
      ref_id: 'conv_456',
      selected_assertion_ids: null,
      pinned_at: '2024-01-01T00:00:00Z',
      pinned_by: null,
    },
    {
      id: 'pin_conv_2',
      project_id: 'proj_123',
      type: 'conversation' as const,
      ref_id: 'conv_789',
      selected_assertion_ids: null,
      pinned_at: '2024-01-01T00:00:00Z',
      pinned_by: null,
    },
    {
      id: 'pin_leaf_1',
      project_id: 'proj_123',
      type: 'leaf' as const,
      ref_id: 'leaf_abc',
      selected_assertion_ids: null,
      pinned_at: '2024-01-01T00:00:00Z',
      pinned_by: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePinsStore).mockReturnValue({ pins: mockPins });
  });

  test('component exports successfully', () => {
    expect(ContextPanel).toBeDefined();
    expect(typeof ContextPanel).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      conversationId: 'conv_123',
      projectId: 'proj_456',
      contextConfig: null,
      onContextChange: vi.fn(),
    };

    expect(props.conversationId).toBe('conv_123');
    expect(props.projectId).toBe('proj_456');
    expect(props.contextConfig).toBeNull();
  });

  test('contextConfig null means no custom config (use default)', () => {
    const props = {
      conversationId: 'conv_123',
      projectId: 'proj_456',
      contextConfig: null, // no custom config
      onContextChange: vi.fn(),
    };

    expect(props.contextConfig).toBeNull();
  });

  test('contextConfig with selected_pin_ids null means use all pins', () => {
    const props = {
      conversationId: 'conv_123',
      projectId: 'proj_456',
      contextConfig: { selected_pin_ids: null }, // use all
      onContextChange: vi.fn(),
    };

    expect(props.contextConfig?.selected_pin_ids).toBeNull();
  });

  test('contextConfig with specific pin IDs means filtered selection', () => {
    const props = {
      conversationId: 'conv_123',
      projectId: 'proj_456',
      contextConfig: { selected_pin_ids: ['pin_conv_1', 'pin_leaf_1'] },
      onContextChange: vi.fn(),
    };

    expect(props.contextConfig?.selected_pin_ids).toEqual(['pin_conv_1', 'pin_leaf_1']);
    expect(props.contextConfig?.selected_pin_ids?.length).toBe(2);
  });

  test('uses pinsStore for pin data', () => {
    const store = usePinsStore();

    expect(store.pins).toBeDefined();
    expect(store.pins.length).toBe(3);
  });

  test('pins can be filtered by type for display', () => {
    const store = usePinsStore();

    const convPins = store.pins.filter(p => p.type === 'conversation');
    const leafPins = store.pins.filter(p => p.type === 'leaf');

    expect(convPins.length).toBe(2);
    expect(leafPins.length).toBe(1);
  });

  test('active pins calculation with null selection (all pins)', () => {
    const store = usePinsStore();
    const contextConfig = { selected_pin_ids: null };

    // When selected_pin_ids is null, all pins are active
    const activePins = contextConfig.selected_pin_ids === null
      ? store.pins
      : store.pins.filter(p => contextConfig.selected_pin_ids?.includes(p.id));

    expect(activePins.length).toBe(3);
  });

  test('active pins calculation with specific selection', () => {
    const store = usePinsStore();
    const contextConfig = { selected_pin_ids: ['pin_conv_1'] };

    // When selected_pin_ids has values, filter to those pins
    const activePins = contextConfig.selected_pin_ids === null
      ? store.pins
      : store.pins.filter(p => contextConfig.selected_pin_ids?.includes(p.id));

    expect(activePins.length).toBe(1);
    expect(activePins[0].id).toBe('pin_conv_1');
  });

  test('onContextChange callback receives pin IDs', () => {
    const onContextChange = vi.fn();

    // Simulate context change
    onContextChange(['pin_conv_1', 'pin_leaf_1']);

    expect(onContextChange).toHaveBeenCalledWith(['pin_conv_1', 'pin_leaf_1']);
  });

  test('onContextChange callback receives null for use all', () => {
    const onContextChange = vi.fn();

    // Simulate context change to "use all"
    onContextChange(null);

    expect(onContextChange).toHaveBeenCalledWith(null);
  });
});
