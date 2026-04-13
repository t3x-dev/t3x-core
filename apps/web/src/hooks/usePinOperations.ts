/**
 * usePinOperations — view-facing API for pin writes + list load.
 *
 * Owns the I/O that previously lived inside pinsStore. Store is now
 * passive (v2 §2.5). Module-level fetch dedup flag survives hook remounts
 * so two concurrent callers for the same project share one request.
 */

import type { Pin, PinType } from '@t3x-dev/core';
import { useCallback } from 'react';
import { createPin, deletePin, updatePinAssertions } from '@/commands/pins';
import { fetchPins as fetchPinsQuery } from '@/queries/pins';
import { usePinsStore } from '@/store/pinsStore';

// Module-level flag dedups concurrent fetches for the same project.
let fetchInProgressFor: string | null = null;

export function usePinOperations() {
  const fetchPins = useCallback(async (projectId: string): Promise<void> => {
    const store = usePinsStore.getState();

    if (fetchInProgressFor === projectId) return;
    if (store.initialized && store.currentProjectId === projectId) return;

    fetchInProgressFor = projectId;
    store.setLoading(true);
    store.setError(null);
    try {
      const pins = await fetchPinsQuery(projectId);
      const s = usePinsStore.getState();
      s.setPins(pins);
      s.setLoading(false);
      s.setInitialized(true);
      s.setCurrentProjectId(projectId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const s = usePinsStore.getState();
      s.setError(error);
      s.setLoading(false);
      s.setInitialized(true);
      s.setCurrentProjectId(projectId);
      s.notifyCallback?.(`Failed to load pins: ${error.message}`, 'error');
    } finally {
      fetchInProgressFor = null;
    }
  }, []);

  const addPin = useCallback(
    async (projectId: string, type: PinType, refId: string): Promise<Pin | null> => {
      const store = usePinsStore.getState();
      const notify = store.notifyCallback;

      if (store.isPinned(type, refId)) {
        notify?.('Item is already pinned', 'warning');
        return null;
      }

      try {
        const pin = await createPin(projectId, type, refId);
        usePinsStore.getState().addPinToState(pin);
        notify?.('Item pinned', 'success');
        return pin;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (error.message.includes('DUPLICATE_PIN') || error.message.includes('409')) {
          notify?.('Item is already pinned', 'warning');
        } else {
          notify?.(`Failed to pin: ${error.message}`, 'error');
        }
        return null;
      }
    },
    []
  );

  const removePin = useCallback(async (pinId: string): Promise<void> => {
    const store = usePinsStore.getState();
    const notify = store.notifyCallback;
    const pin = store.pins.find((p) => p.id === pinId);

    // Optimistic remove
    store.removePinFromState(pinId);

    try {
      await deletePin(pinId);
      notify?.('Pin removed', 'success');
    } catch (err) {
      // Restore on failure
      if (pin) usePinsStore.getState().addPinToState(pin);

      const error = err instanceof Error ? err : new Error(String(err));
      if (error.message.includes('404') || error.message.includes('not found')) {
        notify?.('Pin was already removed', 'warning');
      } else {
        notify?.(`Failed to remove pin: ${error.message}`, 'error');
      }
    }
  }, []);

  const updateAssertions = useCallback(
    async (pinId: string, assertionIds: string[]): Promise<Pin | null> => {
      const store = usePinsStore.getState();
      const notify = store.notifyCallback;

      try {
        const updatedPin = await updatePinAssertions(pinId, assertionIds);
        usePinsStore.getState().updatePinInState(updatedPin);
        notify?.('Pin assertions updated', 'success');
        return updatedPin;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        notify?.(`Failed to update pin: ${error.message}`, 'error');
        return null;
      }
    },
    []
  );

  return {
    fetchPins,
    addPin,
    removePin,
    updatePinAssertions: updateAssertions,
  };
}
