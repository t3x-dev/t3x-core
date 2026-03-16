/**
 * @t3x-dev/storage/postgres
 *
 * PostgreSQL entry point for Docker/production deployments.
 * Uses postgres.js driver which has binary dependencies.
 *
 * WARNING: This module should NOT be bundled with webpack/Next.js.
 * Use @t3x-dev/storage/embedded for local development environments.
 *
 * Usage:
 * ```typescript
 * import { createPostgresStorage, insertProject } from '@t3x-dev/storage/postgres';
 * const db = await createPostgresStorage({ connectionString: process.env.DATABASE_URL });
 * const project = await insertProject(db, { name: 'My Project' });
 * ```
 */

// PostgreSQL adapter only
export {
  closePostgresStorage,
  createPostgresStorage,
  getPostgresDB,
  type PostgresConfig,
  type PostgresDB,
} from './adapters/postgres';
// Query functions
export * from './queries';
// Schema (table definitions and types)
export * from './schema';
export * from './schema-v4';

// Type alias for PostgreSQL database
import type { PostgresDB } from './adapters/postgres';
export type AnyDB = PostgresDB;
