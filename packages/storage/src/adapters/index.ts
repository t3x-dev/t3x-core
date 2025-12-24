/**
 * Database Adapters
 *
 * Unified interface for different PostgreSQL backends:
 * - PGLite: Local development (WASM PostgreSQL)
 * - PostgreSQL: Docker/production
 * - Supabase: Cloud deployment
 */

// PGLite (local)
export {
  type PGLiteDB,
  type PGLiteConfig,
  createPGLiteStorage,
  getPGLiteDB,
  closePGLiteStorage,
} from './pglite';

// PostgreSQL (Docker)
export {
  type PostgresDB,
  type PostgresConfig,
  createPostgresStorage,
  getPostgresDB,
  closePostgresStorage,
} from './postgres';

// Supabase (cloud)
export {
  type SupabaseDB,
  type SupabaseConfig,
  createSupabaseStorage,
  getSupabaseDB,
  closeSupabaseStorage,
} from './supabase';

// Unified type for any database
import type { PGLiteDB } from './pglite';
import type { PostgresDB } from './postgres';
import type { SupabaseDB } from './supabase';

export type AnyDB = PGLiteDB | PostgresDB | SupabaseDB;
