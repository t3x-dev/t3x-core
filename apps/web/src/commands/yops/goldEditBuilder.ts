/**
 * L2 — builds HumanSource and commits human gold-layer edits.
 *
 * Humans don't cite turns (they're lazy). Source is identity + timestamp only.
 */

import type { HumanSource, SourcedYOp, YOp } from '@t3x-dev/core';
import { getSessionUser } from '@/lib/session';
import { SourceValidationError } from './errors';
import { commitOps } from './yopsService';

export function buildHumanSource(): HumanSource {
  const user = getSessionUser();
  const author = user?.username ?? user?.name ?? null;
  if (!author) {
    throw new SourceValidationError(0, 'session.user');
  }
  return {
    type: 'human',
    author,
    at: new Date().toISOString(),
  };
}

/**
 * Attach a HumanSource to a bare YOp and commit through yopsService.
 */
export async function commitGoldEdit(
  conversationId: string,
  op: YOp,
): Promise<void> {
  const sourced = { ...op, source: buildHumanSource() } as SourcedYOp;
  await commitOps(conversationId, [sourced]);
}
