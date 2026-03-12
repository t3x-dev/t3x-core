/**
 * Auth Utilities
 *
 * Extract author information from request context.
 *
 * Priority (Phase 1.5):
 * 1. Authenticated user (userId in context) → verified author from DB
 * 2. Client headers (X-User-Name / X-User-Email) → only when auth disabled
 * 3. Fallback → local author (OS username)
 */

import {
  type CommitAuthor,
  type CommitAuthorV4,
  getLocalAuthor,
  getWebAuthor,
} from '@t3x-dev/core';
import type { Context } from 'hono';
import { getDB } from './db';

/**
 * Get V3 CommitAuthor from request context.
 *
 * When authenticated (userId in context): uses verified user info, ignores client headers.
 * When not authenticated (AUTH_DISABLED=true): falls back to client headers or OS username.
 */
export async function getAuthorFromContext(c: Context): Promise<CommitAuthor> {
  const userId = c.get('userId') as string | undefined;

  if (userId) {
    // Authenticated: use verified identity from DB
    const { findUserById } = await import('@t3x-dev/storage');
    const db = await getDB();
    const user = await findUserById(db, userId);
    return {
      name: user?.name || 'Anonymous',
      identity: `user:${userId}`,
      verification: 'verified',
    };
  }

  // Not authenticated: fall back to client headers or local author
  const userName = c.req.header('X-User-Name');
  const userEmail = c.req.header('X-User-Email');

  if (userName && userEmail) {
    return getWebAuthor({ name: userName, email: userEmail });
  }

  return getLocalAuthor();
}

/**
 * Get V4 CommitAuthor from request context.
 *
 * When authenticated: returns verified author, ignoring any client-supplied author.
 * When not authenticated: returns the client-supplied author or a default.
 */
export async function getV4AuthorFromContext(
  c: Context,
  clientAuthor?: CommitAuthorV4
): Promise<CommitAuthorV4> {
  const userId = c.get('userId') as string | undefined;

  if (userId) {
    const { findUserById } = await import('@t3x-dev/storage');
    const db = await getDB();
    const user = await findUserById(db, userId);
    return {
      type: 'human',
      id: userId,
      name: user?.name || 'Anonymous',
    };
  }

  // Not authenticated: use client-supplied or default
  return clientAuthor || { type: 'human', name: 'Anonymous' };
}
