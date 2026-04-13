/**
 * L3 — typed errors for the commits aggregate (v2 §2.4 contract).
 *
 * Source policy: Sources are recorded as commit metadata
 * (`Commit.sources: { type, id }[]`) listing the conversations / leaves /
 * imports a commit derives from. There is no per-write LLMSource /
 * HumanSource enforcement at this layer — provenance is captured by the
 * `provenance` and `sources` fields in CreateCommit options. Pin /
 * conversation source assembly is done by the calling hook
 * (useCommitActions.commit).
 *
 * Optimistic-update style: all-or-nothing. Hooks set isCommitting=true
 * before the call, on success write the new state via setters, on
 * failure restore (setIsCommitting(false) + setCommitError(message)).
 * Position writes (persistCommitPosition) are best-effort: failures are
 * intentionally swallowed by callers since the canvas already reflects
 * the user's drag intent locally.
 */

import { CommandError } from '../CommandError';

export class CommitPersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('commit_persistence', message, cause);
    this.name = 'CommitPersistenceError';
  }
}
