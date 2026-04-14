/**
 * commands/merge — v2 §2.4 aggregate command module.
 *
 * Source policy: none.
 * Optimistic-update style: mostly all-or-nothing; deleteMergeDraft is
 *   fire-and-forget on the cancel path.
 * Error surface: MergePersistenceError (extends CommandError).
 */

export { commitMergeDraft } from './commitMergeDraft';
export { createMergeDraft } from './createMergeDraft';
export { deleteMergeDraft } from './deleteMergeDraft';
export { MergePersistenceError } from './errors';
export { executeMerge } from './executeMerge';
export { prepareMerge } from './prepareMerge';
export { saveMergeDraft } from './saveMergeDraft';
