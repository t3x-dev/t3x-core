/**
 * L2 — builds HumanSource and commits human gold-layer edits.
 *
 * Humans don't cite turns (they're lazy). Source is identity + timestamp only.
 *
 * Architectural invariant (do not violate):
 *
 *   A SourcedYOp built for an optimistic UI update MUST be the same value
 *   passed to the server commit. Building a fresh source on the persist
 *   path produces a different `at` timestamp than the optimistic path,
 *   which means refresh-from-server returns a `sourceIndex` that doesn't
 *   match the pre-refresh local state — a silent client/server divergence.
 *
 * This module therefore separates the two concerns:
 *
 *   - `sourceGoldEdit(op)` attaches a HumanSource and returns the resulting
 *     SourcedYOp. Call this once at the boundary, share the value.
 *   - `commitGoldEdit(conversationId, sourcedOp)` persists an already-sourced
 *     op via the validated `commitOps` boundary. It does NOT rebuild source.
 *
 * Callers like `useGoldEdit.applyEdit` build the SourcedYOp once, hand it
 * to both `replayAppended` (optimistic) and `commitGoldEdit` (persist).
 */

import type { HumanEditSurface, HumanSource, SourcedYOp, YOp } from '@t3x-dev/core';
import { getAuthMe } from '@/infrastructure/auth';
import { getSessionUser, setSessionUser } from '@/infrastructure/session';
import { SourceValidationError } from './errors';
import { commitOps } from './yopsService';

type AuthorCandidate = {
  name?: string | null;
  username?: string | null;
};

export interface ResolveHumanSourceOptions {
  localAuthor?: string | null;
}

function authorFromCandidate(candidate: AuthorCandidate | null): string | null {
  const author = candidate?.username?.trim() || candidate?.name?.trim() || null;
  return author && author.length > 0 ? author : null;
}

function sourceFromAuthor(author: string, surface?: HumanEditSurface): HumanSource {
  return {
    type: 'human',
    author,
    at: new Date().toISOString(),
    ...(surface ? { surface } : {}),
  };
}

function normalizedAuthor(author: string | null | undefined): string | null {
  const trimmed = author?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function authDisabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
}

/**
 * Build a HumanSource for the current session user, stamped with the
 * UI surface that produced the edit. Surface and author are independent:
 * `author` answers WHO, `surface` answers WHERE.
 *
 * Throws SourceValidationError when no session user is available. Callers
 * should never silently substitute a placeholder identity.
 */
export function buildHumanSource(surface?: HumanEditSurface): HumanSource {
  const user = getSessionUser();
  const author = authorFromCandidate(user);
  if (!author) {
    throw new SourceValidationError(0, 'session.user');
  }
  return sourceFromAuthor(author, surface);
}

/**
 * Resolve a HumanSource for interactive UI edits.
 *
 * The synchronous builder intentionally stays strict for callers that need
 * an already-hydrated session. Script Apply can be reached after a refresh
 * where the auth cookie is still valid but localStorage lost `t3x-user`, so
 * this path lazily restores the user from /auth/me before giving up. Local
 * auth-disabled workspaces still need attribution, so the UI can pass the
 * configured workspace name as the human author.
 */
export async function resolveHumanSource(
  surface?: HumanEditSurface,
  options: ResolveHumanSourceOptions = {}
): Promise<HumanSource> {
  try {
    return buildHumanSource(surface);
  } catch (err) {
    if (!(err instanceof SourceValidationError)) throw err;
  }

  if (authDisabled()) {
    const author = normalizedAuthor(options.localAuthor);
    if (author) return sourceFromAuthor(author, surface);
  }

  try {
    const me = await getAuthMe();
    const author = authorFromCandidate(me);
    if (author) {
      setSessionUser({
        id: me.id,
        name: me.name,
        username: me.username,
        avatar_url: me.avatar_url,
      });
      return sourceFromAuthor(author, surface);
    }
  } catch {
    // Fall through to the strict error below.
  }

  throw new SourceValidationError(0, 'session.user');
}

/**
 * Attach a freshly-built HumanSource to a bare YOp. The returned value is
 * the canonical SourcedYOp that callers should thread through both
 * optimistic replay and the server commit.
 */
export function sourceGoldEdit(op: YOp): SourcedYOp {
  // Gold edits originate from the canvas / tree surface.
  return { ...op, source: buildHumanSource('tree') } as SourcedYOp;
}

/**
 * Attach a HumanSource for interactive tree edits.
 *
 * This keeps `sourceGoldEdit` strict for already-hydrated session paths, while
 * giving UI-originated edits the same lazy /auth/me and local-workspace author
 * fallback used by Script Apply.
 */
export async function resolveGoldEditSource(
  op: YOp,
  options: ResolveHumanSourceOptions = {}
): Promise<SourcedYOp> {
  return { ...op, source: await resolveHumanSource('tree', options) } as SourcedYOp;
}

/**
 * Persist an already-sourced gold-layer edit. Does not build source —
 * callers MUST source the op themselves (typically via `sourceGoldEdit`)
 * before committing. See module-level invariant.
 */
export async function commitGoldEdit(conversationId: string, op: SourcedYOp): Promise<void> {
  await commitOps(conversationId, [op]);
}
