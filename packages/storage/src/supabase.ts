/**
 * @t3x/storage/supabase
 *
 * Supabase entry point for cloud deployments.
 * Uses postgres.js driver with Supabase connection pooling.
 *
 * WARNING: This module should NOT be bundled with webpack/Next.js.
 * Use @t3x/storage/pglite for bundled environments.
 *
 * Usage:
 * ```typescript
 * import { createSupabaseStorage, insertProject } from '@t3x/storage/supabase';
 * const db = await createSupabaseStorage({ connectionString: process.env.SUPABASE_URL });
 * const project = await insertProject(db, { name: 'My Project' });
 * ```
 */

// Supabase adapter only
export {
  closeSupabaseStorage,
  createSupabaseStorage,
  getSupabaseDB,
  type SupabaseConfig,
  type SupabaseDB,
} from './adapters/supabase';
// Query functions
export * from './queries';
// Schema (table definitions and types)
export * from './schema';
export * from './schema-v4';

// Type alias for Supabase database
import type { SupabaseDB } from './adapters/supabase';
export type AnyDB = SupabaseDB;
