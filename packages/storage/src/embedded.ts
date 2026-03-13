/**
 * @t3x-dev/storage/embedded
 *
 * Embedded PostgreSQL entry point for local development.
 * This module does NOT import postgres.js or supabase directly,
 * so it can be safely referenced by Next.js webpack without
 * triggering binary file errors.
 *
 * Usage:
 * ```typescript
 * import { createEmbeddedStorage } from '@t3x-dev/storage/embedded';
 * const db = await createEmbeddedStorage({ dataDir: '.t3x/pg-data' });
 * ```
 */

// Embedded PostgreSQL adapter only
export {
  closeEmbeddedStorage,
  createEmbeddedStorage,
  getEmbeddedRawClient,
  type EmbeddedConfig,
} from './adapters/embedded';

// Query functions (driver-agnostic, work with any AnyDB)
export * from './queries';
// Schema (table definitions and types)
export * from './schema';
export * from './schema-v4';
// Backup & verification
export {
  type VerifyChainResult,
  type VerifyResult,
  verifyCommitHash,
  verifyHashChain,
} from './backup';

// Type alias — embedded adapter returns PostgresDB
import type { PostgresDB } from './adapters/postgres';
export type AnyDB = PostgresDB;
