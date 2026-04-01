'use client';

/**
 * useSlotActions — Facade hook for semantic YAML operations
 *
 * Components call deleteSlot('budget', 'hotels') — no YOp syntax knowledge needed.
 * All actions route through commandStore.execute().
 */

import { useCallback } from 'react';
import { useCommandStore } from '@/store/commandStore';

export function useSlotActions() {
  const execute = useCommandStore((s) => s.execute);

  const updateSlot = useCallback(
    (nodeId: string, slotKey: string, value: string) => {
      execute([{ set: { path: `${nodeId}/${slotKey}`, value, source: '', from: '' } }]);
    },
    [execute]
  );

  const deleteSlot = useCallback(
    (nodeId: string, slotKey: string) => {
      execute([{ unset: { path: `${nodeId}/${slotKey}` } }]);
    },
    [execute]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      execute([{ drop: { path: nodeId } }]);
    },
    [execute]
  );

  const addSlot = useCallback(
    (nodeId: string, key: string, value: string) => {
      execute([{ set: { path: `${nodeId}/${key}`, value, source: '', from: '' } }]);
    },
    [execute]
  );

  return { updateSlot, deleteSlot, deleteNode, addSlot };
}
