/**
 * Trace Storage Policy
 *
 * Controls when full trace data should be persisted to the database.
 * TraceSummary (lightweight stats) is always stored regardless of policy.
 */

/**
 * Storage policy for full trace data
 *
 * - 'always': Always store full trace (for development/debugging)
 * - 'on_failure': Only store when run fails (production default)
 * - 'on_violation': Only store when evaluation has violations
 */
export type TracePolicy = 'always' | 'on_failure' | 'on_violation';

/**
 * Determine whether to store full trace based on policy
 *
 * @param policy - The storage policy to apply
 * @param runStatus - The final status of the run
 * @param hasViolations - Whether the evaluation found any violations
 * @returns true if full trace should be stored
 */
export function shouldStoreFullTrace(
  policy: TracePolicy,
  runStatus: 'completed' | 'failed',
  hasViolations?: boolean
): boolean {
  switch (policy) {
    case 'always':
      return true;

    case 'on_failure':
      return runStatus === 'failed';

    case 'on_violation':
      return hasViolations === true;

    default:
      // Default to on_failure behavior for unknown policies
      return runStatus === 'failed';
  }
}
