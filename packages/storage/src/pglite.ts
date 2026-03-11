/**
 * @t3x-dev/storage/pglite
 *
 * PGLite-only entry point for local development.
 * This module does NOT import postgres.js or supabase, so it can be
 * safely bundled by webpack without triggering binary file errors.
 *
 * Usage:
 * ```typescript
 * import { createPGLiteStorage, insertProject } from '@t3x-dev/storage/pglite';
 * const db = await createPGLiteStorage({ dataDir: '.t3x/database' });
 * const project = await insertProject(db, { name: 'My Project' });
 * ```
 */

// PGLite adapter only (no postgres/supabase)
export {
  closePGLiteStorage,
  createPGLiteStorage,
  getPGLiteClient,
  getPGLiteDB,
  type PGLiteConfig,
  type PGLiteDB,
} from './adapters/pglite';
// Backup & verification
export {
  type VerifyChainResult,
  type VerifyResult,
  verifyCommitHash,
  verifyHashChain,
} from './backup';
// Query functions
export * from './queries';
// Schema (table definitions and types)
export * from './schema';
export * from './schema-v4';
export * from './schema-sentence-modifications';

// Type alias for PGLite database
import type { PGLiteDB } from './adapters/pglite';
export type AnyDB = PGLiteDB;
