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
 * @see packages/core/src/types/index.ts – ApiKey interface
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  type ApiKey,
  type ApiKeyPrincipalKind,
  type CredentialKind,
  isApiKeyPrincipalKind,
  isCredentialKind,
  isTransitionScope,
  type TransitionScope,
} from '@t3x-dev/core';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { projects } from '../schema';
import { type ApiKeyRecord, apiKeys, projectGrants } from '../schema-trees';

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
  /** Namespace scope for a human Credential. Mutually exclusive with projectId. */
  namespaceId?: string;
  /** Owner user ID (undefined = legacy key in AUTH_DISABLED mode) */
  userId?: string;
  /** Trusted principal represented by the credential. Defaults to human. */
  principalKind?: ApiKeyPrincipalKind;
  /** Authenticator/purpose kind. Defaults from principalKind for compatibility. */
  credentialKind?: CredentialKind;
  /** Human delegator proven by the server-side caller context. */
  delegatorUserId?: string;
  /** Explicit Transition capabilities. Defaults to none. */
  transitionScopes?: readonly TransitionScope[];
  /** Optional hard expiry. */
  expiresAt?: Date;
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

function parseStoredTransitionScopes(value: unknown): TransitionScope[] {
  if (!Array.isArray(value) || !value.every((scope) => typeof scope === 'string')) {
    throw new TypeError('Stored API key Transition scopes must be a string array');
  }
  if (!value.every(isTransitionScope)) {
    throw new TypeError('Stored API key contains an unknown Transition scope');
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError('Stored API key contains duplicate Transition scopes');
  }
  return [...value].sort();
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
  const principalKind = input.principalKind ?? 'human';
  if (!isApiKeyPrincipalKind(principalKind)) {
    throw new TypeError(`Unknown API key principal kind: ${principalKind}`);
  }
  const transitionScopes = [...new Set(input.transitionScopes ?? [])].sort();
  const credentialKind =
    input.credentialKind ?? (principalKind === 'human' ? 'api_key' : principalKind);
  if (!isCredentialKind(credentialKind)) {
    throw new TypeError(`Unknown Credential kind: ${credentialKind}`);
  }
  if (!transitionScopes.every(isTransitionScope)) {
    throw new TypeError('API key contains an unknown Transition scope');
  }
  if (input.projectId !== undefined && input.namespaceId !== undefined) {
    throw new TypeError('Credential must have exactly one resource scope');
  }
  if (principalKind !== 'human' && input.projectId === undefined) {
    throw new TypeError('Agent and service credentials must be project-scoped');
  }
  if (input.expiresAt && input.expiresAt <= now) {
    throw new TypeError('Credential expiry must be in the future');
  }
  const delegatorUserId =
    principalKind === 'human' ? null : (input.delegatorUserId ?? input.userId ?? null);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(apiKeys)
      .values({
        id,
        keyPrefix,
        keyHash,
        name: input.name,
        projectId: input.projectId ?? null,
        namespaceId: input.namespaceId ?? null,
        userId: input.userId ?? null,
        principalKind,
        credentialKind,
        delegatorUserId,
        transitionScopes,
        createdAt: now,
        lastUsedAt: null,
        expiresAt: input.expiresAt ?? null,
        revokedAt: null,
        revocationReason: null,
      })
      .returning();

    if (principalKind !== 'human' && input.projectId) {
      const [project] = await tx
        .select({ namespaceId: projects.namespaceId })
        .from(projects)
        .where(eq(projects.projectId, input.projectId))
        .limit(1);
      if (!project?.namespaceId) {
        throw new TypeError('Machine credentials require a canonically namespaced project');
      }
      await tx.insert(projectGrants).values({
        grantId: `grant_${id}`,
        projectId: input.projectId,
        namespaceId: project.namespaceId,
        principalKind,
        principalId: id,
        role: 'editor',
        status: 'active',
      });
    }

    return rowToApiKey(row);
  });
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
  name: string,
  now = new Date()
): Promise<ApiKey | null> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.name, name),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))
      )
    )
    .limit(1);

  return row ? rowToApiKey(row) : null;
}

/**
 * Find an active (non-revoked) API key by its raw value.
 *
 * Hashes the provided value and looks up by key_hash.
 * Returns null if no match or if the key has been revoked.
 */
export async function findApiKeyByValue(
  db: AnyDB,
  keyValue: string,
  now = new Date()
): Promise<ApiKey | null> {
  const keyHash = hashKeyValue(keyValue);

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))
      )
    )
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
 * List all non-revoked API keys, optionally filtered by project and/or user.
 *
 * @param options.projectId - If provided, only return keys scoped to this project
 * @param options.userId - If provided, only return keys owned by this user
 */
export async function listApiKeys(
  db: AnyDB,
  options: { projectId?: string; namespaceId?: string; userId?: string } = {}
): Promise<ApiKey[]> {
  const conditions = [isNull(apiKeys.revokedAt)];

  if (options.projectId) {
    conditions.push(eq(apiKeys.projectId, options.projectId));
  }

  if (options.namespaceId) {
    conditions.push(eq(apiKeys.namespaceId, options.namespaceId));
  }

  if (options.userId) {
    conditions.push(eq(apiKeys.userId, options.userId));
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
export async function revokeApiKey(
  db: AnyDB,
  id: string,
  revocationReason?: string
): Promise<ApiKey | null> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    if (!existing) return null;
    if (existing.revokedAt) return rowToApiKey(existing);

    const [updated] = await tx
      .update(apiKeys)
      .set({
        revokedAt: now,
        revocationReason: revocationReason?.trim() || null,
      })
      .where(eq(apiKeys.id, id))
      .returning();

    if (updated && updated.principalKind !== 'human' && updated.projectId) {
      await tx
        .update(projectGrants)
        .set({ status: 'revoked', revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(projectGrants.projectId, updated.projectId),
            eq(projectGrants.principalKind, updated.principalKind),
            eq(projectGrants.principalId, updated.id)
          )
        );
    }

    return updated ? rowToApiKey(updated) : null;
  });
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
    namespace_id: row.namespaceId ?? null,
    user_id: row.userId ?? null,
    principal_kind: isApiKeyPrincipalKind(row.principalKind) ? row.principalKind : 'human',
    credential_kind: isCredentialKind(row.credentialKind) ? row.credentialKind : 'api_key',
    delegator_user_id: row.delegatorUserId ?? null,
    transition_scopes: parseStoredTransitionScopes(row.transitionScopes),
    expires_at: row.expiresAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
    revocation_reason: row.revocationReason ?? null,
  };
}
