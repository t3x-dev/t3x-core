/**
 * Auth Utilities
 *
 * Extract author information from request context.
 *
 * Priority (Phase 1.5):
 * 1. Authenticated user (userId in context) → verified author from DB
 * 2. Client headers (X-User-Name / X-User-Email) → only when auth disabled
 * 3. Fallback → default anonymous author
 */

import type { CommitAuthor } from '@t3x-dev/core';
import type { Context } from 'hono';
import { getDB } from './db';

/**
 * Get V4 CommitAuthor from request context.
 *
 * When authenticated: returns verified author, ignoring any client-supplied author.
 * When not authenticated: returns the client-supplied author or a default.
 */
export async function getV4AuthorFromContext(
  c: Context,
  clientAuthor?: CommitAuthor
): Promise<CommitAuthor> {
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
