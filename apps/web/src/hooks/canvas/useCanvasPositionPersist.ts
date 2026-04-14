'use client';

/**
 * useCanvasPositionPersist — subscribes to the canvas store and
 * persists node-position changes to the backend via the debounced
 * `saveNodePosition` infra call.
 *
 * Replaces the inline side-effect that used to live in
 * `store/canvasStore.ts` (`onNodesChange` action). v2 §2.5 forbids
 * stores from doing I/O; the persist loop now runs at the view layer
 * alongside the canvas mount.
 *
 * Diff strategy: on every store update, walk the current `nodes`,
 * compare against a ref-held snapshot of prior positions, and fire
 * the saver for changed nodes. O(n) per update with n typically < 200
 * — negligible overhead. The saver itself debounces per node-id, so
 * rapid drag events collapse to a single HTTP PATCH.
 */

import { useEffect } from 'react';
import { saveNodePosition } from '@/infrastructure/nodePositionSaver';
import { useCanvasStore } from '@/store/canvasStore';
import { snapPosition } from '@/store/canvasStoreUtils';

export function useCanvasPositionPersist(): void {
  useEffect(() => {
    // Seed the previous-position snapshot with the current nodes so
    // we don't emit spurious saves on mount.
    const prev = new Map<string, { x: number; y: number }>();
    for (const node of useCanvasStore.getState().nodes) {
      prev.set(node.id, { x: node.position.x, y: node.position.y });
    }

    const unsubscribe = useCanvasStore.subscribe((state) => {
      for (const node of state.nodes) {
        const last = prev.get(node.id);
        if (!last) {
          // New node — record without saving; canvas load already
          // has its position on the server.
          prev.set(node.id, { x: node.position.x, y: node.position.y });
          continue;
        }
        if (last.x !== node.position.x || last.y !== node.position.y) {
          const snapped = snapPosition(node.position);
          saveNodePosition(node.id, node.data.kind, snapped);
          prev.set(node.id, { x: node.position.x, y: node.position.y });
        }
      }
    });

    return unsubscribe;
  }, []);
}
