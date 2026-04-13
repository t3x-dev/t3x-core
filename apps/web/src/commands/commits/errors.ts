/**
 * L3 — typed errors for the commits aggregate.
 *
 * Pilot-minimal: unused in this bundle. Exported so future callers can opt
 * into richer error reporting (e.g., rollback after optimistic write).
 */

export class CommitPersistenceError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CommitPersistenceError';
  }
}
