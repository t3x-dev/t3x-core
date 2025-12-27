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
