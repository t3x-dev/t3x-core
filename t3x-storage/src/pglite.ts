/**
 * @t3x/storage/pglite
 *
 * PGLite-only entry point for local development.
 * This module does NOT import postgres.js or supabase, so it can be
 * safely bundled by webpack without triggering binary file errors.
 *
 * Usage:
 * ```typescript
 * import { createPGLiteStorage, insertProject } from '@t3x/storage/pglite';
 * const db = await createPGLiteStorage({ dataDir: '.t3x/database' });
 * const project = await insertProject(db, { name: 'My Project' });
 * ```
 */

// Schema (table definitions and types)
export * from './schema';

// PGLite adapter only (no postgres/supabase)
export {
  type PGLiteDB,
  type PGLiteConfig,
  createPGLiteStorage,
  getPGLiteDB,
  closePGLiteStorage,
} from './adapters/pglite';

// Query functions
export * from './queries';

// Type alias for PGLite database
import type { PGLiteDB } from './adapters/pglite';
export type AnyDB = PGLiteDB;
