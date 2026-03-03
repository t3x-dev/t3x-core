/**
 * Timeout Checker
 *
 * Periodic task that checks for timed-out runs and marks them as failed.
 * This runs in the Engine process to ensure runs don't stay in 'running'
 * status indefinitely when n8n fails to callback.
 */

import { getTimedOutRuns, markRunAsTimeout } from '@t3x/storage';
import { getDB } from './db';
import { pinoLogger } from '../middleware/logger';

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
      pinoLogger.info({ count: timedOutRuns.length }, "found timed-out runs");

      for (const run of timedOutRuns) {
        try {
          await markRunAsTimeout(db, run.runId);
          pinoLogger.info({ run_id: run.runId }, "marked run as timeout");
        } catch (err) {
          pinoLogger.error({ err, run_id: run.runId }, "failed to mark run as timeout");
        }
      }
    }
  } catch (err) {
    pinoLogger.error({ err }, "error checking timeouts");
  }
}

/**
 * Start the timeout checker
 *
 * Called when the API server starts.
 */
export function startTimeoutChecker(): void {
  if (intervalId) {
    pinoLogger.warn("timeout-checker already running");
    return;
  }

  const intervalMs = parseInt(process.env.TIMEOUT_CHECK_INTERVAL_MS || '', 10) || CHECK_INTERVAL_MS;

  pinoLogger.info({ interval_ms: intervalMs }, "timeout-checker starting");

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
    pinoLogger.info("timeout-checker stopped");
  }
}
