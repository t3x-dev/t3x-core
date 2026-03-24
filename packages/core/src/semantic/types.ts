/**
 * T3X Semantic Frame Types
 *
 * Zero dependencies on other @t3x/core modules.
 * This module can be extracted to a standalone package at any time.
 */

// ── Slot Values ──

/** Reference to another Frame by id */
export interface SlotRef {
  ref: string;
}

/** Inline nested Frame (no id, not top-level) */
export interface InlineFrame {
  type: string;
  slots: Record<string, SlotValue>;
}

/** Plain key-value object as a slot value (e.g. {type: "peanut_allergy", severity: "must avoid"}) */
export interface SlotRecord {
  [key: string]: SlotValue;
}

/** Slot value types: primitives, refs, inline frames, plain objects, and arrays */
export type SlotValue =
  | string
  | number
  | boolean
  | SlotRef
  | InlineFrame
  | SlotRecord
  | SlotValue[];

// ── Source Reference (per-slot traceability) ──

export interface SlotSourceRef {
  /** Turn tag (e.g., "T3") or turn hash prefix */
  turn: string;
  /** Full turn hash for precise matching */
  turn_hash?: string;
  /** Character offset where the source text starts in the turn content */
  start_char: number;
  /** Character offset where the source text ends in the turn content */
  end_char: number;
  /** The verbatim quote from the source turn */
  quote?: string;
}

// ── Frame ──

export interface Frame {
  /** Unique id within a commit, format: f_001, f_002, ... */
  id: string;
  /** Semantic type, LLM-named, snake_case */
  type: string;
  /** Key-value slots, at least one required */
  slots: Record<string, SlotValue>;
  /** Source turn reference (optional) */
  source?: string;
  /** Extraction confidence 0-1 (optional) */
  confidence?: number;
  /** Per-slot source references mapping slot key → source text location */
  slot_sources?: Record<string, SlotSourceRef>;
  /** Frame display status: active (default) or collapsed (drift choice 2: keep new) */
  status?: 'active' | 'collapsed';
}

// ── Relation ──

export const FRAME_RELATION_TYPES = [
  'causes',
  'conditions',
  'contrasts',
  'elaborates',
  'follows',
  'depends',
] as const;

export type FrameRelationType = (typeof FRAME_RELATION_TYPES)[number];

export interface Relation {
  from: string;
  to: string;
  type: FrameRelationType;
  confidence?: number;
}

// ── SemanticContent (a commit's semantic payload) ──

export interface SemanticContent {
  frames: Frame[];
  relations: Relation[];
}

// ── Delta (incremental changes) ──

export type FrameChange =
  | { action: 'add'; frame: Frame }
  | { action: 'update'; target: string; slots: Record<string, SlotValue | null> }
  | { action: 'remove'; target: string; reason?: string };

export interface Delta {
  changes: FrameChange[];
  new_relations?: Relation[];
  remove_relations?: Relation[];
}

// ── Delta Log ──

export type DeltaSource = 'pipeline' | 'manual' | 'answer' | 'collapse' | 'commit_marker';

export interface DeltaLogEntry {
  id: string;
  source: DeltaSource;
  turn_hash?: string;
  delta: Delta;
  created_at: string;
  /** Commit hash — set when this delta is included in a commit, or for commit_marker entries */
  commit_hash?: string;
  /** Which model produced this extraction (for pipeline source) */
  model?: string;
  /** V2: per-conversation auto-increment version number */
  version?: number;
  /** V2: pipeline state at time of recording */
  pipeline_state?: 'completed' | 'failed';
  /** V2: gate check result (Step 5) */
  gate_result?: unknown;
  /** V2: extensible metadata */
  metadata?: Record<string, unknown>;
}

// ── Validation ──

export interface ValidationError {
  type: 'broken_ref' | 'broken_relation' | 'duplicate_id' | 'self_relation' | 'cycle';
  message: string;
  location: string;
}

export interface ValidationWarning {
  type: 'orphan_frame' | 'low_confidence' | 'same_type_contrast' | 'contrast_causes_conflict';
  message: string;
  location: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// ── Diff ──

export interface SlotDiff {
  key: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: SlotValue;
  newValue?: SlotValue;
  /** Word-level diff for long text values (injected externally) */
  wordDiff?: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>;
}

export interface FrameDiff {
  /** Frames present in both, with identical slots */
  identical: Frame[];
  /** Frames present in both, with slot-level differences */
  modified: Array<{
    frameId: string;
    sourceFrame: Frame;
    targetFrame: Frame;
    slotDiffs: SlotDiff[];
  }>;
  /** Frames only in source (removed) */
  onlyInSource: Frame[];
  /** Frames only in target (added) */
  onlyInTarget: Frame[];
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

export type MergeResolution = 'source' | 'target' | 'both' | { edit: Frame };

/**
 * User decisions for executing a frame merge.
 * Maps conflict frameIds to resolutions, and lists which unique frames to keep.
 */
export interface FrameMergeDecision {
  /** How to resolve each conflicted frame (frameId → resolution) */
  conflictResolutions: Record<string, MergeResolution>;
  /** Frame IDs from onlyInSource to keep (omitted = discard) */
  keepFromSource: string[];
  /** Frame IDs from onlyInTarget to keep (omitted = discard) */
  keepFromTarget: string[];
  /** Keep source-only relations */
  keepRelationsFromSource: boolean;
  /** Keep target-only relations */
  keepRelationsFromTarget: boolean;
}

export interface FrameMergeResult {
  /** Auto-kept: identical in source and target */
  autoKept: Frame[];
  /** Conflicts: same frame modified differently in source and target */
  conflicts: Array<{
    frameId: string;
    baseFrame?: Frame;
    sourceFrame: Frame;
    targetFrame: Frame;
    slotConflicts: SlotConflict[];
  }>;
  /** Only in source: user decides keep/discard */
  onlyInSource: Frame[];
  /** Only in target: user decides keep/discard */
  onlyInTarget: Frame[];
  /** Relation conflicts */
  relationsOnlyInSource: Relation[];
  relationsOnlyInTarget: Relation[];
  relationsInBoth: Relation[];
}

/** Word diff function interface — injected, not imported */
export type WordDiffFn = (
  a: string,
  b: string
) => Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>;

// ── Gate System Types ──

export type GateDimension =
  | 'completeness'
  | 'accuracy'
  | 'relations'
  | 'granularity'
  | 'hallucination';

export interface DimensionResult {
  score: number; // 0-1
  details: string;
}

export interface SemanticIssue {
  severity: 'error' | 'warning' | 'info';
  frame_id?: string;
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
    no_duplicate_ids: boolean;
    no_self_relations: boolean;
  };
  warnings?: ValidationWarning[];
}

export interface SemanticGateResult {
  passed: boolean;
  score: number; // 0-1 overall
  dimensions: Record<GateDimension, DimensionResult>;
  issues: SemanticIssue[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface BusinessRuleConfig {
  id: string;
  type: 'rule' | 'llm';
  rule?: string; // JavaScript expression for rule type
  prompt?: string; // LLM prompt for llm type
  message?: string;
  severity: 'error' | 'warning';
  scope?: 'commit' | 'project'; // default: commit
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
  /** Ratio of original text covered by frames (0-1) */
  coverage_ratio: number;
  /** Important text segments not covered by any frame */
  uncovered_segments: string[];
  usage: { inputTokens: number; outputTokens: number };
}
