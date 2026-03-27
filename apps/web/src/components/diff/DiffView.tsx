'use client';

import type { SemanticContent } from '@t3x-dev/core';
import { useCallback, useState } from 'react';
import type { DiffStats } from '@/components/tree-graph';
import { DiffOverlay } from '@/components/tree-graph';

interface DiffViewProps {
  source: SemanticContent;
  target: SemanticContent;
  className?: string;
}

export function DiffView({ source, target, className }: DiffViewProps) {
  const [stats, setStats] = useState<DiffStats | null>(null);

  const handleStats = useCallback((s: DiffStats) => {
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
      <DiffOverlay source={source} target={target} onStats={handleStats} />
    </div>
  );
}
