/**
 * usePinsCrud — async actions for pins (V4 source selection).
 *
 * Owns the I/O that used to live inside `pinsStore` async actions per
 * v2 §2.5. Store is now state + setters + sync selectors only.
 *
 * Consumers reading pin state/selectors (isPinned, getPinByRef) still
 * use `usePinsStore` directly.
 */

import type { Pin, PinType } from '@t3x-dev/core';
import { useCallback } from 'react';
import {
  createPin,
  deletePin,
  fetchPins,
  updatePinAssertions,
} from '@/queries/pins';
import { usePinsStore } from '@/store/pinsStore';

// Module-level flag to prevent concurrent fetchPins calls for the same project.
// Survives hook remounts so two concurrent effect firings don't both slip past
// the loading guard.
let fetchInProgressFor: string | null = null;

export function usePinsCrud() {
  const fetch = useCallback(async (projectId: string): Promise<void> => {
    if (fetchInProgressFor === projectId) return;
    const store = usePinsStore.getState();
    if (store.initialized && store.currentProjectId === projectId) return;

    fetchInProgressFor = projectId;
    store.setLoading(true);
    store.setError(null);
    try {
      const pins = await fetchPins(projectId);
      store.setPins(pins);
      store.setLoading(false);
      store.setInitialized(true);
      store.setCurrentProjectId(projectId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      store.setError(error);
      store.setLoading(false);
      store.setInitialized(true);
      store.setCurrentProjectId(projectId);
      store.notifyCallback?.(`Failed to load pins: ${error.message}`, 'error');
    } finally {
      fetchInProgressFor = null;
    }
  }, []);

  const add = useCallback(
    async (projectId: string, type: PinType, refId: string): Promise<Pin | null> => {
      const store = usePinsStore.getState();
      const notify = store.notifyCallback;

      if (store.isPinned(type, refId)) {
        notify?.('Item is already pinned', 'warning');
        return null;
      }

      try {
        const pin = await createPin(projectId, type, refId);
        store.addToPins(pin);
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

  const remove = useCallback(async (pinId: string): Promise<void> => {
    const store = usePinsStore.getState();
    const notify = store.notifyCallback;

    // Optimistically remove from UI, capturing the evicted entry for rollback.
    const removed = store.removePinById(pinId);

    try {
      await deletePin(pinId);
      notify?.('Pin removed', 'success');
    } catch (err) {
      if (removed) {
        store.addToPins(removed);
      }
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.message.includes('404') || error.message.includes('not found')) {
        notify?.('Pin was already removed', 'warning');
      } else {
        notify?.(`Failed to remove pin: ${error.message}`, 'error');
      }
    }
  }, []);

  const setAssertions = useCallback(
    async (pinId: string, assertionIds: string[]): Promise<Pin | null> => {
      const store = usePinsStore.getState();
      const notify = store.notifyCallback;

      try {
        const updated = await updatePinAssertions(pinId, assertionIds);
        store.replacePin(pinId, updated);
        notify?.('Pin assertions updated', 'success');
        return updated;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        notify?.(`Failed to update pin: ${error.message}`, 'error');
        return null;
      }
    },
    []
  );

  return { fetch, add, remove, setAssertions };
}
