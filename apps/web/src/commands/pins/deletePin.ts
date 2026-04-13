/**
 * L3 command — delete a pin.
 */

import { deletePinApi } from '@/infrastructure/pins';
import { PinPersistenceError } from './errors';

export async function deletePin(pinId: string): Promise<{ deleted: boolean; id: string }> {
  try {
    return await deletePinApi(pinId);
  } catch (cause) {
    throw new PinPersistenceError(
      cause instanceof Error ? cause.message : 'deletePin failed',
      cause
    );
  }
}
