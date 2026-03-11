'use client';

import type { SemanticContent } from '@t3x/core';
import { useCallback, useState } from 'react';
import type { FrameDiffStats } from '@/components/frame-graph';
import { FrameDiffOverlay } from '@/components/frame-graph';

interface FrameDiffViewProps {
  source: SemanticContent;
  target: SemanticContent;
  className?: string;
}

export function FrameDiffView({ source, target, className }: FrameDiffViewProps) {
  const [stats, setStats] = useState<FrameDiffStats | null>(null);

  const handleStats = useCallback((s: FrameDiffStats) => {
    setStats(s);
  }, []);

  return (
    <div className={className}>
      {/* Stats summary */}
      {stats && (
        <div className="flex items-center gap-3 px-4 py-2 mb-3 text-xs text-[var(--text-tertiary)] bg-[var(--surface-panel)] rounded-lg border border-[var(--stroke-divider)]">
          <span>{stats.identical} identical</span>
          {stats.modified > 0 && (
            <span className="text-[var(--diff-modified-line)]">{stats.modified} modified</span>
          )}
          {stats.added > 0 && (
            <span className="text-[var(--diff-added-line)]">+{stats.added} added</span>
          )}
          {stats.removed > 0 && (
            <span className="text-[var(--diff-removed-line)]">-{stats.removed} removed</span>
          )}
          {(stats.relationsAdded > 0 || stats.relationsRemoved > 0) && (
            <span className="ml-auto text-[var(--text-tertiary)]">
              relations: +{stats.relationsAdded} / -{stats.relationsRemoved}
            </span>
          )}
        </div>
      )}

      {/* Graph view */}
      <FrameDiffOverlay source={source} target={target} onStats={handleStats} />
    </div>
  );
}
