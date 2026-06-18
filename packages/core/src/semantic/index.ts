/**
 * T3X Semantic Module — Tree-Primary API
 *
 * TreeNode + Relation paradigm for structured state representation.
 * Zero dependencies on other @t3x/core modules.
 */

// ── Business Gate (Gate 3) ──
export { BusinessGate, evaluateRule, parseGatesConfig } from './businessGate';

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
  LegacyRelationSchema,
  LegacySemanticContentSchema,
  RelationSchema,
  RelationTypeSchema,
  SemanticContentSchema,
  SlotValueSchema,
  TreeNodeSchema,
} from './schema';

// ── Serialization ──
export { semanticToPlain, serializeForPrompt } from './serialize';

// ── Tree utilities ──
export {
  BLOB_TYPES,
  type BlobType,
  flattenTree,
  flattenTrees,
  isBlob,
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
