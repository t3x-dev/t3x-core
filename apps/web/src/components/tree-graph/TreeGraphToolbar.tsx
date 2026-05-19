'use client';

import { cn } from '@/utils/cn';
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
    <div className="flex items-center gap-1 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)]/80 p-1 shadow-sm backdrop-blur-sm dark:bg-[var(--surface-elevated)]">
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
                ? 'bg-[var(--accent-commit)] text-[var(--on-accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]',
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
