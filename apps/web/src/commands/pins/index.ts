/**
 * commands/pins — v2 §2.4 aggregate command module.
 *
 * Source policy: none.
 * Optimistic-update style: caller-rollback (delete); all-or-nothing
 *   (create, setAssertions).
 * Error surface: PinPersistenceError (extends CommandError).
 */

export { createPin, type PinType } from './createPin';
export { deletePin } from './deletePin';
export { PinPersistenceError } from './errors';
export { updatePinAssertions } from './updatePinAssertions';
