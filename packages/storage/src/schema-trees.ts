/**
 * T3X Database Schema — Leaves, Pins, Contexts, Drafts
 *
 * Key tables:
 * - leaves: Application layer (owns constraints, output, validation)
 * - pins: Source selection mechanism
 * - conversation_contexts: Per-conversation context customization
 *
 * @see docs/specification/semantic-layer-architecture.md
 * @see docs/specification/memory-pin-system-design.md
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { conversations, projects } from './schema';

// ═══════════════════════════════════════════════════════════════════════════
// users: Authentication (identity, keyed by email)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Registered users (identity records).
 *
 * Provider-specific info lives in the `accounts` table (many-to-one).
 * In AUTH_DISABLED mode, no users exist. Projects with owner_id=null
 * are public/legacy data accessible to everyone.
 */
export const users = pgTable('users', {
  /** Unique ID: "user_" + nanoid(12) */
  id: text('id').primaryKey(),

  /** Email address (may be null if provider doesn't expose it) */
  email: text('email'),

  /** True when at least one provider has confirmed the email */
  emailVerified: boolean('email_verified').notNull().default(false),

  /** Display name */
  name: text('name'),

  /** Avatar URL */
  avatarUrl: text('avatar_url'),

  /** Username for local auth (null for OAuth-only users) */
  username: text('username').unique(),

  /** Bcrypt password hash for local auth (null for OAuth-only users) */
  passwordHash: text('password_hash'),

  /** User's default extraction style (null = system default) */
  defaultExtractionStyle: jsonb('default_extraction_style').$type<{
    granularity: 'concise' | 'balanced' | 'detailed';
    quote_length: 'minimal' | 'contextual';
    update_stance: 'conservative' | 'balanced' | 'aggressive';
    tier3: 'skip' | 'extract';
  }>(),

  /** User's default generation provider (null = inherit global role order) */
  defaultProvider: text('default_provider'),

  /** User's default generation model (null = provider default model) */
  defaultModel: text('default_model'),

  /** Creation time */
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRecord = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// accounts: OAuth Provider Records (many-to-one with users)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OAuth provider accounts linked to users.
 *
 * Multiple accounts can map to the same user when emails match
 * across providers (auto-linking).
 */
export const accounts = pgTable(
  'accounts',
  {
    /** Unique ID: "acct_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** The user this account belongs to */
    userId: text('user_id').notNull(),

    /** OAuth provider name (e.g., 'github', 'google') */
    provider: text('provider').notNull(),

    /** User ID from the OAuth provider */
    providerAccountId: text('provider_account_id').notNull(),

    /** Creation time */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerUniqueIdx: uniqueIndex('idx_accounts_provider').on(
      table.provider,
      table.providerAccountId
    ),
    userIdx: index('idx_accounts_user').on(table.userId),
  })
);

export type AccountRecord = typeof accounts.$inferSelect;
export type AccountInsert = typeof accounts.$inferInsert;

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

    /**
     * The commit this leaf uses for knowledge.
     *
     * Fix 14 (no-fk note): No foreign key is declared here intentionally.
     * Leaves can reference commits from the commits table,
     * so a single FK to one table would be incorrect. Application-level
     * validation (in the leaves query layer) is responsible for confirming that
     * the referenced commit exists before creating or updating a leaf.
     */
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
          /** Tree-based source reference */
          source_tree?: { tree_type: string; slot_key?: string };
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

    /**
     * Project for easy querying (denormalized from leafId's leaf row).
     *
     * Fix 19 (no-fk note): The FK to projects is intentionally omitted here.
     * Cascade integrity flows through leafId → leaves.id ON DELETE CASCADE,
     * which in turn cascades from projects. Adding a redundant FK to projects
     * would require explicit ordering during deletion and provides no additional
     * safety beyond what the leafId FK already guarantees.
     */
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

    /**
     * Whether the webhook is active.
     *
     * Fix 13: Stored as INTEGER (1 = active, 0 = inactive) to match the
     * project-wide integer-boolean convention (see branches.isCurrent).
     *
     * NOTE: Databases created before this fix used TEXT DEFAULT 'true'. A
     * migration is required for existing deployments:
     *   -- For PostgreSQL:
     *   ALTER TABLE webhooks ALTER COLUMN active TYPE INTEGER
     *     USING (CASE WHEN active = 'true' THEN 1 ELSE 0 END);
     *   ALTER TABLE webhooks ALTER COLUMN active SET DEFAULT 1;
     */
    active: integer('active').notNull().default(1),

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
// drafts: Workbench / Pre-commit Working Area
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Draft is a pre-commit workspace (like Git's working directory).
 *
 * Users compose nodes, add constraints, preview output, then commit.
 * Status lifecycle: editing → committed | abandoned.
 *
 * JSONB columns:
 * - nodes_json: DraftNode[]
 * - constraints_json: DraftConstraint[]
 */
export const drafts = pgTable(
  'drafts',
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

    /** Editable nodes (DraftNode[]) */
    nodesJson: jsonb('nodes_json')
      .notNull()
      .$type<
        Array<{
          id: string;
          text: string;
          origin:
            | { type: 'extracted'; segment_id: string }
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
    projectIdx: index('idx_drafts_project').on(table.projectId),
    statusIdx: index('idx_drafts_status').on(table.status),
  })
);

export type DraftRecord = typeof drafts.$inferSelect;
export type DraftInsert = typeof drafts.$inferInsert;

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
    .references(() => projects.projectId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  trigger: jsonb('trigger').notNull().$type<{
    event: string; // e.g. 'merge.completed', 'leaf.generated', 'commit.created'
    filter?: Record<string, string>; // optional event field filters
  }>(),
  steps: jsonb('steps').notNull().$type<
    Array<{
      action: 'send_webhook' | 'run_eval' | 'export_report' | 'auto_commit_draft';
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

// ═══════════════════════════════════════════════════════════════════════════
// yops_log: Append-only YOps Records (T3X dialect)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Append-only log of SourcedYOps produced during extraction and editing.
 *
 * Every op in the `yops` JSONB array MUST have a `source` field with
 * type ∈ {'llm','human'} — enforced by DB check constraint
 * `yops_log_source_required`, installed inline by `adapters/postgres.ts` so
 * legacy rows are backfilled before the constraint is added.
 *
 * Row-level `source` text column (values: 'pipeline'|'manual'|'answer'|
 * 'collapse'|'compress') is a separate, coarser provenance tag. Per-op
 * `source.type` is the fine-grained truth, but the row-level column is still
 * load-bearing for compression-v2 (which checks `source === 'manual'`) and
 * the OpenAPI contract. Treat them as two distinct concepts, not duplicates.
 */
export const yopsLog = pgTable(
  'yops_log',
  {
    /** Unique ID: "yl_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** Conversation this yops entry belongs to */
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.conversationId, { onDelete: 'cascade' }),

    /** Project this yops entry belongs to */
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),

    /** YOps source: 'pipeline' | 'manual' | 'answer' | 'collapse' | 'compress' */
    source: text('source').notNull(),

    /** Turn hash (only for pipeline source) */
    turnHash: text('turn_hash'),

    /** The YOps content (JSONB) */
    yops: jsonb('yops').notNull(),

    /** Which model produced this extraction (for pipeline source) */
    model: text('model'),

    /** When this yops entry was recorded */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    // ── V2 columns ──

    /** Per-conversation auto-increment version number */
    version: integer('version'),

    /** Pipeline state at time of recording */
    pipelineState: text('pipeline_state'),

    /** Gate check result (Step 5 VALIDATE) */
    gateResultJson: jsonb('gate_result_json'),

    /** Extensible metadata */
    metadata: jsonb('metadata'),

    /** Topic ID for multi-topic conversations */
    topicId: text('topic_id'),
  },
  (table) => ({
    convIdx: index('idx_yops_log_conv').on(table.conversationId, table.createdAt),
    projectIdx: index('idx_yops_log_project').on(table.projectId),
    // Source enforcement — mirrors the inline auto-migrate in adapters/postgres.ts.
    // Uses jsonb_path_exists because Postgres CHECK forbids subqueries.
    sourceRequired: check(
      'yops_log_source_required',
      sql`
        jsonb_typeof(${table.yops}) = 'array'
        AND NOT jsonb_path_exists(
          ${table.yops},
          '$[*] ? (!exists(@.source) || !(@.source.type == "llm" || @.source.type == "human"))'
        )
      `
    ),
  })
);

export type YOpsLogRecord = typeof yopsLog.$inferSelect;
export type YOpsLogInsert = typeof yopsLog.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// Topics: Multi-topic Conversations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tracks distinct topics within a conversation.
 *
 * Each extraction can target a specific topic. The topic name
 * is auto-synced to the root tree type during extraction.
 */
export const topics = pgTable(
  'topics',
  {
    /** Unique ID: "topic_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** Conversation this topic belongs to */
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.conversationId, { onDelete: 'cascade' }),

    /** Project for easy querying */
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),

    /** Topic display name (synced to root tree type) */
    name: text('name').notNull(),

    /** Status: active, archived */
    status: text('status').notNull().default('active'),

    /** When this topic was created */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    convIdx: index('idx_topics_conv').on(table.conversationId),
    projectIdx: index('idx_topics_project').on(table.projectId),
  })
);

export type TopicRecord = typeof topics.$inferSelect;
export type TopicInsert = typeof topics.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// Knowledge Graph (Cross-conversation entity/topic graph)
// @see docs/plans/2026-03-05-knowledge-graph-design.md
// ═══════════════════════════════════════════════════════════════════════════

export const knowledgeNodes = pgTable(
  'knowledge_nodes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    type: text('type').notNull().default('topic'),
    summary: text('summary'),
    memberCount: integer('member_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_kn_project').on(table.projectId),
  })
);

export type KnowledgeNodeRecord = typeof knowledgeNodes.$inferSelect;
export type KnowledgeNodeInsert = typeof knowledgeNodes.$inferInsert;

export const knowledgeNodeMembers = pgTable(
  'knowledge_node_members',
  {
    nodeId: text('node_id')
      .notNull()
      .references(() => knowledgeNodes.id, { onDelete: 'cascade' }),
    contentNodeId: text('content_node_id').notNull(),
    commitHash: text('commit_hash').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.nodeId, table.contentNodeId] }),
    contentNodeIdx: index('idx_knm_content_node').on(table.contentNodeId),
  })
);

export type KnowledgeNodeMemberRecord = typeof knowledgeNodeMembers.$inferSelect;
export type KnowledgeNodeMemberInsert = typeof knowledgeNodeMembers.$inferInsert;

export const knowledgeEdges = pgTable(
  'knowledge_edges',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),
    sourceNodeId: text('source_node_id')
      .notNull()
      .references(() => knowledgeNodes.id, { onDelete: 'cascade' }),
    targetNodeId: text('target_node_id')
      .notNull()
      .references(() => knowledgeNodes.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    weight: real('weight').notNull().default(0),
    evidence:
      jsonb('evidence').$type<
        Array<{
          source_node_key: string;
          target_node_key: string;
          relation_type: string;
        }>
      >(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_ke_project').on(table.projectId),
    sourceIdx: index('idx_ke_source').on(table.sourceNodeId),
    targetIdx: index('idx_ke_target').on(table.targetNodeId),
  })
);

export type KnowledgeEdgeRecord = typeof knowledgeEdges.$inferSelect;
export type KnowledgeEdgeInsert = typeof knowledgeEdges.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// token_usage: LLM Token Consumption Tracking
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Records per-call LLM token consumption for metering and cost estimation.
 */
export const tokenUsage = pgTable(
  'token_usage',
  {
    /** Unique ID: "tu_" + nanoid(12) */
    id: text('id').primaryKey(),

    /** Owner user ID (nullable — null = AUTH_DISABLED / legacy) */
    userId: text('user_id'),

    /** Project scope */
    projectId: text('project_id')
      .notNull()
      .references(() => projects.projectId, { onDelete: 'cascade' }),

    /** API endpoint that triggered the LLM call */
    endpoint: text('endpoint').notNull(),

    /** LLM model identifier */
    model: text('model').notNull(),

    /** Number of input (prompt) tokens */
    inputTokens: integer('input_tokens').notNull(),

    /** Number of output (completion) tokens */
    outputTokens: integer('output_tokens').notNull(),

    /** Estimated cost in USD */
    estimatedCost: numeric('estimated_cost', { precision: 10, scale: 6 }).default('0'),

    /** When the usage was recorded */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index('idx_token_usage_user_created').on(table.userId, table.createdAt),
    projectCreatedIdx: index('idx_token_usage_project_created').on(
      table.projectId,
      table.createdAt
    ),
  })
);

export type TokenUsageRecord = typeof tokenUsage.$inferSelect;
export type TokenUsageInsert = typeof tokenUsage.$inferInsert;
