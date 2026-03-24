/**
 * Users & Accounts Queries
 *
 * CRUD operations for users + accounts tables using Drizzle ORM.
 *
 * Multi-provider auth with email-based auto-linking:
 * 1. Look up account by (provider, provider_account_id)
 * 2. If email is provided and verified, look up user by email (auto-link)
 * 3. Otherwise, create new user + account
 */

import { randomUUID } from 'node:crypto';
import type { Account, User } from '@t3x-dev/core';
import { and, eq } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type AccountRecord, accounts, type UserRecord, users } from '../schema-frames';

// ============================================================
// Constants
// ============================================================

const USER_ID_PREFIX = 'user_';
const ACCT_ID_PREFIX = 'acct_';
const ID_RANDOM_LENGTH = 12;

// ============================================================
// Types
// ============================================================

export interface CreateUserInput {
  /** OAuth provider name (e.g., 'github', 'google') */
  provider: string;
  /** User ID from the OAuth provider */
  provider_id: string;
  /** Email address (may be null) */
  email?: string | null;
  /** Whether the provider has verified the email */
  email_verified?: boolean;
  /** Display name */
  name?: string | null;
  /** Avatar URL */
  avatar_url?: string | null;
}

export interface CreateLocalUserInput {
  /** Username for local auth */
  username: string;
  /** Bcrypt hash of the password */
  passwordHash: string;
  /** Display name (optional, defaults to username) */
  name?: string;
}

// ============================================================
// Internal Helpers
// ============================================================

/** Generate a user_ prefixed ID */
function generateUserId(): string {
  return `${USER_ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, ID_RANDOM_LENGTH)}`;
}

/** Generate an acct_ prefixed ID */
function generateAccountId(): string {
  return `${ACCT_ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, ID_RANDOM_LENGTH)}`;
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new user record (no account).
 */
export async function createUser(
  db: AnyDB,
  input: {
    email?: string | null;
    email_verified?: boolean;
    name?: string | null;
    avatar_url?: string | null;
  }
): Promise<User> {
  const id = generateUserId();

  const [row] = await db
    .insert(users)
    .values({
      id,
      email: input.email ?? null,
      emailVerified: input.email_verified ?? false,
      name: input.name ?? null,
      avatarUrl: input.avatar_url ?? null,
    })
    .returning();

  return rowToUser(row);
}

/**
 * Create a new account record linking a provider to a user.
 */
export async function createAccount(
  db: AnyDB,
  input: { user_id: string; provider: string; provider_account_id: string }
): Promise<Account> {
  const id = generateAccountId();

  const [row] = await db
    .insert(accounts)
    .values({
      id,
      userId: input.user_id,
      provider: input.provider,
      providerAccountId: input.provider_account_id,
    })
    .returning();

  return rowToAccount(row);
}

/**
 * Find an account by provider + provider account ID.
 */
export async function findAccountByProvider(
  db: AnyDB,
  provider: string,
  providerAccountId: string
): Promise<Account | null> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)))
    .limit(1);

  return row ? rowToAccount(row) : null;
}

/**
 * Find a user by email.
 */
export async function findUserByEmail(db: AnyDB, email: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  return row ? rowToUser(row) : null;
}

/**
 * Find a user by ID.
 */
export async function findUserById(db: AnyDB, id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return row ? rowToUser(row) : null;
}

/**
 * List all accounts linked to a user.
 */
export async function findAccountsByUser(db: AnyDB, userId: string): Promise<Account[]> {
  const rows = await db.select().from(accounts).where(eq(accounts.userId, userId));

  return rows.map(rowToAccount);
}

/**
 * Find or create a user by OAuth provider (3-step algorithm).
 *
 * Step 1: Look up account by (provider, provider_account_id)
 *   → Found: return existing user (update profile if changed)
 *
 * Step 2: If email is provided and email_verified:
 *   Look up user by email (email-based auto-linking)
 *   → Found: create new account linked to existing user, return user
 *
 * Step 3: No match: create new user + create account record
 */
export async function findOrCreateUser(db: AnyDB, input: CreateUserInput): Promise<User> {
  // Step 1: Look up by provider account
  const existingAccount = await findAccountByProvider(db, input.provider, input.provider_id);

  if (existingAccount) {
    // Account exists — find and optionally update user profile
    const user = await findUserById(db, existingAccount.user_id);
    if (!user) {
      // Orphan account — shouldn't happen, but handle gracefully
      throw new Error(
        `Account ${existingAccount.id} references missing user ${existingAccount.user_id}`
      );
    }

    // Update profile fields if they changed
    const updates: Partial<{
      name: string | null;
      email: string | null;
      avatarUrl: string | null;
      emailVerified: boolean;
    }> = {};
    if (input.name !== undefined && input.name !== user.name) updates.name = input.name;
    if (input.email !== undefined && input.email !== user.email) updates.email = input.email;
    if (input.avatar_url !== undefined && input.avatar_url !== user.avatar_url)
      updates.avatarUrl = input.avatar_url;
    // Upgrade email_verified to true if provider confirms (never downgrade)
    if (input.email_verified && !user.email_verified) updates.emailVerified = true;

    if (Object.keys(updates).length > 0) {
      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, user.id))
        .returning();
      return rowToUser(updated);
    }

    return user;
  }

  // Step 2: Email-based auto-linking
  if (input.email && input.email_verified) {
    const existingUser = await findUserByEmail(db, input.email);

    if (existingUser) {
      // Link new provider account to existing user
      await createAccount(db, {
        user_id: existingUser.id,
        provider: input.provider,
        provider_account_id: input.provider_id,
      });

      // Update profile if needed (avatar, name)
      const updates: Partial<{
        name: string | null;
        avatarUrl: string | null;
        emailVerified: boolean;
      }> = {};
      if (input.name && !existingUser.name) updates.name = input.name;
      if (input.avatar_url && !existingUser.avatar_url) updates.avatarUrl = input.avatar_url;
      if (!existingUser.email_verified) updates.emailVerified = true;

      if (Object.keys(updates).length > 0) {
        const [updated] = await db
          .update(users)
          .set(updates)
          .where(eq(users.id, existingUser.id))
          .returning();
        return rowToUser(updated);
      }

      return existingUser;
    }
  }

  // Step 3: Create new user + account
  const newUser = await createUser(db, {
    email: input.email,
    email_verified: input.email_verified,
    name: input.name,
    avatar_url: input.avatar_url,
  });

  await createAccount(db, {
    user_id: newUser.id,
    provider: input.provider,
    provider_account_id: input.provider_id,
  });

  return newUser;
}

/**
 * Update a user's profile fields (name, avatar_url).
 *
 * Only mutable fields are accepted. Email is bound to
 * OAuth provider and cannot be changed here.
 * Returns null if user not found.
 */
export async function updateUser(
  db: AnyDB,
  userId: string,
  data: { name?: string; avatar_url?: string }
): Promise<User | null> {
  const updates: Partial<{ name: string; avatarUrl: string }> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.avatar_url !== undefined) updates.avatarUrl = data.avatar_url;

  if (Object.keys(updates).length === 0) return findUserById(db, userId);

  const result = await db.update(users).set(updates).where(eq(users.id, userId)).returning();

  return result[0] ? rowToUser(result[0]) : null;
}

// ============================================================
// Local Auth Query Functions
// ============================================================

/**
 * Find a user by username (for local auth login).
 *
 * Returns the raw UserRecord (includes passwordHash) so the API layer
 * can verify the password. Returns null if no user with that username.
 */
export async function findUserByUsername(db: AnyDB, username: string): Promise<UserRecord | null> {
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  return row ?? null;
}

/**
 * Create a new local user (username + password, no OAuth).
 *
 * Used by the open-source register endpoint.
 * Returns the User type (no passwordHash exposed).
 */
export async function createLocalUser(db: AnyDB, input: CreateLocalUserInput): Promise<User> {
  const id = generateUserId();

  const [row] = await db
    .insert(users)
    .values({
      id,
      username: input.username,
      passwordHash: input.passwordHash,
      name: input.name ?? input.username,
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
    email: row.email ?? null,
    email_verified: row.emailVerified,
    name: row.name ?? null,
    avatar_url: row.avatarUrl ?? null,
    username: row.username ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Convert database row to Account type (snake_case API format).
 */
function rowToAccount(row: AccountRecord): Account {
  return {
    id: row.id,
    user_id: row.userId,
    provider: row.provider,
    provider_account_id: row.providerAccountId,
    created_at: row.createdAt.toISOString(),
  };
}
