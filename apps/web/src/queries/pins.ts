/**
 * L3 — pins read/write pass-through for `pinsStore`.
 *
 * Matches the shape used by the Zustand store: each operation is an
 * imperative async function that returns the normalized `Pin` type the
 * store already expects.
 */

import type { Pin } from '@t3x-dev/core';
import { listPins, type PinType } from '@/infrastructure/pins';

export function fetchPins(projectId: string, type?: PinType): Promise<Pin[]> {
  return listPins(projectId, type);
}

export type { Pin, PinType };
