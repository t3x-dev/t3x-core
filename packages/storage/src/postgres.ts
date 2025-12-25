/**
 * @t3x/storage/postgres
 *
 * PostgreSQL entry point for Docker/production deployments.
 * Uses postgres.js driver which has binary dependencies.
 *
 * WARNING: This module should NOT be bundled with webpack/Next.js.
 * Use @t3x/storage/pglite for bundled environments.
 *
 * Usage:
 * ```typescript
 * import { createPostgresStorage, insertProject } from '@t3x/storage/postgres';
 * const db = await createPostgresStorage({ connectionString: process.env.DATABASE_URL });
 * const project = await insertProject(db, { name: 'My Project' });
 * ```
 */

// Schema (table definitions and types)
export * from './schema';

// PostgreSQL adapter only
export {
  type PostgresDB,
  type PostgresConfig,
  createPostgresStorage,
  getPostgresDB,
  closePostgresStorage,
} from './adapters/postgres';

// Query functions
export * from './queries';

// Type alias for PostgreSQL database
import type { PostgresDB } from './adapters/postgres';
export type AnyDB = PostgresDB;
