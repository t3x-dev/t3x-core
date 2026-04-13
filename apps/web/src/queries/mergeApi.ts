/**
 * L3 — merge readers (read-only per v2 §2.3).
 *
 * Writes (prepare, execute, createDraft, saveDraft, commitDraft,
 * deleteDraft) live in @/commands/merge per v2 §2.4.
 */

export type { ApiMergeCheck } from '@/infrastructure/mergeApi';
export { getMergeDraft, getMergeDraftChecks } from '@/infrastructure/mergeApi';
