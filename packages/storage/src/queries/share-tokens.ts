/**
 * Share Token Queries
 *
 * CRUD operations for share_tokens table.
 * Share tokens grant read-only access to entities via public URLs.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import type { ShareToken } from '@t3x-dev/core';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type ShareTokenRecord, shareTokens } from '../schema-v4';

// ============================================================
// Constants
// ============================================================

const ID_PREFIX = 'share_';
const ID_RANDOM_LENGTH = 12;
const TOKEN_LENGTH = 32; // URL-safe random token

// ============================================================
// Types
// ============================================================

export interface CreateShareTokenInput {
  entity_type: 'leaf' | 'commit';
  entity_id: string;
  project_id: string;
  created_by?: string;
  expires_at?: Date;
}

// ============================================================
// Internal Helpers
// ============================================================

function generateShareTokenId(): string {
  return `${ID_PREFIX}${randomUUID().replace(/-/g, '').slice(0, ID_RANDOM_LENGTH)}`;
}

function generateToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('base64url');
}

function rowToShareToken(row: ShareTokenRecord): ShareToken {
  return {
    id: row.id,
    token: row.token,
    entity_type: row.entityType as 'leaf' | 'commit',
    entity_id: row.entityId,
    project_id: row.projectId,
    created_by: row.createdBy ?? null,
    created_at: row.createdAt.toISOString(),
    expires_at: row.expiresAt?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
  };
}

// ============================================================
// Query Functions
// ============================================================

/**
 * Create a new share token for an entity.
 */
export async function createShareToken(
  db: AnyDB,
  input: CreateShareTokenInput
): Promise<ShareToken> {
  const id = generateShareTokenId();
  const token = generateToken();
  const now = new Date();

  const [row] = await db
    .insert(shareTokens)
    .values({
      id,
      token,
      entityType: input.entity_type,
      entityId: input.entity_id,
      projectId: input.project_id,
      createdBy: input.created_by ?? null,
      createdAt: now,
      expiresAt: input.expires_at ?? null,
      revokedAt: null,
    })
    .returning();

  return rowToShareToken(row);
}

/**
 * Find an active (non-revoked, non-expired) share token by its URL token.
 */
export async function findShareTokenByToken(db: AnyDB, token: string): Promise<ShareToken | null> {
  const [row] = await db
    .select()
    .from(shareTokens)
    .where(and(eq(shareTokens.token, token), isNull(shareTokens.revokedAt)))
    .limit(1);

  if (!row) return null;

  // Check expiration
  if (row.expiresAt && row.expiresAt < new Date()) {
    return null;
  }

  return rowToShareToken(row);
}

/**
 * Find share tokens for a specific entity.
 *
 * Fix 16: Only returns tokens that are active (not revoked) and not yet
 * expired. The expiration check is pushed into the WHERE clause so the
 * database filters expired tokens rather than returning them to JS.
 */
export async function findShareTokensByEntity(
  db: AnyDB,
  entityType: string,
  entityId: string
): Promise<ShareToken[]> {
  const now = new Date();

  const rows = await db
    .select()
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.entityType, entityType),
        eq(shareTokens.entityId, entityId),
        isNull(shareTokens.revokedAt),
        // Keep rows where expiresAt is null (never expires) OR still in the future
        or(isNull(shareTokens.expiresAt), gt(shareTokens.expiresAt, now))
      )
    );

  return rows.map(rowToShareToken);
}

/**
 * Revoke a share token (soft-delete).
 */
export async function revokeShareToken(db: AnyDB, id: string): Promise<ShareToken | null> {
  const now = new Date();

  const [updated] = await db
    .update(shareTokens)
    .set({ revokedAt: now })
    .where(eq(shareTokens.id, id))
    .returning();

  return updated ? rowToShareToken(updated) : null;
}

/**
 * Find a share token by ID.
 */
export async function findShareTokenById(db: AnyDB, id: string): Promise<ShareToken | null> {
  const [row] = await db.select().from(shareTokens).where(eq(shareTokens.id, id)).limit(1);

  return row ? rowToShareToken(row) : null;
}
