/**
 * Frame-Based Commit Storage Schema
 *
 * Two tables:
 * - commits: Frame-based commits (SemanticContent = frames + relations)
 * - frame_lineage: Per-frame lineage tracking across commits
 *
 * @see packages/core/src/commit/types.ts
 * @see packages/core/src/semantic/types.ts
 */

import { index, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './schema';

// ═══════════════════════════════════════════════════════════════════════════
// commits: Frame-Based Knowledge Storage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stores frame-based semantic knowledge.
 *
 * Content is SemanticContent (frames + relations).
 *
 * JSONB columns:
 * - parents: string[]
 * - author: Author
 * - content: SemanticContent (frames + relations)
 * - sources: Source[]
 * - provenance: Provenance
 */
export const commits = pgTable(
  'commits',
  {
    // ─────────────────────────────────────────────────────────────────────────
    // First-class fields (participate in hash)
    // ─────────────────────────────────────────────────────────────────────────

    /** Content hash: "sha256:" + hex */
    hash: text('hash').primaryKey(),

    /** Schema version */
    schema: text('schema').notNull().default('t3x/commit/5'),

    /** Parent commit hashes (DAG) */
    parents: jsonb('parents').notNull().$type<string[]>().default([]),

    /** Author info */
    author: jsonb('author').notNull().$type<{
      type: 'human' | 'agent' | 'system';
      id?: string;
      name?: string;
    }>(),

    /** Commit timestamp */
    committedAt: timestamp('committed_at', { withTimezone: true }).notNull(),

    /**
     * Content: { frames: Frame[], relations: Relation[] }
     * SemanticContent — the frame-based semantic payload.
     */
    content: jsonb('content').notNull(),

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
    branch: text('branch').default('main'),

    /** Source references (conversations, imports, leaves that contributed) */
    sources:
      jsonb('sources').$type<
        Array<{
          type: 'conversation' | 'import' | 'leaf';
          id: string;
          title?: string;
        }>
      >(),

    /** Provenance: how this commit was created */
    provenance: jsonb('provenance').$type<{
      method: 'llm_extraction' | 'human_curation' | 'import' | 'merge';
      model?: string;
      extracted_at?: string;
    }>(),

    /** Canvas position */
    positionX: real('position_x'),
    positionY: real('position_y'),

    /** Record creation time */
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_commits_project').on(table.projectId),
    branchIdx: index('idx_commits_branch').on(table.branch),
    committedAtIdx: index('idx_commits_committed_at').on(table.committedAt),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// frame_lineage: Per-Frame Lineage Tracking
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tracks per-frame lineage across commits.
 *
 * Each row records a frame's presence in a commit along with
 * its slot-level source references and optional metadata.
 */
export const frameLineage = pgTable(
  'frame_lineage',
  {
    /** Unique ID */
    id: text('id').primaryKey(),

    /** The commit this lineage entry belongs to */
    commitHash: text('commit_hash').notNull(),

    /** The frame this lineage entry tracks */
    frameId: text('frame_id').notNull(),

    /** Per-slot source references (SlotSourceRef map) */
    slotSources: jsonb('slot_sources'),

    /** Additional metadata */
    meta: jsonb('meta'),
  },
  (table) => ({
    commitIdx: index('idx_frame_lineage_commit').on(table.commitHash),
    frameIdx: index('idx_frame_lineage_frame').on(table.frameId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════════════════════════════════════

export type CommitRecord = typeof commits.$inferSelect;
export type CommitInsert = typeof commits.$inferInsert;

export type FrameLineageRecord = typeof frameLineage.$inferSelect;
export type FrameLineageInsert = typeof frameLineage.$inferInsert;
