/**
 * T3X Type Definitions
 *
 * This is the SINGLE SOURCE OF TRUTH for T3X types.
 * All layers (storage, api, web) must import from here.
 *
 * @see docs/specification/semantic-layer-architecture.md
 * @see docs/specification/memory-pin-system-design.md
 */

// ═══════════════════════════════════════════════════════════════════════════
// ID Prefixes (for consistent ID generation)
// ═══════════════════════════════════════════════════════════════════════════

export const ID_PREFIXES = {
  constraint: 'cst_',
  assertion: 'ast_',
  leaf: 'leaf_',
  leaf_history: 'lhist_',
  pin: 'pin_',
  api_key: 'ak_',
  share_token: 'share_',
  draft: 'draft_',
  draft_constraint: 'dc_',
  relation: 'rel_',
} as const;

/** Prefix for raw API key values (visible once at creation) */
export const API_KEY_VALUE_PREFIX = 't3xk_';

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

/** Reference to a source node's slot (for tree-based constraints) */
export interface ConstraintSourceNode {
  /** Node type to target (e.g., "preference", "budget") */
  node_type: string;
  /** Specific slot key within the node (optional — omit to target the node as a whole) */
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

  /** Link to source node + slot (tree-based traceability) */
  source_node?: ConstraintSourceNode;
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

  /** Link to source node + slot (tree-based traceability) */
  source_node?: ConstraintSourceNode;
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
  /** Nodes identical in both branches (auto-kept) */
  kept_identical: number;

  /** Similar pairs that were resolved (source or target chosen) */
  resolved_conflicts: number;

  /** Nodes kept from source-only */
  kept_from_source: number;

  /** Nodes kept from target-only */
  kept_from_target: number;

  /** Nodes discarded during merge */
  discarded: number;

  /** Total nodes in the merged commit */
  total_nodes: number;

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

  /** Default extraction style (null = system default) */
  default_extraction_style?: Record<string, unknown> | null;
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
 * Users edit nodes, constraints, and preview output before committing.
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

  /** Editable nodes (DraftNode records, typed as unknown[] until Task 6 cleanup) */
  nodes: unknown[];

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

  /** LLM extraction mode. Undefined or 'deterministic' uses existing DraftNode flow. */
  extraction_mode?: 'deterministic' | 'llm';

  /** SemanticPoints (only when extraction_mode === 'llm'; typed as unknown[] until Task 6 cleanup) */
  semantic_points?: unknown[];

  /** Per-conversation extraction cursor (only when extraction_mode === 'llm'; typed as unknown until Task 6 cleanup) */
  extraction_cursor?: unknown;
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
// Relation Types (used by relation extractor + knowledge graph)
// ═══════════════════════════════════════════════════════════════════════════

export const RELATION_TYPE_VALUES = [
  'supports',
  'contrasts',
  'causes',
  'temporal_follows',
  'conditions',
  'summarizes',
] as const;

export type RelationType = (typeof RELATION_TYPE_VALUES)[number];

export interface NodeRelation {
  id: string; // rel_abc123
  source_id: string; // node key
  target_id: string; // node key
  type: RelationType;
  reasoning: string; // LLM explanation
}

export interface RelationExtractionResult {
  relations: NodeRelation[];
  stats: {
    total_nodes: number;
    relations_found: number;
    extraction_time_ms: number;
  };
  usage: { inputTokens: number; outputTokens: number };
}
