/**
 * Pins Store Tests (passive, v2 §2.5)
 *
 * Store is now pure state + setters + pure selectors. I/O moved to
 * hooks/usePinOperations. Former action tests (fetchPins / addPin /
 * removePin / updatePinAssertions) are removed; hook tests cover the
 * migrated orchestration.
 */

import type { Pin } from '@t3x-dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePinsStore } from '@/store/pinsStore';

const mkPin = (id: string, type: Pin['type'], refId: string): Pin =>
  ({
    id,
    type,
    ref_id: refId,
    project_id: 'proj_1',
    selected_assertion_ids: [],
    pinned_at: '2026-04-13T00:00:00Z',
  }) as Pin;

const reset = () => {
  usePinsStore.setState({
    pins: [],
    loading: false,
    error: null,
    initialized: false,
    currentProjectId: null,
    notifyCallback: null,
  });
};

describe('pinsStore (passive)', () => {
  beforeEach(reset);

  describe('initial state', () => {
    it('starts empty and not initialized', () => {
      const s = usePinsStore.getState();
      expect(s.pins).toEqual([]);
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
      expect(s.initialized).toBe(false);
      expect(s.currentProjectId).toBeNull();
    });
  });

  describe('setters', () => {
    it('setPins replaces the array', () => {
      const pin = mkPin('pin_1', 'leaf', 'leaf_1');
      usePinsStore.getState().setPins([pin]);
      expect(usePinsStore.getState().pins).toEqual([pin]);
    });

    it('addPinToState appends', () => {
      const a = mkPin('pin_a', 'leaf', 'leaf_a');
      const b = mkPin('pin_b', 'conversation', 'conv_b');
      usePinsStore.getState().addPinToState(a);
      usePinsStore.getState().addPinToState(b);
      expect(usePinsStore.getState().pins).toEqual([a, b]);
    });

    it('removePinFromState filters by id', () => {
      const a = mkPin('pin_a', 'leaf', 'leaf_a');
      const b = mkPin('pin_b', 'conversation', 'conv_b');
      usePinsStore.getState().setPins([a, b]);
      usePinsStore.getState().removePinFromState('pin_a');
      expect(usePinsStore.getState().pins).toEqual([b]);
    });

    it('updatePinInState replaces by id', () => {
      const a = mkPin('pin_a', 'leaf', 'leaf_a');
      const aUpdated = { ...a, selected_assertion_ids: ['ast_1'] } as Pin;
      usePinsStore.getState().setPins([a]);
      usePinsStore.getState().updatePinInState(aUpdated);
      expect(usePinsStore.getState().pins[0].selected_assertion_ids).toEqual(['ast_1']);
    });

    it('invalidatePins clears initialized', () => {
      usePinsStore.setState({ initialized: true });
      usePinsStore.getState().invalidatePins();
      expect(usePinsStore.getState().initialized).toBe(false);
    });

    it('setNotifyCallback stores then clears callback', () => {
      const cb = vi.fn();
      usePinsStore.getState().setNotifyCallback(cb);
      expect(usePinsStore.getState().notifyCallback).toBe(cb);
      usePinsStore.getState().setNotifyCallback(null);
      expect(usePinsStore.getState().notifyCallback).toBeNull();
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      usePinsStore
        .getState()
        .setPins([mkPin('pin_a', 'leaf', 'leaf_a'), mkPin('pin_b', 'conversation', 'conv_b')]);
    });

    it('isPinned returns true only for matching type+refId', () => {
      expect(usePinsStore.getState().isPinned('leaf', 'leaf_a')).toBe(true);
      expect(usePinsStore.getState().isPinned('leaf', 'leaf_missing')).toBe(false);
      expect(usePinsStore.getState().isPinned('conversation', 'leaf_a')).toBe(false);
    });

    it('getPinByRef returns the matching pin', () => {
      const pin = usePinsStore.getState().getPinByRef('conversation', 'conv_b');
      expect(pin?.id).toBe('pin_b');
    });
  });
});
