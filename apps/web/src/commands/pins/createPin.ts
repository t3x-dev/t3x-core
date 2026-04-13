/**
 * L3 command — create a pin.
 */

import type { Pin } from '@t3x-dev/core';
import { createPinApi, type PinType } from '@/infrastructure/pins';

export async function createPin(
  projectId: string,
  type: PinType,
  refId: string,
  selectedAssertionIds?: string[]
): Promise<Pin> {
  return createPinApi(projectId, type, refId, selectedAssertionIds);
}
