/**
 * L3 — typed errors for the projects aggregate.
 * Placeholder per bundle template — unused in Bundle 2 (YAGNI).
 */

export class ProjectPersistenceError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ProjectPersistenceError';
  }
}
