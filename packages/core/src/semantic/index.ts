/**
 * T3X Semantic Frame Module
 *
 * Frame + Relation paradigm for structured meaning representation.
 * Zero dependencies on other @t3x/core modules.
 *
 * @see docs/plans/core-engine/00-index.md
 */

// Business Gate (Gate 3)
export { BusinessGate, evaluateRule, parseGatesConfig } from './businessGate';
// Delta
export { applyDelta, buildDraft } from './delta';
// Diff
export { frameDiff } from './diff';
// Frame-to-Text
export {
  type FrameTextSegment,
  framesToNumberedText,
  framesToTextSegments,
  frameToText,
} from './frameToText';
// Gate (Gate 2 — Semantic)
export {
  buildCoveragePrompt,
  buildSemanticGatePrompt,
  parseCoverageResponse,
  parseSemanticGateResponse,
  SemanticGate,
} from './gate';
// Gate Runner (Orchestrator)
export { GateRunner, type GateRunnerOptions } from './gateRunner';
// Merge
export { executeFrameMerge, prepareFrameMerge } from './merge';
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
  BusinessGateResult,
  BusinessRuleConfig,
  CoverageResult,
  Delta,
  DeltaLogEntry,
  DeltaSource,
  DimensionResult,
  Frame,
  FrameChange,
  FrameDiff,
  FrameMergeDecision,
  FrameMergeResult,
  FrameRelationType,
  GateDimension,
  GateResult,
  InlineFrame,
  MergeResolution,
  Relation,
  SemanticContent,
  SemanticGateResult,
  SemanticIssue,
  SlotConflict,
  SlotDiff,
  SlotRef,
  SlotSourceRef,
  SlotValue,
  StructureGateResult,
  ValidationError,
  ValidationResult,
  ValidationWarning,
  WordDiffFn,
} from './types';
export { FRAME_RELATION_TYPES } from './types';
// Validation
export { checkRelationSanity, validateIntegrity } from './validate';
