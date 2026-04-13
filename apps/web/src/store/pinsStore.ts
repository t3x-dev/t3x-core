/**
 * pinsStore — V4 pin state (passive).
 *
 * v2 §2.5 — state + setters + pure selectors. I/O lives in
 * hooks/usePinOperations.
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

  // Setters (no I/O)
  setNotifyCallback: (cb: NotifyCallback | null) => void;
  setPins: (pins: Pin[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  setInitialized: (flag: boolean) => void;
  setCurrentProjectId: (id: string | null) => void;
  addPinToState: (pin: Pin) => void;
  removePinFromState: (pinId: string) => void;
  updatePinInState: (pin: Pin) => void;
  /** Clears initialized so next hook-fetch re-queries (e.g. after retune). */
  invalidatePins: () => void;

  // Pure selectors
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
  setInitialized: (flag) => set({ initialized: flag }),
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  addPinToState: (pin) => set((state) => ({ pins: [...state.pins, pin] })),
  removePinFromState: (pinId) =>
    set((state) => ({ pins: state.pins.filter((p) => p.id !== pinId) })),
  updatePinInState: (pin) =>
    set((state) => ({
      pins: state.pins.map((p) => (p.id === pin.id ? pin : p)),
    })),
  invalidatePins: () => set({ initialized: false }),

  isPinned: (type, refId) => get().pins.some((p) => p.type === type && p.ref_id === refId),
  getPinByRef: (type, refId) => get().pins.find((p) => p.type === type && p.ref_id === refId),
}));
