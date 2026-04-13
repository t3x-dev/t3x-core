/**
 * L3 command — delete a pin by id.
 */

import { deletePinApi } from '@/infrastructure/pins';

export async function deletePin(pinId: string): Promise<{ deleted: boolean; id: string }> {
  return deletePinApi(pinId);
}
