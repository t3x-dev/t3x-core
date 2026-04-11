/**
 * Shared store types and accessors.
 *
 * Types and helpers used by multiple Zustand stores live here
 * to avoid cross-store imports (e.g. pinsStore importing from canvasStoreTypes).
 */

import { useSettingsStore } from './settingsStore';

// ── Notification callback ──────────────────────────────────────────────────

/** Callback shape used by stores to surface toast/snackbar messages to the UI. */
export type NotifyCallback = (message: string, type: 'success' | 'error' | 'warning') => void;

// ── Settings accessors (for non-React Zustand actions) ─────────────────────

/** Read `developerMode` from settingsStore outside React (Zustand actions, helpers). */
export function isDeveloperMode(): boolean {
  return useSettingsStore.getState().developerMode;
}
