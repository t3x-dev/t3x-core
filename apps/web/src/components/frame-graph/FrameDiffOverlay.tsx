'use client';

import type { SemanticContent, TreeNode, WordDiffFn } from '@t3x-dev/core';
import { diffCommits, flattenTrees } from '@t3x-dev/core';
import { useEffect, useMemo } from 'react';
import { wordDiff } from '@/lib/diffUtils';
import { FrameGraphView } from './FrameGraphView';
import { treesToFrames } from '@/lib/treeCompat';

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

    // Combine relations: all unique relations from both sides
    const relKeySet = new Set<string>();
    const allRelations = [...source.relations, ...target.relations].filter((r) => {
      const key = `${r.from}-${r.to}-${r.type}`;
      if (relKeySet.has(key)) return false;
      relKeySet.add(key);
      return true;
    });

    // Merge trees from both sides for the combined content
    const combinedContent: SemanticContent = {
      trees: [...target.trees, ...source.trees.filter((t) => {
        // Include source trees that are only in source (removed)
        const sourceFrames = treesToFrames([t]);
        return sourceFrames.some((f) => diff.onlyInSource.includes(f.id));
      })],
      relations: allRelations,
    };

    // Build deltaState map: path → state
    const deltaState: Record<string, 'added' | 'updated' | 'removed'> = {};
    for (const m of diff.modified) {
      deltaState[m.path] = 'updated';
    }
    for (const path of diff.onlyInTarget) {
      deltaState[path] = 'added';
    }
    for (const path of diff.onlyInSource) {
      deltaState[path] = 'removed';
    }

    // Build updatedSlots map: path → list of changed slot keys
    const updatedSlots: Record<string, string[]> = {};
    for (const m of diff.modified) {
      if (m.slotDiffs.length > 0) {
        updatedSlots[m.path] = m.slotDiffs.map((sd) => sd.key);
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
