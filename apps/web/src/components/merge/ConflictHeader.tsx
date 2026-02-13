'use client';

/**
 * ConflictHeader - Header for conflict card showing index and resolution status
 */

import { AlertTriangle, CheckCircle, Edit3, Layers } from 'lucide-react';

interface ConflictHeaderProps {
  index: number;
  resolution: 'source' | 'target' | 'both' | 'edit' | null;
  sourceBranch?: string;
  targetBranch?: string;
}

const resolutionLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  source: {
    label: 'Keep A',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    color: 'text-[var(--diff-removed-accent)]',
  },
  target: {
    label: 'Keep B',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    color: 'text-[var(--diff-added-accent)]',
  },
  both: {
    label: 'Keep Both',
    icon: <Layers className="h-3.5 w-3.5" />,
    color: 'text-[var(--status-info)]',
  },
  edit: {
    label: 'Custom',
    icon: <Edit3 className="h-3.5 w-3.5" />,
    color: 'text-[var(--accent-conversation)]',
  },
};

export function ConflictHeader({
  index,
  resolution,
  sourceBranch = 'A',
  targetBranch = 'B',
}: ConflictHeaderProps) {
  const resolvedInfo = resolution ? resolutionLabels[resolution] : null;

  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {!resolution ? (
          <AlertTriangle className="h-4 w-4 text-[var(--diff-modified-accent)]" />
        ) : (
          <CheckCircle className="h-4 w-4 text-[var(--diff-added-accent)]" />
        )}
        <span className="text-sm font-medium text-muted-foreground">Conflict {index + 1}</span>
        <span className="text-xs text-muted-foreground">
          ({sourceBranch} vs {targetBranch})
        </span>
      </div>

      {resolvedInfo && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${resolvedInfo.color}`}>
          {resolvedInfo.icon}
          <span>{resolvedInfo.label}</span>
        </div>
      )}
    </div>
  );
}
