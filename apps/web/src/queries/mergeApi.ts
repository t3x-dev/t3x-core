/**
 * L3 — thin re-exports of merge prepare/execute so `canvasMergeSlice`
 * (and any future merge orchestration code) stops calling `@/lib/api/*`
 * from L3 directly. The underlying HTTP adapters remain in
 * `@/lib/api/merge`; a follow-up PR will relocate them to
 * `infrastructure/mergeApi.ts` per the architecture doc's Phase 4 note.
 */

export { createMergeDraft, executeMergeApi, prepareMergeApi } from '@/lib/api/merge';
