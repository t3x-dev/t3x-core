'use client';

/**
 * ConflictResolutionButtons - Four resolution action buttons
 *
 * Keyboard shortcuts:
 * - A = Keep A (Source)
 * - B = Keep B (Target)
 * - X = Keep Both
 * - E = Edit
 *
 * - Keep A: Select source sentence
 * - Keep B: Select target sentence
 * - Keep Both: Include both sentences in merge
 * - Edit: Write custom merged text
 */

import { ArrowLeft, ArrowRight, Layers, Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

type Resolution = 'source' | 'target' | 'both' | 'edit';

interface ConflictResolutionButtonsProps {
  current: Resolution | null;
  onResolve: (resolution: Resolution) => void;
  sourceBranch?: string;
  targetBranch?: string;
  /** Enable keyboard shortcuts (A/B/X/E) - default: true */
  enableKeyboard?: boolean;
}

interface ButtonConfig {
  resolution: Resolution;
  icon: React.ReactNode;
  label: string;
  activeClass: string;
  shortcut: string;
}

export function ConflictResolutionButtons({
  current,
  onResolve,
  sourceBranch = 'A',
  targetBranch = 'B',
  enableKeyboard = true,
}: ConflictResolutionButtonsProps) {
  // Keyboard shortcuts: A/B/X/E
  useEffect(() => {
    if (!enableKeyboard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ignore if modifier keys are pressed
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'a':
          onResolve('source');
          break;
        case 'b':
          onResolve('target');
          break;
        case 'x':
          onResolve('both');
          break;
        case 'e':
          onResolve('edit');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboard, onResolve]);

  const buttons: ButtonConfig[] = [
    {
      resolution: 'source',
      icon: <ArrowLeft className="h-4 w-4" />,
      label: `Keep ${sourceBranch}`,
      activeClass: 'bg-red-100 border-red-300 text-red-700',
      shortcut: 'A',
    },
    {
      resolution: 'target',
      icon: <ArrowRight className="h-4 w-4" />,
      label: `Keep ${targetBranch}`,
      activeClass: 'bg-green-100 border-green-300 text-green-700',
      shortcut: 'B',
    },
    {
      resolution: 'both',
      icon: <Layers className="h-4 w-4" />,
      label: 'Keep Both',
      activeClass: 'bg-blue-100 border-blue-300 text-blue-700',
      shortcut: 'X',
    },
    {
      resolution: 'edit',
      icon: <Pencil className="h-4 w-4" />,
      label: 'Edit',
      activeClass: 'bg-purple-100 border-purple-300 text-purple-700',
      shortcut: 'E',
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
            title={enableKeyboard ? `${btn.label} (${btn.shortcut})` : btn.label}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors',
              isActive
                ? btn.activeClass
                : 'border-muted-foreground/20 hover:bg-muted hover:border-muted-foreground/40'
            )}
          >
            {btn.icon}
            <span>{btn.label}</span>
            {enableKeyboard && (
              <kbd className="ml-1 text-[0.65rem] font-mono bg-muted px-1 rounded opacity-60">
                {btn.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
