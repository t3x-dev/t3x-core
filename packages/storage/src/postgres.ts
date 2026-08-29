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
 * import { createPostgresRuntimeStorage, insertProject } from '@t3x-dev/storage/postgres';
 * const db = await createPostgresRuntimeStorage({ connectionString: process.env.DATABASE_URL });
 * const project = await insertProject(db, { name: 'My Project' });
 * ```
 */

// PostgreSQL adapter only
export {
  closePostgresStorage,
  createPostgresBootstrapStorage,
  createPostgresRuntimeStorage,
  createPostgresStorage,
  getPostgresDB,
  inspectPostgresSchema,
  migratePostgresStorage,
  POSTGRES_SCHEMA_VERSION,
  type PostgresConfig,
  type PostgresDB,
  type PostgresSchemaMetadata,
  type PostgresSchemaStatus,
  PostgresSchemaVersionError,
  type PostgresSchemaVersionErrorReason,
} from './adapters/postgres';
// Query functions
export * from './queries';
// Schema (table definitions and types)
export * from './schema';
export * from './schema-trees';

// Type alias for PostgreSQL database
import type { PostgresDB } from './adapters/postgres';
export type AnyDB = PostgresDB;
