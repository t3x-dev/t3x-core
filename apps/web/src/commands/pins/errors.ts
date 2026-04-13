/**
 * L3 — typed errors for the pins aggregate.
 * Placeholder per bundle template — unused in Bundle 3 (YAGNI).
 */

export class PinPersistenceError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'PinPersistenceError';
  }
}
