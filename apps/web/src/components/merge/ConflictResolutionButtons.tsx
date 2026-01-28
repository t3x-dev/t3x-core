'use client';

/**
 * ConflictResolutionButtons - Four resolution action buttons
 *
 * - Keep A: Select source sentence
 * - Keep B: Select target sentence
 * - Keep Both: Include both sentences in merge
 * - Edit: Write custom merged text
 */

import { ArrowLeft, ArrowRight, Layers, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

type Resolution = 'source' | 'target' | 'both' | 'edit';

interface ConflictResolutionButtonsProps {
  current: Resolution | null;
  onResolve: (resolution: Resolution) => void;
  sourceBranch?: string;
  targetBranch?: string;
}

interface ButtonConfig {
  resolution: Resolution;
  icon: React.ReactNode;
  label: string;
  activeClass: string;
}

export function ConflictResolutionButtons({
  current,
  onResolve,
  sourceBranch = 'A',
  targetBranch = 'B',
}: ConflictResolutionButtonsProps) {
  const buttons: ButtonConfig[] = [
    {
      resolution: 'source',
      icon: <ArrowLeft className="h-4 w-4" />,
      label: `Keep ${sourceBranch}`,
      activeClass: 'bg-red-100 border-red-300 text-red-700',
    },
    {
      resolution: 'target',
      icon: <ArrowRight className="h-4 w-4" />,
      label: `Keep ${targetBranch}`,
      activeClass: 'bg-green-100 border-green-300 text-green-700',
    },
    {
      resolution: 'both',
      icon: <Layers className="h-4 w-4" />,
      label: 'Keep Both',
      activeClass: 'bg-blue-100 border-blue-300 text-blue-700',
    },
    {
      resolution: 'edit',
      icon: <Pencil className="h-4 w-4" />,
      label: 'Edit',
      activeClass: 'bg-purple-100 border-purple-300 text-purple-700',
    },
  ];

  return (
    <div className="flex items-center gap-2 mt-4">
      {buttons.map((btn) => {
        const isActive = current === btn.resolution;
        return (
          <button
            key={btn.resolution}
            type="button"
            onClick={() => onResolve(btn.resolution)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors',
              isActive
                ? btn.activeClass
                : 'border-muted-foreground/20 hover:bg-muted hover:border-muted-foreground/40'
            )}
          >
            {btn.icon}
            <span>{btn.label}</span>
          </button>
        );
      })}
    </div>
  );
}
