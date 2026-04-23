'use client';

/**
 * useSlotActions — Facade hook for semantic YAML operations.
 *
 * Components call deleteSlot('budget', 'hotels') — no YOp syntax knowledge needed.
 * All verbs route through useGoldEdit → commitGoldEdit, which attaches a
 * HumanSource (origin=user_manual implied — see §3a.7 of the UX design doc)
 * before writing through yopsService.
 */

import type { YOp } from '@t3x-dev/core';
import { useCallback } from 'react';
import { useGoldEdit } from './useGoldEdit';

export function useSlotActions() {
  const { applyEdit, enabled } = useGoldEdit();

  const updateSlot = useCallback(
    (nodeId: string, slotKey: string, value: string | number) =>
      applyEdit({ set: { path: `${nodeId}/${slotKey}`, value } } as YOp),
    [applyEdit]
  );

  const deleteSlot = useCallback(
    (nodeId: string, slotKey: string) =>
      applyEdit({ unset: { path: `${nodeId}/${slotKey}` } } as YOp),
    [applyEdit]
  );

  const deleteNode = useCallback(
    (nodeId: string) => applyEdit({ drop: { path: nodeId } } as YOp),
    [applyEdit]
  );

  const addSlot = useCallback(
    (nodeId: string, key: string, value: string) =>
      applyEdit({ set: { path: `${nodeId}/${key}`, value } } as YOp),
    [applyEdit]
  );

  return { updateSlot, deleteSlot, deleteNode, addSlot, enabled };
}
