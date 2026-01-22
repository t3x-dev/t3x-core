/**
 * Pins Store Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePinsStore } from '@/store/pinsStore';
import * as api from '@/lib/api';

// Mock the API module
vi.mock('@/lib/api', () => ({
  listPins: vi.fn(),
  createPinApi: vi.fn(),
  deletePinApi: vi.fn(),
  updatePinAssertionsApi: vi.fn(),
}));

describe('pinsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePinsStore.setState({
      pins: [],
      loading: false,
      error: null,
      initialized: false,
      currentProjectId: null,
      notifyCallback: null,
    });
    vi.clearAllMocks();
  });

  describe('fetchPins', () => {
    it('fetches pins and updates state', async () => {
      const mockPins = [
        {
          id: 'pin_1',
          project_id: 'proj_1',
          type: 'conversation' as const,
          ref_id: 'conv_1',
          selected_assertion_ids: null,
          pinned_at: '2024-01-01T00:00:00Z',
          pinned_by: null,
        },
      ];

      vi.mocked(api.listPins).mockResolvedValue(mockPins);

      await usePinsStore.getState().fetchPins('proj_1');

      expect(api.listPins).toHaveBeenCalledWith('proj_1');
      expect(usePinsStore.getState().pins).toEqual(mockPins);
      expect(usePinsStore.getState().initialized).toBe(true);
      expect(usePinsStore.getState().currentProjectId).toBe('proj_1');
    });

    it('skips fetch if already loading', async () => {
      usePinsStore.setState({ loading: true });

      await usePinsStore.getState().fetchPins('proj_1');

      expect(api.listPins).not.toHaveBeenCalled();
    });

    it('skips fetch if already initialized for same project', async () => {
      usePinsStore.setState({
        initialized: true,
        currentProjectId: 'proj_1',
        pins: [],
      });

      await usePinsStore.getState().fetchPins('proj_1');

      expect(api.listPins).not.toHaveBeenCalled();
    });

    it('refetches if project changes', async () => {
      usePinsStore.setState({
        initialized: true,
        currentProjectId: 'proj_1',
        pins: [],
      });

      vi.mocked(api.listPins).mockResolvedValue([]);

      await usePinsStore.getState().fetchPins('proj_2');

      expect(api.listPins).toHaveBeenCalledWith('proj_2');
    });
  });

  describe('addPin', () => {
    it('creates pin and adds to state', async () => {
      const newPin = {
        id: 'pin_new',
        project_id: 'proj_1',
        type: 'conversation' as const,
        ref_id: 'conv_1',
        selected_assertion_ids: null,
        pinned_at: '2024-01-01T00:00:00Z',
        pinned_by: null,
      };

      vi.mocked(api.createPinApi).mockResolvedValue(newPin);

      const result = await usePinsStore.getState().addPin('proj_1', 'conversation', 'conv_1');

      expect(api.createPinApi).toHaveBeenCalledWith('proj_1', 'conversation', 'conv_1');
      expect(result).toEqual(newPin);
      expect(usePinsStore.getState().pins).toContainEqual(newPin);
    });

    it('returns null if already pinned', async () => {
      usePinsStore.setState({
        pins: [
          {
            id: 'pin_1',
            project_id: 'proj_1',
            type: 'conversation',
            ref_id: 'conv_1',
            selected_assertion_ids: null,
            pinned_at: '2024-01-01T00:00:00Z',
            pinned_by: null,
          },
        ],
      });

      const result = await usePinsStore.getState().addPin('proj_1', 'conversation', 'conv_1');

      expect(api.createPinApi).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('removePin', () => {
    it('removes pin from state and calls API', async () => {
      usePinsStore.setState({
        pins: [
          {
            id: 'pin_1',
            project_id: 'proj_1',
            type: 'conversation',
            ref_id: 'conv_1',
            selected_assertion_ids: null,
            pinned_at: '2024-01-01T00:00:00Z',
            pinned_by: null,
          },
        ],
      });

      vi.mocked(api.deletePinApi).mockResolvedValue({ deleted: true, id: 'pin_1' });

      await usePinsStore.getState().removePin('pin_1');

      expect(api.deletePinApi).toHaveBeenCalledWith('pin_1');
      expect(usePinsStore.getState().pins).toHaveLength(0);
    });

    it('restores pin on API failure', async () => {
      const pin = {
        id: 'pin_1',
        project_id: 'proj_1',
        type: 'conversation' as const,
        ref_id: 'conv_1',
        selected_assertion_ids: null,
        pinned_at: '2024-01-01T00:00:00Z',
        pinned_by: null,
      };

      usePinsStore.setState({ pins: [pin] });
      vi.mocked(api.deletePinApi).mockRejectedValue(new Error('Network error'));

      await usePinsStore.getState().removePin('pin_1');

      // Pin should be restored after failure
      expect(usePinsStore.getState().pins).toContainEqual(pin);
    });
  });

  describe('updatePinAssertions', () => {
    it('updates pin assertions in state', async () => {
      const originalPin = {
        id: 'pin_1',
        project_id: 'proj_1',
        type: 'leaf' as const,
        ref_id: 'leaf_1',
        selected_assertion_ids: null,
        pinned_at: '2024-01-01T00:00:00Z',
        pinned_by: null,
      };

      const updatedPin = {
        ...originalPin,
        selected_assertion_ids: ['ast_1', 'ast_2'],
      };

      usePinsStore.setState({ pins: [originalPin] });
      vi.mocked(api.updatePinAssertionsApi).mockResolvedValue(updatedPin);

      const result = await usePinsStore.getState().updatePinAssertions('pin_1', ['ast_1', 'ast_2']);

      expect(api.updatePinAssertionsApi).toHaveBeenCalledWith('pin_1', ['ast_1', 'ast_2']);
      expect(result).toEqual(updatedPin);
      expect(usePinsStore.getState().pins[0].selected_assertion_ids).toEqual(['ast_1', 'ast_2']);
    });
  });

  describe('selectors', () => {
    it('isPinned returns true for pinned items', () => {
      usePinsStore.setState({
        pins: [
          {
            id: 'pin_1',
            project_id: 'proj_1',
            type: 'conversation',
            ref_id: 'conv_1',
            selected_assertion_ids: null,
            pinned_at: '2024-01-01T00:00:00Z',
            pinned_by: null,
          },
        ],
      });

      expect(usePinsStore.getState().isPinned('conversation', 'conv_1')).toBe(true);
      expect(usePinsStore.getState().isPinned('conversation', 'conv_2')).toBe(false);
      expect(usePinsStore.getState().isPinned('leaf', 'conv_1')).toBe(false);
    });

    it('getPinByRef returns pin for matching items', () => {
      const pin = {
        id: 'pin_1',
        project_id: 'proj_1',
        type: 'leaf' as const,
        ref_id: 'leaf_1',
        selected_assertion_ids: null,
        pinned_at: '2024-01-01T00:00:00Z',
        pinned_by: null,
      };

      usePinsStore.setState({ pins: [pin] });

      expect(usePinsStore.getState().getPinByRef('leaf', 'leaf_1')).toEqual(pin);
      expect(usePinsStore.getState().getPinByRef('leaf', 'leaf_2')).toBeUndefined();
    });
  });
});
