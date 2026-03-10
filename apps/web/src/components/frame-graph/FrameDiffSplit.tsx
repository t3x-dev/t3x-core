'use client';

import type { SemanticContent } from '@t3x/core';
import { frameDiff } from '@t3x/core';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { FrameGraphView } from './FrameGraphView';

// ── Props ──

interface FrameDiffSplitProps {
  /** "Before" commit (e.g., parent) */
  source: SemanticContent;
  /** "After" commit (e.g., current) */
  target: SemanticContent;
  className?: string;
}

// ── Component ──

/**
 * FrameDiffSplit — Side-by-side (split) diff view.
 *
 * Left panel shows the source content, right panel shows the target content.
 * Nodes unique to one side get a colored border; modified nodes get orange;
 * identical nodes render normally.
 */
export function FrameDiffSplit({ source, target, className }: FrameDiffSplitProps) {
  const { sourceDelta, sourceSlots, targetDelta, targetSlots } = useMemo(() => {
    const diff = frameDiff(source, target);

    // Source side: frames only in source are "removed" (green = unique to this side),
    // modified frames are "updated", identical frames have no state.
    const sourceDelta: Record<string, 'added' | 'updated' | 'removed'> = {};
    const sourceSlots: Record<string, string[]> = {};

    for (const f of diff.onlyInSource) {
      sourceDelta[f.id] = 'removed';
    }
    for (const m of diff.modified) {
      sourceDelta[m.frameId] = 'updated';
      if (m.slotDiffs.length > 0) {
        sourceSlots[m.frameId] = m.slotDiffs.map((sd) => sd.key);
      }
    }

    // Target side: frames only in target are "added",
    // modified frames are "updated", identical frames have no state.
    const targetDelta: Record<string, 'added' | 'updated' | 'removed'> = {};
    const targetSlots: Record<string, string[]> = {};

    for (const f of diff.onlyInTarget) {
      targetDelta[f.id] = 'added';
    }
    for (const m of diff.modified) {
      targetDelta[m.frameId] = 'updated';
      if (m.slotDiffs.length > 0) {
        targetSlots[m.frameId] = m.slotDiffs.map((sd) => sd.key);
      }
    }

    return { sourceDelta, sourceSlots, targetDelta, targetSlots };
  }, [source, target]);

  return (
    <div className={cn('flex h-full w-full', className)}>
      {/* Left panel — Source */}
      <div className="relative flex-1 min-w-0">
        <div className="absolute top-2 left-2 z-10 rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-300 backdrop-blur-sm">
          Source
        </div>
        <FrameGraphView
          content={source}
          deltaState={sourceDelta}
          updatedSlots={sourceSlots}
          className="h-full w-full"
        />
      </div>

      {/* Divider */}
      <div className="w-px shrink-0 bg-zinc-300 dark:bg-zinc-600" />

      {/* Right panel — Target */}
      <div className="relative flex-1 min-w-0">
        <div className="absolute top-2 left-2 z-10 rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-300 backdrop-blur-sm">
          Target
        </div>
        <FrameGraphView
          content={target}
          deltaState={targetDelta}
          updatedSlots={targetSlots}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
