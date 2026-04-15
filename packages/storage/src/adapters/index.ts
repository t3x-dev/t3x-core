/**
 * Database Adapters
 *
 * Unified interface for different PostgreSQL backends:
 * - Embedded PostgreSQL: Local development (real PostgreSQL binary)
 * - PostgreSQL: Docker/production (postgres.js)
 * - Supabase: Cloud deployment
 *
 * NOTE: Embedded PostgreSQL adapter is NOT exported here to avoid pulling
 * platform-specific native binaries into webpack/Turbopack bundles.
 * Import it directly: import { ... } from '@t3x-dev/storage/embedded'
 */

// PostgreSQL (Docker)
export {
  closePostgresStorage,
  createPostgresStorage,
  getPostgresClient,
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
import type { PostgresDB } from './postgres';
import type { SupabaseDB } from './supabase';

export type AnyDB = PostgresDB | SupabaseDB;
