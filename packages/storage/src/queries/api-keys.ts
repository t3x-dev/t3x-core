/**
 * API Keys Queries
 *
 * CRUD operations for api_keys table using Drizzle ORM.
 * API keys authenticate requests to the T3X API.
 *
 * Security model:
 * - Full key value is returned only once at creation
 * - We store SHA-256 hash for verification and a short prefix for display
 * - Revocation is a soft-delete (sets revoked_at)
 *
 * @see packages/core/src/types/v4/index.ts – ApiKey interface
 */

import { createHash, randomUUID } from 'node:crypto';
import type { ApiKey } from '@t3x/core';
import { and, eq, isNull } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type ApiKeyRecord, apiKeys } from '../schema-v4';

// ============================================================
// Constants
// ============================================================

const ID_PREFIX = 'ak_';
const ID_RANDOM_LENGTH = 12;

// ============================================================
// Types
// ============================================================

export interface CreateApiKeyInput {
  /** Human-readable label */
  name: string;
  /** Project scope (undefined = user-level key) */
  projectId?: string;
  /** Owner user ID (undefined = legacy key in AUTH_DISABLED mode) */
  userId?: string;
  /** The raw key value (e.g. "t3xk_...") — caller generates this */
  keyValue: string;
}

// ============================================================
// Internal Helpers
// ============================================================

/** Generate an ak_ prefixed ID */
function generateApiKeyId(): string {
  return `${ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, ID_RANDOM_LENGTH)}`;
}

/** SHA-256 hash a raw key value */
function hashKeyValue(keyValue: string): string {
  return createHash('sha256').update(keyValue, 'utf8').digest('hex');
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new API key.
 *
 * The caller provides the raw key value; we store the SHA-256 hash
 * and the first 8 characters as a display prefix.
 *
 * @returns The created ApiKey record (does NOT include the raw key value)
 */
export async function createApiKey(db: AnyDB, input: CreateApiKeyInput): Promise<ApiKey> {
  const id = generateApiKeyId();
  const keyHash = hashKeyValue(input.keyValue);
  const keyPrefix = input.keyValue.slice(0, 8);
  const now = new Date();

  const [row] = await db
    .insert(apiKeys)
    .values({
      id,
      keyPrefix,
      keyHash,
      name: input.name,
      projectId: input.projectId ?? null,
      userId: input.userId ?? null,
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
    })
    .returning();

  return rowToApiKey(row);
}

/**
 * Find an active (non-revoked) API key by name.
 *
 * Useful for checking if a session key already exists for a user
 * before creating a new one.
 *
 * @returns The matching ApiKey, or null if no active key with that name exists
 */
export async function findActiveApiKeyByName(
  db: AnyDB,
  name: string
): Promise<ApiKey | null> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.name, name), isNull(apiKeys.revokedAt)))
    .limit(1);

  return row ? rowToApiKey(row) : null;
}

/**
 * Find an active (non-revoked) API key by its raw value.
 *
 * Hashes the provided value and looks up by key_hash.
 * Returns null if no match or if the key has been revoked.
 */
export async function findApiKeyByValue(db: AnyDB, keyValue: string): Promise<ApiKey | null> {
  const keyHash = hashKeyValue(keyValue);

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  return row ? rowToApiKey(row) : null;
}

/**
 * Find an API key by its ID.
 *
 * Returns the key regardless of revocation status.
 */
export async function findApiKeyById(db: AnyDB, id: string): Promise<ApiKey | null> {
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);

  return row ? rowToApiKey(row) : null;
}

/**
 * List all non-revoked API keys, optionally filtered by project.
 *
 * @param options.projectId - If provided, only return keys scoped to this project
 */
export async function listApiKeys(
  db: AnyDB,
  options: { projectId?: string } = {}
): Promise<ApiKey[]> {
  const conditions = [isNull(apiKeys.revokedAt)];

  if (options.projectId) {
    conditions.push(eq(apiKeys.projectId, options.projectId));
  }

  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(...conditions));

  return rows.map(rowToApiKey);
}

/**
 * Revoke an API key (soft-delete).
 *
 * Sets revoked_at to now. The key will no longer be returned by
 * findApiKeyByValue or listApiKeys.
 *
 * @returns The revoked ApiKey, or null if not found
 */
export async function revokeApiKey(db: AnyDB, id: string): Promise<ApiKey | null> {
  const now = new Date();

  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: now })
    .where(eq(apiKeys.id, id))
    .returning();

  return updated ? rowToApiKey(updated) : null;
}

/**
 * Touch last_used_at timestamp.
 *
 * Called on every successful authentication to track key usage.
 */
export async function touchLastUsed(db: AnyDB, id: string): Promise<void> {
  const now = new Date();

  await db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, id));
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to ApiKey type (snake_case API format).
 */
function rowToApiKey(row: ApiKeyRecord): ApiKey {
  return {
    id: row.id,
    key_prefix: row.keyPrefix,
    key_hash: row.keyHash,
    name: row.name,
    project_id: row.projectId ?? null,
    user_id: row.userId ?? null,
    created_at: row.createdAt.toISOString(),
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
  };
}
