/**
 * L3 — thin re-exports of merge prepare/execute. The HTTP adapters live
 * in `@/infrastructure/mergeApi` (doc §2 L1); this module wraps them so
 * stores and components can call the merge surface without crossing the
 * L3-to-L1 boundary directly.
 */

export {
  commitMergeDraft,
  createMergeDraft,
  deleteMergeDraft,
  executeMergeApi,
  getMergeDraft,
  getMergeDraftChecks,
  prepareMergeApi,
  saveMergeDraft,
} from '@/infrastructure/mergeApi';
export type { ApiMergeCheck } from '@/infrastructure/mergeApi';
