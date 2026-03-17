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

import type { SemanticContent } from '../../semantic/types';

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
  api_key: 'ak_',
  share_token: 'share_',
  draft: 'draft_',
  draft_sentence: 'ds_',
  draft_constraint: 'dc_',
  semantic_point: 'sp_',
  relation: 'rel_',
} as const;

/** Prefix for raw API key values (visible once at creation) */
export const API_KEY_VALUE_PREFIX = 't3xk_';

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

  /**
   * How the evidence anchor relates to the source text.
   * - verbatim: exact quote from the source
   * - paraphrase: meaning preserved but rewording applied
   * - inference: derived from source through reasoning
   *
   * Second-class field: Does NOT participate in hash calculation.
   */
  anchor_type?: 'verbatim' | 'paraphrase' | 'inference';
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

  /**
   * Semantic frame content (frames + relations).
   * Nullable — old commits have undefined.
   * Second-class field: does NOT participate in hash calculation.
   */
  semantic?: SemanticContent;

  /** Canvas position X */
  position_x?: number;

  /** Canvas position Y */
  position_y?: number;

  /** Merkle tree root hash of commit sentences */
  merkle_root?: string;

  /** Database record creation timestamp, ISO8601 */
  created_at?: string;

  /** Merge summary statistics (only present on merge commits) */
  merge_summary?: MergeSummaryData;
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

/** Reference to a source frame's slot (for V5 frame-based constraints) */
export interface ConstraintSourceFrame {
  /** Frame type to target (e.g., "preference", "budget") */
  frame_type: string;
  /** Specific slot key within the frame (optional — omit to target the frame as a whole) */
  slot_key?: string;
}

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

  /** @deprecated Use source_frame for V5 frame-based commits */
  source_sentence_id?: string;

  /** Link to source frame + slot (V5 frame-based traceability) */
  source_frame?: ConstraintSourceFrame;
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

  /** Link to source frame + slot (V5 frame-based traceability) */
  source_frame?: ConstraintSourceFrame;
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
export const LEAF_TYPES = ['tweet', 'weibo', 'wechat', 'email', 'article', 'slack'] as const;

export type LeafType = (typeof LEAF_TYPES)[number];

/**
 * Deploy types — go through Runner pipeline, NOT template/prompt builder.
 * Stored in the same `leaves` table but with separate type constraints.
 */
export const DEPLOY_TYPES = ['deploy_agent'] as const;

export type DeployType = (typeof DEPLOY_TYPES)[number];

/**
 * All valid types for the `leaves` table `type` column.
 * Union of text generation types + deploy types.
 */
export const ALL_LEAF_TYPES = [...LEAF_TYPES, ...DEPLOY_TYPES] as const;

export type AnyLeafType = (typeof ALL_LEAF_TYPES)[number];

/** Check if a type is a text generation leaf (tweet, email, etc.) */
export function isGenerationLeaf(type: string): type is LeafType {
  return (LEAF_TYPES as readonly string[]).includes(type);
}

/** Check if a type is a deploy leaf (deploy_agent) */
export function isDeployLeaf(type: string): type is DeployType {
  return (DEPLOY_TYPES as readonly string[]).includes(type);
}

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

  /** Output type/channel (text generation or deploy) */
  type: AnyLeafType;

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

  /** Validation results (local Generate & Verify / Re-validate) */
  assertions?: Assertion[];

  /** Runner evaluation results (written back by Runner ingest) */
  runner_assertions?: Assertion[];

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

  /** Semantic similarity threshold for constraint validation (0-1) */
  semantic_threshold?: number;

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
// Merge Summary (Second-class metadata for merge commits)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Summary statistics for a merge commit, persisted as a second-class field.
 * Computed at merge execution time from the Merge2WayResult.
 */
export interface MergeSummaryData {
  /** Sentences identical in both branches (auto-kept) */
  kept_identical: number;

  /** Similar pairs that were resolved (source or target chosen) */
  resolved_conflicts: number;

  /** Sentences kept from source-only */
  kept_from_source: number;

  /** Sentences kept from target-only */
  kept_from_target: number;

  /** Sentences discarded during merge */
  discarded: number;

  /** Total sentences in the merged commit */
  total_sentences: number;

  /** Optional release note generated after merge */
  release_note?: {
    title: string;
    timestamp: string;
    source_branch: string;
    target_branch: string;
    summary: string;
    sections: Array<{ heading: string; items: string[] }>;
  };
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
  merge_summary?: MergeSummaryData;
  /** Semantic frame content (frames + relations). Second-class, not in hash. */
  semantic?: SemanticContent;
}

/**
 * Input for creating a new Leaf.
 */
export interface CreateLeafInput {
  commit_hash: string;
  type: AnyLeafType;
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
  type: 'unchanged' | 'added' | 'removed';
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

// ═══════════════════════════════════════════════════════════════════════════
// User (Authentication)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A registered user (identity, keyed by email).
 *
 * Users own projects via projects.owner_id.
 * In AUTH_DISABLED mode, no users exist and owner_id is null.
 *
 * Provider-specific info lives in Account records (many-to-one).
 */
export interface User {
  /** Unique ID, format: "user_" + nanoid(12) */
  id: string;

  /** Email address (may be null if provider doesn't expose it) */
  email: string | null;

  /** True when at least one provider has confirmed the email */
  email_verified: boolean;

  /** Display name */
  name: string | null;

  /** Avatar URL */
  avatar_url: string | null;

  /** Username for local auth (null for OAuth-only users) */
  username: string | null;

  /** When the user was created, ISO8601 */
  created_at: string;
}

/**
 * An OAuth provider account linked to a User.
 *
 * Multiple accounts can map to the same user (e.g., GitHub + Google
 * with the same email are auto-linked).
 */
export interface Account {
  /** Unique ID, format: "acct_" + nanoid(12) */
  id: string;

  /** The user this account belongs to */
  user_id: string;

  /** OAuth provider name (e.g., 'github', 'google') */
  provider: string;

  /** User ID from the OAuth provider */
  provider_account_id: string;

  /** When the account was linked, ISO8601 */
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// API Key (Authentication)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An API key grants access to the T3X API.
 *
 * The full key value (t3xk_...) is only shown once at creation time.
 * We store a SHA-256 hash + short prefix for lookup/display.
 */
export interface ApiKey {
  /** Unique ID, format: "ak_" + nanoid(12) */
  id: string;

  /** First 8 chars of the key value, for display (e.g., "t3xk_abc1...") */
  key_prefix: string;

  /** SHA-256 hash of the full key value */
  key_hash: string;

  /** Human-readable label */
  name: string;

  /** Scope: if set, key is scoped to this project. null = global */
  project_id: string | null;

  /** Owner user ID. null = legacy key (AUTH_DISABLED era) */
  user_id: string | null;

  /** When the key was created, ISO8601 */
  created_at: string;

  /** When the key was last used, ISO8601 */
  last_used_at: string | null;

  /** When the key was revoked (soft-delete), ISO8601 */
  revoked_at: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Share Token (Share Link)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A share token grants read-only access to a specific entity (e.g., Leaf).
 */
export interface ShareToken {
  /** Unique ID, format: "share_" + nanoid(12) */
  id: string;

  /** Random URL-safe token for the share link */
  token: string;

  /** What entity type is being shared */
  entity_type: 'leaf' | 'commit';

  /** ID of the shared entity */
  entity_id: string;

  /** Associated project */
  project_id: string;

  /** Who created the share link */
  created_by: string | null;

  /** When created, ISO8601 */
  created_at: string;

  /** Optional expiration, ISO8601. null = never expires */
  expires_at: string | null;

  /** When revoked (soft-delete), ISO8601 */
  revoked_at: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Draft (Workbench — Pre-commit Working Area)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Draft status lifecycle: editing → committed | abandoned
 * 'auto' status: auto-generated from conversation turns (Upgrade #7)
 */
export type DraftStatus = 'editing' | 'committed' | 'abandoned' | 'auto';

/**
 * Distinguishes how a sentence entered the Draft (RFC §13 Issue A).
 */
export type DraftSentenceOrigin =
  | { type: 'extracted'; segment_id: string; confidence: number }
  | { type: 'selected' }
  | { type: 'manual' };

/**
 * A sentence within a Draft. Uses ds_ prefix IDs.
 * Converted to CommitV4 Sentence (s_) on commit.
 */
export interface DraftSentence {
  /** Unique ID, format: "ds_" + nanoid(12) */
  id: string;

  /** The sentence text */
  text: string;

  /** How the sentence was added */
  origin: DraftSentenceOrigin;

  /** Source reference (only for extracted/selected, manual has none) */
  source?: {
    conversation_id: string;
    conversation_title?: string;
    turn_hash: string;
    role: string;
    start_char: number;
    end_char: number;
  };

  /** Display order position */
  position: number;

  /** Whether included in the final commit */
  included: boolean;
}

/**
 * A constraint within a Draft. Uses dc_ prefix IDs.
 * Converted to Leaf Constraint (cst_) on commit.
 */
export interface DraftConstraint {
  /** Unique ID, format: "dc_" + nanoid(12) */
  id: string;

  type: 'require' | 'exclude';

  match_mode: 'exact' | 'semantic';

  /** The constraint value */
  value: string;

  /** Why this is excluded (for exclude constraints) */
  reason?: string;
}

/**
 * A Draft is a pre-commit working area (like Git's working directory).
 * Users edit sentences, constraints, and preview output before committing.
 */
export interface Draft {
  /** Unique ID, format: "draft_" + nanoid(12) */
  id: string;

  /** Associated project */
  project_id: string;

  /** Human-readable title */
  title: string;

  /** Optional goal/intent description */
  goal?: string;

  /** Parent commit to build upon */
  parent_commit_hash?: string;

  /** Source draft ID if forked from a committed draft (RFC §13 Issue B) */
  forked_from?: string;

  /** Editable sentences */
  sentences: DraftSentence[];

  /** Editable constraints */
  constraints: DraftConstraint[];

  /** Free-form instructions for generation */
  instructions?: string;

  /** Leaf type for preview generation */
  preview_type?: string;

  /** Cached preview output */
  preview_output?: string;

  /** When preview was generated, ISO8601 */
  preview_generated_at?: string;

  /** Lifecycle status */
  status: DraftStatus;

  /** Commit hash after committing */
  committed_as?: string;

  /** Leaf ID created on commit */
  committed_leaf_id?: string;

  /** Target branch for commit */
  target_branch?: string;

  /** Optimistic lock revision counter */
  revision: number;

  /** Creation timestamp, ISO8601 */
  created_at: string;

  /** Last update timestamp, ISO8601 */
  updated_at: string;

  /** LLM extraction mode. Undefined or 'deterministic' uses existing DraftSentence flow. */
  extraction_mode?: 'deterministic' | 'llm';

  /** SemanticPoints (only when extraction_mode === 'llm') */
  semantic_points?: SemanticPoint[];

  /** Per-conversation extraction cursor (only when extraction_mode === 'llm') */
  extraction_cursor?: ExtractionCursor;
}

/**
 * Input for creating a new Draft.
 */
export interface CreateDraftInput {
  project_id: string;
  title: string;
  goal?: string;
  parent_commit_hash?: string;
  target_branch?: string;
  preview_type?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM Incremental Extraction Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evidence anchor linking a SemanticPoint to a specific location in a conversation turn.
 * Multiple evidence anchors per SemanticPoint (many-to-many).
 */
export interface LocatedEvidence {
  conversation_id: string;
  turn_hash: string;
  quoted_text: string;
  start_char: number;
  end_char: number;
  match_score: number;
  role: 'primary' | 'supporting';
  relevance: string;
  enabled: boolean;
}

/**
 * A SemanticPoint is the fundamental unit in LLM-extracted drafts.
 * Replaces DraftSentence when extraction_mode === 'llm'.
 */
export interface SemanticPoint {
  /** Unique ID, format: "sp_" + nanoid(12) */
  id: string;
  text: string;
  extraction_mode: 'deterministic' | 'llm_extracted' | 'manual';
  inference_type?: 'direct' | 'paraphrase' | 'cross_turn' | 'implicit';
  status: 'inherited' | 'auto_landed' | 'reviewed' | 'modified' | 'reinforced' | 'undone';
  zone: 'ready' | 'review';
  routing_reason?: string;
  inherited_from?: string;
  evidence: LocatedEvidence[];
  confidence?: number;
  /** True when evidence covers <60% of primary turn content */
  low_coverage?: boolean;
  position: number;
  staged: boolean;
}

/**
 * Tracks per-conversation extraction progress.
 * Enables delta-in: only process turns after the cursor.
 */
export interface ExtractionCursor {
  cursors: Record<
    string,
    {
      last_processed_turn: string;
      processed_at: string;
    }
  >;
}

/**
 * LLM output proposal before verification and routing.
 */
export interface ExtractionProposal {
  type: 'new' | 'modify' | 'reinforce';
  target_sp_id?: string;
  text: string;
  confidence: number;
  inference_type: 'direct' | 'paraphrase' | 'cross_turn' | 'implicit';
  reasoning: string;
  evidence: EvidenceAnchor[];
}

/**
 * Raw evidence anchor from LLM output (before location verification).
 */
export interface EvidenceAnchor {
  conversation_id: string;
  turn_hash: string;
  quoted_text: string;
  role: 'primary' | 'supporting';
  relevance: string;
}

/**
 * Extended Sentence with multi-evidence support for LLM-extracted commits.
 */
export interface SentenceV5 extends Sentence {
  supporting_refs?: SentenceSourceRef[];
}

/**
 * Result of incremental extraction pipeline.
 */
export interface IncrementalExtractionResult {
  readyPoints: SemanticPoint[];
  reviewPoints: SemanticPoint[];
  newCursor: ExtractionCursor;
  stats: ExtractionStats;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Statistics from an extraction run.
 */
export interface ExtractionStats {
  total_turns: number;
  new_turns: number;
  proposals: number;
  auto_landed: number;
  needs_review: number;
  rejected: number;
}

/**
 * Project-level extraction configuration.
 * Stored in projects table settings JSON.
 */
export interface ProjectExtractionConfig {
  auto_landing_enabled: boolean;
  confidence_thresholds?: {
    direct?: number;
    paraphrase?: number;
    cross_turn?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Ring 4: Inter-Sentence Relations
// @see docs/plans/2026-03-05-ring4-inter-sentence-relations-design.md
// ═══════════════════════════════════════════════════════════════════════════

export const RELATION_TYPES = [
  'supports',
  'contrasts',
  'causes',
  'elaborates',
  'temporal_follows',
  'conditions',
  'summarizes',
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export interface SentenceRelation {
  id: string; // rel_abc123
  source_id: string; // s_xxx (from sentence)
  target_id: string; // s_yyy (to sentence)
  type: RelationType;
  confidence: number; // 0.0 - 1.0
  reasoning: string; // LLM explanation
}

export interface RelationExtractionResult {
  relations: SentenceRelation[];
  stats: {
    total_sentences: number;
    relations_found: number;
    avg_confidence: number;
    extraction_time_ms: number;
  };
  usage: { inputTokens: number; outputTokens: number };
}
