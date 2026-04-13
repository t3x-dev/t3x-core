/**
 * L3 — typed errors for the merge aggregate (v2 §2.4 contract).
 *
 * Source policy: NONE per-write. The merge produces a commit whose
 * `parents` field captures lineage; per-resolution provenance lives on
 * the source/target commits, not the merge command.
 *
 * Optimistic-update style: mostly all-or-nothing.
 *   - prepareMerge / executeMerge: hook flips loading flag, awaits
 *     server compute, writes result via setters atomically.
 *   - createMergeDraft / saveMergeDraft / commitMergeDraft: hook
 *     awaits server response, then transitions workspace state.
 *   - deleteMergeDraft (cancel): fire-and-forget — workspace clears
 *     local state regardless of server outcome.
 *
 * Future improvement: surface MergeConflictError as a separate subclass
 * so callers can pattern-match for the conflict-resolution UX rather
 * than inspecting result shape. Out of scope for the migration PR.
 */

import { CommandError } from '../CommandError';

export class MergePersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('merge_persistence', message, cause);
    this.name = 'MergePersistenceError';
  }
}
