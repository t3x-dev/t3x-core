'use client';

import type { SemanticContent } from '@t3x-dev/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type CompatNode, treesToNodes } from '@/lib/treeCompat';

// ── Animation Duration Constants ──

/** Longest animation duration (ms) — state auto-clears after this */
const ANIMATION_CLEAR_MS = 2000;

// ── Types ──

export interface TreeAnimationState {
  /** Map of tree ID to animation state */
  treeStates: Record<string, 'added' | 'updated' | 'removed'>;
  /** Map of tree ID to list of updated slot keys */
  updatedSlots: Record<string, string[]>;
  /** List of newly added relation keys (formatted as "from->type->to") */
  newRelations: string[];
  /** Set of edge IDs (formatted as "from-to-type") that should animate as new */
  newEdgeIds: Set<string>;
  /** Whether any animation is currently active */
  isAnimating: boolean;
}

const IDLE_STATE: TreeAnimationState = {
  treeStates: {},
  updatedSlots: {},
  newRelations: [],
  newEdgeIds: new Set(),
  isAnimating: false,
};

// ── Helpers ──

/** Serialize a slot value for comparison */
function slotKey(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Build a relation key for set-based comparison */
function relationKey(r: { from: string; to: string; type: string }): string {
  return `${r.from}->${r.type}->${r.to}`;
}

// ── Hook ──

export function useTreeAnimation(
  previousContent: SemanticContent | null,
  currentContent: SemanticContent
): TreeAnimationState {
  const [animState, setAnimState] = useState<TreeAnimationState>(IDLE_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computeDelta = useCallback(
    (prev: SemanticContent | null, curr: SemanticContent): TreeAnimationState => {
      const currNodes = treesToNodes(curr.trees);

      if (!prev) {
        // First render — mark all trees as added
        const treeStates: Record<string, 'added' | 'updated' | 'removed'> = {};
        for (const f of currNodes) {
          treeStates[f.id] = 'added';
        }
        const newRelations = curr.relations.map((r) => relationKey(r));
        const newEdgeIds = new Set(curr.relations.map((r) => `${r.from}-${r.to}-${r.type}`));
        const hasChanges = currNodes.length > 0 || newRelations.length > 0;
        return {
          treeStates,
          updatedSlots: {},
          newRelations,
          newEdgeIds,
          isAnimating: hasChanges,
        };
      }

      const prevNodes = treesToNodes(prev.trees);

      const prevById: Record<string, CompatNode> = {};
      prevNodes.forEach((f) => {
        prevById[f.id] = f;
      });

      const currById: Record<string, CompatNode> = {};
      currNodes.forEach((f) => {
        currById[f.id] = f;
      });

      const treeStates: Record<string, 'added' | 'updated' | 'removed'> = {};
      const updatedSlots: Record<string, string[]> = {};

      // Detect added and updated trees
      currNodes.forEach((currNode) => {
        const prevNode = prevById[currNode.id];
        if (!prevNode) {
          treeStates[currNode.id] = 'added';
          return;
        }
        // Compare slots — collect all keys via object spread
        const allKeysObj: Record<string, true> = {};
        Object.keys(prevNode.slots).forEach((k) => {
          allKeysObj[k] = true;
        });
        Object.keys(currNode.slots).forEach((k) => {
          allKeysObj[k] = true;
        });
        const changedKeys: string[] = [];
        Object.keys(allKeysObj).forEach((key) => {
          const prevVal = slotKey(prevNode.slots[key]);
          const currVal = slotKey(currNode.slots[key]);
          if (prevVal !== currVal) {
            changedKeys.push(key);
          }
        });
        if (changedKeys.length > 0) {
          treeStates[currNode.id] = 'updated';
          updatedSlots[currNode.id] = changedKeys;
        }
      });

      // Detect removed trees
      prevNodes.forEach((f) => {
        if (!currById[f.id]) {
          treeStates[f.id] = 'removed';
        }
      });

      // Detect new relations
      const prevRelKeys: Record<string, true> = {};
      prev.relations.forEach((r) => {
        prevRelKeys[relationKey(r)] = true;
      });
      const newRelations = curr.relations.map((r) => relationKey(r)).filter((k) => !prevRelKeys[k]);

      // Build edge IDs for new relations so RelationEdge can animate them
      const newEdgeIds = new Set<string>();
      for (const r of curr.relations) {
        const key = relationKey(r);
        if (!prevRelKeys[key]) {
          newEdgeIds.add(`${r.from}-${r.to}-${r.type}`);
        }
      }

      const hasChanges = Object.keys(treeStates).length > 0 || newRelations.length > 0;

      return {
        treeStates,
        updatedSlots,
        newRelations,
        newEdgeIds,
        isAnimating: hasChanges,
      };
    },
    []
  );

  // Track content reference to detect changes
  const prevContentRef = useRef<SemanticContent | null>(previousContent);

  useEffect(() => {
    // Detect if content actually changed (by reference)
    const prev = prevContentRef.current;
    const contentChanged = prev !== currentContent;

    if (!contentChanged) return;

    prevContentRef.current = currentContent;

    const delta = computeDelta(previousContent, currentContent);
    if (!delta.isAnimating) return;

    setAnimState(delta);

    // Clear animation state after duration
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setAnimState(IDLE_STATE);
      timerRef.current = null;
    }, ANIMATION_CLEAR_MS);
  }, [previousContent, currentContent, computeDelta]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return animState;
}

// ── Framer Motion Variants ──

export const frameAnimationVariants = {
  added: {
    initial: { opacity: 0, scale: 0.8 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.4, type: 'spring', bounce: 0.3 },
    },
  },
  updated: {
    // Marker only — actual slot highlighting is done via CSS classes
  },
  removed: {
    animate: {
      opacity: 0,
      scale: 0.9,
      transition: { duration: 0.3 },
    },
  },
} as const;
