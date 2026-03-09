/**
 * T3X Semantic Frame Module
 *
 * Frame + Relation paradigm for structured meaning representation.
 * Zero dependencies on other @t3x/core modules.
 *
 * @see docs/plans/core-engine/00-index.md
 */

// Delta
export { applyDelta, buildDraft } from './delta';
// Diff
export { frameDiff } from './diff';
// Merge
export { prepareFrameMerge } from './merge';
// Zod Schemas
export {
  DeltaSchema,
  FrameRelationTypeSchema,
  FrameSchema,
  RelationSchema,
  SemanticContentSchema,
  SlotValueSchema,
} from './schema';
// Types
export type {
  Delta,
  DeltaLogEntry,
  DeltaSource,
  Frame,
  FrameChange,
  FrameDiff,
  FrameMergeResult,
  FrameRelationType,
  InlineFrame,
  MergeResolution,
  Relation,
  SemanticContent,
  SlotConflict,
  SlotDiff,
  SlotRef,
  SlotValue,
  ValidationError,
  ValidationResult,
  ValidationWarning,
  WordDiffFn,
} from './types';
export { FRAME_RELATION_TYPES } from './types';
// Validation
export { validateIntegrity } from './validate';
