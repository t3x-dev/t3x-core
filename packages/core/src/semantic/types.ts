/**
 * T3X Semantic Types — Tree-Primary
 *
 * Zero dependencies on other @t3x/core modules.
 * TreeNode is the canonical knowledge representation.
 * Frames are internal to the diff/merge engine.
 */

// ── Slot Values ──

export type SlotValue =
  | string
  | number
  | boolean
  | SlotValue[]
  | { [key: string]: SlotValue };

// ── Tree Node ──

export interface TreeNode {
  /** Node key name, snake_case (e.g., "budget", "activity_plan") */
  key: string;
  /** Leaf slot values at this node */
  slots: Record<string, SlotValue>;
  /** Child nodes (nested sub-topics) */
  children: TreeNode[];
  /** Per-slot source quotes (dot-path keys → verbatim conversation text) */
  slot_quotes?: Record<string, string>;
  /** Source turn reference (e.g., "T3") */
  source?: string;
  /** Extraction confidence 0-1 */
  confidence?: number;
}

// ── Relation ──

/**
 * Semantic relation types for cross-tree connections.
 * Note: packages/core/src/types/index.ts has a separate RELATION_TYPES for the app layer.
 * This constant is for the semantic layer only.
 */
export const RELATION_TYPES = [
  'causes',
  'conditions',
  'contrasts',
  'follows',
  'depends',
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export interface Relation {
  from: string;
  to: string;
  type: RelationType;
  confidence?: number;
}

// ── SemanticContent ──

export interface SemanticContent {
  trees: TreeNode[];
  relations: Relation[];
}

// ── Delta ──

export type TreeChange =
  | { action: 'add'; parent_path: string; node: TreeNode; slot_quotes?: Record<string, string> }
  | { action: 'update'; target_path: string; slots: Record<string, SlotValue | null>; slot_quotes?: Record<string, string> }
  | { action: 'remove'; target_path: string; reason?: string };

export interface Delta {
  changes: TreeChange[];
  new_relations?: Relation[];
  remove_relations?: Relation[];
}

// ── Delta Log ──

export type DeltaSource = 'pipeline' | 'manual' | 'answer' | 'collapse' | 'commit_marker' | 'compress';

export interface DeltaLogEntry {
  id: string;
  source: DeltaSource;
  turn_hash?: string;
  delta: Delta;
  created_at: string;
  commit_hash?: string;
  model?: string;
  version?: number;
  pipeline_state?: 'completed' | 'failed';
  gate_result?: unknown;
  metadata?: Record<string, unknown>;
}

// ── Validation ──

export interface ValidationError {
  type: 'broken_relation' | 'duplicate_key' | 'self_relation' | 'cycle';
  message: string;
  location: string;
}

export interface ValidationWarning {
  type: 'orphan_tree' | 'low_confidence' | 'same_type_contrast';
  message: string;
  location: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// ── Diff (internal frame-based, results mapped to tree paths) ──

export interface SlotDiff {
  key: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: SlotValue;
  newValue?: SlotValue;
  wordDiff?: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>;
}

export interface TreeDiff {
  /** Nodes identical in both commits */
  identical: string[];
  /** Nodes with changed slots */
  modified: Array<{
    path: string;
    slotDiffs: SlotDiff[];
  }>;
  /** Nodes only in source (removed) */
  onlyInSource: string[];
  /** Nodes only in target (added) */
  onlyInTarget: string[];
  /** Relation changes */
  relationsAdded: Relation[];
  relationsRemoved: Relation[];
}

// ── Merge ──

export interface SlotConflict {
  key: string;
  baseValue?: SlotValue;
  sourceValue?: SlotValue;
  targetValue?: SlotValue;
}

export type MergeResolution = 'source' | 'target' | 'both' | { edit: TreeNode };
// Note: when user picks { edit: TreeNode }, the merge wrapper must convert
// the edited TreeNode to FlatNode(s) via flattenTree() before passing to the
// internal FlatNode-based merge engine, then unflatten the result back.

export interface MergeDecision {
  conflictResolutions: Record<string, MergeResolution>;
  keepFromSource: string[];
  keepFromTarget: string[];
  keepRelationsFromSource: boolean;
  keepRelationsFromTarget: boolean;
}

export interface MergeResult {
  autoKept: string[];
  conflicts: Array<{
    path: string;
    slotConflicts: SlotConflict[];
  }>;
  onlyInSource: string[];
  onlyInTarget: string[];
  relationsOnlyInSource: Relation[];
  relationsOnlyInTarget: Relation[];
  relationsInBoth: Relation[];
}

/** Word diff function interface */
export type WordDiffFn = (
  a: string,
  b: string
) => Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>;

// ── Gate System ──

export type GateDimension =
  | 'completeness'
  | 'accuracy'
  | 'relations'
  | 'granularity'
  | 'hallucination';

export interface DimensionResult {
  score: number;
  details: string;
}

export interface SemanticIssue {
  severity: 'error' | 'warning' | 'info';
  node_path?: string;
  dimension: GateDimension;
  description: string;
  suggestion?: string;
}

export interface StructureGateResult {
  passed: boolean;
  checks: {
    schema_valid: boolean;
    refs_intact: boolean;
    relations_valid: boolean;
    no_cycles: boolean;
    no_duplicate_keys: boolean;
    no_self_relations: boolean;
  };
  warnings?: ValidationWarning[];
}

export interface SemanticGateResult {
  passed: boolean;
  score: number;
  dimensions: Record<GateDimension, DimensionResult>;
  issues: SemanticIssue[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface BusinessRuleConfig {
  id: string;
  type: 'rule' | 'llm';
  rule?: string;
  prompt?: string;
  message?: string;
  severity: 'error' | 'warning';
  scope?: 'commit' | 'project';
}

export interface BusinessGateResult {
  passed: boolean;
  results: {
    rule_id: string;
    passed: boolean;
    message?: string;
    severity: 'error' | 'warning';
  }[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface GateResult {
  passed: boolean;
  structure: StructureGateResult;
  semantic?: SemanticGateResult;
  business?: BusinessGateResult;
}

// ── Coverage ──

export interface CoverageResult {
  coverage_ratio: number;
  uncovered_segments: string[];
  usage: { inputTokens: number; outputTokens: number };
}

// ── Internal: FlatNode (used only by diff/merge engine) ──

/** @internal — not part of public API. Used by diff/merge algorithms. */
export interface FlatNode {
  id: string;
  type: string;
  slots: Record<string, SlotValue>;
  source?: string;
  confidence?: number;
}
