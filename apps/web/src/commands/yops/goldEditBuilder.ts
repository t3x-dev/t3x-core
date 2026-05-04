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
import { getSessionUser } from '@/infrastructure/session';
import { SourceValidationError } from './errors';
import { commitOps } from './yopsService';

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
  const author = user?.username ?? user?.name ?? null;
  if (!author) {
    throw new SourceValidationError(0, 'session.user');
  }
  return {
    type: 'human',
    author,
    at: new Date().toISOString(),
    ...(surface ? { surface } : {}),
  };
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
 * Persist an already-sourced gold-layer edit. Does not build source —
 * callers MUST source the op themselves (typically via `sourceGoldEdit`)
 * before committing. See module-level invariant.
 */
export async function commitGoldEdit(conversationId: string, op: SourcedYOp): Promise<void> {
  await commitOps(conversationId, [op]);
}
