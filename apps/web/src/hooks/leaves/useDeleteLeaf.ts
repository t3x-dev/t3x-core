/**
 * useDeleteLeaf — deletes a persisted leaf via the L3 leaves command.
 */

import { useCallback } from 'react';
import { deleteLeaf } from '@/commands/leaves';

export function useDeleteLeaf(): {
  remove: (leafId: string) => Promise<void>;
} {
  const remove = useCallback((leafId: string) => deleteLeaf(leafId), []);
  return { remove };
}
