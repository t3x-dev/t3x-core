/**
 * Supabase Adapter
 *
 * Cloud PostgreSQL via Supabase.
 * Uses postgres.js with Supabase connection pooling.
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';

export type SupabaseDB = PostgresJsDatabase<typeof schema>;

export interface SupabaseConfig {
  /** Supabase project connection string */
  connectionString: string;
}

let client: postgres.Sql | null = null;
let db: SupabaseDB | null = null;

/**
 * Create Supabase storage for cloud deployment
 *
 * Note: When using Supabase with Transaction pool mode,
 * prepared statements are disabled automatically.
 */
export async function createSupabaseStorage(config: SupabaseConfig): Promise<SupabaseDB> {
  // Create postgres.js client with Supabase-specific settings
  client = postgres(config.connectionString, {
    // Disable prepared statements for Transaction pool mode
    prepare: false,
  });

  // Create Drizzle instance
  db = drizzle(client, { schema });

  return db;
}

/**
 * Get the current database instance
 */
export function getSupabaseDB(): SupabaseDB {
  if (!db) {
    throw new Error('Supabase database not initialized. Call createSupabaseStorage() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export async function closeSupabaseStorage(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}
