/**
 * L3 — typed errors for the pins aggregate (v2 §2.4 contract).
 *
 * Source policy: NONE. Pins are user-managed source-selection metadata
 * (which conversation/leaf to feed as context); no LLMSource /
 * HumanSource concept applies.
 *
 * Optimistic-update style: caller-rollback. The hook (usePinsCrud)
 * removes from local state first, then awaits delete; on server failure
 * (other than 404) it restores the captured snapshot. Add and
 * setAssertions are all-or-nothing.
 *
 * NOTE: the calling hook still uses `error.message.includes('409')` /
 * 'DUPLICATE_PIN' / '404' for branch decisions. Future improvement:
 * surface `PinDuplicateError` and `PinNotFoundError` subclasses so
 * consumers can pattern-match via instanceof. Out of scope for the
 * commands-layer migration PR.
 */

import { CommandError } from '../CommandError';

export class PinPersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('pin_persistence', message, cause);
    this.name = 'PinPersistenceError';
  }
}
