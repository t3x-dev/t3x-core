/**
 * T3X V4 Architecture Database Schema
 *
 * This defines the database tables for V4 architecture.
 * All tables are additive - we don't modify existing V3 tables.
 *
 * Key tables:
 * - commits_v4: Pure knowledge (sentences only, no constraints)
 * - leaves: Application layer (owns constraints, output, validation)
 * - pins: Source selection mechanism
 * - conversation_contexts: Per-conversation context customization
 *
 * @see docs/specification/semantic-layer-architecture.md
 * @see docs/specification/memory-pin-system-design.md
 */

import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { conversations, projects } from './schema';

// ═══════════════════════════════════════════════════════════════════════════
// users: Authentication (OAuth providers)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Registered users via OAuth providers (e.g., GitHub).
 *
 * In AUTH_DISABLED mode, no users exist. Projects with owner_id=null
 * are public/legacy data accessible to everyone.
 */
export const users = pgTable(
  'users',
  {
    /** Unique ID: "user_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** OAuth provider name (e.g., 'github') */
    provider: text('provider').notNull(),

    /** User ID from the OAuth provider */
    providerId: text('provider_id').notNull(),

    /** Email address (may be null) */
    email: text('email'),

    /** Display name */
    name: text('name'),

    /** Avatar URL */
    avatarUrl: text('avatar_url'),

    /** Creation time */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerUniqueIdx: uniqueIndex('idx_users_provider_unique').on(table.provider, table.providerId),
  })
);

export type UserRecord = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// commits_v4: Pure Knowledge Storage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CommitV4 stores pure knowledge (sentences only).
 *
 * Key difference from commits_v3:
 * - content.sentences exists
 * - content.constraints does NOT exist (moved to leaves)
 *
 * JSONB columns:
 * - parents: string[]
 * - author: { type: 'human' | 'agent', id?: string, name?: string }
 * - content: { sentences: Sentence[] }
 * - source_refs: CommitSourceRef[]
 */
export const commitsV4 = pgTable(
  'commits_v4',
  {
    // ─────────────────────────────────────────────────────────────────────────
    // First-class fields (participate in hash)
    // ─────────────────────────────────────────────────────────────────────────

    /** Content hash: "sha256:" + hex */
    hash: text('hash').primaryKey(),

    /** Schema version */
    schema: text('schema').notNull().default('t3x/commit/v4'),

    /** Parent commit hashes (DAG) */
    parents: jsonb('parents').notNull().$type<string[]>().default([]),

    /** Author info */
    author: jsonb('author').notNull().$type<{
      type: 'human' | 'agent';
      id?: string;
      name?: string;
    }>(),

    /** Commit timestamp */
    committedAt: timestamp('committed_at', { withTimezone: true }).notNull(),

    /**
     * Content: { sentences: Sentence[] }
     * NOTE: No constraints here - they belong to leaves now
     */
    content: jsonb('content').notNull().$type<{
      sentences: Array<{
        id: string;
        text: string;
        confidence?: number;
        source_ref?: {
          conversation_id: string;
          turn_hash: string;
          start_char: number;
          end_char: number;
        };
        anchor_type?: 'verbatim' | 'paraphrase' | 'inference';
      }>;
    }>(),

    // ─────────────────────────────────────────────────────────────────────────
    // Second-class fields (NOT in hash)
    // ─────────────────────────────────────────────────────────────────────────

    /** Project ID */
    projectId: text('project_id').references(() => projects.projectId, {
      onDelete: 'cascade',
    }),

    /** Commit message */
    message: text('message'),

    /** Branch name */
    branch: text('branch'),

    /**
     * Source references (frozen at commit time)
     * Records which pinned items contributed to this commit
     */
    sourceRefs:
      jsonb('source_refs').$type<
        Array<{
          type: 'conversation' | 'leaf';
          id: string;
          title?: string;
          assertion_lessons?: string[];
        }>
      >(),

    /** Merge summary statistics (only present on merge commits) */
    mergeSummary: jsonb('merge_summary').$type<{
      kept_identical: number;
      resolved_conflicts: number;
      kept_from_source: number;
      kept_from_target: number;
      discarded: number;
      total_sentences: number;
      release_note?: {
        title: string;
        timestamp: string;
        source_branch: string;
        target_branch: string;
        summary: string;
        sections: Array<{ heading: string; items: string[] }>;
      };
    }>(),

    /** Canvas position */
    positionX: real('position_x'),
    positionY: real('position_y'),

    /** Record creation time */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_commits_v4_project').on(table.projectId),
    branchIdx: index('idx_commits_v4_branch').on(table.branch),
    createdAtIdx: index('idx_commits_v4_created_at').on(table.createdAt),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// leaves: Application Layer (Owns Constraints)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Leaf stores application-layer data: constraints, output, validation.
 *
 * Key insight: Same commit can have multiple leaves with different constraints.
 *
 * JSONB columns:
 * - constraints: Constraint[]
 * - config: LeafConfig
 * - assertions: Assertion[]
 */
export const leaves = pgTable(
  'leaves',
  {
    /** Unique ID: "leaf_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** The commit this leaf uses for knowledge */
    commitHash: text('commit_hash').notNull(),

    /** Output type: 'deploy_agent' | 'tweet' | 'weibo' | etc. */
    type: text('type').notNull(),

    /** Human-readable title */
    title: text('title'),

    // ─────────────────────────────────────────────────────────────────────────
    // Constraints (NOW OWNED BY LEAF)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Validation rules for output
     * Array of RequireConstraint | ExcludeConstraint
     */
    constraints: jsonb('constraints')
      .notNull()
      .$type<
        Array<{
          id: string;
          type: 'require' | 'exclude';
          match_mode: 'exact' | 'semantic';
          value: string;
          description?: string;
          source_sentence_id?: string;
          reason?: string;
        }>
      >()
      .default([]),

    // ─────────────────────────────────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────────────────────────────────

    /** Leaf-specific config */
    config: jsonb('config')
      .notNull()
      .$type<{
        prompt_template?: string;
        model?: string;
        max_tokens?: number;
        [key: string]: unknown;
      }>()
      .default({}),

    // ─────────────────────────────────────────────────────────────────────────
    // Output
    // ─────────────────────────────────────────────────────────────────────────

    /** Generated content */
    output: text('output'),

    /** When output was generated */
    generatedAt: timestamp('generated_at', { withTimezone: true }),

    // ─────────────────────────────────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────────────────────────────────

    /** Validation results (local Generate & Verify / Re-validate) */
    assertions:
      jsonb('assertions').$type<
        Array<{
          id: string;
          constraint_id: string;
          passed: boolean;
          details: string;
          lesson?: string;
        }>
      >(),

    /** Runner evaluation results (written back by Runner ingest) */
    runnerAssertions:
      jsonb('runner_assertions').$type<
        Array<{
          id: string;
          constraint_id: string;
          passed: boolean;
          details: string;
          lesson?: string;
        }>
      >(),

    // ─────────────────────────────────────────────────────────────────────────
    // Metadata
    // ─────────────────────────────────────────────────────────────────────────

    /** Project ID */
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),

    /** Creation time */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Creator */
    createdBy: text('created_by'),
  },
  (table) => ({
    commitIdx: index('idx_leaves_commit').on(table.commitHash),
    projectIdx: index('idx_leaves_project').on(table.projectId),
    typeIdx: index('idx_leaves_type').on(table.type),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// leaf_history: Generation History
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LeafHistory stores a snapshot of each generation for a Leaf.
 *
 * Each time a Leaf generates output, a history entry is created.
 * This allows viewing and restoring previous outputs.
 */
export const leafHistory = pgTable(
  'leaf_history',
  {
    /** Unique ID: "lhist_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** The leaf this history belongs to */
    leafId: text('leaf_id')
      .notNull()
      .references(() => leaves.id, { onDelete: 'cascade' }),

    /** Generated output content */
    output: text('output').notNull(),

    /** Configuration used for this generation */
    config: jsonb('config').notNull().$type<{
      prompt_template?: string;
      model?: string;
      max_tokens?: number;
      [key: string]: unknown;
    }>(),

    /** LLM model used for generation */
    model: text('model').notNull(),

    /** When this output was generated */
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),

    /** Who triggered this generation */
    createdBy: text('created_by'),

    /** Attempt number within a generation cycle (1 = first attempt) */
    attemptNumber: integer('attempt_number').notNull().default(1),

    /** Corrective feedback from corrective-prompt.ts (if retry) */
    correctiveFeedback: text('corrective_feedback'),

    /** The actual prompt sent to LLM */
    promptUsed: text('prompt_used'),
  },
  (table) => ({
    leafIdx: index('idx_leaf_history_leaf').on(table.leafId),
    generatedAtIdx: index('idx_leaf_history_generated_at').on(table.generatedAt),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// pins: Source Selection Mechanism
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pin marks items as selected for commit sources and conversation context.
 *
 * One mechanism, dual purpose:
 * 1. Commit: pinned items become sources for next commit
 * 2. Conversation: pinned items become LLM background context
 */
export const pins = pgTable(
  'pins',
  {
    /** Unique ID: "pin_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** Which project this pin belongs to */
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),

    /** Type of pinned item: 'conversation' | 'leaf' */
    type: text('type').notNull(),

    /** ID of the pinned item */
    refId: text('ref_id').notNull(),

    /**
     * For leaf pins: which assertions to include
     * null = include all assertions with lessons
     */
    selectedAssertionIds: jsonb('selected_assertion_ids').$type<string[]>(),

    /** When pinned */
    pinnedAt: timestamp('pinned_at', { withTimezone: true }).notNull().defaultNow(),

    /** Who pinned it */
    pinnedBy: text('pinned_by'),
  },
  (table) => ({
    projectIdx: index('idx_pins_project').on(table.projectId),
    /** Ensure unique pin per project + type + ref */
    uniquePin: uniqueIndex('idx_pins_unique').on(table.projectId, table.type, table.refId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// conversation_contexts: Per-conversation Context Customization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stores per-conversation context configuration.
 *
 * Each conversation can customize which pins are included in its LLM context.
 * Default (no row): use all project pins.
 */
export const conversationContexts = pgTable('conversation_contexts', {
  /** The conversation this config belongs to */
  conversationId: text('conversation_id')
    .primaryKey()
    .references(() => conversations.conversationId, { onDelete: 'cascade' }),

  /**
   * Which pins to include in context
   * null = use all project pins (default)
   * [] = no pins (fresh start)
   * [...ids] = specific pins only
   */
  selectedPinIds: jsonb('selected_pin_ids').$type<string[] | null>(),

  /** Last update time */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════
// leaf_output_edits: User Edit Tracking (Item 17 — Constraint Reverse Learning)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tracks when a user manually edits a Leaf's output.
 * Each row stores the before/after text so the reverse-learning
 * pipeline can discover implicit constraints from edit patterns.
 */
export const leafOutputEdits = pgTable(
  'leaf_output_edits',
  {
    /** Unique ID: "ledit_" + uuid-slice */
    id: text('id').primaryKey(),

    /** The leaf whose output was edited */
    leafId: text('leaf_id')
      .notNull()
      .references(() => leaves.id, { onDelete: 'cascade' }),

    /** Project for easy querying */
    projectId: text('project_id').notNull(),

    /** The output text before the edit */
    originalOutput: text('original_output').notNull(),

    /** The output text after the user's edit */
    modifiedOutput: text('modified_output').notNull(),

    /** When the edit was made */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leafIdx: index('idx_leaf_output_edits_leaf').on(table.leafId),
    projectIdx: index('idx_leaf_output_edits_project').on(table.projectId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// Type Exports (for use in queries)
// ═══════════════════════════════════════════════════════════════════════════

export type CommitV4Record = typeof commitsV4.$inferSelect;
export type CommitV4Insert = typeof commitsV4.$inferInsert;

export type LeafRecord = typeof leaves.$inferSelect;
export type LeafInsert = typeof leaves.$inferInsert;

export type LeafHistoryRecord = typeof leafHistory.$inferSelect;
export type LeafHistoryInsert = typeof leafHistory.$inferInsert;

export type PinRecord = typeof pins.$inferSelect;
export type PinInsert = typeof pins.$inferInsert;

export type ConversationContextRecord = typeof conversationContexts.$inferSelect;
export type ConversationContextInsert = typeof conversationContexts.$inferInsert;

export type LeafOutputEditRecord = typeof leafOutputEdits.$inferSelect;
export type LeafOutputEditInsert = typeof leafOutputEdits.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// api_keys: Authentication
// ═══════════════════════════════════════════════════════════════════════════

/**
 * API keys for authenticating API requests.
 *
 * The full key value is only shown once at creation.
 * We store a SHA-256 hash for verification and a short prefix for display.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    /** Unique ID: "ak_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** First 8 chars of the key value for display */
    keyPrefix: text('key_prefix').notNull(),

    /** SHA-256 hash of the full key value */
    keyHash: text('key_hash').notNull(),

    /** Human-readable label */
    name: text('name').notNull(),

    /** Project scope (null = user-level key, can access all user's projects) */
    projectId: text('project_id').references(() => projects.projectId, {
      onDelete: 'cascade',
    }),

    /** Owner user ID. null = legacy key (AUTH_DISABLED era) */
    userId: text('user_id'),

    /** Creation time */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Last usage time */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

    /** Revocation time (soft delete) */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    keyHashIdx: uniqueIndex('idx_api_keys_hash').on(table.keyHash),
    projectIdx: index('idx_api_keys_project').on(table.projectId),
  })
);

export type ApiKeyRecord = typeof apiKeys.$inferSelect;
export type ApiKeyInsert = typeof apiKeys.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// share_tokens: Share Links
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Share tokens grant read-only access to specific entities via URL.
 */
export const shareTokens = pgTable(
  'share_tokens',
  {
    /** Unique ID: "share_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** Random URL-safe token for the share link */
    token: text('token').notNull(),

    /** Entity type being shared */
    entityType: text('entity_type').notNull(),

    /** ID of the shared entity */
    entityId: text('entity_id').notNull(),

    /** Associated project */
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),

    /** Who created the share link */
    createdBy: text('created_by'),

    /** Creation time */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Expiration time (null = never) */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    /** Revocation time (soft delete) */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tokenIdx: uniqueIndex('idx_share_tokens_token').on(table.token),
    entityIdx: index('idx_share_tokens_entity').on(table.entityType, table.entityId),
    projectIdx: index('idx_share_tokens_project').on(table.projectId),
  })
);

export type ShareTokenRecord = typeof shareTokens.$inferSelect;
export type ShareTokenInsert = typeof shareTokens.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// webhooks: Event Subscription System
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Webhooks for subscribing to T3X events.
 *
 * Receives POST callbacks when events occur (commit.created, merge.completed, etc.).
 * Secret is stored as plaintext (needed for HMAC signing).
 */
export const webhooks = pgTable(
  'webhooks',
  {
    /** Unique ID: "wh_" + nanoid(12) */
    webhookId: text('webhook_id').primaryKey(),

    /** Project scope (null = global — receives events from all projects) */
    projectId: text('project_id').references(() => projects.projectId, {
      onDelete: 'cascade',
    }),

    /** Target URL to receive POST callbacks */
    url: text('url').notNull(),

    /** List of event types to subscribe to (JSONB) */
    events: jsonb('events').notNull().$type<string[]>(),

    /** Secret for HMAC-SHA256 signature (null = no signing) */
    secret: text('secret'),

    /** Whether the webhook is active */
    active: text('active').notNull().default('true'),

    /** Creation time */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Last update time */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_webhooks_project').on(table.projectId),
    activeIdx: index('idx_webhooks_active').on(table.active),
  })
);

export type WebhookRecord = typeof webhooks.$inferSelect;
export type WebhookInsert = typeof webhooks.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// drafts_v3: Workbench / Pre-commit Working Area
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DraftV3 is a pre-commit workspace (like Git's working directory).
 *
 * Users compose sentences, add constraints, preview output, then commit.
 * Status lifecycle: editing → committed | abandoned.
 *
 * JSONB columns:
 * - sentences_json: DraftSentence[]
 * - constraints_json: DraftConstraint[]
 */
export const draftsV3 = pgTable(
  'drafts_v3',
  {
    /** Unique ID: "draft_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** Project ID */
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),

    /** Human-readable title */
    title: text('title').notNull(),

    /** Optional goal/intent description */
    goal: text('goal'),

    /** Parent commit to build upon */
    parentCommitHash: text('parent_commit_hash'),

    /** Source draft ID if forked from a committed draft */
    forkedFrom: text('forked_from'),

    /** Editable sentences (DraftSentence[]) */
    sentencesJson: jsonb('sentences_json')
      .notNull()
      .$type<
        Array<{
          id: string;
          text: string;
          origin:
            | { type: 'extracted'; segment_id: string; confidence: number }
            | { type: 'selected' }
            | { type: 'manual' };
          source?: {
            conversation_id: string;
            conversation_title?: string;
            turn_hash: string;
            role: string;
            start_char: number;
            end_char: number;
          };
          position: number;
          included: boolean;
        }>
      >()
      .default([]),

    /** Editable constraints (DraftConstraint[]) */
    constraintsJson: jsonb('constraints_json')
      .notNull()
      .$type<
        Array<{
          id: string;
          type: 'require' | 'exclude';
          match_mode: 'exact' | 'semantic';
          value: string;
          reason?: string;
        }>
      >()
      .default([]),

    /** Free-form instructions for generation */
    instructions: text('instructions'),

    /** Leaf type for preview generation */
    previewType: text('preview_type'),

    /** Cached preview output */
    previewOutput: text('preview_output'),

    /** When preview was generated */
    previewGeneratedAt: timestamp('preview_generated_at', { withTimezone: true }),

    /** Lifecycle status: 'editing' | 'committed' | 'abandoned' */
    status: text('status').notNull().default('editing'),

    /** Commit hash after committing */
    committedAs: text('committed_as'),

    /** Leaf ID created on commit */
    committedLeafId: text('committed_leaf_id'),

    /** Target branch for commit */
    targetBranch: text('target_branch').default('main'),

    /** Optimistic lock revision counter */
    revision: integer('revision').notNull().default(1),

    /** LLM extraction mode: 'deterministic' | 'llm' */
    extractionMode: text('extraction_mode'),

    /** SemanticPoint[] (only when extraction_mode === 'llm') */
    semanticPointsJson: jsonb('semantic_points_json'),

    /** ExtractionCursor (only when extraction_mode === 'llm') */
    extractionCursorJson: jsonb('extraction_cursor_json'),

    /** Creation time */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),

    /** Last update time */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    projectIdx: index('idx_drafts_v3_project').on(table.projectId),
    statusIdx: index('idx_drafts_v3_status').on(table.status),
  })
);

export type DraftV3Record = typeof draftsV3.$inferSelect;
export type DraftV3Insert = typeof draftsV3.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// sentence_vectors: pgvector-powered sentence similarity search
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Custom Drizzle type for pgvector's `vector(768)` column.
 * Converts between number[] (TypeScript) and vector literal (SQL).
 */
const pgVector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.replace(/[[\]]/g, '').split(',').map(Number);
  },
});

/**
 * Stores per-sentence embedding vectors for semantic similarity search.
 *
 * Populated when a draft is committed (if embedding provider is configured).
 * Enables the AutoSuggest feature: "given a goal, find relevant committed sentences".
 *
 * @see docs/rfcs/engine-moat-reinforcement.md §4.2
 */
export const sentenceVectors = pgTable(
  'sentence_vectors',
  {
    /** Sentence ID (same as CommitV4 sentence.id, e.g., "s_abc123") */
    id: text('id').primaryKey(),

    /** Project scope */
    projectId: text('project_id').notNull(),

    /** Which commit this sentence belongs to */
    commitHash: text('commit_hash').notNull(),

    /** The sentence text (denormalized for display without join) */
    sentenceText: text('text').notNull(),

    /** 768-dimensional embedding vector (Google AI text-embedding-004) */
    embedding: pgVector('embedding').notNull(),

    /** Which embedding model produced this vector */
    modelId: text('model_id').notNull(),

    /** When this vector was created */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_sv_project').on(table.projectId),
    commitIdx: index('idx_sv_commit').on(table.commitHash),
  })
);

export type SentenceVectorRecord = typeof sentenceVectors.$inferSelect;
export type SentenceVectorInsert = typeof sentenceVectors.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// recipes: Workflow Recipes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recipes define automated workflows triggered by T3X events.
 *
 * Each recipe has a trigger (event + optional filter) and a sequence of steps
 * (send_webhook, run_eval, export_report) that execute when the event fires.
 */
export const recipes = pgTable('recipes', {
  id: text('id').primaryKey(), // recipe_{nanoid}
  project_id: text('project_id')
    .notNull()
    .references(() => projects.projectId),
  name: text('name').notNull(),
  description: text('description'),
  trigger: jsonb('trigger').notNull().$type<{
    event: string; // e.g. 'merge.completed', 'leaf.generated', 'commit.created'
    filter?: Record<string, string>; // optional event field filters
  }>(),
  steps: jsonb('steps').notNull().$type<
    Array<{
      action: 'send_webhook' | 'run_eval' | 'export_report';
      config: Record<string, unknown>;
    }>
  >(),
  enabled: boolean('enabled').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type RecipeRecord = typeof recipes.$inferSelect;
export type RecipeInsert = typeof recipes.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// notifications: Persistent notification system (Item 16)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Persistent notifications for proactive alerts.
 *
 * Events:
 * - commit.created: New knowledge committed
 * - merge.completed: Merge finished
 * - leaf.generated: Leaf output generated
 * - leaf.stale: Leaf references outdated commit
 * - conflict.detected: Conflicting knowledge found
 * - info: General information
 */
export const notifications = pgTable(
  'notifications',
  {
    /** Unique ID: "notif_" + uuid-slice */
    id: text('id').primaryKey(),

    /** Notification type */
    type: text('type').notNull(),

    /** Short title */
    title: text('title').notNull(),

    /** Detailed message */
    message: text('message').notNull(),

    /** Associated project (nullable for system-wide notifications) */
    projectId: text('project_id'),

    /** Reference ID for linking to the source entity (commit hash, leaf id, etc.) */
    refId: text('ref_id'),

    /** Read status */
    read: boolean('read').notNull().default(false),

    /** When the notification was created */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_notifications_project').on(table.projectId),
    readIdx: index('idx_notifications_read').on(table.read),
    createdAtIdx: index('idx_notifications_created').on(table.createdAt),
  })
);

export type NotificationRecord = typeof notifications.$inferSelect;
export type NotificationInsert = typeof notifications.$inferInsert;
