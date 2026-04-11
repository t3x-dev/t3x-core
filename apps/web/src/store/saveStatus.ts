/**
 * Shared save status utilities for workspace stores.
 *
 * Provides the SaveStatus type and a timer helper that resets
 * status to 'idle' after a success delay.
 */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Creates a save-status timer manager.
 * After a successful save, resets status to 'idle' after `delayMs`.
 * Tracks the timer so callers can cancel on reset.
 */
export function createSaveStatusTimer(delayMs = 2000) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    /** Schedule reset to 'idle' after delay */
    scheduleReset(
      get: () => { saveStatus: SaveStatus },
      set: (patch: { saveStatus: SaveStatus }) => void
    ) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (get().saveStatus === 'saved') {
          set({ saveStatus: 'idle' });
        }
      }, delayMs);
    },

    /** Cancel any pending reset (call on store reset) */
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
