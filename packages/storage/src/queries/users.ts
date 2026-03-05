/**
 * Users Queries
 *
 * CRUD operations for users table using Drizzle ORM.
 * Users are created via OAuth login (e.g., GitHub).
 *
 * In AUTH_DISABLED mode, no users exist.
 */

import { randomUUID } from 'node:crypto';
import type { User } from '@t3x/core';
import { and, eq, sql } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type UserRecord, users } from '../schema-v4';

// ============================================================
// Constants
// ============================================================

const ID_PREFIX = 'user_';
const ID_RANDOM_LENGTH = 12;

// ============================================================
// Types
// ============================================================

export interface CreateUserInput {
  /** OAuth provider name (e.g., 'github') */
  provider: string;
  /** User ID from the OAuth provider */
  provider_id: string;
  /** Email address (may be null) */
  email?: string | null;
  /** Display name */
  name?: string | null;
  /** Avatar URL */
  avatar_url?: string | null;
}

// ============================================================
// Internal Helpers
// ============================================================

/** Generate a user_ prefixed ID */
function generateUserId(): string {
  return `${ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, ID_RANDOM_LENGTH)}`;
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new user.
 *
 * Called during OAuth login when the user doesn't exist yet.
 *
 * @returns The created User record
 */
export async function createUser(db: AnyDB, input: CreateUserInput): Promise<User> {
  const id = generateUserId();
  const now = new Date();

  const [row] = await db
    .insert(users)
    .values({
      id,
      provider: input.provider,
      providerId: input.provider_id,
      email: input.email ?? null,
      name: input.name ?? null,
      avatarUrl: input.avatar_url ?? null,
      createdAt: now,
    })
    .returning();

  return rowToUser(row);
}

/**
 * Find a user by OAuth provider and provider ID.
 *
 * Used during login to check if the user already exists.
 *
 * @returns The User, or null if not found
 */
export async function findUserByProvider(
  db: AnyDB,
  provider: string,
  providerId: string
): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.provider, provider), eq(users.providerId, providerId)))
    .limit(1);

  return row ? rowToUser(row) : null;
}

/**
 * Find a user by ID.
 *
 * @returns The User, or null if not found
 */
export async function findUserById(db: AnyDB, id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return row ? rowToUser(row) : null;
}

/**
 * Find or create a user by OAuth provider (upsert pattern).
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE to avoid TOCTOU race conditions
 * when concurrent OAuth login requests arrive for the same new user.
 * Profile fields (name, email, avatar) are updated on conflict.
 *
 * @returns The User record
 */
export async function findOrCreateUser(db: AnyDB, input: CreateUserInput): Promise<User> {
  const id = generateUserId();
  const now = new Date();

  const [row] = await db
    .insert(users)
    .values({
      id,
      provider: input.provider,
      providerId: input.provider_id,
      email: input.email ?? null,
      name: input.name ?? null,
      avatarUrl: input.avatar_url ?? null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [users.provider, users.providerId],
      set: {
        name: sql`COALESCE(${input.name ?? null}, ${users.name})`,
        email: sql`COALESCE(${input.email ?? null}, ${users.email})`,
        avatarUrl: sql`COALESCE(${input.avatar_url ?? null}, ${users.avatarUrl})`,
      },
    })
    .returning();

  return rowToUser(row);
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert database row to User type (snake_case API format).
 */
function rowToUser(row: UserRecord): User {
  return {
    id: row.id,
    provider: row.provider,
    provider_id: row.providerId,
    email: row.email ?? null,
    name: row.name ?? null,
    avatar_url: row.avatarUrl ?? null,
    created_at: row.createdAt.toISOString(),
  };
}
