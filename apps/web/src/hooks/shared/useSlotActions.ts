'use client';

/**
 * useSlotActions — Facade hook for semantic YAML operations.
 *
 * Components call deleteSlot('budget', 'hotels') — no YOp syntax needed.
 * All verbs route through useGoldEdit → commitGoldEdit, which attaches
 * a HumanSource (origin=user_manual implied — see §3a.7 of the UX
 * design doc) before writing through yopsService.
 *
 * Each verb also snapshots the workspace opsLog via useUndoTracker
 * before the change lands, so Cmd+Z can roll back one edit at a time.
 */

import type { YOp } from '@t3x-dev/core';
import { useCallback } from 'react';
import { useGoldEdit } from './useGoldEdit';
import { useUndoTracker } from './useUndo';

export function useSlotActions() {
  const { applyEdit, enabled } = useGoldEdit();
  const { trackAction } = useUndoTracker();

  const updateSlot = useCallback(
    (nodeId: string, slotKey: string, value: string | number) => {
      trackAction(`Edit ${nodeId}/${slotKey}`);
      return applyEdit({ set: { path: `${nodeId}/${slotKey}`, value } } as YOp);
    },
    [applyEdit, trackAction]
  );

  const deleteSlot = useCallback(
    (nodeId: string, slotKey: string) => {
      trackAction(`Remove ${nodeId}/${slotKey}`);
      return applyEdit({ unset: { path: `${nodeId}/${slotKey}` } } as YOp);
    },
    [applyEdit, trackAction]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      trackAction(`Delete ${nodeId}`);
      return applyEdit({ drop: { path: nodeId } } as YOp);
    },
    [applyEdit, trackAction]
  );

  const addSlot = useCallback(
    (nodeId: string, key: string, value: string) => {
      trackAction(`Add ${nodeId}/${key}`);
      return applyEdit({ set: { path: `${nodeId}/${key}`, value } } as YOp);
    },
    [applyEdit, trackAction]
  );

  return { updateSlot, deleteSlot, deleteNode, addSlot, enabled };
}
