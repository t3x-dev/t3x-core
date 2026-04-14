/**
 * L3 command — create a pin (mark a conversation/leaf as a source).
 */

import type { Pin } from '@t3x-dev/core';
import { createPinApi, type PinType } from '@/infrastructure/pins';
import { PinPersistenceError } from './errors';

export async function createPin(
  projectId: string,
  type: PinType,
  refId: string,
  selectedAssertionIds?: string[]
): Promise<Pin> {
  try {
    return await createPinApi(projectId, type, refId, selectedAssertionIds);
  } catch (cause) {
    throw new PinPersistenceError(
      cause instanceof Error ? cause.message : 'createPin failed',
      cause
    );
  }
}

export type { PinType };
