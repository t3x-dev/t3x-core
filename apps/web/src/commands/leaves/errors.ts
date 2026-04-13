/**
 * L3 — typed errors for the leaves aggregate.
 * Placeholder per bundle template (YAGNI until a caller pattern-matches).
 */

export class LeafPersistenceError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LeafPersistenceError';
  }
}
