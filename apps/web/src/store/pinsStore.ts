/**
 * Pins Store
 *
 * Zustand store for managing pins (V4 source selection).
 * Pins mark items as selected for commit sources and conversation context.
 *
 * @see docs/specification/memory-pin-system-design.md
 */

import { create } from 'zustand';
import type { Pin, PinType } from '@t3x/core';
import * as api from '@/lib/api';

type NotifyCallback = (message: string, type: 'success' | 'error' | 'warning') => void;

interface PinsState {
  /** All pins for the current project */
  pins: Pin[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Whether the store has been initialized */
  initialized: boolean;
  /** Current project ID (for cache invalidation) */
  currentProjectId: string | null;
  /** Notification callback */
  notifyCallback: NotifyCallback | null;

  // Actions
  setNotifyCallback: (cb: NotifyCallback | null) => void;
  fetchPins: (projectId: string) => Promise<void>;
  addPin: (projectId: string, type: PinType, refId: string) => Promise<Pin | null>;
  removePin: (pinId: string) => Promise<void>;
  updatePinAssertions: (pinId: string, assertionIds: string[]) => Promise<Pin | null>;

  // Selectors
  isPinned: (type: PinType, refId: string) => boolean;
  getPinByRef: (type: PinType, refId: string) => Pin | undefined;
}

export const usePinsStore = create<PinsState>((set, get) => ({
  pins: [],
  loading: false,
  error: null,
  initialized: false,
  currentProjectId: null,
  notifyCallback: null,

  setNotifyCallback: (cb) => set({ notifyCallback: cb }),

  fetchPins: async (projectId: string) => {
    // Skip if already loading
    if (get().loading) return;

    // Skip if already loaded for this project
    if (get().initialized && get().currentProjectId === projectId) return;

    set({ loading: true, error: null });
    try {
      const pins = await api.listPins(projectId);
      set({
        pins,
        loading: false,
        initialized: true,
        currentProjectId: projectId,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        error,
        loading: false,
        initialized: true,
        currentProjectId: projectId,
      });
      get().notifyCallback?.(`Failed to load pins: ${error.message}`, 'error');
    }
  },

  addPin: async (projectId: string, type: PinType, refId: string) => {
    const notify = get().notifyCallback;

    // Check if already pinned
    if (get().isPinned(type, refId)) {
      notify?.('Item is already pinned', 'warning');
      return null;
    }

    try {
      const pin = await api.createPinApi(projectId, type, refId);

      set((state) => ({
        pins: [...state.pins, pin],
      }));

      notify?.('Item pinned', 'success');
      return pin;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Handle duplicate pin error (409)
      if (error.message.includes('DUPLICATE_PIN') || error.message.includes('409')) {
        notify?.('Item is already pinned', 'warning');
      } else {
        notify?.(`Failed to pin: ${error.message}`, 'error');
      }
      return null;
    }
  },

  removePin: async (pinId: string) => {
    const notify = get().notifyCallback;
    const pin = get().pins.find((p) => p.id === pinId);

    // Optimistically remove from UI
    set((state) => ({
      pins: state.pins.filter((p) => p.id !== pinId),
    }));

    try {
      await api.deletePinApi(pinId);
      notify?.('Pin removed', 'success');
    } catch (err) {
      // Restore pin on failure
      if (pin) {
        set((state) => ({
          pins: [...state.pins, pin],
        }));
      }

      const error = err instanceof Error ? err : new Error(String(err));

      // If 404, it was already deleted
      if (error.message.includes('404') || error.message.includes('not found')) {
        notify?.('Pin was already removed', 'warning');
      } else {
        notify?.(`Failed to remove pin: ${error.message}`, 'error');
      }
    }
  },

  updatePinAssertions: async (pinId: string, assertionIds: string[]) => {
    const notify = get().notifyCallback;

    try {
      const updatedPin = await api.updatePinAssertionsApi(pinId, assertionIds);

      set((state) => ({
        pins: state.pins.map((p) => (p.id === pinId ? updatedPin : p)),
      }));

      notify?.('Pin assertions updated', 'success');
      return updatedPin;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      notify?.(`Failed to update pin: ${error.message}`, 'error');
      return null;
    }
  },

  // Selectors
  isPinned: (type: PinType, refId: string) => {
    return get().pins.some((p) => p.type === type && p.ref_id === refId);
  },

  getPinByRef: (type: PinType, refId: string) => {
    return get().pins.find((p) => p.type === type && p.ref_id === refId);
  },
}));
