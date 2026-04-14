/**
 * useSaveStatusAutoIdle — mounts a timer that flips `saveStatus` back
 * to `'idle'` after a successful save, without living in the store
 * layer. v2 §2.5 keeps store as pure state container; browser timers
 * live in hooks.
 *
 * Caller passes the current status and a pure setter; when status is
 * `'saved'`, this hook schedules a single timeout and resets to idle.
 * Re-entries / early transitions cancel the previous timer via the
 * useEffect cleanup.
 */

import { useEffect } from 'react';
import type { SaveStatus } from '@/store/saveStatus';

export function useSaveStatusAutoIdle(
  status: SaveStatus,
  setIdle: () => void,
  delayMs = 2000
): void {
  useEffect(() => {
    if (status !== 'saved') return;
    const id = setTimeout(setIdle, delayMs);
    return () => {
      clearTimeout(id);
    };
  }, [status, setIdle, delayMs]);
}
