'use client';

import type { SemanticContent } from '@t3x-dev/core';
import { frameDiff } from '@t3x-dev/core';
import { useMemo } from 'react';
import { FrameGraphView } from './FrameGraphView';

// ── Props ──

interface FrameDiffOverlayProps {
  /** "Before" commit (e.g., parent) */
  source: SemanticContent;
  /** "After" commit (e.g., current) */
  target: SemanticContent;
  className?: string;
}

// ── Component ──

export function FrameDiffOverlay({ source, target, className }: FrameDiffOverlayProps) {
  const { combinedContent, deltaState, updatedSlots } = useMemo(() => {
    const diff = frameDiff(source, target);

    // Build combined SemanticContent containing all frames from both sides
    const allFrames = [
      ...diff.identical,
      ...diff.modified.map((m) => m.targetFrame),
      ...diff.onlyInTarget,
      ...diff.onlyInSource,
    ];

    // Combine relations: all unique relations from both sides
    const relKeySet = new Set<string>();
    const allRelations = [...source.relations, ...target.relations].filter((r) => {
      const key = `${r.from}-${r.to}-${r.type}`;
      if (relKeySet.has(key)) return false;
      relKeySet.add(key);
      return true;
    });

    const combinedContent: SemanticContent = {
      frames: allFrames,
      relations: allRelations,
    };

    // Build deltaState map: frameId → state
    const deltaState: Record<string, 'added' | 'updated' | 'removed'> = {};
    // identical frames get no state entry (rendered as gray/default)
    for (const m of diff.modified) {
      deltaState[m.frameId] = 'updated';
    }
    for (const f of diff.onlyInTarget) {
      deltaState[f.id] = 'added';
    }
    for (const f of diff.onlyInSource) {
      deltaState[f.id] = 'removed';
    }

    // Build updatedSlots map: frameId → list of changed slot keys
    const updatedSlots: Record<string, string[]> = {};
    for (const m of diff.modified) {
      if (m.slotDiffs.length > 0) {
        updatedSlots[m.frameId] = m.slotDiffs.map((sd) => sd.key);
      }
    }

    return { combinedContent, deltaState, updatedSlots };
  }, [source, target]);

  return (
    <FrameGraphView
      content={combinedContent}
      deltaState={deltaState}
      updatedSlots={updatedSlots}
      className={className}
    />
  );
}
