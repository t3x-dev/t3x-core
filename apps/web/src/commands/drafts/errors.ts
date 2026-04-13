/**
 * L3 — typed errors for the workbench-drafts aggregate.
 * Placeholder per bundle template — unused in Bundle 5 (YAGNI).
 */

export class DraftPersistenceError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'DraftPersistenceError';
  }
}
