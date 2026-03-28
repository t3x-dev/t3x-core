/**
 * @t3x-dev/storage
 *
 * T3X Storage - PostgreSQL persistence layer with Drizzle ORM.
 *
 * Supports multiple backends:
 * - Embedded PostgreSQL: Local development (crash-safe, via @t3x-dev/storage/embedded)
 * - PostgreSQL: Docker/production (postgres.js driver)
 * - Supabase: Cloud deployment (via @t3x-dev/storage/supabase)
 *
 * Usage:
 *
 * ```typescript
 * // Local development (embedded PostgreSQL)
 * import { createEmbeddedStorage } from '@t3x-dev/storage/embedded';
 * const db = await createEmbeddedStorage({ dataDir: '.t3x/pg-data' });
 *
 * // Docker / production
 * import { createPostgresStorage } from '@t3x-dev/storage';
 * const db = await createPostgresStorage({ connectionString: process.env.DATABASE_URL });
 *
 * // Supabase
 * import { createSupabaseStorage } from '@t3x-dev/storage/supabase';
 * const db = await createSupabaseStorage({ connectionString: process.env.SUPABASE_URL });
 * ```
 */

// Database adapters
export * from './adapters';
// Backup / verify utilities
export * from './backup';
// Query functions
export * from './queries';
// Schema (table definitions and types)
export * from './schema';
// Commits Schema (commits, tree_lineage — tree-based commits)
export * from './schema-commits';
// Extraction Feedback Schema (Anchoring L4)
export * from './schema-extraction-feedback';
// Tree State (source-of-truth for current trees)
export * from './schema-tree-state';
// Schema (leaves, pins, conversation_contexts + retired commits_v4 for migration)
// @see docs/specification/semantic-layer-architecture.md
export * from './schema-trees';
// Knowledge Conflicts Schema (conflict detection persistence)
export * from './schema-knowledge-conflicts';
// Observable Metrics Schema (event tracking)
export * from './schema-metrics';
// Node Modifications Schema (audit trail)
export * from './schema-node-modifications';
