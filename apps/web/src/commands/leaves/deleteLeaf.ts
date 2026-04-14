/**
 * L3 command — delete a leaf by id.
 */

import { deleteLeaf as deleteLeafInfra } from '@/infrastructure/leaves';
import { LeafPersistenceError } from './errors';

export async function deleteLeaf(leafId: string): Promise<void> {
  try {
    return await deleteLeafInfra(leafId);
  } catch (cause) {
    throw new LeafPersistenceError(
      cause instanceof Error ? cause.message : 'deleteLeaf failed',
      cause
    );
  }
}
