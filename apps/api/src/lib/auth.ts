/**
 * Auth Utilities
 *
 * Extract author information from request context.
 */

import { type CommitAuthor, getLocalAuthor, getWebAuthor } from '@t3x/core';
import type { Context } from 'hono';

/**
 * Get author information from request context.
 * 从请求上下文获取作者信息
 *
 * Priority:
 * 1. If X-User-Name and X-User-Email headers exist, use getWebAuthor (verified)
 * 2. Otherwise, use getLocalAuthor (none)
 *
 * @param c - Hono context
 * @returns CommitAuthor
 */
export function getAuthorFromContext(c: Context): CommitAuthor {
  const userName = c.req.header('X-User-Name');
  const userEmail = c.req.header('X-User-Email');

  // If authentication headers exist, use verified author
  if (userName && userEmail) {
    return getWebAuthor({
      name: userName,
      email: userEmail,
    });
  }

  // Default to local author (no authentication)
  return getLocalAuthor();
}
