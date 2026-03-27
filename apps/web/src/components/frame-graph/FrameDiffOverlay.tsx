// @ts-nocheck — tree-primary migration: needs rework
'use client';

import type { SemanticContent, WordDiffFn } from '@t3x-dev/core';
import { diffCommits } from '@t3x-dev/core';
import { useEffect, useMemo } from 'react';
import { wordDiff } from '@/lib/diffUtils';
import { FrameGraphView } from './FrameGraphView';
import type { Frame } from '@/lib/treeCompat';

// ── Props ──

export interface FrameDiffStats {
  identical: number;
  modified: number;
  added: number;
  removed: number;
  relationsAdded: number;
  relationsRemoved: number;
}

interface FrameDiffOverlayProps {
  /** "Before" commit (e.g., parent) */
  source: SemanticContent;
  /** "After" commit (e.g., current) */
  target: SemanticContent;
  /** Called once after diff computation with summary stats */
  onStats?: (stats: FrameDiffStats) => void;
  className?: string;
}

const wordDiffFn: WordDiffFn = (a, b) => wordDiff(a, b);

// ── Component ──

export function FrameDiffOverlay({ source, target, onStats, className }: FrameDiffOverlayProps) {
  const { combinedContent, deltaState, updatedSlots, stats } = useMemo(() => {
    const diff = diffCommits(source, target, wordDiffFn);

    const stats: FrameDiffStats = {
      identical: diff.identical.length,
      modified: diff.modified.length,
      added: diff.onlyInTarget.length,
      removed: diff.onlyInSource.length,
      relationsAdded: diff.relationsAdded.length,
      relationsRemoved: diff.relationsRemoved.length,
    };

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

    return { combinedContent, deltaState, updatedSlots, stats };
  }, [source, target]);

  // Report stats to parent via effect (not inside useMemo to avoid render-time setState)
  useEffect(() => {
    onStats?.(stats);
  }, [stats, onStats]);

  return (
    <FrameGraphView
      content={combinedContent}
      deltaState={deltaState}
      updatedSlots={updatedSlots}
      className={className}
    />
  );
}
