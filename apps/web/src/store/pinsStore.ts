/**
 * Pins Store — pure Zustand state container per
 * docs/frontend-architecture-v2-zh.md §2.5.
 *
 * Async actions (fetchPins, addPin, removePin, updatePinAssertions) now
 * live in `hooks/usePinsCrud`. Store holds state + setters + sync
 * selectors only.
 *
 * @see docs/specification/memory-pin-system-design.md
 */

import type { Pin, PinType } from '@t3x-dev/core';
import { create } from 'zustand';
import type { NotifyCallback } from './shared';

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

  // Setters
  setNotifyCallback: (cb: NotifyCallback | null) => void;
  setPins: (pins: Pin[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  setInitialized: (initialized: boolean) => void;
  setCurrentProjectId: (projectId: string | null) => void;

  addToPins: (pin: Pin) => void;
  removePinById: (pinId: string) => Pin | undefined;
  replacePin: (pinId: string, next: Pin) => void;

  invalidatePins: () => void;

  // Sync selectors (no I/O — fine to stay on the store)
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
  setPins: (pins) => set({ pins }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setInitialized: (initialized) => set({ initialized }),
  setCurrentProjectId: (currentProjectId) => set({ currentProjectId }),

  addToPins: (pin) => set((state) => ({ pins: [...state.pins, pin] })),
  removePinById: (pinId) => {
    const existing = get().pins.find((p) => p.id === pinId);
    set((state) => ({ pins: state.pins.filter((p) => p.id !== pinId) }));
    return existing;
  },
  replacePin: (pinId, next) =>
    set((state) => ({ pins: state.pins.map((p) => (p.id === pinId ? next : p)) })),

  invalidatePins: () => set({ initialized: false }),

  isPinned: (type, refId) => get().pins.some((p) => p.type === type && p.ref_id === refId),
  getPinByRef: (type, refId) => get().pins.find((p) => p.type === type && p.ref_id === refId),
}));
