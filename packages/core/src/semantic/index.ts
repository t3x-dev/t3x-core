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
export { applyDelta, applyTreeDelta, buildDraft } from './delta';
export type { TreeNativeChange, TreeNativeDelta } from './delta';
// Diff
export { frameDiff } from './diff';
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
  TreeNodeSchema,
  TreeNativeDeltaSchema,
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
export type { TreeNode } from './types';
export { FRAME_RELATION_TYPES } from './types';
// Tree (tree-native utilities)
export {
  buildSlotQuotesPath,
  collectSlotQuotes,
  flattenTree,
  isTreeNative,
  resolveSlotQuotesPath,
  unflattenToTree,
  validateTreeDepth,
  yamlObjectToTreeNode,
} from './tree';
// Validation
export { checkRelationSanity, validateIntegrity } from './validate';
// Serialization
export { serializeForPrompt, serializeFramesForPrompt } from './serialize';
