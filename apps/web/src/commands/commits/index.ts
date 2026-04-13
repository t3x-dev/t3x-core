/**
 * commands/commits — v2 §2.4 aggregate command module.
 *
 * Source policy: provenance + sources captured by caller (hook)
 *   when assembling the commit; no per-op source enforcement.
 * Optimistic-update style: all-or-nothing for create; best-effort
 *   for position writes.
 * Error surface: CommitPersistenceError (extends CommandError).
 */

export { type CreateCommitOptions, createCommit } from './createCommit';
export { CommitPersistenceError } from './errors';
export { persistCommitPosition } from './persistCommitPosition';
export { renameCommit } from './renameCommit';
