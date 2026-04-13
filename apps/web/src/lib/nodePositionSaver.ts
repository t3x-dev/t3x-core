/**
 * Debounced node-position saver.
 *
 * Collects node-position changes from the canvas drag layer and persists
 * them ~500ms after the last change. Keyed by node id, so rapid drags
 * on one node collapse to a single API call.
 *
 * Previously lived in `store/canvasStoreUtils.ts` as a module-scoped
 * utility. Moved here per docs/frontend-architecture-v2-zh.md §2.5 —
 * Zustand stores and their adjacent utilities should not call
 * `@/queries/*` or `@/infrastructure/*`. This is an I/O batching
 * primitive, not UI state, so `lib/` is the honest home.
 *
 * The module-scoped timer + pending Map are intentional: debounce
 * semantics must survive component remounts and xyflow re-renders.
 */

import { persistCommitPosition } from '@/queries/commits';
import { updateConversationById } from '@/queries/conversations';
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

    // Staging units use conversationId as nodeId (conv_xxx); committed
    // units use the commit hash (sha256:xxx). Pick the matching API.
    const isStagingUnit = nodeId.startsWith('conv_');
    if (isStagingUnit) {
      updateConversationById(nodeId, {
        position_x: pending.position.x,
        position_y: pending.position.y,
      }).catch(() => {
        // Silent fire-and-forget; next drag will retry.
      });
    } else {
      persistCommitPosition(nodeId, pending.position.x, pending.position.y).catch(() => {
        // Silent fire-and-forget.
      });
    }
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
