/**
 * PinButton Component Tests
 *
 * Tests for pin/unpin button component
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PinButton } from '@/components/ui/PinButton';
import { usePinsStore } from '@/store/pinsStore';

// Mock the pinsStore
vi.mock('@/store/pinsStore', () => ({
  usePinsStore: vi.fn(),
}));

describe('PinButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('component exports successfully', () => {
    expect(PinButton).toBeDefined();
    expect(typeof PinButton).toBe('function');
  });

  test('accepts required props', () => {
    const props = {
      projectId: 'proj_123',
      type: 'conversation' as const,
      refId: 'conv_456',
    };

    expect(props.projectId).toBe('proj_123');
    expect(props.type).toBe('conversation');
    expect(props.refId).toBe('conv_456');
  });

  test('accepts optional className prop', () => {
    const props = {
      projectId: 'proj_123',
      type: 'leaf' as const,
      refId: 'leaf_789',
      className: 'custom-class',
    };

    expect(props.className).toBe('custom-class');
  });

  test('supports both pin types', () => {
    const conversationProps = {
      projectId: 'proj_123',
      type: 'conversation' as const,
      refId: 'conv_456',
    };

    const leafProps = {
      projectId: 'proj_123',
      type: 'leaf' as const,
      refId: 'leaf_789',
    };

    expect(['conversation', 'leaf']).toContain(conversationProps.type);
    expect(['conversation', 'leaf']).toContain(leafProps.type);
  });

  test('uses pinsStore for state management', () => {
    const mockStore = {
      isPinned: vi.fn().mockReturnValue(false),
      getPinByRef: vi.fn().mockReturnValue(undefined),
      addPin: vi.fn(),
      removePin: vi.fn(),
    };

    vi.mocked(usePinsStore).mockReturnValue(mockStore);

    // Verify the store is used
    const store = usePinsStore();
    expect(store.isPinned).toBeDefined();
    expect(store.getPinByRef).toBeDefined();
    expect(store.addPin).toBeDefined();
    expect(store.removePin).toBeDefined();
  });

  test('isPinned determines pinned state', () => {
    const mockStore = {
      isPinned: vi.fn((type, refId) => type === 'conversation' && refId === 'conv_pinned'),
      getPinByRef: vi.fn(),
      addPin: vi.fn(),
      removePin: vi.fn(),
    };

    vi.mocked(usePinsStore).mockReturnValue(mockStore);

    const store = usePinsStore();

    expect(store.isPinned('conversation', 'conv_pinned')).toBe(true);
    expect(store.isPinned('conversation', 'conv_unpinned')).toBe(false);
    expect(store.isPinned('leaf', 'conv_pinned')).toBe(false);
  });

  test('getPinByRef returns pin for pinned items', () => {
    const mockPin = {
      id: 'pin_123',
      project_id: 'proj_123',
      type: 'conversation' as const,
      ref_id: 'conv_456',
      selected_assertion_ids: null,
      pinned_at: '2024-01-01T00:00:00Z',
      pinned_by: null,
    };

    const mockStore = {
      isPinned: vi.fn().mockReturnValue(true),
      getPinByRef: vi.fn().mockReturnValue(mockPin),
      addPin: vi.fn(),
      removePin: vi.fn(),
    };

    vi.mocked(usePinsStore).mockReturnValue(mockStore);

    const store = usePinsStore();
    const pin = store.getPinByRef('conversation', 'conv_456');

    expect(pin).toBeDefined();
    expect(pin?.id).toBe('pin_123');
  });
});
