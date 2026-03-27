'use client';

import { cn } from '@/lib/utils';
import type { ZoomLevel } from './treeGraphUtils';

interface TreeGraphToolbarProps {
  zoomLevel: ZoomLevel;
  onZoomLevelChange: (level: ZoomLevel) => void;
  hasSelectedNode: boolean;
}

const levels: { value: ZoomLevel; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'expand', label: 'Expand Selected' },
  { value: 'full', label: 'Show All' },
];

export function TreeGraphToolbar({
  zoomLevel,
  onZoomLevelChange,
  hasSelectedNode,
}: TreeGraphToolbarProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white/80 p-1 shadow-sm backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/80">
      {levels.map(({ value, label }) => {
        const isActive = zoomLevel === value;
        const isDisabled = value === 'expand' && !hasSelectedNode;

        return (
          <button
            key={value}
            type="button"
            disabled={isDisabled}
            onClick={() => onZoomLevelChange(value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
              isDisabled && 'cursor-not-allowed opacity-40'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
