/**
 * useShareTokens — view-facing API for share-link create / revoke.
 *
 * Wraps infrastructure directly per v2 §2.6; a commands/shares/
 * aggregate is not yet defined (source policy = NONE, no per-write
 * contract needed). Future refactor may promote these to
 * commands/shares/ for symmetry with other aggregates.
 */

import { useCallback } from 'react';
import { createShareLink, listShareLinks, revokeShareLink } from '@/infrastructure/misc';
import type { ShareLink } from '@/types/api';

export type ShareEntityType = 'leaf' | 'run' | 'comparison' | 'commit';

export function useShareTokens() {
  const list = useCallback(
    async (entityType: ShareEntityType, entityId: string): Promise<ShareLink[]> =>
      listShareLinks(entityType, entityId),
    []
  );
  const create = useCallback(
    async (entityType: ShareEntityType, entityId: string): Promise<ShareLink> =>
      createShareLink(entityType, entityId),
    []
  );
  const revoke = useCallback(async (id: string): Promise<ShareLink> => revokeShareLink(id), []);
  return { list, create, revoke };
}
