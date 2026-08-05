/**
 * commands/commits — v2 §2.4 aggregate command module.
 *
 * Source policy: source identifiers and the actor are resolved by the server;
 *   the browser submits only task input plus an exact expected ref head.
 * Optimistic-update style: all-or-nothing for commit; best-effort
 *   for position writes.
 * Error surface: CommitPersistenceError (extends CommandError).
 */

export {
  type CommitRepositoryStateOptions,
  commitRepositoryState,
} from './commitRepositoryState';
export { CommitPersistenceError } from './errors';
export { persistCommitPosition } from './persistCommitPosition';
export { renameCommit } from './renameCommit';
