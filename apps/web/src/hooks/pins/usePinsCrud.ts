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
import { createPin, deletePin, updatePinAssertions } from '@/commands/pins';
import { formatUserFacingError } from '@/domain/format/errors';
import { fetchPins } from '@/queries/pins';
import { usePinsStore } from '@/store/pinsStore';

// The store has one selected project. Readers share a promise only within that
// visit; an older visit must not reclaim ownership when its request finishes.
let fetchInProgress: {
  projectId: string;
  scopeVersion: number;
  promise: Promise<void>;
} | null = null;

function ownsScope(projectId: string | null, scopeVersion: number) {
  const current = usePinsStore.getState();
  return current.currentProjectId === projectId && current.scopeVersion === scopeVersion;
}

export function usePinsCrud() {
  const fetch = useCallback(async (projectId: string): Promise<void> => {
    usePinsStore.getState().setCurrentProjectId(projectId);
    const { scopeVersion, initialized } = usePinsStore.getState();
    if (fetchInProgress?.projectId === projectId && fetchInProgress.scopeVersion === scopeVersion)
      return fetchInProgress.promise;
    if (initialized) return;

    usePinsStore.setState({ loading: true, error: null });
    const request = { projectId, scopeVersion, promise: Promise.resolve() };
    fetchInProgress = request;
    request.promise = (async () => {
      try {
        const pins = await fetchPins(projectId);
        if (!ownsScope(projectId, scopeVersion) || fetchInProgress !== request) return;
        usePinsStore.setState({ pins, loading: false, initialized: true, error: null });
      } catch (err) {
        if (!ownsScope(projectId, scopeVersion) || fetchInProgress !== request) return;
        const error = err instanceof Error ? err : new Error(String(err));
        usePinsStore.setState({ loading: false, initialized: false, error });
        usePinsStore
          .getState()
          .notifyCallback?.(formatUserFacingError(error, 'Failed to load pins.'), 'error');
      } finally {
        if (fetchInProgress === request) fetchInProgress = null;
      }
    })();
    return request.promise;
  }, []);

  const add = useCallback(
    async (projectId: string, type: PinType, refId: string): Promise<Pin | null> => {
      const store = usePinsStore.getState();
      const notify = store.notifyCallback;
      const scopeVersion = store.scopeVersion;

      if (store.currentProjectId === projectId && store.isPinned(type, refId)) {
        notify?.('Item is already pinned', 'warning');
        return null;
      }

      try {
        const pin = await createPin(projectId, type, refId);
        if (ownsScope(projectId, scopeVersion)) store.addToPins(pin);
        notify?.('Item pinned', 'success');
        return pin;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (error.message.includes('DUPLICATE_PIN') || error.message.includes('409')) {
          notify?.('Item is already pinned', 'warning');
        } else {
          notify?.(formatUserFacingError(error, 'Failed to pin item.'), 'error');
        }
        return null;
      }
    },
    []
  );

  const remove = useCallback(async (pinId: string): Promise<void> => {
    const store = usePinsStore.getState();
    const notify = store.notifyCallback;
    const { currentProjectId, scopeVersion } = store;

    // Optimistically remove from UI, capturing the evicted entry for rollback.
    const removed = store.removePinById(pinId);

    try {
      await deletePin(pinId);
      notify?.('Pin removed', 'success');
    } catch (err) {
      if (removed && ownsScope(currentProjectId, scopeVersion)) {
        store.addToPins(removed);
      }
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.message.includes('404') || error.message.includes('not found')) {
        notify?.('Pin was already removed', 'warning');
      } else {
        notify?.(formatUserFacingError(error, 'Failed to remove pin.'), 'error');
      }
    }
  }, []);

  const setAssertions = useCallback(
    async (pinId: string, assertionIds: string[]): Promise<Pin | null> => {
      const store = usePinsStore.getState();
      const notify = store.notifyCallback;
      const { currentProjectId, scopeVersion } = store;

      try {
        const updated = await updatePinAssertions(pinId, assertionIds);
        if (ownsScope(currentProjectId, scopeVersion)) store.replacePin(pinId, updated);
        notify?.('Pin assertions updated', 'success');
        return updated;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        notify?.(formatUserFacingError(error, 'Failed to update pin.'), 'error');
        return null;
      }
    },
    []
  );

  return { fetch, add, remove, setAssertions };
}
