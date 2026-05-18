'use client';

import type { SemanticContent } from '@t3x-dev/core';
import { diffCommits } from '@t3x-dev/core';
import { useMemo } from 'react';
import { cn } from '@/utils/cn';
import { TreeGraphView } from './TreeGraphView';

// ── Props ──

interface DiffSplitProps {
  /** "Before" commit (e.g., parent) */
  source: SemanticContent;
  /** "After" commit (e.g., current) */
  target: SemanticContent;
  className?: string;
}

// ── Component ──

/**
 * DiffSplit — Side-by-side (split) diff view.
 *
 * Left panel shows the source content, right panel shows the target content.
 * Nodes unique to one side get a colored border; modified nodes get orange;
 * identical nodes render normally.
 */
export function DiffSplit({ source, target, className }: DiffSplitProps) {
  const { sourceChanges, sourceSlots, targetChanges, targetSlots } = useMemo(() => {
    const diff = diffCommits(source, target);

    const sourceChanges: Record<string, 'added' | 'updated' | 'removed'> = {};
    const sourceSlots: Record<string, string[]> = {};

    for (const path of diff.onlyInSource) {
      sourceChanges[path] = 'removed';
    }
    for (const m of diff.modified) {
      sourceChanges[m.path] = 'updated';
      if (m.slotDiffs.length > 0) {
        sourceSlots[m.path] = m.slotDiffs.map((sd) => sd.key);
      }
    }

    const targetChanges: Record<string, 'added' | 'updated' | 'removed'> = {};
    const targetSlots: Record<string, string[]> = {};

    for (const path of diff.onlyInTarget) {
      targetChanges[path] = 'added';
    }
    for (const m of diff.modified) {
      targetChanges[m.path] = 'updated';
      if (m.slotDiffs.length > 0) {
        targetSlots[m.path] = m.slotDiffs.map((sd) => sd.key);
      }
    }

    return { sourceChanges, sourceSlots, targetChanges, targetSlots };
  }, [source, target]);

  return (
    <div className={cn('flex h-full w-full', className)}>
      {/* Left panel — Source */}
      <div className="relative flex-1 min-w-0">
        <div className="absolute top-2 left-2 z-10 rounded bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] backdrop-blur-sm">
          Source
        </div>
        <TreeGraphView
          content={source}
          changeState={sourceChanges}
          updatedSlots={sourceSlots}
          className="h-full w-full"
        />
      </div>

      {/* Divider */}
      <div className="w-px shrink-0 bg-[var(--stroke-strong)]" />

      {/* Right panel — Target */}
      <div className="relative flex-1 min-w-0">
        <div className="absolute top-2 left-2 z-10 rounded bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] backdrop-blur-sm">
          Target
        </div>
        <TreeGraphView
          content={target}
          changeState={targetChanges}
          updatedSlots={targetSlots}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
