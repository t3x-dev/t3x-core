// @ts-nocheck — tree-primary migration: needs rework
'use client';

import type { SemanticContent } from '@t3x-dev/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Frame } from '@/lib/treeCompat';

// ── Animation Duration Constants ──

/** Longest animation duration (ms) — state auto-clears after this */
const ANIMATION_CLEAR_MS = 2000;

// ── Types ──

export interface FrameAnimationState {
  /** Map of frame ID to animation state */
  frameStates: Record<string, 'added' | 'updated' | 'removed'>;
  /** Map of frame ID to list of updated slot keys */
  updatedSlots: Record<string, string[]>;
  /** List of newly added relation keys (formatted as "from->type->to") */
  newRelations: string[];
  /** Set of edge IDs (formatted as "from-to-type") that should animate as new */
  newEdgeIds: Set<string>;
  /** Whether any animation is currently active */
  isAnimating: boolean;
}

const IDLE_STATE: FrameAnimationState = {
  frameStates: {},
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

export function useFrameAnimation(
  previousContent: SemanticContent | null,
  currentContent: SemanticContent
): FrameAnimationState {
  const [animState, setAnimState] = useState<FrameAnimationState>(IDLE_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computeDelta = useCallback(
    (prev: SemanticContent | null, curr: SemanticContent): FrameAnimationState => {
      if (!prev) {
        // First render — mark all frames as added
        const frameStates: Record<string, 'added' | 'updated' | 'removed'> = {};
        for (const f of curr.frames) {
          frameStates[f.id] = 'added';
        }
        const newRelations = curr.relations.map((r) => relationKey(r));
        const newEdgeIds = new Set(curr.relations.map((r) => `${r.from}-${r.to}-${r.type}`));
        const hasChanges = curr.frames.length > 0 || newRelations.length > 0;
        return {
          frameStates,
          updatedSlots: {},
          newRelations,
          newEdgeIds,
          isAnimating: hasChanges,
        };
      }

      const prevById: Record<string, (typeof prev.frames)[number]> = {};
      prev.frames.forEach((f) => {
        prevById[f.id] = f;
      });

      const currById: Record<string, (typeof curr.frames)[number]> = {};
      curr.frames.forEach((f) => {
        currById[f.id] = f;
      });

      const frameStates: Record<string, 'added' | 'updated' | 'removed'> = {};
      const updatedSlots: Record<string, string[]> = {};

      // Detect added and updated frames
      curr.frames.forEach((currFrame) => {
        const prevFrame = prevById[currFrame.id];
        if (!prevFrame) {
          frameStates[currFrame.id] = 'added';
          return;
        }
        // Compare slots — collect all keys via object spread
        const allKeysObj: Record<string, true> = {};
        Object.keys(prevFrame.slots).forEach((k) => {
          allKeysObj[k] = true;
        });
        Object.keys(currFrame.slots).forEach((k) => {
          allKeysObj[k] = true;
        });
        const changedKeys: string[] = [];
        Object.keys(allKeysObj).forEach((key) => {
          const prevVal = slotKey(prevFrame.slots[key]);
          const currVal = slotKey(currFrame.slots[key]);
          if (prevVal !== currVal) {
            changedKeys.push(key);
          }
        });
        if (changedKeys.length > 0) {
          frameStates[currFrame.id] = 'updated';
          updatedSlots[currFrame.id] = changedKeys;
        }
      });

      // Detect removed frames
      prev.frames.forEach((f) => {
        if (!currById[f.id]) {
          frameStates[f.id] = 'removed';
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

      const hasChanges = Object.keys(frameStates).length > 0 || newRelations.length > 0;

      return {
        frameStates,
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
