'use client';

/**
 * useNodePositionSaver — fire-and-forget canvas node position saver
 * over @/infrastructure/nodePositionSaver. Keeps components off the
 * infrastructure layer per v2 §1.
 */

import { useCallback } from 'react';
import { cancelAllPositionSaves, saveNodePosition } from '@/infrastructure/nodePositionSaver';

export function useNodePositionSaver() {
  const save = useCallback<typeof saveNodePosition>((...args) => saveNodePosition(...args), []);
  const cancelAll = useCallback(() => cancelAllPositionSaves(), []);
  return { save, cancelAll };
}
