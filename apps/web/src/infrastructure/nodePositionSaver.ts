/**
 * Debounced node-position saver.
 *
 * Collects node-position changes from the canvas drag layer and persists
 * them ~500ms after the last change. Keyed by node id, so rapid drags
 * on one node collapse to a single API call.
 *
 * Previously lived in `store/canvasStoreUtils.ts` as a module-scoped
 * utility. Moved to `lib/` per v2 §2.5 — Zustand stores cannot host I/O.
 * This module is an I/O batching primitive, not UI state, so `lib/` is
 * the honest home.
 *
 * The module-scoped timer + pending Map are intentional: debounce
 * semantics must survive component remounts and xyflow re-renders.
 *
 * Why direct @/infrastructure imports here:
 *   `lib/` is non-React orchestration glue. The biome top-level rule
 *   forbids `@/commands/**` from non-exempt paths, and `lib/` is
 *   intentionally not exempted (it should not become a back-door for
 *   business logic). For the staging-conversation position write this is
 *   the cleanest option.
 *   (Re-tune, which used to live here as a cross-aggregate lib helper,
 *   has since moved to hooks/useRetuneSession because it's consumed
 *   from React code; the same refactor isn't worthwhile for the drag
 *   debouncer which deliberately survives React remounts.)
 */

import { updateConversation } from '@/infrastructure/conversations';
import type { NodeKind } from '@/types/nodes';

const positionSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPositionSaves = new Map<
  string,
  { kind: NodeKind; position: { x: number; y: number } }
>();

const DEBOUNCE_MS = 500;

export function saveNodePosition(
  nodeId: string,
  kind: NodeKind,
  position: { x: number; y: number }
): void {
  const existingTimer = positionSaveTimers.get(nodeId);
  if (existingTimer) clearTimeout(existingTimer);

  pendingPositionSaves.set(nodeId, { kind, position });

  const timer = setTimeout(() => {
    const pending = pendingPositionSaves.get(nodeId);
    if (!pending) return;

    pendingPositionSaves.delete(nodeId);
    positionSaveTimers.delete(nodeId);

    if (pending.kind !== 'unit') return;

    // Only mutable staging conversations own persisted canvas positions.
    // Draft nodes are ephemeral, while immutable Commit snapshots deliberately
    // have no position mutation route.
    if (!nodeId.startsWith('conv_')) return;

    updateConversation(nodeId, {
      position_x: pending.position.x,
      position_y: pending.position.y,
    }).catch(() => {
      // Silent fire-and-forget; next drag will retry.
    });
  }, DEBOUNCE_MS);

  positionSaveTimers.set(nodeId, timer);
}

/**
 * Cancel all pending saves (useful in tests and on hard navigation).
 */
export function cancelAllPositionSaves(): void {
  for (const timer of positionSaveTimers.values()) clearTimeout(timer);
  positionSaveTimers.clear();
  pendingPositionSaves.clear();
}
