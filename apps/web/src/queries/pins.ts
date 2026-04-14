/**
 * L3 — pins list reader (read-only per v2 §2.3).
 *
 * Writes (createPin, deletePin, updatePinAssertions) live in
 * @/commands/pins per v2 §2.4.
 */

import type { Pin } from '@t3x-dev/core';
import { listPins, type PinType } from '@/infrastructure/pins';

export function fetchPins(projectId: string, type?: PinType): Promise<Pin[]> {
  return listPins(projectId, type);
}

export type { Pin, PinType };
