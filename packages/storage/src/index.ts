/**
 * @t3x/storage
 *
 * T3X Storage - PostgreSQL persistence layer with Drizzle ORM.
 *
 * Supports multiple backends:
 * - PGLite: Local development (WASM PostgreSQL)
 * - PostgreSQL: Docker/production
 * - Supabase: Cloud deployment
 *
 * Usage:
 *
 * ```typescript
 * // Local development
 * import { createPGLiteStorage, insertProject } from '@t3x/storage';
 * const db = await createPGLiteStorage({ dataDir: '.t3x/database' });
 * const project = await insertProject(db, { name: 'My Project' });
 *
 * // Docker
 * import { createPostgresStorage } from '@t3x/storage';
 * const db = await createPostgresStorage({ connectionString: process.env.DATABASE_URL });
 *
 * // Supabase
 * import { createSupabaseStorage } from '@t3x/storage';
 * const db = await createSupabaseStorage({ connectionString: process.env.SUPABASE_URL });
 * ```
 */

// Schema (table definitions and types)
export * from './schema';

// Database adapters
export * from './adapters';

// Query functions
export * from './queries';
