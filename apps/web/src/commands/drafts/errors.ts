/**
 * L3 — typed errors for the workbench-drafts aggregate (v2 §2.4 contract).
 *
 * Source policy: NONE for the draft itself (drafts are mutable working
 * copies; provenance is captured at commit time via the parent commit's
 * `provenance + sources`).
 *
 * Optimistic-update style: mostly all-or-nothing, with a known optimistic-
 * lock branch on save:
 *   - createDraft: all-or-nothing.
 *   - updateDraft: optimistic lock via `if_revision`. The hook (save)
 *     branches on `ApiError.code === 'CONFLICT'` and routes a special
 *     conflict UX flow.
 *   - previewDraft: all-or-nothing; the hook flips a generation counter
 *     and discards stale results.
 *   - commitDraft: all-or-nothing; saves any pending changes first.
 *   - forkDraft: all-or-nothing (creates a new editable copy from a
 *     committed draft).
 *
 * NOTE: callers still inspect `err.message.includes('409')` for some
 * branches — same technical-debt note as commands/pins.
 */

import { CommandError } from '../CommandError';

export class DraftPersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('draft_persistence', message, cause);
    this.name = 'DraftPersistenceError';
  }
}
