/**
 * Global Settings Queries
 *
 * CRUD operations for the global_settings key-value store.
 * Used for provider registry config, feature flags, etc.
 */

import { eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { globalSettings } from '../schema';

/**
 * Get a global setting by key.
 * Returns the parsed JSON value, or null if not found.
 */
export async function getGlobalSetting<T = unknown>(db: AnyDB, key: string): Promise<T | null> {
  const rows = await db.select().from(globalSettings).where(eq(globalSettings.key, key)).limit(1);
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch {
    return rows[0].value as unknown as T;
  }
}

/**
 * Set a global setting. Upserts (insert or update) the key-value pair.
 */
export async function setGlobalSetting(db: AnyDB, key: string, value: unknown): Promise<void> {
  const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
  const now = new Date();

  // Use INSERT ... ON CONFLICT (upsert) for atomicity
  await db
    .insert(globalSettings)
    .values({ key, value: jsonValue, updatedAt: now })
    .onConflictDoUpdate({
      target: globalSettings.key,
      set: { value: jsonValue, updatedAt: now },
    });
}

/**
 * Delete a global setting by key.
 */
export async function deleteGlobalSetting(db: AnyDB, key: string): Promise<void> {
  await db.delete(globalSettings).where(eq(globalSettings.key, key));
}

/**
 * List all global settings.
 */
export async function listGlobalSettings(
  db: AnyDB
): Promise<Array<{ key: string; value: unknown; updatedAt: Date }>> {
  const rows = await db.select().from(globalSettings);
  return rows.map((row) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      parsed = row.value;
    }
    return { key: row.key, value: parsed, updatedAt: row.updatedAt };
  });
}
