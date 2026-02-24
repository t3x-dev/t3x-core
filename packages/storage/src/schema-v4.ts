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

import { index, jsonb, pgTable, real, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { conversations, projects } from './schema';

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

    /** Validation results */
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

    /** Project scope (null = global) */
    projectId: text('project_id').references(() => projects.projectId, {
      onDelete: 'cascade',
    }),

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
    /** Unique ID: "stk_" + nanoid(12) */
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
