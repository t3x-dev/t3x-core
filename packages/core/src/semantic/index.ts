/**
 * T3X Semantic Module — Tree-Primary API
 *
 * TreeNode + Relation paradigm for structured meaning representation.
 * Zero dependencies on other @t3x/core modules.
 */

// ── Business Gate (Gate 3) ──
export { BusinessGate, evaluateRule, parseGatesConfig } from './businessGate';

// ── Delta ──
export { applyDelta } from './delta';

// ── Diff ──
export { diffCommits, diffSlots } from './diff';

// ── Gate (Gate 2 — Semantic) ──
export {
  buildCoveragePrompt,
  buildSemanticGatePrompt,
  parseCoverageResponse,
  parseSemanticGateResponse,
  SemanticGate,
} from './gate';

// ── Gate Runner (Orchestrator) ──
export { GateRunner, type GateRunnerOptions } from './gateRunner';

// ── Merge ──
export { executeMerge, prepareMerge } from './merge';

// ── Zod Schemas (public) ──
export {
  DeltaSchema,
  RelationSchema,
  RelationTypeSchema,
  SemanticContentSchema,
  SlotValueSchema,
  TreeNodeSchema,
} from './schema';

// ── Serialization ──
export { serializeForPrompt } from './serialize';

// ── Tree utilities ──
export {
  buildSlotQuotesPath,
  collectSlotQuotes,
  flattenTree,
  flattenTrees,
  resolveSlotQuotesPath,
  unflattenToTree,
  unflattenToTrees,
  validateTreeDepth,
  yamlToTree,
} from './tree';

// ── Types ──
export type {
  BusinessGateResult,
  BusinessRuleConfig,
  CoverageResult,
  Delta,
  DeltaLogEntry,
  DeltaSource,
  DimensionResult,
  GateDimension,
  GateResult,
  MergeDecision,
  MergeResolution,
  MergeResult,
  Relation,
  RelationType,
  SemanticContent,
  SemanticGateResult,
  SemanticIssue,
  SlotConflict,
  SlotDiff,
  SlotValue,
  StructureGateResult,
  TreeChange,
  TreeDiff,
  TreeNode,
  ValidationError,
  ValidationResult,
  ValidationWarning,
  WordDiffFn,
  YOpsLogEntry,
  YOpsSource,
} from './types';
export { RELATION_TYPES } from './types';

// ── Validation ──
export { checkRelationSanity, validateIntegrity } from './validate';
