/**
 * commands/drafts — v2 §2.4 aggregate command module.
 *
 * Source policy: none.
 * Optimistic-update style: mostly all-or-nothing; updateWorkbenchDraft
 *   surfaces ApiError raw so the hook can branch on optimistic-lock
 *   conflict (HTTP 409 / 'CONFLICT') for the conflict-resolution UX.
 * Error surface: DraftPersistenceError (extends CommandError).
 */

export { commitWorkbenchDraft } from './commitWorkbenchDraft';
export { type CreateWorkbenchDraftInput, createWorkbenchDraft } from './createWorkbenchDraft';
export { DraftPersistenceError } from './errors';
export { forkWorkbenchDraft } from './forkWorkbenchDraft';
export { previewWorkbenchDraft } from './previewWorkbenchDraft';
export { type UpdateWorkbenchDraftInput, updateWorkbenchDraft } from './updateWorkbenchDraft';
