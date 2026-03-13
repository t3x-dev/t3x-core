/**
 * Database Adapters
 *
 * Unified interface for different PostgreSQL backends:
 * - PGLite: Local development / in-memory testing (WASM PostgreSQL)
 * - PostgreSQL: Docker/production
 * - Supabase: Cloud deployment
 *
 * NOTE: Embedded PostgreSQL adapter is NOT exported here to avoid pulling
 * platform-specific native binaries into webpack/Turbopack bundles.
 * Import it directly: import { ... } from '@t3x-dev/storage/embedded'
 */

// PGLite (local development / testing)
export {
  closePGLiteStorage,
  createPGLiteStorage,
  getPGLiteDB,
  type PGLiteConfig,
  type PGLiteDB,
} from './pglite';

// PostgreSQL (Docker)
export {
  closePostgresStorage,
  createPostgresStorage,
  getPostgresDB,
  type PostgresConfig,
  type PostgresDB,
} from './postgres';

// Supabase (cloud)
export {
  closeSupabaseStorage,
  createSupabaseStorage,
  getSupabaseDB,
  type SupabaseConfig,
  type SupabaseDB,
} from './supabase';

// Unified type for any database
import type { PGLiteDB } from './pglite';
import type { PostgresDB } from './postgres';
import type { SupabaseDB } from './supabase';

export type AnyDB = PGLiteDB | PostgresDB | SupabaseDB;
