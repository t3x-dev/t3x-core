/**
 * CommandError — shared base class for all aggregate command errors.
 *
 * Per v2 §2.4 contract, every aggregate must declare a typed error
 * surface. View consumers pattern-match via `instanceof CommandError`
 * (or the more specific subclass) to render UX, never via
 * `.message.includes(...)`.
 *
 * Concrete subclasses live in `commands/<aggregate>/errors.ts`.
 */
export class CommandError extends Error {
  /**
   * Stable machine-readable code unique within an aggregate. Subclasses
   * set this in their constructor; consumers can branch on `code`
   * without losing the typed shape.
   */
  readonly code: string;

  /** Optional underlying error from infrastructure or domain. */
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
    this.cause = cause;
  }
}
