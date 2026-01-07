/**
 * Timeout Checker
 *
 * Periodic task that checks for timed-out runs and marks them as failed.
 * This runs in the Engine process to ensure runs don't stay in 'running'
 * status indefinitely when n8n fails to callback.
 */

import { getTimedOutRuns, markRunAsTimeout } from '@t3x/storage';
import { getDB } from './db';

// Default timeout: 5 minutes
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

// Check interval: 30 seconds
const CHECK_INTERVAL_MS = 30 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Check for timed-out runs and mark them as failed
 */
async function checkTimeouts(): Promise<void> {
  try {
    const db = await getDB();
    const timeoutMs = parseInt(process.env.RUN_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;

    const timedOutRuns = await getTimedOutRuns(db, timeoutMs);

    if (timedOutRuns.length > 0) {
      console.log(`[timeout-checker] Found ${timedOutRuns.length} timed-out runs`);

      for (const run of timedOutRuns) {
        try {
          await markRunAsTimeout(db, run.runId);
          console.log(`[timeout-checker] Marked run ${run.runId} as timeout`);
        } catch (err) {
          console.error(`[timeout-checker] Failed to mark run ${run.runId} as timeout:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[timeout-checker] Error checking timeouts:', err);
  }
}

/**
 * Start the timeout checker
 *
 * Called when the API server starts.
 */
export function startTimeoutChecker(): void {
  if (intervalId) {
    console.warn('[timeout-checker] Already running');
    return;
  }

  const intervalMs = parseInt(process.env.TIMEOUT_CHECK_INTERVAL_MS || '', 10) || CHECK_INTERVAL_MS;

  console.log(`[timeout-checker] Starting with interval ${intervalMs}ms`);

  // Run immediately on start
  checkTimeouts();

  // Then run periodically
  intervalId = setInterval(checkTimeouts, intervalMs);
}

/**
 * Stop the timeout checker
 *
 * Called when the API server shuts down.
 */
export function stopTimeoutChecker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[timeout-checker] Stopped');
  }
}
