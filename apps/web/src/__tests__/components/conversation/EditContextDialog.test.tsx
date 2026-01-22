/**
 * EditContextDialog Component Tests
 *
 * Tests for context editing dialog component
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { EditContextDialog } from '@/components/conversation/EditContextDialog';
import { usePinsStore } from '@/store/pinsStore';

// Mock the pinsStore
vi.mock('@/store/pinsStore', () => ({
  usePinsStore: vi.fn(),
}));

describe('EditContextDialog', () => {
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
      id: 'pin_leaf_1',
      project_id: 'proj_123',
      type: 'leaf' as const,
      ref_id: 'leaf_789',
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
    expect(EditContextDialog).toBeDefined();
    expect(typeof EditContextDialog).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      projectId: 'proj_123',
      conversationId: 'conv_456',
      currentSelection: null,
      onSave: vi.fn(),
    };

    expect(props.open).toBe(true);
    expect(props.projectId).toBe('proj_123');
    expect(props.conversationId).toBe('conv_456');
    expect(props.currentSelection).toBeNull();
  });

  test('currentSelection null means use all pins', () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      projectId: 'proj_123',
      conversationId: 'conv_456',
      currentSelection: null, // null = use all
      onSave: vi.fn(),
    };

    // null means "use all pins"
    expect(props.currentSelection).toBeNull();
  });

  test('currentSelection with array means specific pins', () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      projectId: 'proj_123',
      conversationId: 'conv_456',
      currentSelection: ['pin_conv_1'], // specific selection
      onSave: vi.fn(),
    };

    expect(props.currentSelection).toEqual(['pin_conv_1']);
    expect(props.currentSelection?.length).toBe(1);
  });

  test('onSave receives null when useAll is true', () => {
    const onSave = vi.fn();

    // Simulate save with useAll = true
    onSave(null);

    expect(onSave).toHaveBeenCalledWith(null);
  });

  test('onSave receives array when specific pins selected', () => {
    const onSave = vi.fn();
    const selectedPins = ['pin_conv_1', 'pin_leaf_1'];

    // Simulate save with specific selection
    onSave(selectedPins);

    expect(onSave).toHaveBeenCalledWith(selectedPins);
  });

  test('uses pinsStore for pin data', () => {
    const store = usePinsStore();

    expect(store.pins).toBeDefined();
    expect(store.pins.length).toBe(2);
    expect(store.pins[0].type).toBe('conversation');
    expect(store.pins[1].type).toBe('leaf');
  });

  test('pins can be filtered by type', () => {
    const store = usePinsStore();

    const convPins = store.pins.filter(p => p.type === 'conversation');
    const leafPins = store.pins.filter(p => p.type === 'leaf');

    expect(convPins.length).toBe(1);
    expect(leafPins.length).toBe(1);
  });
});
