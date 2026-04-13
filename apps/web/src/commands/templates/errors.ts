/**
 * L3 — typed errors for the templates aggregate.
 *
 * The pilot keeps this minimal: the commands below do not wrap infra errors
 * (YAGNI — no current caller pattern-matches on error type). The class is
 * exported as the canonical shape so future callers can opt into richer
 * error reporting without changing every command signature.
 */

export class TemplatePersistenceError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TemplatePersistenceError';
  }
}
