/**
 * L3 command — delete a leaf by id.
 */

import { deleteLeaf as deleteLeafInfra } from '@/infrastructure/leaves';

export async function deleteLeaf(leafId: string): Promise<void> {
  return deleteLeafInfra(leafId);
}
