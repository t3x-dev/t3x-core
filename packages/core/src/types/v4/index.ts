/**
 * T3X V4 Architecture Type Definitions
 *
 * This is the SINGLE SOURCE OF TRUTH for V4 types.
 * All layers (storage, api, web) must import from here.
 *
 * Key changes from V3:
 * - CommitV4: sentences only, NO constraints
 * - Leaf: owns constraints, validation, output
 * - Pin: source selection mechanism for commit + conversation context
 *
 * @see docs/specification/semantic-layer-architecture.md
 * @see docs/specification/memory-pin-system-design.md
 */

// ═══════════════════════════════════════════════════════════════════════════
// ID Prefixes (for consistent ID generation)
// ═══════════════════════════════════════════════════════════════════════════

export const ID_PREFIXES = {
  sentence: 's_',
  constraint: 'cst_',
  assertion: 'ast_',
  leaf: 'leaf_',
  leaf_history: 'lhist_',
  pin: 'pin_',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Sentence (Knowledge Unit)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A sentence represents a single piece of knowledge extracted from conversations.
 */
export interface Sentence {
  /** Unique ID, format: "s_" + nanoid(12) */
  id: string;

  /** The actual sentence text */
  text: string;

  /** Extraction confidence score, 0-1 */
  confidence?: number;

  /** Where this sentence came from */
  source_ref?: SentenceSourceRef;

  // ─────────────────────────────────────────────────────────────────────────
  // Second-class fields (NOT in hash calculation)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * The commit hash where this sentence was originally created.
   * Set when a sentence is inherited from a parent commit.
   * Undefined for sentences created directly in this commit.
   *
   * Second-class field: Does NOT participate in hash calculation.
   * This preserves determinism while enabling inheritance tracking.
   */
  inherited_from?: string;
}

export interface SentenceSourceRef {
  conversation_id: string;
  turn_hash: string;
  /** Character offset where the sentence starts in the turn content */
  start_char: number;
  /** Character offset where the sentence ends in the turn content */
  end_char: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CommitV4 (Pure Knowledge, NO Constraints)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CommitV4 is a pure knowledge container.
 *
 * Key difference from V3: NO constraints in content.
 * Constraints now belong to Leaf (application layer).
 */
export interface CommitV4 {
  // ─────────────────────────────────────────────────────────────────────────
  // First-class fields (participate in hash calculation)
  // ─────────────────────────────────────────────────────────────────────────

  /** Content hash, format: "sha256:" + hex */
  hash: string;

  /** Schema version identifier */
  schema: 't3x/commit/v4';

  /** Parent commit hashes (DAG for branching/merging) */
  parents: string[];

  /** Who created this commit */
  author: CommitAuthor;

  /** When the commit was created, ISO8601 */
  committed_at: string;

  /** The actual content - ONLY sentences, no constraints */
  content: CommitV4Content;

  // ─────────────────────────────────────────────────────────────────────────
  // Second-class fields (NOT in hash calculation)
  // ─────────────────────────────────────────────────────────────────────────

  /** Associated project */
  project_id?: string;

  /** Human-readable commit message */
  message?: string;

  /** Branch name */
  branch?: string;

  /** Source references (pinned items that contributed to this commit) */
  source_refs?: CommitSourceRef[];

  /** Canvas position X */
  position_x?: number;

  /** Canvas position Y */
  position_y?: number;

  /** Database record creation timestamp, ISO8601 */
  created_at?: string;
}

export interface CommitV4Content {
  /** The knowledge - array of sentences */
  sentences: Sentence[];

  // NOTE: No constraints here! They belong to Leaf now.
}

export interface CommitAuthor {
  type: 'human' | 'agent';
  id?: string;
  name?: string;
}

/**
 * Records where the commit's knowledge came from (frozen at commit time).
 */
export interface CommitSourceRef {
  type: 'conversation' | 'leaf';
  id: string;
  title?: string;
  /** For leaf sources: lessons from selected assertions */
  assertion_lessons?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Constraint (Now belongs to Leaf, not Commit)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Constraints define validation rules for Leaf outputs.
 *
 * Key insight: Same commit can have different constraints via different leaves.
 */
export type Constraint = RequireConstraint | ExcludeConstraint;

export interface RequireConstraint {
  /** Unique ID, format: "cst_" + nanoid(12) */
  id: string;

  type: 'require';

  /** How to match: exact string or semantic meaning */
  match_mode: 'exact' | 'semantic';

  /** The value that must be present */
  value: string;

  /** Human explanation of this constraint */
  description?: string;

  /** Link to source sentence (for traceability) */
  source_sentence_id?: string;
}

export interface ExcludeConstraint {
  /** Unique ID, format: "cst_" + nanoid(12) */
  id: string;

  type: 'exclude';

  /** How to match: exact string or semantic meaning */
  match_mode: 'exact' | 'semantic';

  /** The value that must NOT be present */
  value: string;

  /** Human explanation of this constraint */
  description?: string;

  /** Why this is excluded (policy/compliance reason) */
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Assertion (Validation Result)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An assertion is the result of validating output against a constraint.
 */
export interface Assertion {
  /** Unique ID, format: "ast_" + nanoid(12) */
  id: string;

  /** Which constraint was checked */
  constraint_id: string;

  /** Did the output pass this constraint? */
  passed: boolean;

  /** What was found/not found */
  details: string;

  /** Human-readable lesson (for feedback loop) */
  lesson?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Leaf (Application Layer - Owns Constraints)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Leaf types represent different output formats/channels.
 * Single source of truth - used by both TypeScript types and Zod schemas.
 */
export const LEAF_TYPES = [
  'deploy_agent',
  'tweet',
  'weibo',
  'wechat',
  'email',
  'article',
  'slack',
  'eval',
] as const;

export type LeafType = (typeof LEAF_TYPES)[number];

/**
 * A Leaf is an application of committed knowledge with specific constraints.
 *
 * Key insight: Leaf owns constraints, not Commit.
 * Same commit + different constraints = different leaf outputs.
 */
export interface Leaf {
  /** Unique ID, format: "leaf_" + nanoid(12) */
  id: string;

  /** The commit this leaf uses for knowledge */
  commit_hash: string;

  /** Output type/channel */
  type: LeafType;

  /** Human-readable title */
  title?: string;

  // ─────────────────────────────────────────────────────────────────────────
  // Constraints (NOW OWNED BY LEAF)
  // ─────────────────────────────────────────────────────────────────────────

  /** Validation rules for this leaf's output */
  constraints: Constraint[];

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration
  // ─────────────────────────────────────────────────────────────────────────

  /** Leaf-specific configuration */
  config: LeafConfig;

  // ─────────────────────────────────────────────────────────────────────────
  // Output
  // ─────────────────────────────────────────────────────────────────────────

  /** Generated content */
  output?: string;

  /** When output was generated, ISO8601 */
  generated_at?: string;

  // ─────────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────────

  /** Validation results */
  assertions?: Assertion[];

  // ─────────────────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────────────────

  /** Associated project */
  project_id: string;

  /** Creation timestamp, ISO8601 */
  created_at: string;

  /** Who created this leaf */
  created_by?: string;
}

export interface LeafConfig {
  /** Prompt template for generation */
  prompt_template?: string;

  /** LLM model to use */
  model?: string;

  /** Max tokens for generation */
  max_tokens?: number;

  /** Allow extension */
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// LeafHistory (Generation History)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LeafHistory stores a snapshot of each generation for a Leaf.
 *
 * Each time a Leaf generates output, a history entry is created.
 * This allows viewing and restoring previous outputs.
 */
export interface LeafHistory {
  /** Unique ID, format: "lhist_" + nanoid(12) (历史记录唯一标识) */
  id: string;

  /** The leaf this history belongs to (关联的 Leaf ID) */
  leaf_id: string;

  /** Generated output content (生成的输出内容) */
  output: string;

  /** Configuration used for this generation (生成时使用的配置) */
  config: LeafConfig;

  /** LLM model used for generation (使用的 LLM 模型) */
  model: string;

  /** When this output was generated, ISO8601 (生成时间) */
  generated_at: string;

  /** Who triggered this generation (触发生成的用户/系统) */
  created_by?: string;
}

/**
 * Input for creating a new LeafHistory entry.
 */
export interface CreateLeafHistoryInput {
  /** The leaf this history belongs to */
  leaf_id: string;

  /** Generated output content */
  output: string;

  /** Configuration used for this generation */
  config: LeafConfig;

  /** LLM model used for generation */
  model: string;

  /** Who triggered this generation */
  created_by?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pin (Source Selection Mechanism)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What can be pinned.
 */
export type PinType = 'conversation' | 'leaf';

/**
 * A Pin marks an item as selected for:
 * 1. Commit sources (what goes into next commit)
 * 2. Conversation context (what LLM knows as background)
 *
 * One mechanism, dual purpose.
 */
export interface Pin {
  /** Unique ID, format: "pin_" + nanoid(12) */
  id: string;

  /** Which project this pin belongs to */
  project_id: string;

  /** Type of pinned item */
  type: PinType;

  /** ID of the pinned item (conversation_id or leaf_id) */
  ref_id: string;

  /**
   * For leaf pins: which assertions to include in context.
   * null/undefined = include all assertions with lessons.
   */
  selected_assertion_ids?: string[];

  /** When the item was pinned, ISO8601 */
  pinned_at: string;

  /** Who pinned it */
  pinned_by?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Conversation Context (Per-conversation context customization)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Each conversation can customize which pins are included in its LLM context.
 *
 * Default behavior: use all project pins.
 * Custom behavior: select specific pins for this conversation.
 */
export interface ConversationContext {
  /** The conversation this config belongs to */
  conversation_id: string;

  /**
   * Which pins to include in this conversation's context.
   * null = use all project pins (default)
   * [] = no pins (fresh start)
   * [...ids] = specific pins only
   */
  selected_pin_ids: string[] | null;

  /** Last update timestamp, ISO8601 */
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Built Context (Output of context builder)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The result of building context for LLM consumption.
 */
export interface BuiltContext {
  /** The assembled context string for LLM */
  text: string;

  /** Estimated token count */
  token_estimate: number;

  /** Sources that contributed to this context */
  sources: ContextSource[];
}

export interface ContextSource {
  type: 'commit' | 'conversation' | 'leaf';
  id: string;
  title?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * First-class fields of CommitV4 that participate in hash calculation.
 *
 * Used by computeCommitV4Hash() to ensure only these fields are hashed.
 *
 * NOT included (second-class):
 * - project_id, message, branch, source_refs, position_x, position_y, created_at
 */
export type CommitV4FirstClass = Pick<
  CommitV4,
  'schema' | 'parents' | 'author' | 'committed_at' | 'content'
>;

/**
 * Input for creating a new CommitV4.
 */
export interface CreateCommitV4Input {
  parents?: string[];
  author: CommitAuthor;
  sentences: Sentence[];
  project_id: string;
  message?: string;
  branch?: string;
  source_refs?: CommitSourceRef[];
  position_x?: number;
  position_y?: number;
}

/**
 * Input for creating a new Leaf.
 */
export interface CreateLeafInput {
  commit_hash: string;
  type: LeafType;
  title?: string;
  constraints?: Constraint[];
  config?: LeafConfig;
  project_id: string;
  created_by?: string;
}

/**
 * Input for creating a new Pin.
 */
export interface CreatePinInput {
  project_id: string;
  type: PinType;
  ref_id: string;
  selected_assertion_ids?: string[];
  pinned_by?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Merge V4 Types (Sentence-only merge, NO constraints)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * V4 merge operates on sentences only.
 * Constraints belong to Leaf, not Commit, so merge doesn't handle them.
 */

/**
 * Word-level diff segment for UI display.
 */
export interface WordDiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

/**
 * A pair of similar sentences from source and target commits.
 * User must choose which one to keep.
 */
export interface MergeV4SimilarPair {
  /** Source sentence */
  source: Sentence;

  /** Target sentence */
  target: Sentence;

  /** Word-level diff for UI display */
  word_diff: WordDiffSegment[];

  /** User's resolution: pick source or target */
  resolution?: 'source' | 'target';
}

/**
 * A sentence that exists in only one commit (source or target).
 * User can choose to keep or discard it.
 */
export interface MergeV4Candidate {
  /** The unique sentence */
  sentence: Sentence;

  /** Whether to keep in merged result (default: true) */
  keep: boolean;
}

/**
 * Result of preparing a V4 merge.
 * Contains all information needed for user to make merge decisions.
 */
export interface MergeV4Result {
  /** Sentences identical in both commits - auto-kept */
  identical: Sentence[];

  /** Similar pairs requiring user decision */
  similar_pairs: MergeV4SimilarPair[];

  /** Sentences only in source commit */
  only_in_source: MergeV4Candidate[];

  /** Sentences only in target commit */
  only_in_target: MergeV4Candidate[];
}
