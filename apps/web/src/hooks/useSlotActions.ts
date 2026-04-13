'use client';

/**
 * useSlotActions — Facade hook for semantic YAML operations
 *
 * Components call deleteSlot('budget', 'hotels') — no YOp syntax knowledge needed.
 * TODO(undo-redo): yops_log is append-only; undo is deferred to a future PR.
 * Actions are currently no-ops until goldEditBuilder dispatch is wired.
 */

import type { YOp } from '@t3x-dev/core';
import { useCallback } from 'react';

export function useSlotActions() {
  // TODO(undo-redo): yops_log is append-only; undo is deferred to a future PR.
  const execute = useCallback((_ops: YOp[]) => {}, []);

  const updateSlot = useCallback(
    (nodeId: string, slotKey: string, value: string) => {
      execute([{ set: { path: `${nodeId}/${slotKey}`, value } }]);
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
      execute([{ set: { path: `${nodeId}/${key}`, value } }]);
    },
    [execute]
  );

  return { updateSlot, deleteSlot, deleteNode, addSlot };
}
