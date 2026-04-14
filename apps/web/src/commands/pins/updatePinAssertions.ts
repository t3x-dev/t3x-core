/**
 * L3 command — update which assertions are selected on a pin.
 */

import type { Pin } from '@t3x-dev/core';
import { updatePinAssertionsApi } from '@/infrastructure/pins';
import { PinPersistenceError } from './errors';

export async function updatePinAssertions(
  pinId: string,
  selectedAssertionIds: string[]
): Promise<Pin> {
  try {
    return await updatePinAssertionsApi(pinId, selectedAssertionIds);
  } catch (cause) {
    throw new PinPersistenceError(
      cause instanceof Error ? cause.message : 'updatePinAssertions failed',
      cause
    );
  }
}
