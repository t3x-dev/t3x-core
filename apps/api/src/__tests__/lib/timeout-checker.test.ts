/**
 * Timeout Checker Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before import
const mockGetTimedOutRuns = vi.fn().mockResolvedValue([]);
const mockMarkRunAsTimeout = vi.fn().mockResolvedValue(undefined);
const mockDB = {};

vi.mock('@t3x/storage', () => ({
  getTimedOutRuns: (...args: unknown[]) => mockGetTimedOutRuns(...args),
  markRunAsTimeout: (...args: unknown[]) => mockMarkRunAsTimeout(...args),
}));

vi.mock('../../lib/db', () => ({
  getDB: vi.fn(() => Promise.resolve(mockDB)),
}));

// Silence console output
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('timeout-checker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetTimedOutRuns.mockResolvedValue([]);
    mockMarkRunAsTimeout.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Dynamically import to get fresh module
    const { stopTimeoutChecker } = await import('../../lib/timeout-checker');
    stopTimeoutChecker();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('runs check immediately on start', async () => {
    const { startTimeoutChecker, stopTimeoutChecker } = await import('../../lib/timeout-checker');
    startTimeoutChecker();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockGetTimedOutRuns).toHaveBeenCalled();
    stopTimeoutChecker();
  });

  it('marks timed-out runs', async () => {
    mockGetTimedOutRuns.mockResolvedValueOnce([{ runId: 'run_1' }, { runId: 'run_2' }]);

    const { startTimeoutChecker, stopTimeoutChecker } = await import('../../lib/timeout-checker');
    startTimeoutChecker();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockMarkRunAsTimeout).toHaveBeenCalledTimes(2);
    expect(mockMarkRunAsTimeout).toHaveBeenCalledWith(mockDB, 'run_1');
    expect(mockMarkRunAsTimeout).toHaveBeenCalledWith(mockDB, 'run_2');
    stopTimeoutChecker();
  });

  it('handles errors gracefully', async () => {
    mockGetTimedOutRuns.mockRejectedValueOnce(new Error('DB error'));
    const { startTimeoutChecker, stopTimeoutChecker } = await import('../../lib/timeout-checker');
    startTimeoutChecker();
    await vi.advanceTimersByTimeAsync(0);
    // Should not throw
    stopTimeoutChecker();
  });

  it('does not start twice', async () => {
    const { startTimeoutChecker, stopTimeoutChecker } = await import('../../lib/timeout-checker');
    startTimeoutChecker();
    startTimeoutChecker(); // Second call should warn
    // Should only have one interval running
    stopTimeoutChecker();
  });

  it('stop is safe to call when not running', async () => {
    const { stopTimeoutChecker } = await import('../../lib/timeout-checker');
    // Should not throw
    stopTimeoutChecker();
  });
});
