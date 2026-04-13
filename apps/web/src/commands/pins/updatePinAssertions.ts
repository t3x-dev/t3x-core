/**
 * L3 command — update the selected assertions on a pin.
 */

import type { Pin } from '@t3x-dev/core';
import { updatePinAssertionsApi } from '@/infrastructure/pins';

export async function updatePinAssertions(
  pinId: string,
  selectedAssertionIds: string[]
): Promise<Pin> {
  return updatePinAssertionsApi(pinId, selectedAssertionIds);
}
